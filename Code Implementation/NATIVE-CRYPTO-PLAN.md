# Native crypto acceleration plan

> **Status: COMPLETE (software gate; physical-device parity remains an operator drill).**
> B1–B4 are implemented. The Android module is discovered by Expo autolinking, the managed
> Android project compiles it in the native build gate, and the runtime diagnostic is ready to run
> on a development client. No physical-device result is claimed from this workstation.

## Boundary

The shared SDK continues to own every signed byte and every identity derivation rule. Platform code
may implement cryptographic primitives only. Android acceleration must not create an Android
envelope format, Android BIP-39 behavior, or a second signer.

## B1 — `CryptoBackend` seam

- [x] Define a synchronous primitive-only backend contract in `@jagoo/sdk`.
- [x] Register the existing Noble/Scure implementation as the Node, iOS, test and vector default.
- [x] Express BIP-39 and hardened BIP-32/BIP-85 once over backend hash/KDF primitives.
- [x] Route content IDs, evidence, blind credentials, Ed25519, X25519, AEAD, ML-KEM, ML-DSA and
      Signal ratchets through the seam.
- [x] Ban direct production Noble/Scure/`react-native-argon2` imports outside the two named
      adapters.
- [x] Add a failing-on-purpose ESLint probe and reference-parity regression tests.

## B2 — Android local Expo module

- [x] Add `frontend/modules/jagoo-crypto` as an Android-only local Expo module.
- [x] Export synchronous `Function` primitives using `Uint8Array` ↔ Kotlin `ByteArray`.
- [x] Implement SHA-2, HMAC, HKDF, PBKDF2, scrypt, Argon2id, Ed25519, X25519, ChaCha20-Poly1305,
      XChaCha20-Poly1305, ML-KEM-768 and ML-DSA-44.
- [x] Pin Bouncy Castle 1.79 and keep its use inside the native adapter.
- [x] Add Kotlin known-answer, AEAD-authentication and Ed25519 tests.
- [x] Prove Expo autolinking discovers the module.

## B3 — frontend selection and hot path

- [x] Install the native backend during root-layout module evaluation, before any signer can run.
- [x] Fall back intentionally to the JS backend on iOS, Expo Go and Jest.
- [x] Remove frontend Noble and `react-native-argon2` dependencies and mocks.
- [x] Route vault KDF/AEAD, prekeys and anti-abuse proof-of-work through `CryptoBackend`.
- [x] Derive each plane's BIP-39 root seed once per unlock, return disposable copies to operations,
      and zero the cache and wrapping key on lock/panic/replacement.
- [x] Prove repeated Forum and Signal signatures do not repeat PBKDF2.

## B4 — parity and evidence

- [x] Add an explicit on-device suite comparing 18 primitive contracts byte-for-byte with JS.
- [x] Include cross-verification and decapsulation, not output comparison alone.
- [x] Render backend identity and every check in Node operations diagnostics.
- [x] Add ADR-017.
- [x] Record the implementation, failures caught, commands and unrun physical drill in
      `BUILD-LOG.md`.

## Exit gates

| Gate | Evidence |
| --- | --- |
| Seam is used | SDK probe backend observes content-ID hashing |
| Boundary is enforced | Test writes a direct Noble import and requires ESLint `CRYPTO-01` failure |
| Shared derivation is stable | BIP-39/BIP-32 tests match Scure across fixed seeds and paths |
| Frontend hot path is memoised | Two planes, multiple signatures, exactly two PBKDF2 calls |
| Native module is linked | Expo autolinking resolves `jagoo-crypto` from `frontend/modules` |
| Portable behavior is intact | SDK, frontend and cross-language vector suites pass |
| Device parity is inspectable | Operations workspace runs and renders all 18 checks |

## Physical drill

Build an Android development client, open **Profile → Node operations → Crypto backend parity**, run
the suite, and retain a screenshot plus Android model/API level. A physical-device result is release
evidence; it is not a prerequisite for keeping the software implementation honest in environments
without an attached Android device.
