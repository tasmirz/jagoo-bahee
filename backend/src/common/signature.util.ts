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
    pub = new Uint8Array(publicKeyBuf as Buffer)
  }
  let sig: Uint8Array
  if (typeof signature === 'string') {
    sig = new Uint8Array(Buffer.from(signature, 'base64'))
  } else {
    sig = new Uint8Array(signature as Buffer)
  }
  const hash = createHash('sha256').update(payload).digest()
  try {
    const result = tinysecp.verify(hash, pub, sig)
    return result
  } catch (e) {
    console.error('Error during signature verification:', e)
    return false
  }
}

export async function getAuthPublicKeyById(db: any, authId: string): Promise<Buffer | null> {
  try {
    const authObjId = new Types.ObjectId(authId)
    const authRec = await db.collection('auths').findOne({ _id: authObjId })
    if (!authRec) {
      console.error('No auth record found for ID:', authId)
      return null
    }
    if (!authRec.publicKey) {
      console.error('Auth record exists but has no publicKey:', authRec)
      return null
    }
    // MongoDB stores Buffer as Binary type, need to extract the buffer
    let pubKeyBuffer: Buffer
    if (Buffer.isBuffer(authRec.publicKey)) {
      pubKeyBuffer = authRec.publicKey
    } else if (authRec.publicKey && authRec.publicKey.buffer) {
      // MongoDB Binary type has a buffer property
      pubKeyBuffer = Buffer.from(authRec.publicKey.buffer)
    } else if (authRec.publicKey && typeof authRec.publicKey === 'object') {
      // Try to extract buffer from Binary object
      pubKeyBuffer = Buffer.from(authRec.publicKey)
    } else {
      console.error('Unable to convert publicKey to Buffer:', authRec.publicKey)
      return null
    }
    if (pubKeyBuffer.length === 0) {
      console.error('Public key buffer is empty!')
      return null
    }
    
    return pubKeyBuffer
  } catch (error) {
    console.error('Error in getAuthPublicKeyById:', error)
    return null
  }
}
