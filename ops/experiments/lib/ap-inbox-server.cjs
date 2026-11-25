'use strict';
/**
 * Minimal protocol-level ActivityPub HTTP-inbox peer for end-to-end comparison (R1.4).
 * Sends & verifies AS2 Create/Note JSON-LD with real Mastodon @context + gzip + HTTP Ed25519 Signature.
 * Deliberately lightweight (no Ruby/Rails/Postgres/Sidekiq), which favours ActivityPub on RAM/CPU.
 */

const { createHash, generateKeyPairSync, sign, verify } = require('node:crypto');
const http = require('node:http');
const { gunzipSync, gzipSync } = require('node:zlib');

const PORT = Number(process.env.AP_PORT || 3000);
const SELF_ID = process.env.AP_SELF_ID || 'ap-a';
const PEER_URL = process.env.AP_PEER_URL || '';
const PEER_PUBKEY_PEM = process.env.AP_PEER_PUBKEY_PEM || '';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const MASTODON_CONTEXT = [
  'https://www.w3.org/ns/activitystreams',
  {
    ostatus: 'http://ostatus.org#',
    atomUri: 'ostatus:atomUri',
    inReplyToAtomUri: 'ostatus:inReplyToAtomUri',
    conversation: 'ostatus:conversation',
    sensitive: 'as:sensitive',
    toot: 'http://joinmastodon.org/ns#',
    votersCount: 'toot:votersCount',
    blurhash: 'toot:blurhash',
    focalPoint: { '@id': 'toot:focalPoint', '@type': '@id' },
  },
];

const items = new Map();
let peerKeyPem = PEER_PUBKEY_PEM || null;

function sha256B64(buf) {
  return createHash('sha256').update(buf).digest('base64');
}

function buildActivity(seq, text) {
  const nowIso = new Date().toISOString();
  const noteId = `https://${SELF_ID}.local/users/test/statuses/${seq}`;
  return {
    '@context': MASTODON_CONTEXT,
    id: `${noteId}/activity`,
    type: 'Create',
    actor: `https://${SELF_ID}.local/users/test`,
    published: nowIso,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc: [`https://${SELF_ID}.local/users/test/followers`],
    object: {
      id: noteId,
      type: 'Note',
      summary: null,
      inReplyTo: null,
      published: nowIso,
      url: noteId,
      attributedTo: `https://${SELF_ID}.local/users/test`,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`https://${SELF_ID}.local/users/test/followers`],
      sensitive: false,
      atomUri: noteId,
      inReplyToAtomUri: null,
      conversation: `tag:${SELF_ID}.local,2026:objectId=${seq}:objectType=Conversation`,
      content: `<p>${text}</p>`,
      contentMap: { en: `<p>${text}</p>` },
      attachment: [],
      tag: [],
      replies: {
        id: `${noteId}/replies`,
        type: 'Collection',
        first: { type: 'CollectionPage', next: `${noteId}/replies?only_other_accounts=true&page=true`, partOf: `${noteId}/replies`, items: [] },
      },
    },
  };
}

async function deliverWithRetry(activity, targetUrl) {
  const jsonBuf = Buffer.from(JSON.stringify(activity), 'utf8');
  const gzBuf = gzipSync(jsonBuf);
  const digestHdr = `SHA-256=${sha256B64(gzBuf)}`;
  const target = new URL('/inbox', targetUrl);

  const delays = [0, 300, 600, 1200, 2400];
  let lastErr = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    const dateHdr = new Date().toUTCString();
    const signingStr = `(request-target): post ${target.pathname}\nhost: ${target.host}\ndate: ${dateHdr}\ndigest: ${digestHdr}`;
    const sigB64 = sign(null, Buffer.from(signingStr, 'utf8'), privateKey).toString('base64');
    const sigHdr = `keyId="https://${SELF_ID}.local/actor#main-key",algorithm="ed25519",headers="(request-target) host date digest",signature="${sigB64}"`;

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(target.toString(), {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/activity+json',
          'content-encoding': 'gzip',
          date: dateHdr,
          digest: digestHdr,
          signature: sigHdr,
        },
        body: gzBuf,
      });
      clearTimeout(timer);
      if (res.ok) {
        return { delivered: true, attempts: attempt + 1, rawBytes: jsonBuf.length, gzipBytes: gzBuf.length };
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { delivered: false, attempts: delays.length, error: lastErr, rawBytes: jsonBuf.length, gzipBytes: gzBuf.length };
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const rawBody = Buffer.concat(chunks);

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', self: SELF_ID, pubKeyPem: PUB_PEM }));
    return;
  }

  if (req.method === 'POST' && req.url === '/set-peer-key') {
    const parsed = JSON.parse(rawBody.toString('utf8'));
    peerKeyPem = parsed.pubKeyPem;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && req.url === '/inbox/items') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items: [...items.values()] }));
    return;
  }

  if (req.method === 'POST' && req.url === '/inbox') {
    const expectedDigest = `SHA-256=${sha256B64(rawBody)}`;
    if (req.headers.digest !== expectedDigest) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad digest' }));
      return;
    }
    if (peerKeyPem) {
      const m = /signature="([^"]+)"/.exec(String(req.headers.signature || ''));
      if (!m) {
        res.writeHead(401);
        res.end();
        return;
      }
      const signingStr = `(request-target): post /inbox\nhost: ${req.headers.host}\ndate: ${req.headers.date}\ndigest: ${req.headers.digest}`;
      const ok = verify(null, Buffer.from(signingStr, 'utf8'), peerKeyPem, Buffer.from(m[1], 'base64'));
      if (!ok) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad signature' }));
        return;
      }
    }
    const plain = req.headers['content-encoding'] === 'gzip' ? gunzipSync(rawBody) : rawBody;
    const obj = JSON.parse(plain.toString('utf8'));
    const receivedAtMs = Date.now();
    if (!items.has(obj.id)) {
      items.set(obj.id, { id: obj.id, receivedAtMs });
    }
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ accepted: true, id: obj.id, receivedAtMs }));
    return;
  }

  if (req.method === 'POST' && req.url === '/publish') {
    const reqJson = JSON.parse(rawBody.toString('utf8'));
    const activity = buildActivity(reqJson.seq, reqJson.text);
    const sentAtMs = Date.now();
    const result = await deliverWithRetry(activity, reqJson.targetUrl || PEER_URL);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: activity.id, sentAtMs, ...result }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`ap-inbox ${SELF_ID} listening on :${PORT}\n`);
});
