# 10 — Implementation Sequence

> **How to actually build this.** What order, what runs in parallel, where the sync points are, and what to cut when time runs out.
>
> Task IDs reference [`09-TASKS.md`](09-TASKS.md). Gates reference [`08-PHASES.md`](08-PHASES.md).

---

## 1. The one rule

**The spine is sequential. Everything else is a lane running alongside it.**

The spine is: *contracts → validation pipeline → projections → federation → ISP bridging.* Each link genuinely depends on the previous one, and trying to parallelise inside it produces rework, not speed.

Everything else — crypto, client, infrastructure, sidecars, documentation — can run concurrently once its input contract exists. Most of the project's wall-clock time is in those lanes, so the plan is built around keeping them fed.

---

## 2. Lanes

| Lane | Owns | Can start after | Blocks |
|---|---|---|---|
| **SPINE** | Contracts, ingress pipeline, projections, federation, ISP bridging | day 0 | everything |
| **CRYPTO** | `jb-crypto`, `jb-wasm`, plane signers, certificates, revocation | T0.1 | client signing |
| **CLIENT** | Web app, UI, offline outbox, mesh transport | T0.7 (codegen) | nothing |
| **INFRA** | CI gates, Docker, netns harness, seed tooling, size budgets | day 0 | nothing |
| **SIDECAR** | Labeller, witness, Reticulum relay | T0.4 / T0.5 | nothing |
| **DOCS** | Router guides, Bangla localisation, accessibility, operator manual | day 0 | nothing |

**SIDECAR is the important one to notice.** The Reticulum relay is a separate process behind a port frozen at P0. Someone can build the entire P6 deliverable during P1 without touching the spine and without delaying anything. The "lowest priority" item can be de-risked for free, provided nobody on the spine is pulled onto it.

---

## 3. Dependency graph

```
day 0
  │
  ├─[SPINE]───  T0.1 envelope.proto
  │               ├── T0.2 forum.proto ──┐
  │               ├── T0.3 signal.proto ─┤
  │               ├── T0.4 federation ───┼── T0.6 registry.yaml ── T0.7 codegen
  │               └── T0.5 bridge.proto ─┘                              │
  │                                                                     │
  │             T0.8 canonical encoder ── T0.9 contentId ──┐            │
  │                                                         │            │
  │             ┌───────────────────────────────────────────┴────────┐  │
  │             │  ★ T0.14–T0.17  CROSS-LANGUAGE GATE + REGRESSIONS  │  │
  │             └──────────────────────────┬─────────────────────────┘  │
  │                                        │                             │
  │             T0.18–T0.22 skeleton, ports, lint, plugin registry       │
  │                          │                                           │
  │                     ═══ M0: CONTRACTS FROZEN ═══                     │
  │                          │                                           │
  │             T1.1–T1.7 pipeline + storage + write endpoint            │
  │                          │                                           │
  │             T1.18–T1.30 forum features (parallelisable among         │
  │                          themselves — see §5)                        │
  │                          │                                           │
  │                     ═══ M1: FORUM PARITY ═══                         │
  │                          │                                           │
  │             T2.1–T2.16 federation ★ PRIMARY                          │
  │                          │                                           │
  │                     ═══ M2: FEDERATION WORKS ═══                     │
  │                          │                                           │
  │             T3.1–T3.22 ISP scopes, uplinks, bridging ★ SECONDARY     │
  │                          │                                           │
  │                     ═══ M3: ISLANDS MERGE ═══                        │
  │                                                                      │
  ├─[CRYPTO]── T0.10 Ed25519 ── T0.11 BIP85 ── T0.12 ML-DSA ── T0.13 WASM
  │              └── T1.8 forum signer ── T1.9–T1.11 certs, revocation
  │                     └── T4.1 signal signer ── T4.17 hybrid KEM
  │                                                                      │
  ├─[CLIENT]────────────────── (waits for T0.7) ── T1.34 routes ── T1.36 verify
  │                                └── T5.1 outbox ── T5.7 mesh ── T4.x signal UI
  │                                                                      │
  ├─[INFRA]── CI skeleton ── T0.14 gate wiring ── T1.38 size gates
  │              └── T2.16 two-node harness ── T3.8 netns harness (BUILD EARLY)
  │                                                                      │
  ├─[SIDECAR]──────── (waits for T0.4/T0.5) ── witness ── labeller ── T6.1–T6.8 relay
  │                                                                      │
  └─[DOCS]──── operator manual ── T3.22 router guides ── Bangla l10n ── a11y audit
```

---

## 4. Sequenced milestones

### M0 — Contracts frozen

**Spine:** T0.1 → T0.9, then **T0.14–T0.17**, then T0.18–T0.22.

**Runs in parallel:**

| Lane | Work |
|---|---|
| CRYPTO | T0.10 Ed25519, T0.11 BIP85, T0.12 ML-DSA, T0.13 WASM binding |
| INFRA | CI skeleton, Docker compose, regenerate-and-diff check, import-boundary lint scaffold |
| DOCS | Operator manual outline, deployment shape docs |
| SIDECAR | *(after T0.4/T0.5)* witness service skeleton, relay service skeleton |

**Sync point:** T0.14 needs `jb-wasm` from CRYPTO to prove TS ↔ Rust equality. This is the first place the lanes must meet.

> **T0.14–T0.17 is the highest-value work in the entire plan.** It locks the wire format across three languages and permanently forecloses the v1 signature-confusion bug class. Do not let it slip, and do not start feature work before it passes.

**Exit:** P0 gate (`08-PHASES.md`).

---

### M1 — Forum parity, single instance

**Spine:** T1.1–T1.7 (pipeline, storage, write endpoint) → then the feature block.

**Runs in parallel — the feature block.** Once T1.7 lands, the forum features are mutually independent and can be built simultaneously by different people. This is the widest parallelism in the project:

| Group | Tasks | Depends on |
|---|---|---|
| A | T1.18 post, T1.19 comment, T1.20 vote | T1.7 |
| B | T1.21 community, T1.22 membership, T1.25 role | T1.7 |
| C | T1.23 moderation, T1.24 report, T1.30 label | A, B |
| D | T1.26 award, T1.27 attachment, T1.28 social | T1.7 |
| E | T1.29 forum messaging | T1.8 (CRYPTO) |

Groups A, B, D, E start together. C waits on A and B.

| Lane | Work |
|---|---|
| CRYPTO | T1.8 signer worker, T1.9–T1.11 certificates and revocation |
| CLIENT | T1.34 all 42 routes, T1.35 static export, T1.36 verification badges, T1.37 audit view |
| INFRA | T1.38 bundle gate, **T3.8 netns harness — build it now**, Pi acceptance runner |
| SIDECAR | Witness service, labeller service |
| DOCS | Bangla localisation pass, accessibility audit |

**Why build the netns harness during M1:** P3's ISP tests need simulated ASNs and firewall control. Building that tooling while the spine is busy with features means P3 starts with its test infrastructure already working, instead of spending its first days on tooling.

**Sync points:**
- CLIENT needs T1.31 read endpoints — stub them early with fixture data so the UI is not blocked.
- E needs T1.8 from CRYPTO.

**Exit:** P1 gate.

---

### M2 — Federation ★ PRIMARY GOAL

**Spine:** T2.1 → T2.16, mostly sequential (each RPC builds on the handshake and the queue).

Two sub-chains can run in parallel after T2.2:

| Chain | Tasks |
|---|---|
| Delivery | T2.4 `Deliver` → T2.5 `StreamActivities` → T2.6 projection → T2.7 index → T2.8 queue → T2.9 `Backfill` |
| Trust | T2.3 directory → T2.10 quotas → T2.12 STH gossip → T2.13 `ExchangeDirectory` → T2.14 discovery |

| Lane | Work |
|---|---|
| CRYPTO | T4.1 signal signer, T4.17 hybrid KEM — get ahead on P4 |
| CLIENT | Finish P1 route polish; begin T5.1 outbox |
| INFRA | T2.16 two-node harness, finish netns harness |
| SIDECAR | **T6.1–T6.5 Reticulum relay** — free parallelism, de-risks P6 |
| DOCS | T3.22 router port-forwarding guides |

**Exit:** M2 is the primary goal. Once `FG-01`–`FG-10` pass, the project's core thesis is demonstrated.

---

### M3 — ISP availability & bridging ★ SECONDARY GOAL

**Spine:** two chains, parallel after T3.2:

| Chain | Tasks |
|---|---|
| Path | T3.1 scopes → T3.2 uplinks → T3.3 source binding → T3.4 selector → T3.5 backoff → T3.9 ISP-local federation → T3.10 metrics |
| Bridge | T3.11 relay → T3.12 quotas → T3.13 failover → T3.14 re-announce+backfill |
| Reach | T3.15 UPnP → T3.16 STUN/CGNAT → T3.17 reverse tunnel |
| Discovery | T3.6 directory cache → T3.7 seed list → T3.18 mDNS → T3.19 manual/QR |

Path must precede Bridge. Reach and Discovery are independent of both and of each other.

**P4 may start in parallel here** — the Signal plane depends on federation (M2), not on ISP bridging.

| Lane | Work |
|---|---|
| CRYPTO+CLIENT | **Full P4 track** — channels, broadcast, messaging UI |
| INFRA | ISP suite automation, per-scope metrics dashboards |
| SIDECAR | T6.6–T6.8 relay forwarding and store-and-forward |
| DOCS | Operator deployment guide for bridge nodes |

**Exit:** M3 gate (`TG-01`–`TG-10`).

---

### M4 — Signal plane

If it did not already run in parallel with M3, it runs here.

**Sequence within P4:**

```
T4.1 signal signer ──┬── T4.3 channel ── T4.4 verification ── T4.5 QR ── T4.6 confusables
                     │        └── T4.7 broadcast ── T4.8 gaps ── T4.9 gating ── T4.10 retraction
                     │                                    └── T4.11 size budget
                     ├── T4.12 local subs ── T4.13 area subs ── T4.14 opt-in push
                     ├── T4.15 engine ── T4.16 prekeys ── T4.17 KEM ── T4.18 ratchet ── T4.19 receipts ── T4.20 groups
                     └── T4.22 checkin, T4.23 missing, T4.24 resource ── T4.25 map
```

Four independent sub-chains after T4.1: **channels/broadcast**, **subscription**, **messaging**, **crisis reporting**. Four people can work simultaneously.

**Exit:** M4 gate (`P4-G1`–`P4-G12`).

---

### M5 — Offline & mesh

**Sequence:** T5.1 outbox → T5.2 priority drain → T5.3 idempotency → T5.4 SW sync → T5.5/T5.6 offline compose and read.

Then mesh: T5.7 WebRTC → T5.8 QR pairing → T5.9 bloom → T5.10 store-and-forward → T5.11 verification → T5.12 quotas.

T5.13 `.jbpack` and T5.14 battery/data modes are independent and can run alongside.

**Exit:** M5 gate. This produces the strongest live demo.

---

### M6 — Reticulum

If SIDECAR kept pace, most of this is already done. Remaining: T6.9 admin visibility, T6.10 build-without-adapter verification, T6.11 hardware docs.

**Exit:** M6 gate — including `RG-04`, the full suite passing with the adapter removed.

---

## 5. Parallelism summary

### Always parallel with everything

| Work | Lane |
|---|---|
| CI gates, Docker, test harnesses | INFRA |
| Bangla localisation | DOCS |
| Accessibility audit | DOCS |
| Router and operator documentation | DOCS |
| Witness service | SIDECAR |
| Labeller service | SIDECAR |
| Reticulum relay service | SIDECAR |

### Parallel within a phase

| Phase | Independent groups |
|---|---|
| P0 | proto authoring ∥ crypto primitives ∥ CI scaffolding |
| P1 | 5 feature groups (A, B, D, E together; C after A+B) ∥ client routes ∥ netns harness |
| P2 | delivery chain ∥ trust chain |
| P3 | path chain → bridge chain; reach ∥ discovery ∥ **all of P4** |
| P4 | channels/broadcast ∥ subscription ∥ messaging ∥ crisis reporting |
| P5 | outbox chain → mesh chain; `.jbpack` ∥ battery modes |

### Never parallel

| Sequence | Why |
|---|---|
| Contracts → anything | Contract churn after freeze invalidates all downstream work |
| Pipeline → features | Features register into machinery that must exist |
| Federation → ISP bridging | Cannot bridge federation that does not exist |
| Outbox → mesh | Every transport is a drain of the one queue |
| T0.8 encoder → T0.14 vectors | Obviously |

---

## 6. Team allocation

### Solo

Run the spine only. Fold lanes in as context-switches at natural breaks.

| Order | Work |
|---|---|
| 1 | T0.1–T0.9, **T0.14–T0.17**, T0.18–T0.22 |
| 2 | T1.1–T1.7 pipeline |
| 3 | Feature group A only (post, comment, vote) — enough to demonstrate |
| 4 | T1.34 minimal client (feed, post, verify badge) |
| 5 | **P2 federation** — the primary goal |
| 6 | P3 path selection + one bridge scenario |

Cut: P4, P5, P6. Descope forum features to A only. **Do not cut T0.14–T0.17** — solo is exactly when a canonicalization bug costs the most.

### Two people

| Person | Lane |
|---|---|
| 1 | SPINE throughout |
| 2 | CRYPTO through M0, then CLIENT |

INFRA is shared, timeboxed. Target M2, attempt M3.

### Three to four people

| Person | Lane |
|---|---|
| 1 | SPINE |
| 2 | CRYPTO → signal plane crypto |
| 3 | CLIENT |
| 4 | INFRA + SIDECAR |

Target M3 and M4. Person 4's netns harness during M1 is what makes M3 achievable.

### Five or more

Add a second SPINE person to take the trust chain in P2 and the bridge chain in P3, and split the P1 feature groups across two people. Target M5.

---

## 7. Sync points

Points where lanes must meet. Schedule them explicitly.

| # | When | Who | What |
|---|---|---|---|
| S1 | T0.13 done | SPINE + CRYPTO | Wire WASM into the cross-language vector gate |
| S2 | T0.7 done | SPINE + CLIENT | Hand over generated types; client starts against fixtures |
| S3 | T1.7 done | SPINE + CLIENT | First real write endpoint; client swaps fixtures for the API |
| S4 | T1.8 done | CRYPTO + CLIENT | Signer worker integrated into the client |
| S5 | End of M1 | all | Full parity review against R2–R11 checklists |
| S6 | T2.2 done | SPINE + INFRA | Two-node harness wired to the real handshake |
| S7 | Start of M3 | SPINE + INFRA | netns harness handover — must already work |
| S8 | T4.1 done | CRYPTO + CLIENT | Second signer worker; verify plane separation |
| S9 | End of M2, M3, M4 | all | Gate review; go/no-go on the next phase |

---

## 8. Descope ladder

Cut from the bottom. Each rung leaves a coherent, demonstrable system.

| Rung | Cut | Still demonstrable |
|---|---|---|
| 0 | *(nothing)* | Everything through M6 |
| 1 | End-device RNS, RNS↔IP bridge (T6.12, T6.13) | Radio via server forwarding |
| 2 | All of P6 | Blackout via mesh and sneakernet |
| 3 | `.jbpack`, BLE, battery modes | Mesh over WebRTC |
| 4 | All of P5 | Federation + ISP bridging + broadcast |
| 5 | Groups, delivery receipts, missing persons, resources, map | Channels, broadcast, 1:1 messaging |
| 6 | All of P4 | **Federation + ISP bridging** — both stated goals |
| 7 | Bridge relay (keep scopes + path selection) | ISP-local federation |
| 8 | All of P3 | **Federation** — the primary goal |
| 9 | Awards, labels, search, roles | Core forum + federation |

**Never cut:** T0.14–T0.17 (cross-language gate and the three regressions), T1.1–T1.7 (pipeline), T2.1–T2.9 (federation core). Those three blocks *are* the project.

Rung 6 is the honest floor: both stated goals met, nothing else. Rung 8 is the emergency floor: primary goal only.

---

## 9. Definition of done

| Work type | Done means |
|---|---|
| **Contract** (proto, registry row) | Compiles in three languages; codegen diff clean; a fixture exercises it |
| **Pipeline step** | Pure function; unit-tested in isolation; every error path reachable by a test |
| **Domain handler** | validate + authorize + project implemented; registered; handler test passes; **zero core changes required** |
| **Read endpoint** | Cursor pagination; provenance block; integration test against a real database |
| **Adapter** | Implements its port; production impl + in-memory double; integration test |
| **Transport** | Satisfies the `Transport` port; class filter enforced; no app-layer branch on its ID |
| **Client route** | Renders offline from cache; signature status visible; keyboard-navigable; Bangla strings present |
| **Requirement** | At least one automated test cites its ID (`NFR-M08`) |
| **Phase** | Every gate criterion in `08-PHASES.md` passes in CI, not by hand |

---

## 10. First two weeks, concretely

| Day | SPINE | CRYPTO | INFRA | CLIENT |
|---|---|---|---|---|
| 1 | T0.1 envelope.proto | T0.10 Ed25519 | CI skeleton, Docker | — |
| 2 | T0.2, T0.3 bodies | T0.11 BIP85 | regenerate-and-diff check | — |
| 3 | T0.4, T0.5, T0.6 registry | T0.11 cont. | import-boundary lint | — |
| 4 | T0.7 codegen | T0.12 ML-DSA | size-budget harness | *(S2: types handed over)* |
| 5 | T0.8 encoder, T0.9 contentId | T0.13 WASM | — | scaffold, fixtures |
| 6 | **T0.14 vectors** *(S1)* | support S1 | wire the gate | routes scaffold |
| 7 | **T0.15–T0.17 regressions** | — | make gates blocking | routes scaffold |
| 8 | T0.18–T0.20 skeleton, ports, lint | — | Pi runner | feed UI |
| 9 | T0.21, T0.22 registry, rejection | T1.8 signer worker | — | feed UI |
| 10 | **M0 review** — contracts frozen | T1.8 cont. | — | post UI |
| 11 | T1.1 pipeline steps | T1.9 certificates | **netns harness start** | post UI |
| 12 | T1.2, T1.3 errors, envelope store | T1.10 revocation | netns harness | comment UI |
| 13 | T1.4, T1.5 projections, Merkle | T1.11 duress | netns harness | *(S4: signer wired)* |
| 14 | T1.6, T1.7 rebuild, write endpoint *(S3)* | — | netns harness | swap to live API |

By day 14 the contracts are frozen and cross-verified, the pipeline accepts its first signed envelope, and the ISP test harness is under construction three weeks before it is needed.
