import { randomBytes } from 'node:crypto';
import { RsaBlindCredentialIssuer } from '../adapters/outbound/redis/rsa-blind-credentials.js';

const secret = (): string => randomBytes(32).toString('base64');
const credentialJwk = Buffer.from(JSON.stringify(RsaBlindCredentialIssuer.generateJwk())).toString(
  'base64',
);

// This command is explicitly operator-invoked. Its output is secret material and must be
// redirected into an ignored secret store, never copied into source or build logs.
process.stdout.write(
  [
    `NODE_SIGNING_SEED=${secret()}`,
    `POW_SECRET=${secret()}`,
    `AUTH_ACCESS_SECRET=${secret()}`,
    `AUTH_REFRESH_SECRET=${secret()}`,
    `CREDENTIAL_RSA_JWK=${credentialJwk}`,
    '',
  ].join('\n'),
);
