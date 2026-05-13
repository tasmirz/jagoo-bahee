import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalJson, sha256Hex, verifyReceipt } from '../src/verification.js'

test('receipt verification rejects tampered canonical payloads', () => {
  const canonicalPayload = canonicalJson({ content: 'hello', id: '1' })
  const receipt = {
    receiptVersion: 1,
    serverId: 'server-a',
    serverBaseUrl: 'https://server-a.example',
    keyId: 'key-a',
    action: 'post.created',
    subjectType: 'post',
    subjectId: '665b3f2a9c5a7d0012a1b300',
    actorPublicKey: '',
    canonicalPayload,
    payloadHash: sha256Hex(canonicalPayload),
    actorSignature: '',
    serverSignature: 'signature'
  }

  assert.equal(verifyReceipt(receipt).payloadOk, true)
  assert.equal(verifyReceipt({ ...receipt, canonicalPayload: canonicalJson({ content: 'edited', id: '1' }) }).payloadOk, false)
})
