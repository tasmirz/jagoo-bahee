# R2 — Identity & Authentication

Contracts: [`../01-IDENTITY-PLANES.md`](../01-IDENTITY-PLANES.md)

## 1. Key management & authentication

| ID | Requirement | Plane | v1 | Phase |
|---|---|---|---|---|
| AUTH-01 | 24-word BIP-39 mnemonic generation with copy/download and explicit no-recovery warning | both | ✓ | P1 |
| AUTH-02 | Mnemonic import with live word-list validation | both | ✓ | P1 |
| AUTH-03 | Optional BIP-39 passphrase (25th word) | both | ✓ | P1 |
| AUTH-04 | **BIP85 child-entropy derivation** replacing BIP-32, enabling multi-algorithm keys from one root | both | ✗ (BIP-32 only) | P1 |
| AUTH-05 | Challenge–response login; no password ever transmitted | both | ✓ | P1 |
| AUTH-06 | Challenge bound to the requesting public key, with a typed claim assertion | both | ✗ | P1 |
| AUTH-07 | **Argon2id** memory-hard proof of work, pressure-scaled | both | ✗ (SHA-256, difficulty 3) | P1 |
| AUTH-08 | mCaptcha integration | FORUM | ✓ | P1 |
| AUTH-09 | Session tokens with refresh, httpOnly cookies, logout | both | ✓ | P1 |
| AUTH-10 | Separate signing keys per token class; type asserted on every use | both | ✗ | P1 |
| AUTH-11 | Public key lookup by identity | both | ✓ | P1 |
| AUTH-12 | Global status bitmap (active/banned/shadowbanned/verified/mod/admin/revoked) | FORUM | ✓ | P1 |
| AUTH-13 | Key certificate publication with ML-DSA-44 post-quantum attestation | both | — | P1 |
| AUTH-14 | Key rotation preserving karma, roles, and history | both | — | P1 |
| AUTH-15 | Compromise revocation with `effective_from_ms`; pre-revocation content stays valid | both | — | P1 |
| AUTH-16 | Pre-signed duress revocation, exportable and third-party publishable | both | — | P1 |
| AUTH-17 | Per-community derived identities, unlinkable across communities | FORUM | — | P1 |
| AUTH-18 | Blind-signed anonymous membership credentials | FORUM | — | P1 |
| AUTH-19 | Epoch nullifiers for anonymous rate limiting | FORUM | — | P1 |
| AUTH-20 | Signing isolated in a worker; private keys never reachable from page JS | both | ✗ (sessionStorage) | P1 |
| AUTH-21 | **One signer worker per plane** — no shared key store | both | — | P4 |
| AUTH-22 | Per-plane panic wipe of key material and cached content | both | — | P1/P4 |
| AUTH-23 | Signal identity uses a **separate root secret** from the Forum identity | SIGNAL | — | P4 |
| AUTH-24 | Session/authentication is per plane; a token in one grants nothing in the other | both | — | P4 |
| AUTH-25 | Ed25519 for all per-message signing; ML-DSA only on certificates | both | ✗ (secp256k1) | P1 |
| AUTH-26 | Exactly one crypto module in the browser bundle | both | ✗ (four overlapping libs) | P1 |

## 2. Profiles & social identity

| ID | Requirement | Plane | v1 | Phase |
|---|---|---|---|---|
| USR-01 | Auto-generated unique username on first auth | FORUM | ✓ | P1 |
| USR-02 | Profile: display name, bio, avatar, banner | FORUM | ✓ | P1 |
| USR-03 | Post karma and comment karma | FORUM | ✓ | P1 |
| USR-04 | Public profile page by username | FORUM | ✓ | P1 |
| USR-05 | Public profile page by key ID (canonical) | FORUM | partial | P1 |
| USR-06 | Follow / unfollow | FORUM | ✓ | P1 |
| USR-07 | Block / unblock, enforced in messaging and feed | FORUM | ✓ | P1 |
| USR-08 | Save / unsave posts and comments | FORUM | ✓ | P1 |
| USR-09 | Saved-content page | FORUM | ✓ | P1 |
| USR-10 | Feed preferences: sort, timeframe, NSFW show/blur, layout, favourites, hidden keys | FORUM | ✓ | P1 |
| USR-11 | List of joined communities | FORUM | ✓ | P1 |
| USR-12 | Temporary account ban with expiry | FORUM | ✓ | P1 |
| USR-13 | Multiple identities per device with fast switching | both | — | P1 |
| USR-14 | Trusted-contact list for duress revocation and check-in notification | SIGNAL | — | P4 |
| USR-15 | UI refuses any feature that cross-links the two planes, and explains why | both | — | P4 |

## 3. Derivation paths (normative)

**Forum plane** — root `M_forum`:
```
m/83696968'/10'/0'   device identity
m/83696968'/11'/n'   per-community identity n
m/83696968'/12'/e'   per-epoch posting secret (nullifier source)
m/83696968'/13'/0'   messaging key agreement (X25519 + ML-KEM-768)
m/83696968'/14'/0'   credential blinding secret
```

**Signal plane** — root `M_signal` (**separate secret**, `SEP-01`):
```
m/83696968'/20'/0'   device identity
m/83696968'/21'/c'   channel signing key c
m/83696968'/22'/0'   messaging key agreement (X25519 + ML-KEM-768)
m/83696968'/23'/0'   signed prekey batch seed
```

## 4. Signature algorithm policy

| Algorithm | Signature | Public key | Fits one LoRa frame (~222 B)? | Used for |
|---|---|---|---|---|
| Ed25519 | 64 B | 32 B | **Yes** | Every per-message signature |
| ML-DSA-44 | 2420 B | 1312 B | No — ~12 fragments | Identity certificates only |
| Falcon-512 | ~666 B | 897 B | No — 4+ fragments | Reserved |

**AUTH-27:** `BROADCAST`, `DIRECT`, and `CHECKIN` priority envelopes MUST use a 64-byte signature algorithm, enforced at construction with a typed error.

**Rationale.** One ML-DSA signature is eleven LoRa transmissions before any content. The post-quantum budget is therefore spent where quantum computers actually threaten: **confidentiality** (hybrid X25519 + ML-KEM-768 for messaging, because traffic captured today can be decrypted later) rather than **signatures** (a forged signature on a 2026 post produced in 2035 has no value). Long-term identity authenticity is preserved by PQ-attesting the Ed25519 key once in a certificate, amortising the cost.

## 5. Anti-abuse rules

| ID | Requirement | v1 defect it fixes |
|---|---|---|
| AUTH-28 | `User-Agent` MUST NOT appear in any rate-limit, credit, or throttle subject | Rotating one header minted a fresh rate-limit bucket *and* a fresh full credit balance |
| AUTH-29 | `X-Forwarded-For` MUST be parsed with a configured trusted-proxy hop count or CIDR set | Client-supplied XFF produced a new identity per request, bypassing per-IP limits and the IP blocklist |
| AUTH-30 | All counter and balance mutations MUST be atomic — one Lua script per operation | Read-modify-write meant N concurrent requests cost 1 credit; `INCR` + separate `PEXPIRE` could leave a TTL-less key locking a subject out permanently |
| AUTH-31 | PoW challenge issuance MUST be stateless (HMAC-derived) | Every issued challenge was stored in Redis with no issuance limit — trivial memory exhaustion |
| AUTH-32 | Rate-limiter unavailability MUST fail closed in production | — |
| AUTH-33 | Check-in and safety-status actions cost zero credits and require no credential | — |
