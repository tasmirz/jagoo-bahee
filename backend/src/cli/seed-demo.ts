import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import {
  Plane,
  blindCredential,
  buildEnvelope,
  canonicalBytes,
  certificateSelfSignatureBytes,
  pqAttestationBytes,
  sealEnvelope,
  unblindCredential,
} from '@jagoo/sdk';
import { ed25519, mldsa } from '@jagoo/sdk/crypto';
import type { BlindCredentialPublicKey } from '@jagoo/sdk/signer';
import { CommunityCreate, KeyCertificate, PostCreate, PostKind } from '@jagoo/sdk/proto';

const text = new TextEncoder();
const base64 = (value: Uint8Array) => Buffer.from(value).toString('base64');
const fromBase64 = (value: string) => new Uint8Array(Buffer.from(value, 'base64'));
const digest = (value: string) =>
  new Uint8Array(createHash('sha256').update(value, 'utf8').digest());

async function json<T>(url: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, `${url.replace(/\/+$/, '')}/`), {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json()) as T & { detail?: string };
  // Name the request. A bare "HTTP 404" from a seeding tool tells an operator nothing about
  // which of a dozen calls failed, and sends them reading source instead of fixing config.
  if (!response.ok) {
    const reason = payload.detail ?? `HTTP ${response.status}`;
    throw new Error(`${init?.method ?? 'GET'} ${path} — ${reason}`);
  }
  return payload;
}

function envelope(
  seed: Uint8Array,
  domain: string,
  body: Uint8Array,
  antiAbuse?: {
    readonly credential: Uint8Array;
    readonly nullifier: Uint8Array;
    readonly epoch: number;
    readonly pow: Uint8Array;
  },
  scope = '',
) {
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

interface PowChallenge {
  readonly challenge: string;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly expiresAtMs: number;
}

async function solvePow(challenge: PowChallenge, authorKey: Uint8Array): Promise<Uint8Array> {
  const challengeBytes = fromBase64(challenge.challenge);
  const digest = await argon2.hash(Buffer.from(challengeBytes).toString('hex'), {
    type: argon2.argon2id,
    salt: Buffer.from(authorKey),
    // The in-memory adapter advertises a deliberately tiny test cost; native argon2
    // enforces 1 MiB as its portable minimum. Production challenges are always higher.
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
  proof.set(digest, 41);
  return proof;
}

export async function seedDemo(
  url = process.env.NODE_URL ?? 'http://127.0.0.1:3000',
): Promise<string> {
  const identity = process.env.DEMO_IDENTITY_SEED ?? 'jagoo-bahee-demo-identity-v1';
  const seed = digest(identity);
  // The epoch nullifier salt follows the identity. A hardcoded salt made the seeder
  // single-use per epoch — a second run spent a nullifier the first had already claimed and
  // failed with "epoch quota is exhausted", which is anti-abuse working correctly against a
  // tool that should not have been asking twice.
  const salt = identity;
  const publicKey = ed25519.derivePublicKey(seed);
  const validFrom = BigInt(Date.now() - 60_000);
  const validUntil = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pq = mldsa.generateKeyPair(digest('jagoo-bahee-demo-pq-v1'));
  const fields = {
    plane: Plane.FORUM,
    deviceKey: publicKey,
    pqKey: pq.publicKey,
    validFrom,
    validUntil,
  };
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
      self_signature: ed25519.sign(
        certificateSelfSignatureBytes(fields, attestation),
        seed,
      ),
    }),
  ).finish();
  const powChallenge = await json<PowChallenge>(url, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(publicKey) }),
  });
  const pow = await solvePow(powChallenge, publicKey);
  await json(url, '/v1/envelopes', {
    method: 'POST',
    body: JSON.stringify({
      envelope: base64(
        envelope(seed, 'jb:key:certify:forum:v1', certificate, {
          credential: new Uint8Array(0),
          nullifier: new Uint8Array(0),
          epoch: 0,
          pow,
        }),
      ),
    }),
  });

  const challenged = await json<{ challenge: string; claim: string }>(
    url,
    `/v1/auth/challenge?public_key=${encodeURIComponent(base64(publicKey))}`,
  );
  const authBytes = new Uint8Array([
    ...text.encode('jb-auth-v1\0login\0'),
    ...publicKey,
    ...fromBase64(challenged.challenge),
  ]);
  const session = await json<{ accessToken: string }>(url, '/v1/auth', {
    method: 'POST',
    body: JSON.stringify({
      public_key: base64(publicKey),
      challenge: challenged.challenge,
      claim: challenged.claim,
      signature: base64(ed25519.sign(authBytes, seed)),
    }),
  });

  const parameters = await json<BlindCredentialPublicKey>(
    url,
    '/v1/credentials/parameters',
  );
  const blinded = blindCredential(
    parameters,
    new Uint8Array(randomBytes(32)),
    new Uint8Array(randomBytes(parameters.width)),
  );
  const issued = await json<{ blindSignature: string }>(url, '/v1/credentials/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ blinded: base64(blinded.blinded) }),
  });
  const credential = unblindCredential(blinded.state, fromBase64(issued.blindSignature));
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  // The community follows the identity, not the other way round.
  //
  // A second run under a different `DEMO_IDENTITY_SEED` used to find the FIRST identity's
  // `welcome` community, try to post into it, and be refused with "post.create permission
  // required" — moderation working correctly against a seeder that had assumed it owned
  // somewhere it had merely found. Naming the community after the identity means each demo
  // identity creates and moderates its own, so the seeder is re-runnable and the ISP gate can
  // publish a second, distinguishable post to prove a bridge crossing.
  const communityName = process.env.DEMO_COMMUNITY ?? 'welcome';
  const listed = await json<{
    readonly items: readonly { readonly id: string; readonly name: string }[];
  }>(url, `/v1/communities?q=${encodeURIComponent(communityName)}`);
  let communityId = listed.items.find((item) => item.name === communityName)?.id;
  if (!communityId) {
    await json(url, '/v1/envelopes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({
        envelope: base64(
          envelope(
            seed,
            'jb:community:create:v1',
            CommunityCreate.encode(
              CommunityCreate.fromPartial({
                name: communityName,
                title: 'Welcome',
                description: 'The local starting point for this Jagoo Bahee node.',
              }),
            ).finish(),
            {
              credential,
              nullifier: digest(`jb:community:create:v1\0${epoch}\0${salt}`),
              epoch,
              pow,
            },
          ),
        ),
      }),
    });
    const created = await json<{
      readonly items: readonly { readonly id: string; readonly name: string }[];
    }>(url, `/v1/communities?q=${encodeURIComponent(communityName)}`);
    communityId = created.items.find((item) => item.name === communityName)?.id;
  }
  if (!communityId) throw new Error('demo community was not projected');
  const post = envelope(
    seed,
    'jb:post:create:v1',
    PostCreate.encode(
      PostCreate.fromPartial({
        title: 'Welcome to this Jagoo Bahee node',
        kind: PostKind.POST_KIND_TEXT,
        body_markdown:
          'This signed demo post passed the same pipeline, witness log, and proof checks as every other post.',
      }),
    ).finish(),
    {
      credential,
      nullifier: digest(`jb:post:create:v1\0${epoch}\0${salt}`),
      epoch,
      pow: new Uint8Array(0),
    },
    communityId,
  );
  const receipt = await json<{ content_id: string }>(url, '/v1/envelopes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ envelope: base64(post) }),
  });
  seed.fill(0);
  return receipt.content_id;
}

if (require.main === module) {
  const argument = process.argv.find((value) => value.startsWith('--url='));
  const url = argument?.slice('--url='.length);
  void seedDemo(url)
    .then((contentId) => process.stdout.write(`Seeded ${contentId}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`Demo seed failed: ${(error as Error).message}\n`);
      process.exitCode = 1;
    });
}
