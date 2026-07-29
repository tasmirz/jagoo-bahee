import { contentId, serverId } from './content-id.js';
import { decodeSignedEnvelope } from './decode.js';
import { verifyReceipt, type OfflineReceipt, type OfflineTreeHead } from './evidence.js';

export const AUDIT_CERTIFICATE_VERSION = 1 as const;

export interface AuditTreeHeadJson {
  readonly tree_size: number;
  readonly server_key: string;
  readonly root_hash: string;
  readonly timestamp_ms: number;
  readonly signature: string;
}

export interface AuditReceiptJson {
  readonly content_id: string;
  readonly log_index: number;
  readonly leaf_index: number;
  readonly accepted_at_ms: number;
  readonly server_id: string;
  readonly server_key: string;
  readonly signature: string;
  readonly sth: AuditTreeHeadJson;
  readonly inclusion_proof: readonly string[];
}

/**
 * Exact HTTP request material retained by the client. `body_base64` is the UTF-8 JSON body,
 * not a reconstructed object, so an auditor can prove which packet produced the receipt.
 */
export interface AuditRequestPacket {
  readonly method: 'POST';
  readonly path: '/v1/envelopes';
  readonly content_type: 'application/json';
  readonly body_base64: string;
}

export interface AuditCertificate {
  readonly version: typeof AUDIT_CERTIFICATE_VERSION;
  readonly identifier: string;
  readonly request: AuditRequestPacket;
  readonly acknowledgement: AuditReceiptJson;
}

export interface AuditCertificateVerification {
  readonly valid: boolean;
  readonly identifier: string | null;
  readonly checks: {
    readonly requestPacket: boolean;
    readonly contentIdentifier: boolean;
    readonly serverIdentity: boolean;
    readonly receiptSignature: boolean;
  };
  readonly detail?: string;
}

function decodeBase64(value: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('invalid base64');
  }
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return globalThis.btoa(binary);
}

function parseReceipt(value: AuditReceiptJson): OfflineReceipt {
  const sth: OfflineTreeHead = {
    treeSize: value.sth.tree_size,
    serverKey: decodeBase64(value.sth.server_key),
    rootHash: decodeBase64(value.sth.root_hash),
    timestampMs: value.sth.timestamp_ms,
    signature: decodeBase64(value.sth.signature),
  };
  return {
    contentId: value.content_id,
    logIndex: value.log_index,
    leafIndex: value.leaf_index,
    acceptedAtMs: value.accepted_at_ms,
    serverId: value.server_id,
    serverKey: decodeBase64(value.server_key),
    signature: decodeBase64(value.signature),
    sth,
    inclusionProof: value.inclusion_proof.map(decodeBase64),
  };
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isAuditCertificate(value: unknown): value is AuditCertificate {
  if (!value || typeof value !== 'object') return false;
  const certificate = value as Partial<AuditCertificate>;
  const request = certificate.request as Partial<AuditRequestPacket> | undefined;
  const receipt = certificate.acknowledgement as Partial<AuditReceiptJson> | undefined;
  const sth = receipt?.sth as Partial<AuditTreeHeadJson> | undefined;
  return (
    certificate.version === AUDIT_CERTIFICATE_VERSION &&
    typeof certificate.identifier === 'string' &&
    request?.method === 'POST' &&
    request.path === '/v1/envelopes' &&
    request.content_type === 'application/json' &&
    typeof request.body_base64 === 'string' &&
    typeof receipt?.content_id === 'string' &&
    isSafeInteger(receipt.log_index) &&
    isSafeInteger(receipt.leaf_index) &&
    isSafeInteger(receipt.accepted_at_ms) &&
    typeof receipt.server_id === 'string' &&
    typeof receipt.server_key === 'string' &&
    typeof receipt.signature === 'string' &&
    isSafeInteger(sth?.tree_size) &&
    typeof sth?.server_key === 'string' &&
    typeof sth.root_hash === 'string' &&
    isSafeInteger(sth.timestamp_ms) &&
    typeof sth.signature === 'string' &&
    Array.isArray(receipt.inclusion_proof) &&
    receipt.inclusion_proof.every((part) => typeof part === 'string')
  );
}

export function createAuditCertificate(
  requestBodyUtf8: Uint8Array,
  acknowledgement: AuditReceiptJson,
): AuditCertificate {
  return {
    version: AUDIT_CERTIFICATE_VERSION,
    identifier: acknowledgement.content_id,
    request: {
      method: 'POST',
      path: '/v1/envelopes',
      content_type: 'application/json',
      body_base64: encodeBase64(requestBodyUtf8),
    },
    acknowledgement,
  };
}

export function verifyAuditCertificate(value: unknown): AuditCertificateVerification {
  const failed = (
    detail: string,
    checks: AuditCertificateVerification['checks'],
    identifier: string | null = null,
  ): AuditCertificateVerification => ({ valid: false, identifier, checks, detail });
  const emptyChecks: AuditCertificateVerification['checks'] = {
    requestPacket: false,
    contentIdentifier: false,
    serverIdentity: false,
    receiptSignature: false,
  };
  if (!isAuditCertificate(value)) {
    return failed('certificate shape or version is invalid', emptyChecks);
  }

  try {
    const requestBytes = decodeBase64(value.request.body_base64);
    const packet = JSON.parse(new TextDecoder().decode(requestBytes)) as {
      readonly envelope?: unknown;
    };
    if (typeof packet.envelope !== 'string') {
      return failed('request packet does not contain one envelope', emptyChecks, value.identifier);
    }
    const envelope = decodeSignedEnvelope(decodeBase64(packet.envelope));
    const computedIdentifier = contentId(envelope);
    const requestPacket = true;
    const contentIdentifier =
      computedIdentifier === value.identifier &&
      value.identifier === value.acknowledgement.content_id;
    const receipt = parseReceipt(value.acknowledgement);
    const serverIdentity =
      receipt.serverKey.length === 32 &&
      receipt.sth.serverKey.length === 32 &&
      serverId(receipt.serverKey) === receipt.serverId &&
      receipt.serverKey.every((byte, index) => byte === receipt.sth.serverKey[index]);
    const receiptSignature = contentIdentifier && serverIdentity && verifyReceipt(receipt);
    const checks = { requestPacket, contentIdentifier, serverIdentity, receiptSignature };
    return receiptSignature
      ? { valid: true, identifier: value.identifier, checks }
      : failed('request identifier or node receipt did not verify', checks, value.identifier);
  } catch (error) {
    return failed(
      error instanceof Error ? error.message : 'certificate could not be decoded',
      emptyChecks,
      value.identifier,
    );
  }
}
