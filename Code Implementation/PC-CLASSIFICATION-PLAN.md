# PC — Content classification: sentiment, intent, and safety labelling

> **Status: PLANNED.** Not started; branch `post-classification` is empty as of 2026-08-20.
> This phase ADDS one registry row and one proto message (`jb:classify:emit:v1`,
> `jagoo.v1.Classification`) through the RG-03 extension point. It changes no frozen
> contract, adds no write route, and touches no pipeline step. The requirements it
> implements already exist and are not restated here: LBL-01…LBL-11, MOD-01, MOD-11/12,
> VIS-01/05/06, AC-62/63, INF-29, ADM-13 in `Plans/requirements/R5-MODERATION.md`, plus
> FM-04…FM-09 in `Plans/03-CONTRACTS-FORUM.md` §6.

## Context

Posts, comments and image attachments currently enter the system with no automated
assessment of any kind. The question raised was which of three paths to take:
(1) publish first and attest afterwards, (2) have the server run a classifier and refuse
to sign — rejecting the post with a stated cause, or (3) use NudeNet for imagery and a
MiniLM-family model for text.

**Path 2 is not available.** It is not a preference call — the frozen specification already
evaluated and rejected it, in a decision table at `Plans/requirements/R5-MODERATION.md` §1
and again at `Plans/03-CONTRACTS-FORUM.md` §6:

| Property | Pre-publish gate | Publish-then-attest |
|---|---|---|
| Server can silently censor | **Yes** — withheld approval is indistinguishable from a network error | **No** — a missing label is visible; a `RESTRICT` label is signed evidence |
| Works offline / on mesh | No | **Yes** |
| Round trips before publishing | 2 + inference | **0** |
| User can contest a decision | Nothing to point at | Signed label with `reasons[]` and `appealable` |
| Multiple opinions possible | No — one gatekeeper | **Yes** — labellers may publicly disagree |

Three further reasons path 2 breaks this specific system:

- Posts are signed by the **user's** key. `NodeSigner`'s own doc comment
  (`backend/src/core/ports/node-signer.port.ts`) says a node key asserts *"this node saw
  this and put it in its log"* — an accountability claim, not authorship — and that
  *"conflating them would let a node forge user content."* A server signature that
  confers validity inverts the trust model.
- It breaks federation determinism, the PRIMARY goal. A peer running model v1.1 would
  reject bytes that v1.0 accepted, so validity would stop being a property of the signed
  bytes (FD-03).
- The instinct behind path 2 — *"the server should hand back a signature"* — is already
  satisfied. Pipeline **step 18** signs a receipt with a Merkle inclusion proof. It
  attests *inclusion*, after acceptance, rather than *approval*, before it.

**The good news: almost all of the seam already exists and is deliberately empty.** What is
missing is only the model behind it.

| Already built | Location |
|---|---|
| `LabelProvider` port + `NullLabelProvider` default (AR-12) | `backend/src/core/ports/content.port.ts:34`, `app.module.ts:283` |
| `POST /v1/labels/preflight`, fail-open, live, **zero client callers** | `backend/src/adapters/inbound/http/labels.controller.ts` |
| `jb:label:emit:v1` domain, row, handler, `forum_labels` projection | `registry.yaml:379`, `backend/src/features/forum/label/label.handler.ts` |
| `Label` proto with `model_id`, `confidence_pct`, `reasons[]`, `appealable` | `proto/jagoo/v1/forum.proto:380` |
| `provenance.labels[]` already served on every post/comment | `backend/src/adapters/inbound/http/forum-read.controller.ts` (`provenance()`) |
| `label.trust` permission bit 11 | `backend/src/features/forum/shared/flags.ts:69` |
| `AttachmentDoc.scanStatus: 'unscanned'` | `backend/src/features/forum/attachment/attachment.handler.ts` |
| Requirements LBL-01…LBL-11, MOD-01, VIS-01/05/06, AC-62/63, INF-29, ADM-13 | `Plans/requirements/R5-MODERATION.md` |
| `services/labeller/` reserved in the architecture | `Plans/07-ARCHITECTURE.md:234` |

Branch `post-classification` is currently empty (`git log main..post-classification` → no
output). No sentiment, NSFW, MiniLM, NudeNet or ONNX code exists anywhere in the tree.

### Decisions taken

1. **Publish-then-attest, plus client-side default-hide for `DANGEROUS`, plus auto-tombstone
   for undeclared explicit imagery** — the tombstone being a *public* MOD-11 record, never
   a silent delete.
2. **A new `jb:classify:emit:v1` domain** carrying sentiment/intent/language as descriptive
   metadata, kept separate from `Label`, which stays a safety verdict.
3. **The classifier is a black box each operator chooses.** NudeNet + multilingual MiniLM is
   the *reference implementation* we ship, not a requirement. Any service satisfying the
   documented HTTP contract can be dropped in. This forces two things: an **open taxonomy**
   in the wire format instead of closed enums, and a **capability manifest** the client reads
   at runtime so it renders whatever that operator's classifier actually emits.
4. **`paraphrase-multilingual-MiniLM-L12-v2`** (int8 ONNX) as the reference text encoder —
   same MiniLM family, but Bengali-capable. `all-MiniLM-L6-v2` is English-only, and
   CLAUDE.md §6 makes Bangla the primary language of the target users; an English-only head
   would be confidently wrong rather than silent on exactly the people this platform exists
   for.
5. **The job queue is a Redis Stream with a consumer group**, not a Mongo collection. Redis
   is already a first-class port here, and `XREADGROUP` + `XAUTOCLAIM` give atomic claim and
   a visibility timeout natively — which is precisely the property the federation outbox's
   `lease()` lacks.

### The intended outcome

Classification becomes a **discovery and triage** capability first and a moderation
capability second. `intent: HELP_REQUEST` on a crisis feed is worth more to this project
than a toxicity score, and it is the part no existing requirement covers.

---

## Non-negotiable boundaries

These are the constraints that make the difference between a correct implementation and a
plausible-looking one. Each gets a test that fails on purpose (CLAUDE.md §7.4).

1. **Nothing enters the 19-step pipeline.** No step consults a classifier. Ingress latency
   with the labeller enabled must match ingress latency with it disabled. VP-01, VP-03.
2. **Fail open, everywhere.** A dead, slow or wrong classifier means *unlabelled*, never
   *unpublishable*. LBL-06, LBL-11, NFR-R05, AC-62.
3. **FORUM plane, public content only.** Never the SIGNAL plane; never `jb:message:forum:v1`
   (pseudonymous DMs). Classifying private messages would breach SEP-01…05 and ADR-012.
4. **No per-author aggregates, ever.** A per-key sentiment or behaviour profile on a
   pseudonymous plane is a deanonymisation vector. Aggregate per-community only, matching
   the existing aggregate-only observability stance.
5. **No floats reach a signed structure.** All confidences are `uint32` percent, rounded and
   clamped **inside the sidecar**, so no float ever crosses into TypeScript.
6. **Optional subsystem (AR-12).** `pnpm test`, `pnpm smoke:local` and `pnpm vectors` all
   pass with no classifier configured, and the node boots with it absent.
7. **The labeller signs with its own FORUM identity, never `NodeSigner`.** See boundary 1's
   sibling reasoning in `node-signer.port.ts`.
8. **A runaway classifier must not become a mass-censorship event.** Auto-tombstone is
   default-off, per-community opt-in, rate-capped, and alerts the operator on every use.
   Build-log lesson L-22: a false positive that requires an operator to lift is a
   long-tailed denial of service.

### Deployment reality, and why it is a feature

The sidecar is roughly 350–450 MB RSS (multilingual MiniLM int8 ~120 MB + NudeNet 320n
~20 MB + onnxruntime). CLAUDE.md §5.5 budgets the **node** at < 512 MB on a Pi 4, and the
measured baseline is already ~384 MB with Mongo and Redis co-resident. **The classifier
therefore cannot run on a Pi-class node, and should not try.**

That is fine, because labels and classifications are *envelopes*. A small node federates
them in from a well-resourced peer's labeller for free, through the outbox that already
exists. Running a labeller is a capability of well-resourced instances; consuming its
output is available to every node on the network.

---

## Architecture

```
  Author signs → POST /v1/envelopes → 19 steps → receipt (unchanged, untouched)
                                          │
                                          └─ step 19 afterCommit ─→ XADD jb:classify:jobs
                                                                        │
   ┌────────────────────────────────────────────────────────────────────┘
   │  LabellerService (composition-owned timer, AR-11)
   │    1. XREADGROUP  — atomic claim, no double dispatch
   │       XAUTOCLAIM  — reclaim jobs whose worker died mid-flight
   │    2. skip if federated-in, SIGNAL plane, or a DM domain
   │    3. text → ContentClassifier.classifyText
   │       images → BlobStore.read → ContentClassifier.classifyImage
   │    4. build + sign with LabellerSigner (its own FORUM identity)
   │    5. IngressPipeline.accept(raw)  ← in-process, all 19 steps re-run
   │    6. XACK  ·  or XADD jb:classify:dead + OperatorAlerts past MAX_ATTEMPTS
   │                                                     │
   │            ┌────────────────────────────────────────┤
   │            ▼                                        ▼
   │   jb:classify:emit:v1                      jb:label:emit:v1
   │   (always, if classified)                  (only when verdict ≠ OK)
   │            │                                        │
   └────────────┴──────────── federates via existing outbox ──────→ peers

  ContentClassifier port ─ HTTP/JSON ─→ ANY conforming service
                                          └─ reference impl: services/classifier
                                             multilingual MiniLM int8 · NudeNet 320n
                                          └─ or whatever the operator runs

  GET /v1/labeller (capability manifest) ──→ client renders what THIS node emits
```

**Why `Classification` always, `Label` only when not OK.** Absence of a label is otherwise
ambiguous — unclassified, classifier down, or clean? Emitting an OK `Label` for every post
doubles envelope volume for no signal. Instead the `Classification` envelope doubles as the
*"I looked at this"* receipt, and it carries genuinely useful data regardless. Present
classification + absent label ⇒ clean. Absent classification ⇒ not yet looked at.

**Why local-origin only.** Without this, N nodes × M posts produces N×M redundant label
envelopes. The worker skips content that arrived federated by checking
`FederationLedger.entriesFor(contentId)` for an inbound entry — **which requires no core
change**, since `afterCommit(body, env)` does not receive `HandlerContext`. Override with
`CLASSIFY_FEDERATED_CONTENT=true` for an instance that distrusts its peers' labellers.

---

## Work breakdown

### PC-0 — Contract

- `proto/jagoo/v1/forum.proto`: add `Classification` and `Assertion`. **No enums** — see
  the reasoning below.

  ```protobuf
  // An operator may run any classifier. The wire format therefore carries an OPEN
  // taxonomy: a namespaced taxonomy id, a label within it, and an integer score. A node
  // that has never heard of `acme:triage:v2` still stores, federates and renders it as an
  // attributed opaque tag — it does not need to understand a taxonomy to carry it.
  message Assertion {
    string taxonomy  = 1;   // "jb:intent:v1" | "jb:sentiment:v1" | "acme:triage:v2"
    string label     = 2;   // "help_request"
    uint32 score_pct = 3;   // 0..100, integer — never a float
  }

  message Classification {
    string target = 1;                    // content_id, "jb1…"
    repeated Assertion assertions = 2;
    string language     = 3;              // BCP-47, "" when undetermined
    uint32 language_pct = 4;
    string model_id     = 5;              // operator-defined, e.g. "mmini-l12-int8@1.2.0"
  }
  ```

  **Why not closed enums.** An `enum Intent { HELP_REQUEST=1; … }` would make the protocol
  the arbiter of which classifiers are legal. An operator running a flood-specific triage
  model, or a Bangla-dialect model with categories we never anticipated, could not express
  its output — and the enum numbers would be frozen forever the moment they federate, like
  the content-flag bits in `flags.ts`. An open taxonomy costs a few bytes per assertion and
  removes that gate entirely. It also matches the precedent already set by
  `Label.categories`, which is `repeated string`.

  Well-known `jb:*` taxonomies ship as **SDK data**, not contract:
  `packages/sdk-ts/src/taxonomy/well-known.ts`. Presentation data belongs in the SDK, where
  it can change without a version bump; the contract stays open.

  Handler `validate()` (pure) must cap the blast radius: `target` starts with `jb1`,
  `assertions.length <= 32`, each `taxonomy` matching `^[a-z0-9]+(:[a-z0-9_]+)+$` and
  `<= 64` chars, each `label` non-empty and `<= 64` chars, `score_pct <= 100`,
  `language_pct <= 100`. Without the caps this message is a payload vector inside a
  zero-cost domain.

  Unset fields stay at 0/"" and canonical encoding omits zero values, so an image-only
  post's classification costs nothing extra.

- `proto/jagoo/v1/registry.yaml`: one row, mirroring `jb:label:emit:v1`. Reuse the existing
  `label.trust` permission bit rather than claiming a new one — bit positions are frozen and
  a new bit is a permanent commitment for something bit 11 already means.

  ```yaml
  - domain: 'jb:classify:emit:v1'
    plane: FORUM
    body: jagoo.v1.Classification
    priority: BULK          # required — codegen KY-05 constrains non-BULK to ED25519 only
    idempotent: true        # no nonce needed; content_id dedupe is sufficient
    scope_kind: COMMUNITY
    key_algs: [ED25519]
    max_bytes: 4096
    credit_cost: 0
    requires: []
    permission: label.trust
  ```

- `pnpm proto:gen` → regenerates `packages/sdk-ts/src/gen/registry.ts`,
  `crates/jb-core/src/gen/registry.rs`, `tools/vectors/gen/registry.py` via
  `tools/codegen/generate.mjs`. `pnpm proto:check` must diff clean (AR-10).
- `tools/vectors/expected.json`: add a `Classification` fixture. Review the diff by hand —
  `--update` only regenerates after all three implementations already agree, which makes it
  a rubber stamp if nobody reads it (build-log L-02).
- `Code Implementation/ADR-018-CONTENT-CLASSIFICATION.md` — records: why the domain is
  separate from `Label`; **why the taxonomy is open rather than enumerated**; why the sidecar
  boundary is HTTP/JSON rather than proto; **why the queue is a Redis Stream and not a copy
  of the federation outbox**; why the labeller key is not the node key; and the
  auto-tombstone guard rails.
- `Plans/requirements/R5-MODERATION.md` — append `CLS-01…CLS-12` for the axes no existing
  requirement covers. Existing LBL/MOD/VIS IDs are reused as-is, not restated.

### PC-1 — The classifier contract, and a reference implementation

Two separable deliverables. The **contract** is the product; the **service** is one
implementation of it that we happen to ship.

#### PC-1a — The contract (`docs/classifier-contract.md`)

A versioned HTTP/JSON contract any operator can implement in any language. HTTP/JSON rather
than proto deliberately: this boundary is node-local and nothing signed depends on it, so
`proto/` stays reserved for formats that cross trust boundaries. Requiring protobuf here
would also be a barrier to the third-party implementations the whole point is to enable.

- `GET /healthz` → `{ ok: bool }`. Liveness only.
- `GET /v1/capabilities` → **the metadata that drives everything downstream**:

  ```jsonc
  {
    "contract": "jagoo.classifier/1",
    "axes": ["safety", "sentiment", "intent", "language", "image"],
    "taxonomies": [
      { "id": "jb:safety:v1",    "kind": "verdict",
        "labels": ["ok","review","restrict","dangerous"] },
      { "id": "jb:intent:v1",    "kind": "multi",
        "labels": ["help_request","offer_aid","information","rumour",
                   "coordination","opinion","question","spam"] },
      { "id": "jb:sentiment:v1", "kind": "single",
        "labels": ["negative","neutral","positive","distressed"] }
    ],
    "languages": ["bn", "en"],
    "models": [{ "id": "mmini-l12-int8@1.2.0", "axes": ["sentiment","intent","safety"] },
               { "id": "nudenet-320n@3.4.2",   "axes": ["image"] }],
    "maxTextBytes": 65536,
    "maxImageBytes": 16777216
  }
  ```

  An operator swapping in their own model declares its own `taxonomies` here — including
  ones we have never seen — and both the node and the client adapt without a code change.

- `POST /v1/classify/text` → `{ assertions[], language, language_pct, model_id }`
- `POST /v1/classify/image` → `{ assertions[], model_id, detections[] }`

Contract rules an implementation must honour, and which the conformance suite checks:

- **Every score is an integer 0..100.** Rounding and clamping happen *inside the
  implementation*, so no float ever crosses into TypeScript.
- Unknown axes are omitted, never faked. Omission is honest; a fabricated neutral is not.
- The service is stateless per request and stores nothing about authors.
- **No outbound network at inference time.** A classifier that phones home during a shutdown
  is worse than no classifier.

Ship `services/classifier/tests/conformance/` as a runnable suite an operator can point at
their own implementation. A contract with no conformance suite is a suggestion.

#### PC-1b — The reference implementation (`services/classifier`)

Follows `services/relay` for packaging and `services/audit-log` for deployment.

- `pyproject.toml` — `jagoo-classifier`; `onnxruntime`, `fastapi`, `uvicorn`, `tokenizers`,
  `numpy`, `pillow`; console script; `testpaths = ["tests"]`.
- `src/jagoo_classifier/`: `app.py` (routes), `capabilities.py` (manifest), `text.py`
  (multilingual MiniLM encoder + safety/sentiment/intent heads), `image.py` (NudeNet 320n),
  `rounding.py` (**the float boundary** — `round(p * 100)` clamped to 0..100, unit-tested
  directly).
- Models baked into the image or mounted from a volume; never fetched at runtime.
- `ops/classifier.Dockerfile` + a `classifier` service in `ops/docker-compose.yml` behind a
  compose profile, so `pnpm ops:up` stays lean.
- `pnpm test:classifier` alongside the existing `pnpm test:relay`.

### PC-2 — Backend ports, adapters and worker

New ports in `backend/src/core/ports/content.port.ts` (abstract classes, so they double as
Nest DI tokens — the idiom documented at `app.module.ts:8-13`):

- `ContentClassifier` — `capabilities()`, `classifyText`, `classifyImage`. Plain data in,
  plain data out. **Kept separate from `LabelProvider`** because signing belongs to the
  labeller identity, not to the classifier; `LabelProvider.label()`'s signature-returning
  shape does not fit and its only live consumer is the preflight route.
- `ClassificationQueue` — `enqueue`, `claim`, `ack`, `reclaimStale`, `deadLetter`, `stats`.
  The method names follow stream semantics rather than the outbox's lease semantics, because
  the underlying guarantee is genuinely different.

Adapters (each needs a production impl **and** an in-memory double, AR-03):

- `adapters/outbound/classifier/http-content-classifier.ts` + `null-content-classifier.ts`
- `adapters/outbound/redis/redis-classification-queue.ts` + `InMemoryClassificationQueue`

#### Why Redis Streams rather than a Mongo collection

The federation outbox's `MongoFederationOutbox.lease()` is a plain `find().sort().limit()`
with **no atomic claim and no visibility timeout**. It is safe today only because exactly
one in-process timer calls `drain()`. Copying that pattern would inherit the defect, and a
classification worker is far more likely to be scaled out or run as its own container.

A Redis Stream with a consumer group gives all of it natively, and Redis is already a
first-class port here (credits, nullifiers, rate limits, cache):

| Need | Redis Streams |
|---|---|
| Atomic claim, no double dispatch | `XREADGROUP GROUP labeller <consumer>` |
| Visibility timeout / worker died mid-job | `XAUTOCLAIM … <min-idle-ms>` reclaims it |
| Attempt counting | delivery count from `XPENDING` |
| Dead letter | past `MAX_ATTEMPTS` → `XADD jb:classify:dead` + `XACK` + `OperatorAlerts.raise` |
| Bounded memory | `XADD … MAXLEN ~ N` |
| Horizontal workers | add a consumer to the group; correct by construction |

Keys: stream `jb:classify:jobs`, group `labeller`, dead-letter stream `jb:classify:dead`.
All operations are single atomic commands — no read-modify-write, so CLAUDE.md §5.5 is
satisfied without a Lua script.

Reuse `backend/src/core/domain/federation/backoff.ts` (`nextRetry`, `backoffDelayMs`) for
the retry delay — it is already pure and already tested.

**Durability.** Redis is `appendonly yes` in `ops/docker-compose.yml`, but a Redis stream is
weaker than the Mongo envelope log and should not be treated as the source of truth. It does
not need to be: a lost job means *unclassified*, which is the fail-open state anyway, and the
sweeper below recovers it. The envelope log stays the only backup-critical dataset (§4.5).

`ClassificationQueue` follows the `REDIS_URL` precedent at `app.module.ts:321-335` — throw
in production when unset, fall back to the in-memory double otherwise — so unit tests need
no Redis and the real adapter gets an integration spec gated on `REDIS_URL`, matching the
three existing integration specs.

App layer, `backend/src/core/app/labeller.ts`:

- `LabellerService.runOnce()` — a single pass with no clock of its own. Scheduling lives in
  `composition/classifier.runtime.ts`, mirroring `federation.runtime.ts` (AR-11).
- A **sweeper** pass alongside the queue drain. `afterCommit` throws are swallowed by
  `ingress.ts:258-262` (*"the acceptance receipt is authoritative"*), so a lost enqueue is
  invisible. The sweeper finds posts older than N seconds with no classification, which also
  backfills content published before the labeller existed.

Labeller identity, `backend/src/adapters/outbound/labeller-signer.ts`:

- A FORUM `PlaneSigner` seeded from **`LABELLER_SIGNING_SEED`**, distinct from
  `NODE_SIGNING_SEED`. Mirror `ConfiguredNodeSigner`'s env handling.
- Bootstrap: `jb:label:emit:v1` inherits `requires_certificate: true`, so the labeller key
  must first self-certify via `jb:key:certify:forum:v1` (one of only two rows with
  `requires_certificate: false`). The construction is already demonstrated in
  `backend/src/testing/harness.ts:174-236` (`certifyEnvelope`) and
  `backend/src/cli/seed-demo.ts:123-140`.
- CLI `backend/src/cli/labeller-provision.ts` — generates the seed, self-certifies, prints
  the labeller public key. Operators publish that key; users add or remove it from their
  trust set (LBL-08).

Enqueue point: `afterCommit` on the post and comment create handlers. Note this is currently
implemented by exactly one handler in the whole tree (`broadcast.handlers.ts`), so the hook
is well-isolated and failure-tolerant by design.

Composition: bind `NullContentClassifier` unless `CLASSIFIER_URL` is set — the null-object
shape at `app.module.ts:283`, not a feature flag consumers can see.

### PC-3 — NSFW policy and the tombstone path

`AttachmentDoc.scanStatus` already exists as `'unscanned'`. Extend to
`'clean' | 'explicit' | 'withheld' | 'error'`.

| Author declared NSFW | Detector | Action |
|---|---|---|
| yes | explicit | `verdict: OK`, category `nsfw:declared`. No restriction — the author did the right thing. Client blurs per the existing `USR-10 blur_nsfw` preference. |
| no | explicit, above label threshold | `verdict: RESTRICT`, categories `[nsfw:explicit, nsfw:undeclared]`, `reasons[]` naming the attachment content id. `scanStatus: 'explicit'`. Blurred by default. |
| no | explicit, above **tombstone** threshold **and** community opted in | The above, **plus** `jb:mod:action:v1` `REMOVE` **plus** `scanStatus: 'withheld'` **plus** an `OperatorAlerts.raise`. |
| no | clean | `scanStatus: 'clean'`. No `Label` emitted; the `Classification` is the proof it ran. |

The framing matters: when a user declares NSFW and the detector agrees, **nothing is
restricted**. The offence being labelled is the missing warning, not the content.

**Two mechanisms, deliberately distinct.** Auto-tombstone is `jb:mod:action:v1 REMOVE`,
which is community-scoped and needs `post.moderate` in that community — so it only works
where a community owner explicitly granted the labeller identity that permission. That is
the correct shape: it respects community autonomy rather than handing the instance a
network-wide removal power. `ModVerb.REMOVE` sets `removed: true` and `removedReason`;
`renderPost` nulls `bodyMarkdown` and `url` while the row, author, timestamp, acting
labeller and reason all stay visible, hash-chained in the public mod log (MOD-09/10/11).

Separately, `scanStatus: 'withheld'` stops **this node** serving the blob bytes. This is not
a new censorship power: blobs were never federated (ATT-18), bytes are fetched on demand and
verified against the claim hash, and `alt_text` already renders when a blob is unavailable
(ATT-19). Blob availability has always been per-node.

Guard rails, all mandatory:

- Default off. Requires `NSFW_AUTO_TOMBSTONE=true` **and** a per-community opt-in.
- One narrow category only. Never fires on a text verdict.
- Requires two signals: detector confident **and** the author did not declare.
- `appealable: true` on every emitted label (MOD-12 appeal flow).
- Rate cap — above N tombstones/hour the labeller stops acting and alerts. A model
  regression must degrade to noisy, not to a mass removal event.

### PC-4 — Read API and the capability manifest

**`GET /v1/labeller` — public, unauthenticated, cacheable.** This is what lets a client
adapt to whatever black box an operator chose. `admin.controller.ts:174` already reports
`labeller: 'null'`; this is the public, richer form of that.

```jsonc
{
  "enabled": true,
  "labellerKey": "jbk1…",          // so the client can put it in a trust set (LBL-07)
  "contract": "jagoo.classifier/1",
  "axes": ["safety","sentiment","intent","language","image"],
  "taxonomies": [ /* verbatim from the classifier's /v1/capabilities */ ],
  "languages": ["bn","en"],
  "models": [{ "id": "mmini-l12-int8@1.2.0", "axes": [...] }],
  "policy": { "autoTombstone": false, "classifiesFederatedContent": false }
}
```

Served from a short-TTL cache of the classifier's own `/v1/capabilities`, through the
existing `TaggedCache` port. `{ "enabled": false }` when no classifier is configured — a
truthful answer, not a 404, so the client can distinguish *"this node does not label"* from
*"this node is unreachable"*.

Publishing `policy` matters: an instance that will auto-tombstone should say so before a
user posts there, not after.

- `provenance` gains `classification` alongside the `labels[]` that `provenance()` in
  `forum-read.controller.ts` already returns.
- `GET /v1/classifications/:contentId`, cursor-paginated, mirroring `GET /v1/labels/:contentId`.
- `GET /v1/feed?assert=jb:intent:v1/help_request&assert=jb:sentiment:v1/distressed` — the
  crisis-triage payoff, and the reason this work is worth doing beyond moderation. The
  taxonomy-qualified form means an operator's custom taxonomy is filterable on day one with
  no server change. A **query filter**, never a gate: the unfiltered feed stays the default
  and stays reachable. Index `forum_classifications` on `(taxonomy, label)` and keep it
  cursor-paginated (§5.5 — offset pagination does not exist here).
- Incidental fix found during exploration: `forum-read.controller.ts:453` declares
  `@Get('posts:contentId/audit')` — missing the `/` before `:contentId`, so the route is
  unreachable at the path its sibling routes imply, and `post-detail-screen.tsx:387`
  ("View audit proof") calls it.

### PC-5 — Client

`frontend/src/verify/index.ts`'s `ProvenanceJson` currently declares no `labels` field, even
though the server sends one. Extend it with `labels` and `classification` first — everything
else depends on that.

- **Composer preflight (LBL-05).** Debounced call to the already-live
  `POST /v1/labels/preflight`, which has **zero client callers** today. Shows advice with
  reasons. The Post button is **never** disabled, and the offline/unavailable case shows
  nothing rather than an error.
- **Manifest-driven rendering.** On connect, fetch and cache `GET /v1/labeller`. The UI is
  built from that manifest, not from hardcoded categories:
  - A taxonomy in the shipped well-known set (`jb:*`) renders richly — translated name,
    icon, its own filter chip.
  - A taxonomy the client has never seen renders **generically but honestly**: the raw
    label, its score, and the labeller's attribution. Degrading to a plain tag is correct;
    hiding it because we do not recognise it would silently discard an operator's work.
  - Axes the node does not offer produce no UI at all — no empty filter rows, no
    permanently-blank sentiment slot.
  - `enabled: false` renders "this instance does not label content", which is information,
    not an error state.
- **Post card (LBL-09).** Label chips with labeller attribution and reasons. Per CLAUDE.md
  §6, **colour is never the sole carrier** — every verdict carries an icon and text.
- **Default-hide `DANGEROUS`**, tap-to-reveal, with "Show anyway" and "Untrust this
  labeller" both reachable from the overlay. NSFW blur honours the existing `blur_nsfw`
  preference plus the label.
- **Labeller trust set (LBL-07/08).** A settings screen listing labeller keys with per-key
  toggles, shipped default = home instance labeller, and the home instance removable like
  any other. AC-63 asserts removal yields unfiltered content.
- **Tombstoned posts** already render — a `ModerationTombstone` component exists.
- **i18n, Bangla and English**, for every verdict, category, sentiment and intent name plus
  all advisory copy. Layout computed against the Bangla worst case, not retrofitted.
- Every surface renders from cache offline and shows staleness honestly.

### PC-6 — Gates and documentation

| ID | Asserts | Fail-on-purpose counterpart |
|---|---|---|
| CL-G1 | Classifier stopped ⇒ publish still succeeds, content unlabelled (LBL-11, AC-62) | A deliberately-gating provider variant must fail this test |
| CL-G2 | Two-node: post on A, labeller on A, `Label` + `Classification` project on B with identical content ids | Extends `pnpm ops:two-node` |
| CL-G3 | `pnpm proto:check` clean; `pnpm vectors` agrees TS ≡ Rust ≡ Python on the `Classification` fixture | A hand-edited generated file must fail |
| CL-G4 | No float reaches an envelope | A fixture carrying a float must be rejected at the adapter boundary |
| CL-G5 | Worker refuses SIGNAL-plane and DM domains (SEP-01…05, ADR-012) | Feed it a SIGNAL envelope; assert refusal |
| CL-G6 | Removing the home instance labeller yields unfiltered content (AC-63) | — |
| CL-G7 | A declared-NSFW post is never auto-tombstoned; opt-in and threshold both required | Assert a community without opt-in is untouched |
| CL-G8 | Ingress p50 with labeller enabled ≈ disabled | A classifier call added to the pipeline must fail this |
| CL-G9 | **Black-box swap.** A stub classifier declaring taxonomy `acme:triage:v2` is stored, federated and rendered generically | A client that drops unknown taxonomies must fail this |
| CL-G10 | **Stream semantics.** Two concurrent workers never double-dispatch; a worker killed mid-job has it reclaimed by `XAUTOCLAIM`; past `MAX_ATTEMPTS` it dead-letters and alerts | The non-atomic `find().limit()` shape must fail this |
| CL-G11 | Conformance suite passes against the reference implementation, and fails against one that returns a float score or fabricates an unsupported axis | — |

Then: a `Code Implementation/BUILD-LOG.md` entry per CLAUDE.md §7.2, and this document's
checklist updated as tasks land, per CLAUDE.md §7.2.3, so plan and reality do not drift.

CI: add `pnpm test:classifier`. CL-G2 belongs in the existing federation job, since burying
a federation assertion in the general test job lets a green summary hide it being skipped.

---

## Files

**New**

```
proto/jagoo/v1/forum.proto                             (edit: Classification, Assertion — no enums)
proto/jagoo/v1/registry.yaml                           (edit: jb:classify:emit:v1 row)
docs/classifier-contract.md                            THE contract; the service is one impl of it
services/classifier/                                   pyproject.toml, src/, tests/, tests/conformance/
ops/classifier.Dockerfile
packages/sdk-ts/src/taxonomy/well-known.ts             jb:* taxonomies as DATA, not contract
backend/src/features/forum/classify/                   classify.handler.ts, .projection.ts, .spec.ts
backend/src/core/app/labeller.ts
backend/src/adapters/outbound/classifier/              http-content-classifier.ts, null-content-classifier.ts
backend/src/adapters/outbound/redis/redis-classification-queue.ts
backend/src/adapters/inbound/http/labeller.controller.ts     GET /v1/labeller manifest
backend/src/adapters/outbound/labeller-signer.ts
backend/src/cli/labeller-provision.ts
backend/src/composition/classifier.runtime.ts, classifier.config.ts
frontend/src/features/labels/                          label-chip.tsx, hidden-content-overlay.tsx
frontend/src/features/labels/manifest.ts               fetch + cache /v1/labeller, drive the UI
frontend/src/features/settings/labeller-trust-screen.tsx
Code Implementation/ADR-018-CONTENT-CLASSIFICATION.md

```

**Modified**

```
backend/src/core/ports/content.port.ts                 ContentClassifier, ClassificationQueue
backend/src/composition/app.module.ts                  bindings, null-object default
backend/src/features/forum/post/post-create.handler.ts afterCommit enqueue
backend/src/features/forum/comment/…                   afterCommit enqueue
backend/src/features/forum/index.ts                    register the classify handler
backend/src/features/forum/attachment/attachment.handler.ts   scanStatus states
backend/src/adapters/inbound/http/forum-read.controller.ts    classification in provenance,
                                                              new route, audit-route slash fix
frontend/src/verify/index.ts                           ProvenanceJson: labels, classification
frontend/src/features/composer/composer-screen.tsx     preflight advisory
frontend/src/features/posts/post-card.tsx              label chips, blur/hide
frontend/src/i18n/…                                    bn + en strings
tools/vectors/expected.json                            Classification fixture
ops/docker-compose.yml                                 classifier service, profile-gated
Plans/requirements/R5-MODERATION.md                    CLS-01…CLS-12
```

---

## Verification

Run in this order; each stage gates the next.

```bash
# PC-0 — contract agrees in three languages
pnpm proto:lint && pnpm proto:check
pnpm vectors                       # must report agreement on the Classification fixture
cargo test -p jb-core && python -m pytest tools/vectors

# PC-1 — the contract, then the reference implementation against it
pnpm test:classifier
python -m pytest services/classifier/tests/conformance --target http://localhost:8500
docker compose -f ops/docker-compose.yml --profile classifier up -d classifier
curl -s localhost:8500/v1/capabilities        # taxonomies the client will be driven by
curl -s localhost:8500/v1/classify/text -d '{"text":"আমার সাহায্য দরকার"}' -H 'content-type: application/json'
#   expect language "bn", an assertion jb:intent:v1/help_request,
#   and every score an INTEGER — grep the raw body for "." inside a score field

# PC-2/3 — the node with the labeller absent (AR-12) and present
pnpm test && pnpm lint && pnpm typecheck
pnpm smoke:local                   # must pass with CLASSIFIER_URL unset
CLASSIFIER_URL=http://localhost:8500 pnpm dev:backend
curl -s localhost:3000/v1/labeller            # the manifest the client adapts to
#   publish a post, then poll GET /v1/classifications/:contentId

# CL-G10 — stream semantics, the reason we are not copying the outbox
#   run two LabellerService workers against one Redis; assert no content id is
#   classified twice. Then SIGKILL one mid-job and assert XAUTOCLAIM redelivers it.
redis-cli XPENDING jb:classify:jobs labeller
redis-cli XLEN jb:classify:dead                # 0 on a healthy run

# CL-G9 — the black-box swap, the point of the whole design
CLASSIFIER_URL=http://localhost:8599 pnpm dev:backend   # stub declaring acme:triage:v2
#   assert: node stores and federates it; client renders it as an attributed
#   generic tag rather than dropping it

# CL-G1 — the gate that matters most
docker compose stop classifier && pnpm smoke:local
#   publishing MUST still succeed; content appears unlabelled, not rejected

# CL-G2 — labels federate
pnpm ops:two-node
#   post on node-a; assert Label + Classification project on node-b with identical content ids
pnpm --filter @jagoo/backend exec vitest run src/federation

# CL-G8 — the pipeline is untouched
#   measure /v1/envelopes p50 with keep-alive, labeller on vs off; they must match.
#   Measure with keep-alive — a curl-per-request loop times process spawn, not the node.

# Client
pnpm --filter @jagoo/frontend exec jest src/verify
pnpm --filter @jagoo/frontend android    # NOT Expo Go — native crypto module required
```

Manual client checks, each of which has failed silently in comparable work before:

1. Compose a post with the classifier **stopped** — advisory absent, Post button live.
2. Publish undeclared explicit imagery in a community **without** opt-in — labelled and
   blurred, **not** removed.
3. Remove the home instance labeller from the trust set — content renders unfiltered (AC-63).
4. Airplane mode — every label, classification and the cached manifest render from cache,
   staleness shown.
5. Maximum system font scale, Bangla locale — no clipping on label chips or the hidden-content
   overlay.
6. Point the client at a node whose classifier offers **only** `safety` — the sentiment and
   intent surfaces disappear entirely rather than rendering permanently empty.
7. Point it at a node running the `acme:triage:v2` stub — its labels render as attributed
   generic tags, and its filter chips work.
8. Point it at a node with no classifier — "this instance does not label content", not an
   error banner and not a silent blank.
