# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. What this is

**Jagoo Bahee v2** — a federated, censorship-resistant community platform that degrades gracefully from
full internet, through ISP-level blocking, to complete national blackout, and keeps working at every step.

It looks like a forum (communities, posts, threaded comments, votes, moderation, messaging). Underneath,
**every mutation is a self-authenticating signed envelope** that does not depend on any server for its
validity, so it can travel over HTTP, gRPC, LoRa, Bluetooth, or a QR code and still be verified on arrival.

Alongside it runs a second, deliberately unlinkable system: identified broadcast channels and
person-to-person messaging, where knowing exactly who is speaking is the entire point.

### Goal priority — normative, ordered

A later goal must never be built at the cost of an earlier one, and must never become a dependency of one.

| # | Goal | Rank | Phase |
|---|---|---|---|
| 1 | **Federation works** — independent instances exchange, verify, and project content | ★ **PRIMARY** | P2 |
| 2 | **ISP-level availability and ISP bridging** | ★ **SECONDARY** | P3 |
| 3 | Broadcast + identified messaging over IP | tertiary | P4 |
| 4 | Offline store-and-forward | low | P5 |
| 5 | Reticulum / LoRa | **lowest** | P6 |

When a trade-off appears, resolve it in this order. Reticulum is an optional adapter behind a port and
must never be a dependency — the system ships complete with it absent from the build.

---

## 2. Repository layout

```
proto/jagoo/v1/          SOURCE OF TRUTH — envelope, forum, signal, federation, bridge, registry.yaml
crates/jb-core/          Rust reference impl: canonical encode, contentId, Ed25519 verify
tools/vectors/           Python reference impl + shared fixture runner
packages/sdk-ts/         Generated TS types + canonical encoder + contentId + crypto + PlaneSigner
packages/ui/             Shared React Native design system (tokens, primitives, components)
backend/                 NestJS node  — hexagonal: core/{domain,ports,app}, adapters, features, composition
frontend/                Expo React Native app — the only client for P0–P2
ops/                     docker-compose (mongo replica set, redis, minio, node-a, node-b)
Plans/                   FROZEN specification. Read-only unless explicitly revising a contract.
Code Implementation/     Phase plans, BUILD-LOG.md, decision records. Written before code, updated after.
```

**Folder mapping vs. the Plans.** `Plans/07-ARCHITECTURE.md` §6 names `services/node` and `apps/web`.
This repo uses **`backend/`** (= `services/node`) and **`frontend/`** (= `apps/mobile`, Expo RN).
`apps/web` is out of scope for P0–P2. Everything else in that layout is unchanged. When a doc says
`services/node/src/...`, read `backend/src/...`.

---

## 3. Commands

```bash
pnpm install                      # workspace install (pnpm 9, node-linker=hoisted for Metro)

# Contracts — proto/ is the source of truth, bindings are generated
pnpm proto:lint                   # buf lint + breaking-change check
pnpm proto:gen                    # regenerate TS / Rust / Python bindings
pnpm proto:check                  # regenerate and diff — fails on hand-edited generated code (AR-10)

# Build / verify — turborepo task graph
pnpm build
pnpm typecheck
pnpm lint                         # includes the import-boundary rules (AR-01, SG-01)
pnpm test                         # all workspaces
pnpm vectors                      # ★ cross-language canonical gate: TS ≡ Rust ≡ Python (P0-G1..G4)

# Single test
pnpm --filter @jagoo/backend exec vitest run src/core/domain/envelope.spec.ts
pnpm --filter @jagoo/backend exec vitest run -t "rejects unknown domain"
pnpm --filter @jagoo/sdk exec vitest run src/core/canonical.spec.ts
pnpm --filter @jagoo/frontend exec jest src/verify/provenance.test.ts

# Run
pnpm ops:up                       # mongo (single-node replica set) + redis + minio
pnpm dev:backend                  # NestJS, watch mode
pnpm dev:frontend                 # Expo dev client  (NOT Expo Go — native modules required)
pnpm --filter @jagoo/backend exec nest start --debug

# Operational
pnpm --filter @jagoo/backend exec ts-node src/cli/rebuild-projections.ts
pnpm ops:two-node                 # node-a + node-b federation harness (P2)
```

Rust and Python are invoked through `pnpm vectors`; run them directly with `cargo test -p jb-core`
and `python -m pytest tools/vectors`.

---

## 4. The architecture in one pass

### 4.1 Everything is an envelope

There is **exactly one write endpoint in the entire system**: `POST /v1/envelopes`. A post, a vote, a ban,
a broadcast, a message, a key revocation — all of it is an `Envelope` (`Plans/02-CONTRACTS-CORE.md` §2).
No feature may add a write route. If a feature appears to need one, the registry row or the body schema
is wrong.

```
content_id = "jb1" + base32-nopad-lower( SHA-256( canonical_bytes(fields 1..12) ) )
signature  = Ed25519 over the same canonical bytes
```

Canonical encoding is deterministic protobuf: ascending field number, zero values omitted, no unknown
fields retained, NFC-normalised strings, **no floats anywhere in a signed structure**. There is exactly
one accepted form per version. Fallback chains and "try the legacy shape too" are forbidden — that
ambiguity is the exact v1 bug (signature confusion) this rebuild exists to foreclose.

### 4.2 The 19-step validation pipeline

Every envelope, from every transport — HTTP, gRPC federation, mesh, Reticulum — runs the same pipeline
in the same order (`Plans/02-CONTRACTS-CORE.md` §5):

```
1 SIZE → 2 PARSE → 3 VERSION → 4 DOMAIN → 5 PLANE → 6 ALG POLICY → 7 PRIORITY → 8 CLOCK
→ 9 SIGNATURE → 10 CERTIFICATE → 11 DEDUPE → 12 REPLAY → 13 ANTI-ABUSE → 14 AUTHORISE
→ 15 BODY VALIDATE → 16 APPLY → 17 WITNESS → 18 RECEIPT → 19 FANOUT
```

- Steps 1–12 perform **no database writes**, so an invalid-envelope flood cannot amplify into writes.
- Steps 16 and 17 are **atomic with respect to each other**. A projected envelope missing from the
  Merkle log is a transparency failure.
- Each step is an independently unit-testable pure function. The pipeline is composed from them, never
  written as one procedure.
- Peer trust affects **quota only, never verification**. Federated and mesh inbound re-runs all 19 steps.

### 4.3 The registry is the extension point

`proto/jagoo/v1/registry.yaml` maps each `domain` string (`jb:post:create:v1`) to its plane, body type,
priority class, idempotency, scope kind, credit cost, anti-abuse gates, and permission. It generates into
TS, Rust, and Python. Adding a feature adds a **row plus a handler**, never a branch in the pipeline.

```ts
interface DomainHandler<TBody> {
  readonly domain: string;
  readonly plane: Plane;
  validate(body, env): ValidationResult;              // pure, no I/O
  authorize(body, env, ctx): Promise<AuthDecision>;   // against projections
  project(body, env, tx): Promise<void>;              // same transaction as the log append
  afterCommit?(body, env): Promise<void>;             // notifications, fanout hints
}
```

### 4.4 Two identity planes, unlinkable by construction

| | **FORUM** (Plane A) | **SIGNAL** (Plane B) |
|---|---|---|
| Identity | Pseudonymous — a key with no real-world binding | Identified — a key bound to a verifiable claim |
| Root secret | `M_forum` mnemonic | **Separate** `M_signal` mnemonic |
| Unlinkability | Per-community derived keys, blind credentials, epoch nullifiers | None wanted — recognisability is the point |
| Contents | Posts, comments, votes, communities, moderation, pseudonymous DMs | Channels, broadcasts, subscriptions, identified messaging |
| Transport class | Bulk | Priority — small, floods first |

This separation is a **security requirement**. If a person's known broadcast identity were linkable to
their forum identity, publishing under their real name as a relief coordinator would retroactively
deanonymise every forum post that key ever made.

### 4.5 Storage

MongoDB (envelope log + projections + Merkle log) and Redis (credits, nullifiers, rate limits, cache),
both behind ports. **Mongo must run as a replica set even single-node** — pipeline step 16/17 atomicity
needs multi-document transactions. `ops/docker-compose.yml` initialises `rs0` automatically.

The **envelope store is the only backup-critical dataset.** Projections are derived and must be fully
reconstructible by `rebuild-projections`, byte-identical. If a projection cannot be rebuilt from the
envelope log alone, that is a defect in the handler, not a reason to back up projections.

---

## 5. Coding rules

These are checked in review and, where marked, by lint. A PR that violates one does not merge.

### 5.1 Hexagonal boundaries

- `backend/src/core/domain/**` is **pure**: deterministic given its inputs, no clock reads, no random,
  no I/O, and **no NestJS decorators**. `Clock` and `RandomSource` are injected ports. This is what makes
  the validation pipeline and the path selector unit-testable with no infrastructure. *(lint-enforced)*
- `core/**` may import only from `core/**`. Adapters depend on the core; the core never depends on an
  adapter, a driver, or a framework. *(lint-enforced)*
- Every port gets a production adapter **and** an in-memory double. Unit tests use doubles; integration
  tests use real adapters via testcontainers.
- Nothing constructs an adapter outside `backend/src/composition/`. No service-locator lookups at call
  sites — dependencies are constructor-injected.

### 5.2 The four bans

| Banned | Why |
|---|---|
| `switch` / `if` on `domain` anywhere in the core | The registry dispatches. A domain switch means the Open/Closed abstraction failed. |
| Branching on transport ID outside the transport layer | Every `Transport` is substitutable. `if (t.id === "reticulum")` in app code is a Liskov violation. |
| A database row ID inside any signed structure or federated payload | Row IDs are meaningless off-instance. **This is the specific defect that made v1 federation impossible.** |
| A private key in a variable outside the signer boundary | *(lint-enforced)* Only `packages/sdk-ts/src/signer/**` and `frontend/src/signer/**` may touch raw key material. |

### 5.3 SOLID, concretely

| Principle | Here | A violation looks like |
|---|---|---|
| **S** | Ingress validates. Projector projects. Transport moves bytes. Witness logs. | A `PostService` that validates, saves, notifies, and federates — v1's shape |
| **O** | New content type = new `DomainHandler` + registry row, pipeline untouched | Adding a `case` to a domain switch |
| **L** | The outbox drains through HTTP, mesh, or Reticulum with identical calling code | `if (transport.id === …)` in application code |
| **I** | `EnvelopeReader` and `EnvelopeWriter` are separate ports | One fat `Store` interface everyone depends on |
| **D** | Core declares `WitnessLog`; the Merkle adapter depends on the core | Core importing the Mongo driver |

### 5.4 A feature is one directory

`backend/src/features/<plane>/<name>/` holds its handlers, projections, read routes, and tests, and
nothing else depends on its internals. Deleting the directory and its registry rows removes the feature
completely, with no dangling references. Features are config-toggleable for experimentation — but a
toggle is **not** for hiding incomplete work. A toggled-on feature is complete or it does not merge.

### 5.5 Performance and scale

- Every list endpoint is **cursor-paginated**. Offset pagination does not exist here.
- Cache invalidation uses **tagged keys**. A keyspace `SCAN` per write is a self-inflicted load amplifier
  that gets worse exactly as the instance gets busier — it is what v1 did.
- Every counter or balance mutation is **one atomic Redis Lua script**. Read-modify-write and
  `INCR`-then-`PEXPIRE` are both forbidden.
- Outbound queues are ordered by priority class first, then FIFO. A queued emergency broadcast overtakes
  500 queued votes.
- Class 0–2 envelopes (`BROADCAST`, `DIRECT`, `CHECKIN`) have hard size budgets — ≤ 512 B / ≤ 1 KB / ≤ 512 B
  **after** encoding, including signature and anti-abuse fields. Enforced at construction with a typed
  error, never discovered at send time.
- The node must run on a Raspberry Pi 4 in < 512 MB RAM. Treat that as a design constraint, not a target.

---

## 6. Frontend rules (Expo React Native)

The client is the product surface for people under a shutdown. Its quality bar is not "functional".

- **Design system first.** Colours, spacing, radii, typography, and motion live in `packages/ui` tokens.
  No raw hex values, no magic numbers, no ad-hoc `StyleSheet` spacing in screens.
- **Responsive across every size.** Layouts adapt from a 320 pt phone to a tablet in landscape and to
  split-screen. Use the shared responsive scale and `useWindowDimensions`; never hardcode pixel widths.
- **Bangla and English are both first-class.** Bangla is not a translation layer added at the end —
  size budgets and layout are computed against Bangla UTF-8 worst case, because that is the primary
  language of the target users. Every string ships through i18n from the first commit.
- **Accessibility is a requirement, not a pass at the end.** WCAG 2.1 AA on core flows, full screen-reader
  labelling, touch targets ≥ 44×44 pt on crisis actions, legible at maximum system font scale, and
  **colour is never the sole carrier of meaning** — verification state, alert severity, and transport
  scope each need shape or text too.
- **The client verifies; it never trusts the server's word.** Signature badges and inclusion proofs are
  recomputed on-device from the `provenance` block, and must work with the network fully disabled.
- **Offline is the default assumption.** Every screen renders from cache, shows its staleness honestly,
  and never blocks on a request that may never return.
- **The UI must not offer plane linkage.** No feature publishes both identities together, cross-links
  profiles, or imports one plane's contacts into the other. If a user asks, explain the risk and refuse.

---

## 7. Working protocol

### 7.1 Contracts are frozen

`Plans/02` through `Plans/06` are frozen before implementation. Contract churn during implementation is
the failure mode this plan exists to prevent. Changing a frozen contract requires a **version bump**, never
an in-place edit, and a decision record in `Code Implementation/`. If a contract looks wrong mid-build,
write the concern down and keep building against the frozen shape.

### 7.2 Plan before code, log after

1. **Before a phase**, write its plan to `Code Implementation/P<n>-*.md` — scope, task IDs, file-by-file
   deliverables, exit gate. This is what survives between sessions; nothing important lives only in chat.
2. **After each work block**, append to `Code Implementation/BUILD-LOG.md`: what was built, what broke,
   what the fix was, and what to do differently. Read it at the start of every session. Its purpose is
   that the same mistake is never made twice.
3. Update the phase plan's checklist as tasks land, so plan and reality never drift.

### 7.3 Definition of done

| Work type | Done means |
|---|---|
| Contract (proto, registry row) | Compiles in three languages, codegen diff clean, a fixture exercises it |
| Pipeline step | Pure function, unit-tested in isolation, every error path reachable by a test |
| Domain handler | validate + authorize + project implemented and registered, **zero core changes required** |
| Read endpoint | Cursor pagination, `provenance` block, integration test against a real database |
| Adapter | Implements its port, production impl **plus** in-memory double, integration test |
| Transport | Satisfies the `Transport` port, class filter enforced, no app-layer branch on its ID |
| Client screen | Renders offline from cache, signature status visible, a11y-labelled, Bangla strings present |
| Requirement | At least one automated test cites its ID (`NFR-M08`) |
| Phase | Every gate criterion in `Plans/08-PHASES.md` passes **in CI**, not by hand |

### 7.4 Blocking CI gates

Never disable these to get a build green. They exist because each one caught a real, expensive v1 bug.

| Gate | From |
|---|---|
| **Cross-language canonical vectors** — TS ≡ Rust ≡ Python, byte-identical | P0 · the single highest-value gate in the project |
| Import-boundary lint (`core/domain` purity, signer boundary) | P0 |
| Regenerate-and-diff on generated code | P0 |
| Two-node federation suite | P2 |
| Network-namespace ISP suite | P3 |
| Build-without-Reticulum suite | P6 |

---

## 8. Where to look

| Question | Document |
|---|---|
| Goals, planes, resilience ladder | `Plans/00-OVERVIEW.md` |
| Plane separation invariants, key hierarchy, revocation | `Plans/01-IDENTITY-PLANES.md` |
| Envelope, canonical encoding, pipeline, errors, anti-abuse | `Plans/02-CONTRACTS-CORE.md` |
| Forum bodies, domain registry rows, read API | `Plans/03-CONTRACTS-FORUM.md` |
| Channels, broadcast, identified messaging, crisis bodies | `Plans/04-CONTRACTS-SIGNAL.md` |
| Federation gRPC, TOFU trust, STH gossip | `Plans/05-CONTRACTS-FEDERATION.md` |
| Scopes, uplinks, path selection, ISP bridging, Reticulum | `Plans/06-CONTRACTS-TRANSPORT.md` |
| Ports catalogue, plugin registry, composition root | `Plans/07-ARCHITECTURE.md` |
| Phase scope and exit gates | `Plans/08-PHASES.md` |
| Task IDs and acceptance lines | `Plans/09-TASKS.md` |
| Build order, parallel lanes, descope ladder | `Plans/10-IMPLEMENTATION-SEQUENCE.md` |
| Feature requirement IDs by module | `Plans/requirements/R0`–`R14` |
| What we actually built and why | `Code Implementation/BUILD-LOG.md` |

Cite requirement IDs (`FD-05`, `VP-02`, `SEP-04`, `TP-11`) in code comments and test names. They are the
link between the specification and the implementation, and `NFR-M08` requires every MUST to have one.

---

## 9. Context that prevents wrong decisions

Things that look like reasonable engineering choices but are wrong **in this specific system**:

- **Server-side approval before publishing.** Withheld approval is indistinguishable from a network error,
  which makes silent censorship structurally possible. Moderation is publish-then-attest: content is valid
  the instant its author signs it, and labels are additive signed opinions clients may honour.
- **Deleting content.** Removal is a tombstone — content ID, author, timestamp, acting moderator, and
  reason stay publicly visible; only the body is withheld. Every censorship action is itself evidence.
- **Admin-allowlisted federation.** During a shutdown, volunteers stand up relay nodes and cannot wait for
  manual approval. New peers land at `PROBATION` via TOFU and earn reach through vouches.
- **Server-side subscription tables.** In this context, a list of who follows which channel is a list of
  targets. Broadcasts flood and the client filters locally.
- **Requiring identity to stop spam.** That hands the adversary a censorship lever. Cost — memory-hard PoW,
  credits, blind credentials, epoch nullifiers — is the anti-abuse primitive, and it must work against a
  fully anonymous user.
- **Rate-limiting a check-in.** Telling people you are alive costs zero credits and needs no credential.
- **Only exercising the fallback path during a fallback.** Path selection prefers the *narrowest* working
  scope (`LAN` > `ISP_LOCAL` > `NATIONAL` > `GLOBAL`) continuously, so the resilience path is warm and
  tested at the moment it becomes the only path. Code that only runs during a blackout fails during a blackout.
- **Post-quantum signatures everywhere.** One ML-DSA signature is eleven LoRa transmissions before any
  content. The PQ budget goes to *confidentiality* (hybrid X25519 + ML-KEM-768 key agreement, because
  traffic captured today is decrypted later) and not to per-message signatures, which stay Ed25519 at 64 B.
