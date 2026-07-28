# P1 — Core Node & Forum Plane

> **Goal:** full Forum-plane feature parity running through the 19-step pipeline on one instance.
> Contracts are frozen (`Plans/02`–`Plans/04`); this phase implements against them without changing them.

**Exit gate:** `P1-G1` … `P1-G11` from `Plans/08-PHASES.md`, as automated tests.
`P1-G2` and `P1-G10` are replaced per ADR-003 §2 — the client is Expo RN, not a 42-route web app, so
"every feature has a screen with an integration test" substitutes for route parity and the JS bundle gate.

---

## 0. Order of work

`Plans/10` §8 marks **T1.1–T1.7 as never-cut** — the pipeline _is_ the project. Rung 9 of the descope
ladder cuts awards, labels, search and roles first. So:

```
1. Pipeline steps 1–15 as pure functions          (T1.1)      ← never cut
2. Pipeline composition + typed error contract    (T1.2)      ← never cut
3. Merkle witness log                             (T1.5)
4. Storage adapters: Mongo envelope + projection  (T1.3, T1.4)
5. POST /v1/envelopes — the single write route    (T1.7)
6. Anti-abuse: credits, nullifiers, PoW           (T1.13–T1.17)
7. Forum features, highest value first            (T1.18–T1.23)
8. Read API with cursor pagination + provenance   (T1.31)
9. rebuild-projections                            (T1.6)
10. Client screens + on-device verification       (T1.36, T1.37)
```

Steps 1–5 are the spine: once an envelope can be validated, projected, witnessed and read back, every
remaining feature is a `DomainHandler` plus a registry row and touches no core code (`P1-G11`).

---

## 1. Pipeline (T1.1, T1.2)

`Plans/02` §5 fixes the order. Each step is a pure function in `backend/src/core/domain/pipeline/`,
independently unit-testable, composed by `core/app/ingress.ts` — never written as one procedure (VP-03).

| #     | Step                               | File                  | Rejection                                                       |
| ----- | ---------------------------------- | --------------------- | --------------------------------------------------------------- |
| 1     | SIZE                               | `size.ts`             | `TOO_LARGE`                                                     |
| 2     | PARSE                              | `parse.ts`            | `MALFORMED`                                                     |
| 3     | VERSION                            | `accept.ts`           | `UNKNOWN_VERSION`                                               |
| 4     | DOMAIN                             | `accept.ts`           | `UNKNOWN_DOMAIN`                                                |
| 5     | PLANE                              | `accept.ts`           | `PLANE_MISMATCH`                                                |
| 6     | ALG POLICY                         | `alg-policy.ts`       | `ALG_NOT_PERMITTED`                                             |
| 7     | PRIORITY                           | `priority.ts`         | `PRIORITY_MISMATCH`                                             |
| 8     | CLOCK                              | `clock-window.ts`     | `CLOCK_SKEW`                                                    |
| 9     | SIGNATURE                          | `signature.ts`        | `BAD_SIGNATURE`                                                 |
| 10    | CERTIFICATE                        | `certificate.ts`      | `NO_CERTIFICATE`, `KEY_REVOKED`                                 |
| 11    | DEDUPE                             | `dedupe.ts`           | `DUPLICATE` (returns the original receipt, ER-01)               |
| 12    | REPLAY                             | `replay.ts`           | `REPLAY`                                                        |
| 13    | ANTI-ABUSE                         | `anti-abuse.ts`       | `INSUFFICIENT_CREDITS`, `NULLIFIER_SPENT`, `CREDENTIAL_INVALID` |
| 14    | AUTHORISE                          | handler               | `FORBIDDEN`                                                     |
| 15    | BODY VALIDATE                      | handler               | `BODY_INVALID`                                                  |
| 16–19 | APPLY / WITNESS / RECEIPT / FANOUT | `core/app/ingress.ts` | —                                                               |

**VP-01:** steps 1–12 perform no database writes. Enforced by a test that floods invalid envelopes and
asserts the envelope store's write count stayed zero.
**VP-02:** 16 and 17 share one transaction. Enforced by a test that fails the witness append and asserts
the projection rolled back.

## 2. Registry binding

`DomainRegistry` gains the generated `DOMAIN_SPECS` (`@jagoo/sdk/gen`). Registering a handler whose
domain is absent from the generated registry, or whose plane disagrees with it, throws at bootstrap
(RG-01). Steps 6, 7 and 13 read their policy from the spec — never from a branch on the domain string.

## 3. Storage (T1.3, T1.4, T1.5)

- `MongoEnvelopeStore` — unique index on `content_id`; that index, not a racy read, is what makes
  step 11 correct under concurrency.
- `MongoProjectionStore` — `transaction()` over a replica set (ADR-001, L-03).
- `LocalMerkleLog` — RFC 6962 hashing: leaves `H(0x00 ‖ data)`, nodes `H(0x01 ‖ l ‖ r)`. Inclusion and
  consistency proofs must verify **offline on the client** against a stored STH.

## 4. Anti-abuse (T1.13–T1.17)

- Credits: one atomic Lua script. `P1-G6` — 50 concurrent against 10 credits succeeds exactly 10 times.
- PoW: stateless HMAC challenge, so `P1-G9` (10⁵ challenges, no memory growth) holds by construction.
- Rate-limit subject: never `User-Agent`, never a raw `X-Forwarded-For` hop (`P1-G4`, `P1-G5`).

## 5. Definition of done per item

Unchanged from `Plans/10` §9. A handler is done when validate + authorize + project are implemented,
registered, tested, and required **zero** core changes.

---

## 6. Progress

**The core-node task spine and nonvisual client foundations are complete.** An envelope signed on a client is
validated through all 19 steps, projected, witnessed, receipted, and read back with a proof
that verifies offline.

- [x] Deterministic decoder — step 2, with the canonicality round-trip (15 tests)
- [x] Pipeline steps 1–15 as pure functions (T1.1)
- [x] Registry bound to generated `DOMAIN_SPECS`; plane and row checked at registration (RG-01)
- [x] Pipeline composition + typed errors; **VP-01 and VP-02 asserted** (T1.2) — 26 tests
- [x] `LocalMerkleLog` — RFC 6962 inclusion + consistency, tamper detection (T1.5) — 18 tests
- [x] `POST /v1/envelopes`, including homogeneous batch enforcement (T1.7)
- [x] All 30 Forum handlers, full post/moderation counters and flags, derived notifications,
      attachment ownership, karma, membership policy, and default roles (T1.18–T1.30)
- [x] Frozen read table, sort/filter cursor pagination, full search, provenance, SSE, and tagged
      cache (T1.31–T1.33)
- [x] **`P1-G11`** new-domain smoke test (T1.39)
- [x] Mongo envelope/projection/Merkle/nonce and Redis anti-abuse/cache adapters
- [x] `rebuild-projections` with byte-identical replay gate (T1.6, **P1-G3**)
- [x] Argon2id PoW, RSA blind credentials, nullifiers, and atomic Lua credits (T1.13–T1.17)
- [x] Challenge auth, rotating refresh tokens/HttpOnly cookies, PQ certificates, rotation,
      compromise and duress revocation (T1.9–T1.12)
- [x] SecureStore signer, native PoW, identity-scoped offline state, panic wipe, i18n, hybrid DM
      crypto, and offline evidence
- [ ] RN feature screens and audit UI (**P1-G1** and ADR-003's G2/G10 replacement).
      Visual work is waiting on the recorded product design brief.
- [ ] Full frozen-catalogue closure: administration, attachment management, observability,
      platform gates, moderation appeals, and runtime network limiting. See
      `P1-REQUIREMENTS-AUDIT.md`.

### Gate status

| Gate                                      | Status                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| P1-G3 — byte-identical projection rebuild | ✅ `projection-rebuilder.spec.ts`                                  |
| P1-G4/G5 — rate-limit subject             | 🟨 helper tested; runtime limiter/IP-block binding remains         |
| P1-G6 — 50 concurrent vs 10 credits       | ✅ mandatory CI integration test; local run skipped without Docker |
| P1-G7 — refresh token rejected as bearer  | ✅ security + HTTP suites                                          |
| P1-G8 — mod-action replay rejected        | ✅ `forum-parity.spec.ts`                                          |
| P1-G9 — 10⁵ PoW challenges, no growth     | ✅ `security-services.spec.ts`                                     |
| P1-G11 — new domain, zero core changes    | ✅ `forum-features.spec.ts`                                        |
| P1-G1 / ADR-003 G2/G10 replacement        | ⬜ RN feature screens and integration tests remain                 |
