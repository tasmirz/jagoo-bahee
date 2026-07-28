import { ed25519 } from '@jagoo/sdk/crypto';
import { identityId } from '@jagoo/sdk/core';
import { NodeSigner } from '../../core/ports/node-signer.port.js';

/** Persistent node identity. The seed is supplied by secret management, never generated on boot. */
export class ConfiguredNodeSigner extends NodeSigner {
  readonly publicKey: Uint8Array;
  readonly serverId: string;

  constructor(private readonly seed: Uint8Array) {
    super();
    if (seed.length !== 32) throw new Error('NODE_SIGNING_SEED must decode to 32 bytes');
    this.publicKey = ed25519.derivePublicKey(seed);
    this.serverId = identityId(this.publicKey).replace(/^jbk1/, 'jbs1');
  }

  sign(message: Uint8Array): Uint8Array {
    return ed25519.sign(message, this.seed);
  }
}
