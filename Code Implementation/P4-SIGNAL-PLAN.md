# P4 — Signal plane over IP

> **Status: IN PROGRESS.** Contracts in `Plans/04-CONTRACTS-SIGNAL.md` and
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
| T4.1–T4.2 signer and schema isolation | in progress |
| T4.3–T4.14 channels, broadcasts and subscriptions | pending |
| T4.15–T4.21 identified E2EE messaging | pending |
| T4.22–T4.25 crisis reporting | pending |
| T4.26–T4.27 streams and alert UI | pending |

## Exit gate

The phase is complete only when P4-G1 through P4-G12 have automated evidence, including a
two-independent-node broadcast, offline-recipient decryption, direct ciphertext-only database
inspection, one-plane-per-stream assertions, independent panic wipes and a measured ≤512-byte
broadcast envelope.
