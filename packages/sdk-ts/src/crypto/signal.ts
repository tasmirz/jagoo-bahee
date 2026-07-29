import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, randomBytes } from '@noble/hashes/utils';

const text = new TextEncoder();
const RATCHET_INFO = text.encode('jb:signal:ratchet:v1');

function lengthPrefixed(value: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, value.length, false);
  return concatBytes(length, value);
}

/** MS-04: stable bytes covered by a prekey bundle's Ed25519 signature. */
export function signalPrekeySignatureBytes(fields: {
  readonly identityKey: Uint8Array;
  readonly signedPrekey: Uint8Array;
  readonly kemPublicKey: Uint8Array;
  readonly validUntilMs: bigint;
}): Uint8Array {
  const validUntil = new Uint8Array(8);
  new DataView(validUntil.buffer).setBigInt64(0, fields.validUntilMs, false);
  return concatBytes(
    text.encode('jb:signal:prekey:v1\0'),
    lengthPrefixed(fields.identityKey),
    lengthPrefixed(fields.signedPrekey),
    lengthPrefixed(fields.kemPublicKey),
    validUntil,
  );
}

export interface RatchetState {
  readonly chainKey: Uint8Array;
  readonly counter: bigint;
}

export interface RatchetCiphertext {
  readonly counter: bigint;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly next: RatchetState;
}

function advance(state: RatchetState): { readonly messageKey: Uint8Array; readonly next: RatchetState } {
  if (state.chainKey.length !== 32) throw new Error('ratchet chain key must be 32 bytes');
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, state.counter, false);
  const material = hkdf(sha256, state.chainKey, counter, RATCHET_INFO, 64);
  return {
    messageKey: material.slice(0, 32),
    next: { chainKey: material.slice(32), counter: state.counter + 1n },
  };
}

/** MS-02: each message advances and discards the previous chain key. */
export function sealRatchetMessage(
  state: RatchetState,
  plaintext: Uint8Array,
  aad: Uint8Array = new Uint8Array(),
  nonce: Uint8Array = randomBytes(12),
): RatchetCiphertext {
  if (nonce.length !== 12) throw new Error('ratchet nonce must be 12 bytes');
  const { messageKey, next } = advance(state);
  try {
    return {
      counter: state.counter,
      nonce,
      ciphertext: chacha20poly1305(messageKey, nonce, aad).encrypt(plaintext),
      next,
    };
  } finally {
    messageKey.fill(0);
  }
}

export function openRatchetMessage(
  state: RatchetState,
  message: Pick<RatchetCiphertext, 'counter' | 'nonce' | 'ciphertext'>,
  aad: Uint8Array = new Uint8Array(),
): { readonly plaintext: Uint8Array; readonly next: RatchetState } {
  if (message.counter !== state.counter) {
    throw new Error(`ratchet counter gap: expected ${state.counter}, received ${message.counter}`);
  }
  const { messageKey, next } = advance(state);
  try {
    return {
      plaintext: chacha20poly1305(messageKey, message.nonce, aad).decrypt(message.ciphertext),
      next,
    };
  } finally {
    messageKey.fill(0);
  }
}
