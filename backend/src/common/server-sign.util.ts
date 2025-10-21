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
