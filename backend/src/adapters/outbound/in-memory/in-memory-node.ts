/**
 * Node identity and the nonce store.
 *
 * The nonce store backs pipeline step 12. Its production form is Redis with a TTL matched
 * to the clock window — remembering nonces forever is unbounded growth, and remembering
 * them for less than the accepted clock window would let a captured envelope be replayed
 * once its nonce expired but its timestamp was still valid (P1-G8).
 */

import { ed25519 } from '@jagoo/sdk/crypto';
import { identityId } from '@jagoo/sdk/core';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import type { NonceStore } from '../../../core/app/ingress.js';

export class InMemoryNodeSigner extends NodeSigner {
  readonly publicKey: Uint8Array;
  readonly serverId: string;

  constructor(private readonly seed: Uint8Array = new Uint8Array(32).fill(1)) {
    super();
    this.publicKey = ed25519.derivePublicKey(seed);
    // jbs1… would be the server prefix; identityId gives the same base32 body.
    this.serverId = identityId(this.publicKey).replace(/^jbk1/, 'jbs1');
  }

  sign(message: Uint8Array): Uint8Array {
    return ed25519.sign(message, this.seed);
  }
}

export class InMemoryNonceStore implements NonceStore {
  private readonly seenNonces = new Set<string>();

  private static key(authorKey: Uint8Array, nonce: Uint8Array): string {
    return `${Buffer.from(authorKey).toString('hex')}:${Buffer.from(nonce).toString('hex')}`;
  }

  async seen(authorKey: Uint8Array, nonce: Uint8Array): Promise<boolean> {
    return this.seenNonces.has(InMemoryNonceStore.key(authorKey, nonce));
  }

  async remember(authorKey: Uint8Array, nonce: Uint8Array): Promise<void> {
    if (nonce.length === 0) return;
    this.seenNonces.add(InMemoryNonceStore.key(authorKey, nonce));
  }

  get size(): number {
    return this.seenNonces.size;
  }
}
