# P4 — Signal plane over IP

> **Status: COMPLETE (software gate).** Contracts in `Plans/04-CONTRACTS-SIGNAL.md` and
> `proto/jagoo/v1/signal.proto` are frozen. No in-place contract edits are permitted.

## Entry condition

P2 federation and Stage 0 pass. Stage 1 provides real routes and domain/design-system boundaries.
ADR-012 records the storage and signer isolation required before any Signal handler is registered.

## Build order

1. Plane-aware certificate lookup and separate Signal certificate/revocation projections.
2. Signal signer vault and independent panic wipe.
3. Channel lifecycle, trust evidence and confusable-name detection.
4. Broadcast sequence, size, supersede/revoke and subscriber-side policy.
5. Crisis check-in, missing-person and resource projections/read API.
6. Prekeys, session init, ciphertext-only messages/receipts and groups.
7. Plane-specific SSE/federation advertisement.
8. Signal client routes, local subscriptions, QR verification, gaps, alerts and offline map/list.
9. Two-node and database inspection gates P4-G1…P4-G12.

## Task status

| Tasks | Status |
|---|---:|
| T4.1–T4.2 signer and schema isolation | complete |
| T4.3–T4.14 channels, broadcasts and subscriptions | complete |
| T4.15–T4.21 identified E2EE messaging | complete |
| T4.22–T4.25 crisis reporting | complete |
| T4.26–T4.27 streams and alert UI | complete |

## Exit gate

The phase is complete only when P4-G1 through P4-G12 have automated evidence, including a
two-independent-node broadcast, offline-recipient decryption, direct ciphertext-only database
inspection, one-plane-per-stream assertions, independent panic wipes and a measured ≤512-byte
broadcast envelope.

## Gate evidence

| Gate | Evidence |
|---|---|
| P4-G1, P4-G10 | `frontend/src/security/panic.test.ts` |
| P4-G2 | `backend/src/features/signal/signal-federation.e2e.spec.ts` |
| P4-G3, P4-G4, P4-G5, P4-G11, P4-G12 | `backend/src/features/signal/signal-features.spec.ts` |
| P4-G6, P4-G7 | Offline prekey session/decryption plus direct projection inspection in `signal-features.spec.ts`; cached prekeys are locally signature/expiry checked by the client |
| P4-G8 | `backend/src/adapters/inbound/http/events.controller.spec.ts` and federation plane-frame guards |
| P4-G9 | certificate isolation regression in `signal-features.spec.ts` |

The same feature suite covers monotonic ratchet counters, recipient-only delivery receipts and
2–64-member sender-key group rekeying. `packages/sdk-ts/src/crypto/signal.spec.ts` proves old
ratchet chain keys cannot open later ciphertext. Push subscription tokens use a non-federating
registry row (ADR-014), and the UI requires explicit opt-in after displaying the privacy cost.
