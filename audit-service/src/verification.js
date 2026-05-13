import { createHash } from 'crypto'
import * as secp from 'tiny-secp256k1'

export function canonicalJson(value) {
  return JSON.stringify(normalize(value))
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function verifyReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return { ok: false, reason: 'receipt must be an object' }
  if (!receipt.canonicalPayload || !receipt.payloadHash || !receipt.serverSignature) {
    return { ok: false, reason: 'missing required receipt fields' }
  }

  const payloadHash = sha256Hex(String(receipt.canonicalPayload))
  const payloadOk = payloadHash === String(receipt.payloadHash)
  const unsigned = {
    receiptVersion: Number(receipt.receiptVersion || 1),
    serverId: String(receipt.serverId || receipt.serverBaseUrl || ''),
    serverBaseUrl: String(receipt.serverBaseUrl || receipt.serverId || ''),
    keyId: String(receipt.keyId || ''),
    action: String(receipt.action || ''),
    subjectType: String(receipt.subjectType || receipt.contentType || ''),
    subjectId: String(receipt.subjectId || receipt.contentId || ''),
    actorPublicKey: String(receipt.actorPublicKey || receipt.userPublicKey || ''),
    canonicalPayload: String(receipt.canonicalPayload || ''),
    payloadHash: String(receipt.payloadHash || receipt.contentHash || ''),
    actorSignature: String(receipt.actorSignature || receipt.userSignature || ''),
    legacy: receipt.legacy === true
  }
  const serverOk = verifySecpSignature(canonicalJson(unsigned), String(receipt.serverSignature || ''), String(receipt.serverPublicKey || ''))
  const actorPublicKey = String(receipt.actorPublicKey || receipt.userPublicKey || '')
  const actorSignature = String(receipt.actorSignature || receipt.userSignature || '')
  const actorOk = actorPublicKey && actorSignature ? verifySecpSignature(String(receipt.canonicalPayload), actorSignature, actorPublicKey) : null

  return {
    ok: payloadOk && serverOk !== false && actorOk !== false,
    payloadOk,
    serverOk,
    actorOk,
    reason: payloadOk ? undefined : 'payload hash mismatch'
  }
}

function verifySecpSignature(payload, signatureB64, publicKeyB64) {
  if (!signatureB64 || !publicKeyB64) return null
  try {
    const hash = createHash('sha256').update(payload).digest()
    return secp.verify(hash, Buffer.from(publicKeyB64, 'base64'), Buffer.from(signatureB64, 'base64'))
  } catch {
    return false
  }
}

function normalize(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => normalize(item))
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = normalize(value[key])
      return acc
    }, {})
}
