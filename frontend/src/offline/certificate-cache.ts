import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  certificateSelfSignatureBytes,
  pqAttestationBytes,
  type Plane,
  type SignedEnvelope,
} from '@jagoo/sdk';
import { ed25519, mldsa } from '@jagoo/sdk/crypto';

const KEY = 'jb.mesh.certificate-cache.v1';

interface DirectoryCertificate {
  readonly id: string;
  readonly plane: Plane;
  readonly deviceKey: string;
  readonly pqKey: string;
  readonly pqAttestation: string;
  readonly validFromMs: number;
  readonly validUntilMs: number;
  readonly selfSignature: string;
  readonly certifiedAtMs: number;
}

interface DirectoryRevocation {
  readonly id: string;
  readonly effectiveFromMs: number;
}

interface Cache {
  readonly refreshedAtMs: number;
  readonly certificates: readonly DirectoryCertificate[];
  readonly revocations: readonly DirectoryRevocation[];
}

const empty: Cache = { refreshedAtMs: 0, certificates: [], revocations: [] };
const unbase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
const unhex = (value: string): Uint8Array =>
  Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));

async function read(): Promise<Cache> {
  const encoded = await AsyncStorage.getItem(KEY);
  if (!encoded) return empty;
  try {
    return JSON.parse(encoded) as Cache;
  } catch {
    return empty;
  }
}

function validate(certificate: DirectoryCertificate): boolean {
  const deviceKey = unhex(certificate.deviceKey);
  const pqKey = unbase64(certificate.pqKey);
  const pqAttestation = unbase64(certificate.pqAttestation);
  const fields = {
    plane: certificate.plane,
    deviceKey,
    pqKey,
    validFrom: BigInt(certificate.validFromMs),
    validUntil: BigInt(certificate.validUntilMs),
  };
  return (
    deviceKey.length === 32 &&
    mldsa.verifyAttestation(pqAttestation, pqAttestationBytes(fields), pqKey) &&
    ed25519.verify(
      unbase64(certificate.selfSignature),
      certificateSelfSignatureBytes(fields, pqAttestation),
      deviceKey,
    )
  );
}

export async function refreshMeshCertificates(baseUrl: string): Promise<number> {
  const documents = await Promise.all(
    ['FORUM', 'SIGNAL'].map(async (plane) => {
      const response = await fetch(
        new URL(`/v1/identity/certificates?plane=${plane}`, `${baseUrl}/`).toString(),
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`certificate directory returned HTTP ${response.status}`);
      return response.json() as Promise<{
        readonly certificates: readonly DirectoryCertificate[];
        readonly revocations: readonly DirectoryRevocation[];
      }>;
    }),
  );
  const certificates = documents.flatMap((document) => document.certificates).filter(validate);
  const cache: Cache = {
    refreshedAtMs: Date.now(),
    certificates,
    revocations: documents.flatMap((document) => document.revocations),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  return certificates.length;
}

export async function verifyCachedMeshCertificate(envelope: SignedEnvelope): Promise<boolean> {
  const cache = await read();
  const id = Array.from(envelope.author_key, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const atMs = Number(envelope.created_at_ms);
  const certificate = cache.certificates.find(
    (item) =>
      item.id === id &&
      item.plane === envelope.plane &&
      item.certifiedAtMs <= atMs &&
      item.validFromMs <= atMs &&
      item.validUntilMs > atMs,
  );
  if (!certificate) return false;
  const revocation = cache.revocations.find((item) => item.id === id);
  return !revocation || atMs < revocation.effectiveFromMs;
}
