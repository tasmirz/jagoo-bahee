import fetch from 'node-fetch'
import tester from './tester'
import { createHash } from 'crypto'

async function attachmentsSmoke() {
  // Use deterministic test identity (overridable via TEST_MNEMONIC/TEST_PASSPHRASE env vars)
  const { jwt, identity } = await tester.authenticate()
  console.log('JWT obtained for test identity')

  // Create user profile
  const username = 'smoke_attach_' + Date.now()
  let createRes = await fetch('http://localhost:3000/users/me/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ username })
  })
  if (createRes.status !== 201 && createRes.status !== 200) {
    console.error('Failed to create user profile', createRes.status)
    console.log(await createRes.text())
    process.exit(1)
  }
  const created: any = await createRes.json()
  console.log('Created user:', created.username, created._id)

  // Prepare a small file to upload
  const content = Buffer.from('hello world from smoke test')
  const contentHash = createHash('sha256').update(content).digest('hex')
  const fileSignature = require('tiny-secp256k1').sign(Buffer.from(contentHash, 'hex'), identity.privateKey)

  // Request presigned upload URL
  const uploadReq = await fetch('http://localhost:3000/attachments/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      ownerId: created._id,
      originalFilename: 'smoke.txt',
      mimeType: 'text/plain',
      sizeBytes: content.length,
      type: 'document',
      signature: Buffer.from(fileSignature).toString('base64'),
      contentHash,
      isPublic: true
    })
  })

  if (!uploadReq.ok) {
    console.error('upload-url request failed', uploadReq.status)
    console.log(await uploadReq.text())
    process.exit(1)
  }

  const uploadResp: any = await uploadReq.json()
  console.log('Upload URL response:', uploadResp.uploadUrl ? 'has uploadUrl' : 'no uploadUrl')

  const { uploadUrl, attachment, minioKey } = uploadResp as any
  if (!uploadUrl) {
    console.error('No uploadUrl returned')
    process.exit(1)
  }

  // PUT the file directly to the presigned URL
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: content
  })

  if (!putRes.ok) {
    console.error('Direct upload failed', putRes.status)
    const body = await putRes.text()
    console.error('Body:', body)
    process.exit(1)
  }
  console.log('File uploaded successfully to presigned URL')

  // Verify attachment in DB via API
  const getRes = await fetch(`http://localhost:3000/attachments/${attachment._id}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  })

  if (!getRes.ok) {
    console.error('Failed to fetch attachment', getRes.status)
    console.log(await getRes.text())
    process.exit(1)
  }
  const got: any = await getRes.json()
  console.log('Attachment record retrieved, minioKey:', got.minioKey)
  if (got.minioKey !== minioKey) {
    console.warn('minioKey mismatch between creation response and DB')
  }

  // zeroing done inside tester; also clear identity privateKey in-memory
  identity.privateKey.fill(0)

  console.log('Attachment smoke test completed successfully')
}

attachmentsSmoke()
