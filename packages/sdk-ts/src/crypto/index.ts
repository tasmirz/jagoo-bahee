// Node, iOS and the vector gate use this portable default. Android installs the
// synchronous native backend during app bootstrap before any key operation.
import './js-backend.js';

export {
  cryptoBackend,
  registerDefaultCryptoBackend,
  resetCryptoBackendForTesting,
  setCryptoBackend,
  type Argon2idParams,
  type CryptoBackend,
  type KemEncapsulation,
  type KeyPairBytes,
  type ScryptParams,
} from './backend.js';
export { jsCryptoBackend } from './js-backend.js';
export * as ed25519 from './ed25519.js';
export * as mldsa from './mldsa.js';
export {
  messagingKeyPair,
  sealFirstMessage,
  openFirstMessage,
  type MessagingPublicKey,
  type MessagingSecretKey,
  type MessagingKeyPair,
  type HybridCiphertext,
} from './messaging.js';
export {
  openRatchetMessage,
  sealRatchetMessage,
  signalPrekeySignatureBytes,
  type RatchetCiphertext,
  type RatchetState,
} from './signal.js';
export {
  FORUM_PATH,
  SIGNAL_PATH,
  deriveForumKey,
  deriveSignalKey,
  generateRootMnemonic,
  isValidMnemonic,
  mnemonicToSeed,
  type ForumPath,
  type SignalPath,
} from './bip85.js';
