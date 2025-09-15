import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as tinySecp from 'tiny-secp256k1'
import { createHash } from 'crypto'
import fetch from 'node-fetch'

async function usersSmoke() {
  const bip32 = BIP32Factory(tinySecp)

  // generate mnemonic
  const mnemonic = bip39.generateMnemonic(256)
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const root = bip32.fromSeed(seed)
  const path = "m/44'/0'/0'/0'/0'"
  const leaf = root.derivePath(path)
  const privateKeyBytes = leaf.privateKey
  if (!privateKeyBytes) {
    console.error('Failed to derive private key')
    process.exit(1)
  }
  const publicKeyBytes = leaf.publicKey

  // Get challenge
  let q = await fetch('http://localhost:3000/auth/challenge')
  const token = await q.text()

  const parts = token.split('.')
  const base64UrlDecode = (str: string) => Buffer.from(str, 'base64url').toString('utf8')
  const challenge = JSON.parse(base64UrlDecode(parts[1])).challenge

  // Sign challenge
  const messageHash = createHash('sha256').update(challenge).digest()
  const signature = tinySecp.sign(messageHash, privateKeyBytes)

  // Authenticate and obtain JWT
  let u = await fetch('http://localhost:3000/auth/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: token,
      signedData: Buffer.from(signature).toString('base64'),
      publicKey: Buffer.from(publicKeyBytes).toString('base64')
    })
  })
  const jwt = await u.text()
  console.log('JWT:', jwt)

  // Create user profile (protected)
  let createRes = await fetch('http://localhost:3000/users/me/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ username: 'smoke_' + Date.now() })
  })
  console.log('create status', createRes.status)
  const created = await createRes.json()
  console.log('created', created)

  // Fetch profile
  let profileRes = await fetch('http://localhost:3000/users/me/profile', {
    headers: { Authorization: `Bearer ${jwt}` }
  })
  console.log('profile status', profileRes.status)
  let profile: any = null
  try {
    profile = await profileRes.json()
  } catch (e) {
    const text = await profileRes.text()
    console.warn('profile body not JSON, raw:', text)
  }
  console.log('profile', profile)

  // zero sensitive buffers
  seed.fill(0)
  leaf.privateKey?.fill(0)
  if (root.privateKey) root.privateKey.fill(0)
}

usersSmoke()
