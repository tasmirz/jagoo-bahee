/**
 * The production signature verifier — real Ed25519, via the same `@jagoo/sdk` primitives
 * the client signs with.
 *
 * This is an adapter rather than a double: there is no reason to stub signature
 * verification anywhere except in a test that specifically wants to isolate another step.
 * Using the real one by default means the pipeline's integration tests exercise genuine
 * cryptography, so a canonicalisation mistake shows up as a failed signature rather than
 * passing quietly against a stub that always returns true.
 */

import { ed25519 } from '@jagoo/sdk/crypto';
import { KeyAlg } from '../../../core/domain/envelope.js';
import { SignatureVerifier } from '../../../core/ports/identity.port.js';

export class RealSignatureVerifier extends SignatureVerifier {
  verify(alg: KeyAlg, key: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
    // ALG POLICY (step 6) already restricted which algorithms a domain accepts; this is the
    // second line — an unimplemented algorithm must fail closed, never default to "ok".
    if (alg !== KeyAlg.ED25519) return false;
    return ed25519.verify(sig, msg, key);
  }
}
