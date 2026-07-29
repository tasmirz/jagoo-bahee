# ADR-012 — Signal plane isolation is physical at persistence boundaries

**Status:** Accepted · 2026-07-29  
**Governs:** SEP-01…SEP-05, SG-01…SG-04, AC-12…AC-15, P4-G8…P4-G10

## Context

The SDK already makes `ForumSigner` and `SignalSigner` different types, and federation already
guards one plane per stream. That is necessary but insufficient. Reusing a projection collection,
SecureStore key, application context or authenticated session would create a stored association
between a pseudonymous Forum identity and an identified Signal identity.

## Decision

The isolation boundary is enforced at every persistent and runtime seam:

1. Signal keys use a distinct SecureStore root and a distinct in-memory signer instance.
2. Forum and Signal certificates, revocations and feature projections use distinct collections.
3. Certificate lookup includes the signed plane; a key byte string alone is not a certificate key.
4. Signal read endpoints never join Forum collections, identities or sessions.
5. SSE and federation filters carry one explicit plane per connection/stream.
6. Panic wipe is plane-specific and removes only that plane's keys and local cache.
7. The offline outbox stores opaque wire bytes plus public routing metadata; it never stores or
   derives either plane's private material.

There is deliberately no “combined profile”, contact import or cross-plane account switcher.

## Consequences

- Some adapters contain two physically separate collections with similar document shapes. This is
  intentional duplication: sharing a collection would weaken AC-12.
- `CertificateStore` must receive the plane at lookup time.
- Signal-only nodes can register only Signal handlers and advertise only Signal.
- Tests must inspect persisted field names and collection names, not only API responses.

## Rejected alternatives

- **One account row with `forumKey` and `signalKey`:** directly violates SEP-03 and AC-12.
- **One encrypted vault containing both mnemonics:** a process compromise or backup correlates them.
- **A UI-only separation:** presentation cannot repair linkage already written to disk.
