# P0 — Contracts & Skeleton (NestJS + Expo)

> Supersedes §1–§3 of `P0-P2-IMPLEMENTATION-PLAN.md` for the *skeleton* pass, and keeps its §4–§8
> (P1, P2) intact. Deviations from `Plans/` are recorded in `ADR-003`; storage in `ADR-001`;
> NestJS↔hexagonal mapping in `ADR-002`.
>
> **Goal:** every contract frozen and generating code in TS/Rust/Python, the cross-language gate green
> and blocking, and a running skeleton on both sides that proves the architecture holds — with zero
> business logic.

**Exit gate:** `P0-G1` … `P0-G7` from `Plans/08-PHASES.md`, all as CI-blocking automated tests.

---

## 0. Target tree

```
jagoo-bahee/
├── pnpm-workspace.yaml  turbo.json  tsconfig.base.json  .npmrc  eslint.config.mjs
├── Cargo.toml                              # rust workspace
├── proto/jagoo/v1/
│   ├── envelope.proto                      # T0.1  Envelope, Receipt, SignedTreeHead, enums, AntiAbuse
│   ├── forum.proto                         # T0.2  Plane A bodies
│   ├── signal.proto                        # T0.3  Plane B bodies
│   ├── federation.proto                    # T0.4  6 RPCs
│   ├── bridge.proto                        # T0.5  Reticulum sidecar
│   ├── transport.proto                     #       ReachabilityScope, PeerEndpoint, PeerRecord
│   └── registry.yaml                       # T0.6  domain table — the only place a domain is defined
├── buf.yaml  buf.gen.yaml
├── crates/jb-core/                         # Rust reference: canonical, contentId, ed25519 verify
├── tools/vectors/                          # Python reference + shared fixture runner
├── packages/
│   ├── sdk-ts/                             # generated types + canonical + contentId + crypto + signer
│   └── ui/                                 # RN design system: tokens, primitives, components
├── backend/                                # NestJS node
│   └── src/{core/{domain,ports,app},adapters/{inbound,outbound},features,composition,cli}
├── frontend/                               # Expo app
│   └── {app,src/{signer,data,verify,i18n,theme}}
└── ops/docker-compose.yml
```

---

## 1. Contracts (T0.1 – T0.7)

| Task | Deliverable | Acceptance |
|---|---|---|
| T0.1 | `envelope.proto` — exact fields from `Plans/02` §2–3 | compiles for TS/Rust/Python |
| T0.2 | `forum.proto` — every body in `Plans/03` §1 | every message present |
| T0.3 | `signal.proto` — every body in `Plans/04` §2–6 | every message present |
| T0.4 | `federation.proto` — all 6 RPCs from `Plans/05` §2 | all 6 present |
| T0.5 | `bridge.proto` — `Plans/06` §9.2 | compiles |
| T0.6 | `registry.yaml` — every Forum row (`Plans/03` §2) and Signal row (`Plans/04` §5) | schema-validated, no domain missing |
| T0.7 | Generator: `buf generate` → ts-proto, prost, python; registry → 3 languages | **P0-G5** — identical domain tables; `proto:check` diff clean |

**Non-negotiable in the proto:** no `float`/`double` in any signed structure (`EN-01`); `plane` is a
signed field (`SEP-02`); no row IDs anywhere (`ID-01`).

## 2. Canonical encoding, three implementations (T0.8 – T0.10)

Deterministic protobuf: ascending field number, zero values omitted entirely, unknown fields rejected
(not retained), strings NFC-normalised before encoding.

```
content_id = "jb1" + base32-nopad-lowercase( SHA-256( canonical_bytes(fields 1..12) ) )
```

| Where | Library | Role |
|---|---|---|
| `packages/sdk-ts/src/core/` | `@noble/hashes`, `@noble/curves` | **production** — backend and frontend both import this |
| `crates/jb-core/` | `prost`, `sha2`, `ed25519-dalek` | reference for the gate |
| `tools/vectors/` | `protobuf`, `cryptography` | reference for the gate |

## 3. Crypto, TypeScript-only (T0.11 – T0.12)

- `bip85.ts` — the five Forum paths and four Signal paths from `Plans/01` §2.2/§3.2, on
  `@scure/bip39` + `@scure/bip32`. Known-answer tests prove Forum and Signal paths produce distinct keys.
- `mldsa.ts` — ML-DSA-44 via `@noble/post-quantum`, for `KeyCertificate.pq_attestation` in P1.

## 4. Signer boundary (`SG-01`, adapted)

`PlaneSigner<P extends Plane>` with a nominal type parameter, so passing a Forum signer where a Signal
signer is expected is a **compile error** (`AC-15`), not a runtime check. Raw key material may only be
imported inside `packages/sdk-ts/src/signer/**` and `frontend/src/signer/**` — enforced by lint.

## 5. Backend skeleton (T0.18 – T0.22)

| Task | Deliverable |
|---|---|
| T0.18 | Hexagonal directories + a composition root that boots an empty node |
| T0.19 | Every port from `Plans/07` §2 as an abstract class, each with an in-memory double |
| T0.20 | Import-boundary lint — **P0-G6** |
| T0.21 | `DomainRegistry` + `DomainHandler`; a throwaway handler proves register/dispatch needs zero core changes |
| T0.22 | Unknown-version and unknown-domain hard rejection — **P0-G7** |

Ports to declare: `EnvelopeReader`/`EnvelopeWriter`, `ProjectionStore`, `SignatureVerifier`,
`CertificateStore`, `CreditLedger`, `NullifierRegistry`, `CredentialIssuer`, `WitnessLog`, `Transport`,
`PeerDirectory`, `UplinkManager`, `PathSelector`, `FederationOut`, `BridgeRelay`, `LabelProvider`,
`BlobStore`, `NotificationSink`, `Clock`, `RandomSource`.

## 6. Frontend skeleton

Not in the original P0 scope — added because the client lane has the longest wall-clock tail and its
foundations (design system, theming, i18n, a11y) are expensive to retrofit and cheap to establish now.

- Expo Router shell with the tab structure the P1 screens will land into.
- `packages/ui` tokens: colour (light/dark), spacing, radii, typography scale, motion durations.
  Responsive scale driven by `useWindowDimensions`, no hardcoded widths.
- i18n with **bn** and **en** wired from the first screen, Bangla as a first-class locale (`NFR-A04`).
- Verification badge and transport-scope indicator primitives that carry meaning by shape and text, not
  colour alone (`NFR-A06`, `NFR-A07`).

## 7. The gate (T0.14 – T0.17) — never cut

| Task | Test | Gate |
|---|---|---|
| T0.14 | Shared fixture set encoded by TS, Rust, Python → byte-identical bytes and content IDs | **P0-G1** |
| T0.15 | Signature over domain A fails verification under domain B | **P0-G2** |
| T0.16 | FORUM-plane signature fails verification as a SIGNAL envelope | **P0-G3** |
| T0.17 | A body with fields omitted does not validate a body with those fields populated | **P0-G4** |

T0.17 is the v1 signature-confusion regression: v1 accepted a signature valid over *either* of two
canonical forms, so a signature produced over a plain text post also validated a post carrying an
attacker-chosen URL and arbitrary attachments — and the UI showed a green check on the forgery.

Fixtures live in `tools/vectors/fixtures/*.json` and are consumed by all three languages. The expected
bytes in a fixture must be produced by a **different** implementation than the one asserting on them,
or the test only proves the code agrees with itself.

## 8. Order of work

```
1. monorepo root + tooling + lint boundaries
2. proto/*.proto + registry.yaml            (T0.1–T0.6)
3. codegen + proto:check                     (T0.7)
4. sdk-ts canonical + contentId + ed25519    (T0.8–T0.10)
5. Rust + Python references                  (T0.8–T0.10 mirror)
6. ★ cross-language gate + 3 regressions     (T0.14–T0.17)   ← do not start 7 before this is green
7. backend skeleton, ports, registry, lint   (T0.18–T0.22)
8. sdk-ts BIP85 + ML-DSA + signer boundary   (T0.11–T0.12)
9. frontend shell, design system, i18n
```

Step 6 before step 7 is deliberate: it locks the wire format across three languages and permanently
forecloses the v1 bug class before any feature work compiles against it.

---

## 9. Progress

- [x] Toolchain: pnpm 9.15.4, cargo 1.97.1, node 20.19.6, Python 3.14, Docker 29.1.3
- [x] `CLAUDE.md`, `BUILD-LOG.md`, ADR-001/002/003
- [x] Monorepo root + tooling — pnpm workspace, turbo, tsconfig.base, eslint boundaries, buf
- [x] Proto contracts + registry (T0.1–T0.6) — 6 `.proto` files, 48 domains (30 FORUM, 18 SIGNAL)
- [x] Codegen (T0.7) — `tools/codegen/generate.mjs` emits TS + Rust + Python registries
- [x] `proto:check` regenerate-and-diff wired into CI (T0.7) — `contracts` job
- [x] sdk-ts canonical/contentId/Ed25519 (T0.8–T0.10)
- [x] Rust + Python reference implementations — `crates/jb-core`, `tools/vectors`
- [x] **★ Cross-language gate + 3 regressions (T0.14–T0.17)** — `pnpm vectors`: 3 implementations
      agree on 16 vectors; TS 36 tests, Rust 6, Python 22
- [x] Backend skeleton (T0.18) — hexagonal tree, Fastify composition root, boot spec passes
- [x] Ports as abstract classes + in-memory doubles (T0.19) — all 19 ports, doubles with real rollback
- [x] Import-boundary lint (T0.20 / **P0-G6**) — **was silently broken; fixed and now probe-tested**
- [x] `DomainRegistry` + `DomainHandler` register/dispatch (T0.21)
- [x] Unknown-version / unknown-domain hard rejection (T0.22 / **P0-G7**) — 16 tests
- [x] BIP85 + ML-DSA + signer boundary (T0.11–T0.12) — `PlaneSigner<P>` nominal typing in place
- [~] Frontend shell — Expo Router shell, `src/{signer,data,verify,i18n,theme}`, render test passes
- [ ] `packages/ui` design system + i18n (bn/en) — **not started**, first P1 client task
- [x] `ops/docker-compose.yml` — mongo `rs0` + redis + minio; verified a real multi-doc transaction
- [x] `.github/workflows/ci.yml` — every P0 gate blocking
- [x] **P0-G1 … P0-G7 all green** (locally verified; CI workflow committed but not yet run on a remote)

Legend: `[x]` done · `[~]` scaffolded, not complete · `[ ]` not started.

## 10. Exit gate status

| Gate | Criterion | Status | Evidence |
|---|---|---|---|
| P0-G1 | TS ≡ Rust ≡ Python, byte-identical | ✅ | `pnpm vectors` — 3 implementations, 16 vectors |
| P0-G2 | Signature over one domain fails under another | ✅ | TS `domain-separation.spec.ts`, Rust `domain_separation`, Python |
| P0-G3 | FORUM signature fails as SIGNAL | ✅ | TS/Rust/Python plane-separation |
| P0-G4 | Field-omission confusion (the v1 bug) | ✅ | TS/Rust/Python field-omission + truncation probe |
| P0-G5 | registry.yaml → identical tables in 3 languages | ✅ | `pnpm proto:check` |
| P0-G6 | Lint fails when `core/domain` imports a driver | ✅ | `import-boundary.spec.ts` — 8 probes incl. a passing control |
| P0-G7 | Unknown version and unknown domain hard-rejected | ✅ | `accept.spec.ts` — 16 tests |

**Carried into P1:** `packages/ui` (design system + bn/en i18n) is the only open item.

The `@jagoo/sdk` consumption blocker is **closed**. The sdk ships a dual ESM/CJS build with a
subpath `exports` map; `backend/` resolves the `require` condition on `node16`, `frontend/`
resolves `react-native` via Metro package exports, and the vector gate runs the ESM output.
All three are asserted against `tools/vectors/expected.json` by
`backend/src/sdk-interop.spec.ts` and `frontend/src/verify/verify.test.ts` — the backend
produces byte-identical canonical output to Rust and Python.
