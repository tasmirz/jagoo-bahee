# P1 Requirements Audit

**Audited:** 2026-07-29  
**Authority:** `Plans/SYSTEM-REQUIREMENTS.md`, `Plans/08-PHASES.md`, and
`Plans/requirements/R2-R12`

## Closure Summary

The P1 implementation is code-complete for the single-node Forum phase. P2 federation has not
started. The three real Mongo/Redis tests remain mandatory in CI but were not rerun locally after
the user explicitly stopped Docker work. Raspberry Pi memory and nightly endurance acceptance
also require their target environments; neither is represented as locally verified.

## Implemented Surface

| Area | Evidence |
| --- | --- |
| Contracts and ingress | Generated registry; independently tested 19-step pipeline; typed errors; all 30 frozen Forum handlers; homogeneous batch ingress |
| Storage and transparency | Mongo transactional envelope/projection/Merkle stores, byte-identical rebuild, RFC 6962 inclusion/consistency proofs, signed receipts, offline client verification |
| Identity and anti-abuse | SecureStore signer, ML-DSA certificate attestation, rotation/revocation, one-use key-bound auth, rotating token classes, blind credentials, nullifiers, stateless Argon2id, atomic credits |
| Request security | Trusted-proxy network subjects, no User-Agent binding, fail-closed in-memory/Redis limiter, authenticated IP-block CRUD, security headers |
| Forum product | Post/comment/vote/community/member/role/mod/report/award/attachment/social/message/label projections; frozen read table, search, provenance, SSE, tagged cache |
| Attachments | Authenticated upload/confirm, owner-bound staging, signed hash/MIME/size claim, list/get/download/delete, S3/in-memory/filesystem blob adapters, alt/kind/scan metadata |
| Administration | Summary, runtime security config, IP blocks, feature/adapter inspection, aggregate-only metrics, health/readiness, projection recovery and backup instructions |
| Client | Approved light/dark design system, responsive five-tab Expo shell, feed/post/audit/community/compose/inbox/profile/search screens, 14 P1 feature destinations, recovery/import/unlock/register UX, real signed post publication |
| Platform | OpenAPI JSON, native Android/iOS export, Compose deployment, dependency-free development mode, production fail-closed configuration, demo seed and reproducible smoke test |

## Exit Gates

| Gate | Status and automated evidence |
| --- | --- |
| P1-G1 and ADR-003 screen replacement | Pass: every P1 feature family is reachable from the RN shell; all 14 destinations are navigation-tested |
| P1-G3 | Pass: `projection-rebuilder.spec.ts` proves byte-identical replay |
| P1-G4/G5 | Pass: request interceptor tests prove UA independence and trusted-XFF behavior |
| P1-G6 | Pass in the committed mandatory Redis integration gate; locally skipped without Redis |
| P1-G7/G8/G9/G11 | Pass: token-class, mod replay, 100k stateless PoW, and new-domain tests |

## Reproducible Acceptance

`pnpm smoke:local` starts a dependency-free node in-process and performs certificate publication,
key-bound authentication, blind credential issuance, community creation, signed post ingress,
receipt creation, projection, and feed read. Use `pnpm seed:demo -- --url=<node>` against any
already-running durable node. The complete verification sequence is documented in the root
`README.md`; production configuration and recovery are in `ops/README.md`.

P2 may begin only after the mandatory CI job confirms the Mongo/Redis gates on the final P1 commit.
