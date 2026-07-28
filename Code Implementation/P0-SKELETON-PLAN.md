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
- [ ] Monorepo root + tooling
- [ ] Proto contracts + registry (T0.1–T0.6)
- [ ] Codegen + `proto:check` (T0.7)
- [ ] sdk-ts canonical/contentId/Ed25519 (T0.8–T0.10)
- [ ] Rust + Python references
- [ ] **Cross-language gate + 3 regressions (T0.14–T0.17)**
- [ ] Backend skeleton + ports + registry + lint (T0.18–T0.22)
- [ ] BIP85 + ML-DSA + signer boundary (T0.11–T0.12)
- [ ] Frontend shell + design system + i18n
- [ ] P0-G1 … P0-G7 all green in CI
