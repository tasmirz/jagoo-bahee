# P3 handoff — read this before touching ISP availability & bridging

> **Written at the point work was paused.** Its job is to let the next session continue
> without re-deriving anything, and without believing something is finished when it is not.
> Read `P3-ISP-AVAILABILITY-PLAN.md` first for the phase's scope; this file is the *state*.

**Status in one line:** the node-side of P3 is built and green in-process (22/22 gate tests,
358/371 backend tests); **the container gate has never once run green**, and the client half
(T3.19, T3.20) is three unwired files. Docs, ADRs and the build log are not written.

---

## 1. What is actually done, and how it was verified

Everything below is committed or in the working tree and passes the command named beside it.

| Area | Files | Verified by |
|---|---|---|
| Pure domain | `core/domain/transport/{scope,uplink-state,path-selection,bridge-policy}.ts` | `vitest run src/core/domain/transport` → 51 pass |
| Ports | `core/ports/transport.port.ts`; extensions to `network.port.ts`, `observability.port.ts` | typecheck + lint clean |
| App services | `core/app/{path-router,bridge-relay,transport-supervisor,reverse-tunnel}.ts` | exercised by the gate suite |
| Adapters | `adapters/outbound/transport/{tcp-probe,configured-uplinks,uplink-resolver,nat-traversal,local-discovery,reverse-tunnel-client}.ts`, `adapters/outbound/in-memory/in-memory-transport.ts` | ditto |
| HTTP | `adapters/inbound/http/{transport,tunnel}.controller.ts` | typecheck only — **no route test exists yet** |
| Composition | `composition/{transport.config,transport.runtime}.ts`, wiring in `app.module.ts` | `app.module.spec.ts` boots (but see §4 — that spec cannot catch DI faults) |
| Harness | `federation/two-node-harness.ts` extended | FG-01…FG-10 still green through it |
| **P3 gate (in-process)** | `backend/src/transport/isp.e2e.spec.ts` | `vitest run src/transport/isp.e2e.spec.ts` → **22/22 pass** |
| Container topology | `ops/isp-compose.yml` | **stack builds and starts; nodes have never stayed up — see §3** |
| Container gate driver | `backend/src/cli/isp-gate.ts` | **never executed successfully** |
| Client data layer | `frontend/src/data/{seed-directory,peer-directory}.ts`, `frontend/src/features/connectivity/scope.ts` | **nothing — not imported, not typechecked, not tested** |
| i18n | `frontend/src/i18n/index.ts` — P3 keys in `en` and `bn` | **frontend typecheck/test not run since the edit** |

Baseline at pause: backend `358 passed | 13 skipped (371)`, backend typecheck clean, backend
lint clean *as of before* the `identity-directory.controller.ts` edit in §3.

**AR-12 is held by construction, not by assertion.** The two-node harness now always builds a
`PathRouter` over one implicit uplink, so FG-01…FG-10 running green *is* the evidence that a
node with no `UPLINKS` behaves exactly as it did in P2. Do not "simplify" that by giving the
P2 suite a null selector — the coupling is the test.

---

## 2. What is NOT done

Ordered by what blocks what.

1. **The container gate has never passed.** `pnpm ops:isp` builds and starts, all four node
   containers then exit(1). Cause found and fixed in the working tree (§3), but the image has
   **not been rebuilt** since. Nothing in `ops/isp-compose.yml` or `isp-gate.ts` has been
   validated against a running stack: the ADMIN_KEYS/auth flow, the `jagoo-isp_ix` network
   name used by `docker network disconnect`, `/proc/net/tcp` parsing, `seedDemo(A1)` against a
   containerised node, and every route the gate calls are all **unproven**.
2. **Client scope indicator (T3.20 / TG-10).** `features/connectivity/scope.ts` holds the
   parsing, polling cadence and tone rules. There is **no component and no wiring**: nothing
   renders it, `app-provider.tsx` does not fetch `/v1/transport/scope`, and TP-20's "always
   visible, never buried in settings" is therefore not met.
3. **Manual entry ≤ 3 taps + QR (T3.19).** Not started. `peer-directory.ts` exposes
   `candidateAddresses` and `connectFromCandidates`, which is what such a screen would drive.
4. **Client tests.** No test for `peer-directory`, `seed-directory` or `scope`. TG-09 ("cold
   client, seed list only, `GLOBAL` blocked, connects on `ISP_LOCAL`") and TG-10 are
   client-side gates and are **unmet**.
5. **`ops/docs/PORT-FORWARDING.md` (T3.22 / TP-17)** — Bangla + English router guides. Not
   written. TP-17 calls this a deployment blocker.
6. **ADRs.** Two are needed and neither exists:
   - source-bound dialling through `experimental.registerResolver` (§5.1),
   - Docker networks instead of Linux netns (§5.2).
   **Numbering warning:** the merge took `ADR-014` (local Signal push subscriptions). The next
   free numbers are **ADR-015** and **ADR-016**. `P3-ISP-AVAILABILITY-PLAN.md` and several code
   comments still say "ADR-014"/"ADR-015" for these two — **those references are wrong and must
   be renumbered** in: the plan, `uplink-resolver.ts` header, `isp.e2e.spec.ts` header,
   `ops/isp-compose.yml` header.
7. **`BUILD-LOG.md` entry** for P3. Not written. Candidate standing lessons in §5.
8. **`CLAUDE.md`** still describes P2 as the frontier. Not updated.
9. **`P3-ISP-AVAILABILITY-PLAN.md` §7 status table is a lie** — it was written as a template
   with every row marked `done`. Corrected in this handoff's sibling commit; if it still reads
   `done` for T3.19/T3.20/T3.22, fix it before anything else. A completed implementation
   without an updated phase boundary is indistinguishable from untracked partial work (the
   lesson already recorded at the end of the P2 log).
10. **Workspace-level verification not run since the merge**: `pnpm lint`, `pnpm typecheck`,
    `pnpm build`, `pnpm test`, `pnpm vectors`, `pnpm proto:check`, `pnpm smoke:local`. Only the
    backend filter was run.
11. **CI**: no job runs the ISP suite. `CLAUDE.md` §7.4 lists "Network-namespace ISP suite" as
    a blocking gate; it must become its own job, like FG-01…FG-10, so a green summary cannot
    hide it being skipped.

---

## 3. The live blocker, and the four merge repairs

A `git pull` mid-session brought in P4/P5/P6 work (`8ec7803 P4,P5,P6(done)` plus a merge
commit). It landed four defects that had to be repaired before P3 could be verified. Three are
fixed and green; the fourth is fixed in the working tree but **unverified**.

| # | Symptom | Root cause | State |
|---|---|---|---|
| 1 | `Duplicate identifier 'BroadcastCategory'` | merge kept both my type-only import and the original | fixed, typecheck clean |
| 2 | `Calling the test function inside another test function is not allowed` | `federation.config.spec.ts` — two `it` blocks textually nested by the merge | fixed, 15 pass |
| 3 | `ingress.spec` and `signal-features.spec` expected 1/2 fanout entries, got 2/3 | `ingress.ts` step 19 ended up calling `federation.enqueue` **twice** — the merge grafted my `bytes:` call on top of theirs and clobbered the `auxiliary.fanout` call it was meant to replace | fixed: one `federation.enqueue` inside `if (spec.federate)` carrying `bytes`, followed by `auxiliary?.fanout(raw, envelope)`. 358 tests pass |
| 4 | **every node container exits(1)**: `Nest can't resolve dependencies of the IdentityDirectoryController (?)` | `identity-directory.controller.ts` used `import type { ProjectionStore }`. A type-only import erases the class, so there is no DI token, and there is no `@Inject` either | **fixed in the working tree, NOT verified** — the image must be rebuilt |

**Defect 4 is L-15 and L-20 happening together, and it is worth pausing on.** Under vitest,
esbuild drops `emitDecoratorMetadata`, so the dependency silently arrives as `undefined` and
`app.module.spec.ts` boots happily. Under `nest build` the metadata *is* emitted, Nest resolves
the real type, finds nothing, and the process dies. So the in-process module spec **cannot
see** this class of fault, and only running the artefact does.

**Immediately actionable:** the same audit has not been done for the other controllers the
merge added. `reticulum.controller.ts` and anything else introduced in `8ec7803` should be
checked for the same shape — a value import of the port plus `@Inject(Token)` on every
constructor parameter. That scan was requested and interrupted; it is the first thing to
redo.

### Resume sequence

```bash
pnpm --filter @jagoo/backend exec tsc -p tsconfig.json --noEmit   # expect clean
pnpm --filter @jagoo/backend lint                                  # expect clean
pnpm --filter @jagoo/backend exec vitest run                       # expect 358 pass / 13 skip
pnpm ops:isp:down                                                  # containers are currently exited
pnpm ops:isp                                                       # rebuilds the image with the DI fix
pnpm gate:isp                                                      # FIRST EVER RUN — expect surprises
```

Current container state: `mongo-a`, `mongo-b`, `redis-a`, `redis-b` **running**; `jb-a1`,
`jb-a2`, `jb-b1`, `jb-bridge` **exited(1)**. `pnpm ops:isp:down` uses `-v`, which drops the
island datastores — that is intended, the harness is disposable.

---

## 4. Design decisions already made — do not re-litigate these

### 4.1 Source binding rides a registered gRPC resolver

`@grpc/grpc-js` has no `localAddress` channel option. It does expose
`experimental.registerResolver`, and its connector calls `net.connect(address)` with the
address object the resolver produced — and `net.connect` honours `localAddress`. So a target
of the form `jbuplink://<sourceIp>/<host>:<port>` binds the socket to that uplink.

This was **verified empirically before being built on**: a scratch script registered the
resolver, dialled a plain `net` server, and the server observed the requested local port. The
alternative considered and rejected was a per-uplink loopback CONNECT relay, which would put a
userspace splice in front of every federation byte.

The coupling to grpc-js internals is real, so the gate asserts it *falsifiably*: dialling with
a source address the host does not have must **fail**. If `localAddress` were ever silently
ignored, that test goes green-to-red immediately. Keep that test.

### 4.2 A static resolver MUST rate-limit re-resolution

Found the hard way: the whole ISP suite hung with one vitest worker pegged at 100% CPU and no
output. grpc-js asks the resolver to re-resolve after every failed connection attempt, and a
source address that no longer exists fails `net.connect` with `EADDRNOTAVAIL` *immediately* —
no SYN, no timeout. "Fail → re-resolve → fail" is then a tight synchronous loop with nothing
in it to yield, which no test timeout can interrupt.

`resolver-dns` never hits this because it rate-limits with
`grpc.dns_min_time_between_resolutions_ms`. `UplinkResolver` now does the same (5 s default,
honouring that channel option). **This is a production bug, not a test artifact** — it is
exactly what a node does when an uplink's address is withdrawn while peers are queued against
it, which is the failover case P3 exists to handle.

### 4.3 Uplinks are born `UP`, and an unmeasurable scope is treated as live

`UNKNOWN` makes `isSelectable` false, which takes every path with it — a node would be unable
to federate until its first probe round finished, and would never recover if the probe targets
themselves were blocked. "We have not measured this, so try it and find out" is the honest
position; a failed dial then feeds TP-12's backoff. Probing demotes; it does not have to
promote. Same reasoning for a declared scope with no probe target.

### 4.4 The bridge gates crossings only

`FederationOutboxService.applyBridgePolicy` runs only when `options.excludePeers` is non-empty
(i.e. the envelope arrived from a peer). Fanout to peers on the *same* uplink as the origin is
ordinary P2 federation and is never gated; gating it would break gossip on any node that
happens to have two interfaces. With one uplink every peer resolves to it, nothing is a
crossing, and the quota is never consulted — which is how AR-12 survives.

One decision per crossing *set*, not per peer: the quota is per uplink **pair**, and charging
per peer would bill an island with three nodes three times for one link's worth of traffic.

### 4.5 BR-01's refusal reports as `disabled`

`Plans/06` §6 fixes the `RelayDecision` reason set at five values, and `untrusted` is not one
of them. Rather than extend a frozen contract, "no uplink pair has a TRUSTED peer on both
sides" maps to `disabled`, and the real reason is carried by `bridgeReadiness()` and surfaced
at `/v1/transport/bridge` (BR-06). The gate test demotes a peer to **NORMAL**, not
`PROBATION` — `PROBATION` does not carry class 3 at all, so the trust ladder would refuse
before the bridge was ever consulted and the test would pass vacuously.

### 4.6 `ScopeProbe.probe` carries `uplinkId`

TP-09's "each uplink is probed independently" is stated rather than inferred. It also lets a
test cut one interface when two uplinks necessarily share a bindable source address in-process.

### 4.7 In-process tests bind `127.0.0.1` wherever they actually dial

Because TP-08 binding is *real*, an uplink configured with `10.0.1.10` fails with
`EADDRNOTAVAIL` on a host without that address. The suite therefore keeps realistic addresses
only in the TG-01 test that **selects and never dials**, and uses `127.0.0.1` everywhere it
opens a connection. Two genuinely separate interfaces are a property of a machine, not a
process — which is precisely why the container gate exists and why it is not optional.

---

## 5. Candidate standing lessons for `BUILD-LOG.md`

Numbering continues from L-26. Check the log — the merge may have added its own.

- **A resolver that answers instantly must rate-limit itself.** Any retry loop whose failure
  path is synchronous (`EADDRNOTAVAIL`, `ECONNREFUSED` on loopback) will spin at 100% CPU with
  no timeout able to interrupt it. Symptom: a test runner that produces *no output at all* —
  look at process CPU before looking at the code.
- **A type-only import of a port is a boot failure that only the artefact can show.** Ports are
  abstract classes so they can be DI tokens; `import type` erases the token, vitest hides it by
  dropping decorator metadata, and the container is where it surfaces. Every controller
  constructor parameter needs a value import **and** `@Inject(Token)`.
- **A phase-plan status table written as a template is worse than no table.** The P3 plan
  shipped every row marked `done` before any row was. Fill the table from evidence, at the end.

---

## 6. Where each TG criterion stands

| ID | Criterion | In-process | Container | Client |
|---|---|:--:|:--:|:--:|
| TG-01 | source binding per peer | ✅ (selection + falsifiable bind test) | ❌ never run | — |
| TG-02 | `GLOBAL` blocked → `ISP_LOCAL` federation | ✅ | ❌ never run | — |
| TG-03 | selector prefers `ISP_LOCAL`, metric confirms | ✅ | ❌ never run | — |
| TG-04 | bridge merges two islands | ✅ | ❌ never run | — |
| TG-05 | class-0 crosses under bulk backlog | ✅ | ❌ never run | — |
| TG-06 | uplink kill → re-establish, zero loss | ✅ | ❌ never run | — |
| TG-07 | backfill closes the gap, no duplicates | ✅ | n/a | — |
| TG-08 | outbound-only behind CGNAT + reverse tunnel | ✅ | n/a | — |
| TG-09 | cold client, seed list only, `GLOBAL` blocked | node half ✅ | — | ❌ **not built** |
| TG-10 | scope visible in the UI, updates ≤ 30 s | node half ✅ | partial check written | ❌ **not built** |

**The phase is not complete.** `Plans/08` requires every gate criterion to pass *in CI*, not by
hand, and three of the ten have no client implementation at all.
