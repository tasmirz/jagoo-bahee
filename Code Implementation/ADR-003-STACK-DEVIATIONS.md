# ADR-003 — Deliberate deviations from the frozen Plans

**Status:** Accepted · 2026-07-29
**Purpose:** every divergence from `Plans/` written down, so none of them is a silent cut.

---

The Plans were written assuming a Fastify node service and a Next.js PWA client. The build is a NestJS
backend and an Expo React Native client. Each consequence below is either **adapted** (same requirement,
different mechanism), **deferred** (will be done, not now), or **dropped** (was specific to a stack we
are not using). Nothing here weakens a frozen *contract* — the envelope, the registry, the pipeline, the
federation RPCs, and the transport port are all unchanged.

## 1. Structural

| Plan says | Here | Kind | Note |
|---|---|---|---|
| `services/node/` | `backend/` | adapted | Directory name only. Internal layout (`core/{domain,ports,app}`, `adapters`, `features`, `composition`) is exactly as specified. |
| `apps/web/` Next.js PWA | `frontend/` Expo RN | adapted | See §2. |
| `apps/mobile/` native shell | `frontend/` **is** the mobile app | adapted | RN is the primary client, not a shell around a web view. |
| Hand-rolled `Container` in one composition root | NestJS DI, one composition module tree | adapted | ADR-002. `AR-11` still holds — nothing constructs an adapter outside `composition/`. |

## 2. Client stack

| Plan assumption | Consequence | Kind |
|---|---|---|
| `crates/jb-wasm` browser WASM binding (T0.13) | **Dropped for P0–P2.** Hermes does not run WebAssembly and there is no browser to target. Rust stays as a *reference implementation* for the cross-language gate only. | dropped |
| Signer in a Web Worker, one per plane (`SG-02`) | **Adapted.** RN has no Web Worker equivalent. Signing runs in a dedicated `frontend/src/signer/` module, isolated by nominal TypeScript types plus a lint rule that fails any import of raw key material from outside the signer directories. This is weaker than process isolation and is recorded as such — see §5. | adapted |
| Non-extractable IndexedDB key entry, passphrase-derived AES-GCM | **Adapted.** `expo-secure-store` (iOS Keychain / Android Keystore) holds the passphrase-wrapped mnemonic; unwrap uses scrypt + XChaCha20-Poly1305 in JS. | adapted |
| Native `jb-core` on mobile, Secure Enclave raw key ops | **Deferred.** Ed25519 / ML-KEM / ML-DSA run in pure JS via `@noble/*`. A uniffi Rust binding is the correct long-term hardening step, revisited after the federation demo is solid. | deferred |
| 42 web routes, static export, bundle-size gate (T1.34–T1.38, `P1-G2`, `P1-G10`, `INF-18`) | **Rebuilt as RN screens.** Same functional coverage, no static-export requirement, no JS bundle gate. `P1-G2`/`P1-G10` are replaced by "every feature has a screen with an integration test". | adapted |
| SSE `/v1/events` (T1.32) | **Simplified to polling** via TanStack Query for P0–P2; RN has no native `EventSource`. The endpoint is still built server-side. Revisit before P4, where broadcast urgency makes polling latency unacceptable. | deferred |
| Argon2id PoW solved client-side (T1.14) | Needs the `react-native-argon2` native module — pure JS is too slow, WASM will not run. Together with secure-store this requires **Expo prebuild / dev client, not Expo Go**. | adapted |

## 3. Cross-language gate — kept, scope-trimmed

`T0.14`–`T0.17` are marked never-cut and stay blocking. What each language implements:

| Language | Implements | Runs where |
|---|---|---|
| **TypeScript** (`packages/sdk-ts`) | Everything: canonical encode, contentId, Ed25519, BIP85, ML-DSA, signer | Production — both `backend/` and `frontend/` |
| **Rust** (`crates/jb-core`) | Canonical encode, contentId, Ed25519 verify | Reference only, CI gate |
| **Python** (`tools/vectors`) | Canonical encode, contentId, Ed25519 verify | Reference only, CI gate |

BIP85 and ML-DSA-44 are TypeScript-only and not cross-language gated — they are not required by
`P0-G1`–`P0-G7`, and building a Rust BIP85 implementation nobody will execute buys nothing. The three
regression gates (`P0-G2` domain separation, `P0-G3` plane separation, `P0-G4` field omission) are
implemented in all three.

## 4. Storage

MongoDB + Redis as specified in the Plans' adapter names. Two consequences with mandatory mitigations —
replica set for transactions, block-allocated log index — are in **ADR-001**, not repeated here.

## 5. Security posture: what is genuinely weaker, and why it is acceptable

Honesty here matters more than a tidy table.

**`SEP-04` / `SG-02` process isolation has no React Native analogue.** The frozen design assumes one
signer worker per plane, so that no code path can reach the other plane's private key even if the page
is compromised. In RN the mitigation is nominal typing plus a lint boundary plus secure-store-wrapped
key material at rest — all of which a determined attacker running code inside the app process defeats.

Accepted for P0–P2 because an RN app is not exposed to arbitrary third-party script injection the way a
web page is, so the threat that motivated worker isolation (XSS reaching key material) does not apply in
the same shape. **This must be revisited before the Signal plane ships (P4)**, since `SEP-04` was written
assuming stronger isolation than a lint rule provides, and P4 is exactly where a linkage leak between
planes becomes dangerous to a real person. The options at that point are a uniffi native signer holding
keys in native memory, or a separate RN "signer" process — the decision belongs in a P4 ADR.

Not weakened, for the record: content validity is still verifiable offline with no trusted server
(`THR-01`), plaintext still never exists server-side (`THR-05`), and the two planes still have separate
roots, separate stores, and separate unlock state (`SEP-01`, `SEP-05`).

## 6. Explicitly still in scope, just later

- `apps/web` — P5 needs a service worker and an offline shell, which requires a web PWA. `packages/sdk-ts`
  and `packages/ui` are shaped so a web app can reuse them without a rewrite.
- WASM signer — returns with `apps/web`.
- Native Rust signer on mobile — see §2.
