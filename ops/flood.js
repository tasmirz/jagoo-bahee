/**
 * Invalid-envelope flood: does the no-write prefix of the pipeline actually hold?
 *
 *   docker cp ops/flood.js jb-a1:/tmp/flood.js
 *   docker exec -e FLOOD_B64="$(cat env.b64)" jb-a1 node /tmp/flood.js --n=3000 --c=16
 *
 * The paper claims steps 1-12 of the ingress pipeline perform no database writes, so that a
 * flood of invalid envelopes costs CPU but cannot amplify into write load. That is a design
 * claim about a DoS surface and it was never measured. This measures it.
 *
 * ── Why mutate a real envelope rather than send garbage ──────────────────────────────
 * Random bytes are rejected at step 2 (PARSE) for a few microseconds each, which proves
 * nothing interesting: the expensive path is a WELL-FORMED envelope whose signature is
 * wrong, because that one has to be parsed, canonicality-checked and then Ed25519-verified
 * before it can be refused. So we take a genuine envelope off the node's own log and mutate
 * one byte inside the signed region. That both invalidates the signature AND changes the
 * content id, so each request is a novel envelope and none can be short-circuited by dedupe.
 *
 * ── What is reported, and why the error histogram matters ────────────────────────────
 * "It was rejected" is not the claim; "it was rejected at a step that does not write" is.
 * So the error code of every response is tallied. A run that rejects everything at PARSE has
 * not exercised signature verification and must not be quoted as if it had.
 *
 * Keep-alive is mandatory. An earlier measurement in this project reported 144 ms for a read
 * the node serves in 4 ms, because it was timing process creation rather than the server.
 */

const http = require('node:http');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
  }),
);

const TOTAL = Number(args.n ?? 2000);
const CONC = Number(args.c ?? 16);
const PORT = Number(args.port ?? 3000);

const B64 = process.env.FLOOD_B64;
if (!B64) {
  process.stderr.write('FLOOD_B64 must contain a base64 envelope\n');
  process.exit(1);
}
const BASE = Buffer.from(B64.trim(), 'base64');

const agent = new http.Agent({ keepAlive: true, maxSockets: CONC });

/**
 * One byte inside the signed region, varied per request. Kept away from the first few bytes
 * so the leading field headers stay intact and the message still parses -- otherwise every
 * request is refused at PARSE and the expensive path is never touched.
 */
function mutate(i) {
  const buf = Buffer.from(BASE);
  const pos = 24 + (i % Math.max(1, buf.length - 96));
  buf[pos] = (buf[pos] + 1 + (i % 251)) & 0xff;
  return buf;
}

function post(body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ envelope: body.toString('base64') });
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/v1/envelopes',
        method: 'POST',
        agent,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let code = `http_${res.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            code = parsed.code ?? parsed.error ?? parsed.message ?? code;
          } catch {
            /* non-JSON body: keep the status code */
          }
          resolve(String(code).slice(0, 48));
        });
      },
    );
    req.on('error', (e) => resolve(`neterr_${e.code ?? 'unknown'}`));
    req.end(payload);
  });
}

async function main() {
  const codes = new Map();
  let sent = 0;
  const started = Date.now();

  await Promise.all(
    Array.from({ length: CONC }, async () => {
      for (;;) {
        const i = sent;
        if (i >= TOTAL) return;
        sent += 1;
        const code = await post(mutate(i));
        codes.set(code, (codes.get(code) ?? 0) + 1);
      }
    }),
  );

  const ms = Date.now() - started;
  process.stdout.write(
    JSON.stringify(
      {
        sent: TOTAL,
        concurrency: CONC,
        durationMs: ms,
        rps: Math.round((TOTAL / ms) * 1000),
        envelopeBytes: BASE.length,
        codes: Object.fromEntries([...codes.entries()].sort((a, b) => b[1] - a[1])),
      },
      null,
      2,
    ) + '\n',
  );
}

void main();
