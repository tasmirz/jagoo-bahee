import { cryptoBackend } from '../crypto/backend.js';
import { verify as verifyEd25519 } from '../crypto/ed25519.js';
import { concatBytes, frameParts } from './wire.js';

const text = new TextEncoder();

export interface OfflineTreeHead {
  readonly serverKey: Uint8Array;
  readonly treeSize: number;
  readonly rootHash: Uint8Array;
  readonly timestampMs: number;
  readonly signature: Uint8Array;
}

export interface OfflineReceipt {
  readonly contentId: string;
  readonly logIndex: number;
  readonly leafIndex: number;
  readonly acceptedAtMs: number;
  readonly serverId: string;
  readonly serverKey: Uint8Array;
  readonly signature: Uint8Array;
  readonly sth: OfflineTreeHead;
  readonly inclusionProof: readonly Uint8Array[];
}

const hashLeaf = (contentId: string): Uint8Array =>
  cryptoBackend().sha256(concatBytes(new Uint8Array([0]), text.encode(contentId)));
const hashNode = (left: Uint8Array, right: Uint8Array): Uint8Array =>
  cryptoBackend().sha256(concatBytes(new Uint8Array([1]), left, right));

export function sthSigningBytes(sth: Omit<OfflineTreeHead, 'signature' | 'serverKey'>): Uint8Array {
  return concatBytes(
    text.encode(`jb-sth-v1\n${sth.treeSize}\n${sth.timestampMs}\n`),
    sth.rootHash,
  );
}

export function receiptSigningBytes(receipt: Omit<OfflineReceipt, 'signature'>): Uint8Array {
  return frameParts([
    text.encode('jb-receipt-v1'),
    text.encode(receipt.contentId),
    text.encode(String(receipt.logIndex)),
    text.encode(String(receipt.leafIndex)),
    text.encode(String(receipt.acceptedAtMs)),
    text.encode(receipt.serverId),
    receipt.serverKey,
    text.encode(String(receipt.sth.treeSize)),
    receipt.sth.rootHash,
    text.encode(String(receipt.sth.timestampMs)),
    receipt.sth.serverKey,
    receipt.sth.signature,
    ...receipt.inclusionProof,
  ]);
}

export function verifyInclusion(receipt: OfflineReceipt): boolean {
  if (
    receipt.leafIndex < 0 ||
    receipt.leafIndex >= receipt.sth.treeSize ||
    !Number.isSafeInteger(receipt.leafIndex)
  ) {
    return false;
  }
  let index = receipt.leafIndex;
  let last = receipt.sth.treeSize - 1;
  let hash = hashLeaf(receipt.contentId);
  for (const sibling of receipt.inclusionProof) {
    if ((index & 1) === 1 || index === last) {
      hash = hashNode(sibling, hash);
      while ((index & 1) === 0 && index !== 0) {
        index >>= 1;
        last >>= 1;
      }
    } else {
      hash = hashNode(hash, sibling);
    }
    index >>= 1;
    last >>= 1;
  }
  if (index !== 0 || last !== 0 || hash.length !== receipt.sth.rootHash.length) return false;
  return hash.every((byte, position) => byte === receipt.sth.rootHash[position]);
}

export function verifyReceipt(receipt: OfflineReceipt): boolean {
  if (
    receipt.serverKey.length !== receipt.sth.serverKey.length ||
    !receipt.serverKey.every((byte, index) => byte === receipt.sth.serverKey[index])
  ) {
    return false;
  }
  const sthValid = verifyEd25519(
    receipt.sth.signature,
    sthSigningBytes(receipt.sth),
    receipt.sth.serverKey,
  );
  const receiptValid = verifyEd25519(
    receipt.signature,
    receiptSigningBytes(receipt),
    receipt.serverKey,
  );
  return sthValid && receiptValid && verifyInclusion(receipt);
}
