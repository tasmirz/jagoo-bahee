import * as tinysecp from 'tiny-secp256k1'
import { createHash, randomBytes } from 'crypto'

// Load server private key from env (hex). If not provided, generate an ephemeral key (not recommended for production).
const privHex = process.env.SERVER_PRIVATE_KEY_HEX || ''
let priv: Buffer
if (privHex && /^([0-9a-fA-F]{64})$/.test(privHex)) {
  priv = Buffer.from(privHex, 'hex')
} else {
  // generate ephemeral key
  priv = randomBytes(32)
}

// derive public key (compressed)
const pub = tinysecp.pointFromScalar(priv) // returns Uint8Array (compressed pubkey) or null

export const serverKeyId = pub ? Buffer.from(pub).toString('hex') : 'server-unknown'

export function getServerPublicKeyBase64(): string {
  return pub ? Buffer.from(pub).toString('base64') : ''
}

export function signServerMessage(payload: string): string {
  const hash = createHash('sha256').update(payload).digest()
  const sig = tinysecp.sign(hash, priv)
  return Buffer.from(sig).toString('base64')
}

export function verifyServerSignature(payload: string, signatureB64: string) {
  try {
    const sig = Buffer.from(signatureB64, 'base64')
    const hash = createHash('sha256').update(payload).digest()
    return tinysecp.verify(hash, pub as Uint8Array, sig)
  } catch (e) {
    return false
  }
}

/**
 * Create a verifiable proof hash that users can store as evidence of post creation.
 * This combines userId + postId + server public key into a hash that can be verified later.
 *
 * Format: SHA256(userId|postId|serverPublicKey)
 *
 * This allows users to prove:
 * 1. They had a post with this ID
 * 2. The server acknowledged it (via signature verification)
 * 3. They can query the server for post status even if deleted
 */
export function createProofHash(userId: string, postId: string): string {
  const payload = `${userId}|${postId}|${serverKeyId}`
  const hash = createHash('sha256').update(payload).digest()
  return hash.toString('hex')
}

/**
 * Verify a proof hash matches the expected format
 */
export function verifyProofHash(userId: string, postId: string, proofHash: string): boolean {
  const expectedHash = createProofHash(userId, postId)
  return expectedHash === proofHash
}

/**
 * Sign a proof hash to create a verifiable token users can store
 * Returns: base64 signature of the proof hash
 */
export function signProofHash(proofHash: string): string {
  const hash = Buffer.from(proofHash, 'hex')
  const sig = tinysecp.sign(hash, priv)
  return Buffer.from(sig).toString('base64')
}

/**
 * Verify a signed proof hash
 */
export function verifySignedProof(proofHash: string, signatureB64: string): boolean {
  try {
    const sig = Buffer.from(signatureB64, 'base64')
    const hash = Buffer.from(proofHash, 'hex')
    return tinysecp.verify(hash, pub as Uint8Array, sig)
  } catch (e) {
    return false
  }
}
