# P1 Requirements Audit

**Audited:** 2026-07-29  
**Authority:** `Plans/SYSTEM-REQUIREMENTS.md`, `Plans/08-PHASES.md`, and
`Plans/requirements/R2–R12`

This matrix distinguishes implemented foundations from the complete P1 product. A route,
projection, or helper is not marked complete when its required UI, operator control, or runtime
integration is absent.

## Verified Complete

| Area                        | Requirement coverage                      | Evidence                                                                                                                                                         |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingress and contracts       | T1.1–T1.7, P1-G3, P1-G11                  | Registry-driven 19-step pipeline, typed errors, atomic Mongo projection/witness transaction, durable receipts, projection rebuild, generated-contract drift gate |
| Forum write model           | All 30 frozen Forum envelope domains      | Post/comment/vote/community/membership/role/mod/report/award/label/social/message/identity handlers and parity tests                                             |
| Transparency                | TRL-01–TRL-05, TRL-09–TRL-10              | RFC 6962 append, signed heads, inclusion/consistency proofs, offline SDK/client verification                                                                     |
| Core identity               | AUTH-04–AUTH-07, AUTH-09–AUTH-19, AUTH-25 | BIP85 derivation, one-use key-bound auth, typed rotating tokens, certificates, rotation/revocation, blind credentials, nullifiers, Argon2id                      |
| Durable services            | INF-01–INF-05, INF-19                     | Mongo, Redis Lua operations, S3/MinIO, tagged cache, readiness, SSE, production fail-closed composition                                                          |
| Read model                  | T1.31–T1.33                               | Frozen Forum read table, cursor/sort/filter/search behavior, provenance, SSE, tagged cache                                                                       |
| Client security foundations | T1.36 verification primitives, AUTH-22    | SecureStore vault, per-context signing, native PoW, offline evidence, identity-scoped cache, Forum panic wipe, hybrid Forum DM encryption                        |

## Partial or Unverified

| Area                           | Implemented                                                                               | Still required                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-G4/G5 and AUTH-28/29        | Pure trusted-proxy subject parser proves UA exclusion and untrusted-XFF rejection         | Bind network subjects to the distributed limiter/IP-block path and test through HTTP                                                        |
| Attachments (ATT-01–ATT-14)    | Authenticated upload ticket/confirmation; signed hash/MIME/size and ownership enforcement | Metadata list/get/update/delete, download authorization/redirect, delete-by-key, dimensions/duration/alt/kind access paths                  |
| Notifications (NOT-01–NOT-05)  | Derived rows plus private local read/unread/delete state                                  | RN notification page/badge and a documented RN replacement for web push                                                                     |
| Moderation and labels          | Actions, hash chain, reports, public mod log, label envelopes, fail-open preflight        | Appeal flow, client trust-set management, label/mod/audit screens                                                                           |
| Community and roles            | Core CRUD envelopes, policy, roles, member/mod/ban reads                                  | Maintenance jobs, permission cache, approved-submitter flow, 29-bit translation document, management screens                                |
| Administration (ADM-01–ADM-42) | Health, server identity, receipts/proofs, rebuild command, recovery notes                 | Admin summary/config/IP blocks/global roles, feature inspection, observability, structured safe logs, metrics, labeller controls, dashboard |
| Platform (INF-06–INF-38)       | Native Expo export, CI, Compose, optional-service ports                                   | Demo seed, OpenAPI/proto docs, security headers, filesystem blob adapter, size gates, Raspberry Pi/nightly acceptance                       |
| Client identity/profile        | Cryptographic APIs and basic i18n exist                                                   | Recovery/import/passphrase UX, multiple-identity switching, profile/preferences/saved/joined-community screens                              |

## Blocking Exit Gates

- **P1-G1:** every Forum P1 feature must be reachable in the RN UI.
- **ADR-003 replacement for P1-G2/P1-G10:** every feature screen needs an integration test.
- **P1-G4/G5:** must be demonstrated on a real request limiter/IP-block path, not only a helper.
- **P1-G6/VP-02/cache integration:** mandatory in CI, but not executed on this workstation because
  Docker Desktop is stopped.

P1 must not be reported complete until these rows are cleared and this matrix is updated with
test or runtime evidence.
