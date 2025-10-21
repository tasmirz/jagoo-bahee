import * as tinysecp from 'tiny-secp256k1'
import { Types } from 'mongoose'

/**
 * Verify a tiny-secp256k1 signature. publicKey is Buffer or hex string.
 * payload should be the canonical string that was signed; we SHA-256 it before verify.
 */
import { createHash } from 'crypto'

export function verifySignature(
  publicKeyBuf: Buffer | Uint8Array | string,
  payload: string,
  signature: Buffer | Uint8Array | string
) {
  let pub: Uint8Array
  if (typeof publicKeyBuf === 'string') {
    pub = Buffer.from(publicKeyBuf, 'hex')
  } else {
    pub = Buffer.from(publicKeyBuf as Buffer)
  }
  const sig = typeof signature === 'string' ? Buffer.from(signature, 'base64') : Buffer.from(signature as Buffer)
  const hash = createHash('sha256').update(payload).digest()
  try {
    return tinysecp.verify(hash, pub, sig)
  } catch (e) {
    return false
  }
}

export async function getAuthPublicKeyById(db: any, authId: string): Promise<Buffer | null> {
  try {
    if (!Types.ObjectId.isValid(authId)) return null
    const doc = await db.collection('auths').findOne({ _id: new Types.ObjectId(authId) })
    if (!doc || !doc.publicKey) return null
    return Buffer.from(doc.publicKey)
  } catch (e) {
    return null
  }
}
