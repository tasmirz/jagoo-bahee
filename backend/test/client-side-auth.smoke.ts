import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as tinySecp from 'tiny-secp256k1'
import { createHash } from 'crypto'
import fetch from 'node-fetch'
async function auth() {
  const bip32 = BIP32Factory(tinySecp)

  // 1. Obtain or generate mnemonic
  enum CLIFlags {
    mnemonic = '--mnemonic',
    passphrase = '--passphrase'
  }

  function getArg(flag: CLIFlags): string | undefined {
    const idx = process.argv.indexOf(flag)
    return idx !== -1 ? process.argv[idx + 1] : undefined
  }

  let mnemonic: string
  const cliMnemonic = getArg(CLIFlags.mnemonic)
  if (cliMnemonic) {
    if (!bip39.validateMnemonic(cliMnemonic)) {
      console.error('❌ Invalid mnemonic passed via --mnemonic')
      process.exit(1)
    }
    mnemonic = cliMnemonic
  } else {
    mnemonic = bip39.generateMnemonic(256)
  }

  // 2. Optional extra passphrase
  let passphrase = getArg(CLIFlags.passphrase) ?? ''

  // 3. Derive seed and root node
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase)
  const root = bip32.fromSeed(seed)

  // 4. Derive single hardened leaf at m/44'/0'/0'/0'/0'
  const path = "m/44'/0'/0'/0'/0'"
  const leaf = root.derivePath(path)

  // 5. Extract keys
  const privateKeyBytes = leaf.privateKey
  if (!privateKeyBytes) {
    console.error('❌ Failed to derive private key')
    process.exit(1)
  }
  const publicKeyBytes = leaf.publicKey

  // 6. Output (demo only)
  console.log('--- Single Hardened Keypair ---')
  console.table({
    Path: path,
    //Mnemonic: mnemonic,
    Passphrase: passphrase || '(none)',
    'Private Key': Buffer.from(privateKeyBytes).toString('base64'),
    'Public Key': Buffer.from(publicKeyBytes).toString('base64')
  })

  let q = await fetch('http://localhost:3000/auth/challenge')
  const token = await q.text()
  const parts = token.split('.')

  const base64UrlDecode = str => Buffer.from(str, 'base64url').toString('utf8')
  const challenge = JSON.parse(base64UrlDecode(parts[1])).challenge

  // 7. Sign a message
  const message = challenge
  const messageHash = createHash('sha256').update(message).digest()

  const signature = tinySecp.sign(messageHash, privateKeyBytes)
  console.log('Signature', Buffer.from(signature).toString('base64'))

  const valid = tinySecp.verify(messageHash, publicKeyBytes, signature)
  console.log('Verify:', valid)

  // 8. Zero‑out sensitive buffers
  seed.fill(0)
  leaf.privateKey?.fill(0)
  if (root.privateKey) root.privateKey.fill(0)

  let u = await fetch('http://localhost:3000/auth/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json' // JSON payload
    },
    body: JSON.stringify({
      challenge: token,
      signedData: Buffer.from(signature).toString('base64'),
      publicKey: Buffer.from(publicKeyBytes).toString('base64')
    })
  })
  let the_jwt = await u.text()
  console.log('JWT:', the_jwt)
  return the_jwt
}
auth()
