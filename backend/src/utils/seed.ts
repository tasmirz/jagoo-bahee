import 'dotenv/config'
import mongoose from 'mongoose'
import config from '../config'

import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as tinySecp from 'tiny-secp256k1'

import { Auth, AuthSchema } from '../auth/schemas/auth.schema'
import { User, UserSchema } from '../users/schemas/user.schema'

const bip32 = BIP32Factory(tinySecp)

// Read passphrases from environment or use defaults. Comma-separated list.
const PASSPHRASES: string[] = ['passphrase1', 'admin-passphrase']

// Mnemonic can be provided via SEED_MNEMONIC env. If not provided we generate one and print it.
const MNEMONIC =
  'abandon assume bicycle chicken design eager father glove human ignore junk kitchen loop mule nurse orange provide letter maximum airport burst cereal'

async function run() {
  console.log('Seeder starting')
  console.log('Using Mongo URI:', config.mongo.uri)
  console.log('Mnemonic (keep this safe if you want reproducible keys):', MNEMONIC)
  console.log('Passphrases:', PASSPHRASES)

  await mongoose.connect(config.mongo.uri)

  const AuthModel = mongoose.models[Auth.name] ?? mongoose.model(Auth.name, AuthSchema)
  const UserModel = mongoose.models[User.name] ?? mongoose.model(User.name, UserSchema)

  for (let i = 0; i < PASSPHRASES.length; i++) {
    const passphrase = PASSPHRASES[i]

    // Derive seed & keypair for this passphrase
    const seed = bip39.mnemonicToSeedSync(MNEMONIC, passphrase)
    const root = bip32.fromSeed(seed)
    const path = "m/44'/0'/0'/0'/0'"
    const leaf = root.derivePath(path)
    const pub = leaf.publicKey
    if (!pub) {
      console.warn(`Failed to derive public key for passphrase index ${i}`)
      continue
    }
    // Convert to Buffer (mongoose Buffer expected)
    const pubBuf = Buffer.from(pub)

    // Ensure Auth entry exists
    const existing = await AuthModel.findOne({ publicKey: pubBuf })
    let authDoc
    if (!existing) {
      authDoc = new AuthModel({ publicKey: pubBuf })
      await authDoc.save()
      console.log(`Created Auth for passphrase[${i}] (id=${authDoc._id.toString()})`)
    } else {
      authDoc = existing
      console.log(`Auth already exists for passphrase[${i}] (id=${authDoc._id.toString()})`)
    }

    // Optionally create a minimal User tied to this Auth if none exists
    const userExists = await UserModel.findById(authDoc._id)
    if (!userExists) {
      const buf = pubBuf
      const short = buf.subarray(buf.length - 6).toString('hex')
      const username = `seed_user_${i}_${short}`
      const user = new UserModel({ _id: authDoc._id, username } as any)
      await user.save()
      console.log(`Created User '${username}' for auth ${authDoc._id.toString()}`)
    } else {
      console.log(`User already exists for auth ${authDoc._id.toString()}`)
    }

    // Zero sensitive buffers
    seed.fill(0)
    leaf.privateKey?.fill(0)
    if (root.privateKey) root.privateKey.fill(0)
  }

  await mongoose.disconnect()
  console.log('Seeder finished')
}

run().catch(err => {
  console.error('Seeder error:', err)
  process.exit(1)
})
