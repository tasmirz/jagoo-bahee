# ADR-017: One crypto seam with an Android primitive backend

**Status:** Accepted  
**Date:** 2026-07-30

## Context

`@jagoo/sdk` is the byte-authority for the node, client and vector gate. The Expo client previously
imported Noble primitives and a separate Argon2 bridge directly, while the SDK imported those same
implementations from many semantic modules. Adding native acceleration without a boundary would
make it possible for one call site to keep using JavaScript silently, or for Android to acquire a
second implementation of BIP-39, BIP-85 or envelope signing semantics.

Several existing SDK functions are synchronous and used by pure validation and render-time
memoisation. Turning them into promises would change the public contract throughout the node and
client. The native boundary therefore needs synchronous calls.

## Decision

Introduce a primitive-only `CryptoBackend` interface in the shared SDK.

- The portable Noble/Scure adapter remains the default for Node, iOS, tests and vectors.
- Android installs `frontend/modules/jagoo-crypto` during application module evaluation. It is a
  local Expo module exposing synchronous `Function` calls and Kotlin `ByteArray` values.
- The Android adapter pins Bouncy Castle 1.83. XChaCha20-Poly1305 is constructed from HChaCha20 and
  the provider's IETF ChaCha20-Poly1305 implementation. ML-DSA uses the protected byte-oriented
  signer entry point with the FIPS pure-mode prefix and zero `rnd`, preserving the portable
  adapter's deterministic signature bytes.
- BIP-39 checksum/seed framing, hardened BIP-32, BIP-85 paths, envelopes and signer policy stay in
  TypeScript. Native code receives primitive byte inputs and returns primitive byte outputs only.
- Production SDK and frontend files may not import Noble, Scure or `react-native-argon2` outside
  the named portable adapters. ESLint enforces this and a test deliberately creates a violation.
- Forum and Signal signers cache the 64-byte root seed for the unlocked session. Callers receive
  copies; lock, panic and signer replacement zero the cache and vault wrapping key.
- An explicit Operations diagnostic compares deterministic native results with the JS reference.
  It checks hashes/KDFs, both AEADs, Ed25519, X25519, ML-KEM and ML-DSA, including verification and
  decapsulation.

## Failure semantics

Verification returns `false` for malformed hostile input. Authenticated decryption throws on tag
failure. Invalid key lengths and work factors fail before invoking a primitive. The native module
does not persist keys, log byte inputs, or own identity state.

## Consequences

- The node and vector gate retain the existing portable implementation and byte behavior.
- Android expensive arithmetic can execute in native code without forking signed semantics.
- iOS remains correct but unaccelerated until a separate adapter is justified and parity-gated.
- Synchronous KDFs still occupy the JavaScript call until native completion. They are restricted to
  explicit unlock/proof actions; repeated signatures no longer repeat PBKDF2 or vault decryption.
- Bouncy Castle upgrades are security- and compatibility-sensitive changes requiring the Kotlin
  tests, on-device parity suite and cross-language gates.
- Android pins Kotlin 1.9.25, matching React Native 0.76.9 and Expo Modules Core's Compose 1.5.15
  compatibility mapping.
- Expo Go cannot load the local module. Development and release validation use a development client
  or native build, while Expo Go/Jest deliberately report the JS backend.
