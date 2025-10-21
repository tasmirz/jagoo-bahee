import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'
import * as crypto from 'crypto'

const bip32 = BIP32Factory(ecc as any)

export function generateServerKeyFromPassphrase(passphrase?: string) {
  // generate a new mnemonic
  const mnemonic = bip39.generateMnemonic(256)
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase)
  const root = bip32.fromSeed(seed)
  // derive a key for server signing using a hardened path
  const node = root.derivePath("m/44'/0'/0'/0/0")
  const priv = node.privateKey
  if (!priv) throw new Error('failed to derive private key')
  const privHex = Buffer.from(priv).toString('hex')
  // compressed public key
  const pub = ecc.pointFromScalar(priv)
  const pubHex = pub ? Buffer.from(pub).toString('hex') : ''
  const pubBase64 = pub ? Buffer.from(pub).toString('base64') : ''

  // optional id (hex of pub)
  const keyId = pubHex || crypto.createHash('sha256').update(priv).digest('hex')

  return {
    mnemonic,
    privateKeyHex: privHex,
    publicKeyHex: pubHex,
    publicKeyBase64: pubBase64,
    keyId
  }
}

// If run directly with node, print a generated keypair to stdout
if (require.main === module) {
  const passphrase = process.argv[2]
  const out = generateServerKeyFromPassphrase(passphrase)
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2))
}
