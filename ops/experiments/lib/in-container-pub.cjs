'use strict';
/**
 * Helper executed inside a node container (`WORKDIR /app`) to set up one
 * certified identity + community or publish a batch of valid posts using a saved state.
 *
 * Usage:
 *   node /tmp/in-container-pub.cjs setup <identity> [url]
 *   node /tmp/in-container-pub.cjs post <stateJsonB64> <count> <paceMs> <prefix> [url]
 */

const { createHash, randomBytes } = require('node:crypto');
const { existsSync } = require('node:fs');
const { createRequire } = require('node:module');
const appRequire = existsSync('/app/backend/package.json')
  ? createRequire('/app/backend/package.json')
  : require;
const argon2 = appRequire('argon2');
const {
  Plane,
  blindCredential,
  buildEnvelope,
  canonicalBytes,
  certificateSelfSignatureBytes,
  pqAttestationBytes,
  sealEnvelope,
  unblindCredential,
} = appRequire('@jagoo/sdk');
const { ed25519, mldsa } = appRequire('@jagoo/sdk/crypto');
const { CommunityCreate, KeyCertificate, PostCreate, PostKind } = appRequire('@jagoo/sdk/proto');

const text = new TextEncoder();
const b64 = (v) => Buffer.from(v).toString('base64');
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const digest = (s) => new Uint8Array(createHash('sha256').update(s, 'utf8').digest());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonReq(url, path, init) {
  const res = await fetch(new URL(path, `${url.replace(/\/+$/, '')}/`), {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const txt = await res.text();
  let payload = {};
  try {
    payload = JSON.parse(txt);
  } catch {
    payload = { raw: txt };
  }
  if (!res.ok) {
    throw new Error(`${(init && init.method) || 'GET'} ${path} -> HTTP ${res.status} ${payload.detail || txt}`);
  }
  return payload;
}

function makeEnvelope(seed, domain, body, antiAbuse, scope = '') {
  const unsigned = buildEnvelope({
    domain,
    plane: Plane.FORUM,
    authorKey: ed25519.derivePublicKey(seed),
    body,
    nowMs: BigInt(Date.now()),
    nonce: new Uint8Array(randomBytes(16)),
    antiAbuse,
    scope,
  });
  return sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), seed)).wireBytes;
}

async function solvePow(challenge, authorKey) {
  const challengeBytes = fromB64(challenge.challenge);
  const h = await argon2.hash(Buffer.from(challengeBytes).toString('hex'), {
    type: argon2.argon2id,
    salt: Buffer.from(authorKey),
    memoryCost: Math.max(1024, challenge.memoryKiB),
    timeCost: Math.max(2, challenge.iterations),
    parallelism: challenge.parallelism,
    hashLength: 32,
    raw: true,
  });
  const proof = new Uint8Array(73);
  proof[0] = 1;
  new DataView(proof.buffer).setBigUint64(1, BigInt(challenge.expiresAtMs), false);
  proof.set(challengeBytes, 9);
  proof.set(h, 41);
  return proof;
}

async function setupIdentity(identity, url) {
  const seed = digest(identity);
  const publicKey = ed25519.derivePublicKey(seed);
  const validFrom = BigInt(Date.now() - 60_000);
  const validUntil = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pq = mldsa.generateKeyPair(digest(`${identity}-pq`));
  const fields = { plane: Plane.FORUM, deviceKey: publicKey, pqKey: pq.publicKey, validFrom, validUntil };
  const attestation = mldsa.attest(pqAttestationBytes(fields), pq.secretKey);
  pq.secretKey.fill(0);

  const certificate = KeyCertificate.encode(
    KeyCertificate.fromPartial({
      plane: 1,
      device_key: publicKey,
      pq_key: pq.publicKey,
      pq_attestation: attestation,
      valid_from: validFrom,
      valid_until: validUntil,
      self_signature: ed25519.sign(certificateSelfSignatureBytes(fields, attestation), seed),
    }),
  ).finish();

  const powChallenge = await jsonReq(url, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: b64(publicKey) }),
  });
  const pow = await solvePow(powChallenge, publicKey);
  const certReceipt = await jsonReq(url, '/v1/envelopes', {
    method: 'POST',
    body: JSON.stringify({
      envelope: b64(
        makeEnvelope(seed, 'jb:key:certify:forum:v1', certificate, {
          credential: new Uint8Array(0),
          nullifier: new Uint8Array(0),
          epoch: 0,
          pow,
        }),
      ),
    }),
  });

  const challenged = await jsonReq(url, `/v1/auth/challenge?public_key=${encodeURIComponent(b64(publicKey))}`);
  const authBytes = new Uint8Array([...text.encode('jb-auth-v1\0login\0'), ...publicKey, ...fromB64(challenged.challenge)]);
  const session = await jsonReq(url, '/v1/auth', {
    method: 'POST',
    body: JSON.stringify({
      public_key: b64(publicKey),
      challenge: challenged.challenge,
      claim: challenged.claim,
      signature: b64(ed25519.sign(authBytes, seed)),
    }),
  });

  const parameters = await jsonReq(url, '/v1/credentials/parameters');
  const blinded = blindCredential(parameters, new Uint8Array(randomBytes(32)), new Uint8Array(randomBytes(parameters.width)));
  const issued = await jsonReq(url, '/v1/credentials/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ blinded: b64(blinded.blinded) }),
  });
  const credential = unblindCredential(blinded.state, fromB64(issued.blindSignature));
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));

  const commBody = CommunityCreate.encode(
    CommunityCreate.fromPartial({
      name: identity,
      title: `Experiment ${identity}`,
      description: 'Controlled experiment community',
    }),
  ).finish();

  const commReceipt = await jsonReq(url, '/v1/envelopes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      envelope: b64(
        makeEnvelope(seed, 'jb:community:create:v1', commBody, {
          credential,
          nullifier: digest(`jb:community:create:v1\0${epoch}\0${identity}`),
          epoch,
          pow,
        }),
      ),
    }),
  });

  const listed = await jsonReq(url, `/v1/communities?q=${encodeURIComponent(identity)}`);
  const communityId = listed.items.find((x) => x.name === identity)?.id;
  if (!communityId) throw new Error('community projection missing after creation');

  process.stdout.write(
    JSON.stringify({
      identity,
      seedB64: b64(seed),
      credentialB64: b64(credential),
      epoch,
      communityId,
      certId: certReceipt.content_id,
      communityEnvelopeId: commReceipt.content_id,
      token: session.accessToken,
    }) + '\n',
  );
}

async function publishPosts(stateB64, count, paceMs, prefix, url) {
  const st = JSON.parse(Buffer.from(stateB64, 'base64').toString('utf8'));
  const seed = fromB64(st.seedB64);
  const credential = fromB64(st.credentialB64);
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const body = PostCreate.encode(
      PostCreate.fromPartial({
        title: `${prefix} #${i}`,
        kind: PostKind.POST_KIND_TEXT,
        body_markdown: `Controlled test message ${prefix} index ${i}`,
      }),
    ).finish();
    const wire = makeEnvelope(
      seed,
      'jb:post:create:v1',
      body,
      {
        credential,
        nullifier: digest(`jb:post:create:v1\0${st.epoch}\0${st.identity}\0${prefix}\0${i}`),
        epoch: st.epoch,
        pow: new Uint8Array(0),
      },
      st.communityId,
    );
    const t0 = Date.now();
    const receipt = await jsonReq(url, '/v1/envelopes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${st.token}` },
      body: JSON.stringify({ envelope: b64(wire) }),
    });
    results.push({ index: i, contentId: receipt.content_id, submittedAtMs: t0 });
    if (paceMs > 0 && i + 1 < count) await sleep(paceMs);
  }
  process.stdout.write(JSON.stringify(results) + '\n');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'setup') {
    await setupIdentity(rest[0], rest[1] || 'http://127.0.0.1:3000');
  } else if (cmd === 'post') {
    await publishPosts(rest[0], Number(rest[1]), Number(rest[2]), rest[3], rest[4] || 'http://127.0.0.1:3000');
  } else {
    throw new Error(`unknown cmd: ${cmd}`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
