import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as tinySecp from 'tiny-secp256k1'
import { createHash } from 'crypto'
import fetch from 'node-fetch'

const bip32 = BIP32Factory(tinySecp)

// Default deterministic test identity (override with env vars)
// Use a known-valid 12-word test mnemonic by default
const DEFAULT_MNEMONIC =
  process.env.TEST_MNEMONIC ||
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const DEFAULT_PASSPHRASE = process.env.TEST_PASSPHRASE || 'test-smoke-passphrase'

export interface TesterIdentity {
  mnemonic: string
  passphrase: string
  privateKey: Buffer
  publicKey: Buffer
}

export async function deriveIdentity(mnemonic?: string, passphrase?: string): Promise<TesterIdentity> {
  const m = mnemonic || DEFAULT_MNEMONIC
  const p = passphrase || DEFAULT_PASSPHRASE
  if (!bip39.validateMnemonic(m)) {
    throw new Error('Invalid test mnemonic')
  }
  const seed = bip39.mnemonicToSeedSync(m, p)
  const root = bip32.fromSeed(seed)
  const path = "m/44'/0'/0'/0'/0'"
  const leaf = root.derivePath(path)
  const privateKeyBytes = leaf.privateKey
  if (!privateKeyBytes) throw new Error('Failed to derive private key')
  const publicKeyBytes = leaf.publicKey

  // zero seed buffers after deriving
  seed.fill(0)

  return {
    mnemonic: m,
    passphrase: p,
    privateKey: Buffer.from(privateKeyBytes),
    publicKey: Buffer.from(publicKeyBytes)
  }
}

export async function authenticate(
  mnemonic?: string,
  passphrase?: string
): Promise<{ jwt: string; identity: TesterIdentity }> {
  const identity = await deriveIdentity(mnemonic, passphrase)

  // Get challenge
  const q = await fetch('http://localhost:3000/auth/challenge')
  const token = await q.text()

  const parts = token.split('.')
  const base64UrlDecode = (str: string) => Buffer.from(str, 'base64url').toString('utf8')
  const challenge = JSON.parse(base64UrlDecode(parts[1])).challenge

  const messageHash = createHash('sha256').update(challenge).digest()
  // tiny-secp returns Uint8Array/Buffer from BIP32Factory use
  const signature = tinySecp.sign(messageHash, identity.privateKey)

  const u = await fetch('http://localhost:3000/auth/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: token,
      signedData: Buffer.from(signature).toString('base64'),
      publicKey: identity.publicKey.toString('base64')
    })
  })
  const jwt = await u.text()
  return { jwt, identity }
}

export async function ensureProfile(jwt: string, username?: string): Promise<any> {
  const uname = username || `smoke_user_${process.env.TEST_USER_SUFFIX || 'default'}`
  // Try creating profile; if exists, fall back to fetching
  const res = await fetch('http://localhost:3000/users/me/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ username: uname })
  })

  if (res.ok) {
    return await res.json()
  }

  // If not ok (already exists, etc.), attempt to fetch profile
  const profileRes = await fetch('http://localhost:3000/users/me/profile', {
    headers: { Authorization: `Bearer ${jwt}` }
  })
  if (profileRes.ok) return await profileRes.json()

  const text = await res.text()
  throw new Error(`Could not ensure profile: create failed (${res.status}): ${text}`)
}

export default { deriveIdentity, authenticate, ensureProfile }
