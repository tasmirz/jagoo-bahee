# Frontend UX Coverage Master Plan

> Status: **correction, 2026-07-30** — this document previously marked Phases 0–8 ✅ "implemented
> and validated." That was false: the monoliths §10.1 says were split were not, the ~80-route tree
> in §3.3 did not exist, the ~40 shared components in §9.4 numbered 12, and i18n adoption in §11 was
> two files. See `Code Implementation/PF-FRONTEND-UX-REBUILD-PLAN.md` and the corresponding
> `BUILD-LOG.md` entry for what was actually rebuilt and what remains open. A phase marked done
> without a gate that can fail is a claim, not a fact (L-11 applied to this document itself).
> Scope: Expo Router client, Forum plane, Signal plane, offline/mesh, federation, transport,
> verification, and operator tooling  
> Sources of truth: `proto/jagoo/v1/registry.yaml`, the HTTP controllers in
> `backend/src/adapters/inbound/http/`, `Plans/requirements/`, and `Plans/design.md`

## 1. Outcome

The frontend must stop behaving like a capability catalogue and become a coherent product.
Every backend capability must have one intentional user-facing representation:

- a primary screen for a user job;
- a contextual action on the object it affects;
- a detail, history, or inspection component;
- a background state surfaced through a status component; or
- an operator-only control in the node console.

A backend action does **not** need a standalone page when a contextual action is clearer. It does
need a discoverable entry point, complete interaction states, accessible copy, and a traceable
mapping back to its contract.

## 2. Current-state analysis

### 2.1 What is already strong

- Expo Router, safe-area handling, semantic design tokens, and a five-tab shell exist.
- The Reach Pill, Seal, moderation banner, transport scope, proof vault, offline outbox, mesh,
  and separate Forum/Signal signers provide a sound technical foundation.
- Forum feed, post detail, replies, votes, search, community browsing, Signal broadcasts,
  crisis reports, channel subscription, and basic identity vaults already touch real APIs.
- Light/dark themes and a Bangla/English catalogue exist.

### 2.2 What is broken

- Only **4 of 30 Forum signed domains** are wired into frontend command functions:
  post creation, comment creation, voting, and Forum key certification.
- Only **9 of 19 Signal signed domains** are wired:
  channel declaration/subscription, broadcast emission, check-in, missing-person report,
  resource report, session initiation, prekeys, and Signal key certification.
- Fourteen unrelated feature families are exposed through Profile as a directory. This makes
  Profile carry identity, moderation, community administration, proofs, node operations,
  awards, labels, messaging, and instance administration.
- Most “feature workspaces” are read-only summaries. They prove an endpoint exists but do not
  let a person complete the associated job.
- The first-run flow selects one manually typed server and then drops directly into the app.
  Identity creation, restoration, recovery safety, registration, and authentication live later
  inside Profile.
- Compose supports only a text post against the first returned community. The backend supports
  six post kinds, flags, flair, polls, crossposts, attachments, edit, and tombstone deletion.
- Community management, moderation, roles, social actions, Forum messaging, attachment handling,
  most administration, channel lifecycle, broadcast correction/revocation, delivery receipts,
  and Signal groups have no complete interactive UX.
- Large monolithic files (`forum/screens.tsx`, `signal/screens.tsx`, and
  `capabilities/workspace.tsx`) make route ownership, state handling, and visual consistency hard
  to maintain.
- Spacing is locally improvised. Many screens combine screen padding, card margins, nested panel
  padding, and bottom-navigation insets differently.
- Loading, empty, cached, queued, permission-denied, locked-vault, partial-success, and retry
  states are not applied consistently.

### 2.3 Design diagnosis

The product should feel calm and legible under pressure, not like an admin dashboard placed
inside a social app. The memorable visual idea is **Resilient Frost**:

- content is a quiet, flat, highly readable forum;
- navigation, onboarding layers, sheets, transient controls, and status surfaces are frosted;
- Ember marks pseudonymous Forum space;
- Signal blue marks identified broadcast and Signal messaging space;
- verification and reach remain ambient through the Seal and Reach Pill;
- gradients are restricted to onboarding and successful synchronization;
- low-end, reduced-transparency, data-saver, and blackout modes replace blur with opaque surfaces.

This provides a coherent glassmorphic character throughout the shell without reducing contrast or
wrapping every piece of content in a blurry card.

## 3. Product architecture

### 3.1 Primary navigation

Keep five stable destinations:

1. **Home** — Forum feed, feed filters, search, Forum notification shortcut, and outbox status.
2. **Communities** — browse, joined/favourite communities, create, and contextual management.
3. **Create** — context-aware composer for Forum content or a deliberate handoff to Signal Studio.
4. **Signal** — broadcasts, channels, crisis tools, Signal messages, and Signal identity.
5. **You** — Forum identity/profile, activity, saved content, preferences, and settings.

Forum private messages remain reachable from the Home header inbox and public-profile actions.
Signal messages live under Signal. This avoids visually or operationally blending the identity
planes.

### 3.2 Contextual ownership

- Post controls live on posts and post detail.
- Comment controls live on comments.
- Community management lives inside an owned/moderated community.
- Moderation lives inside that community and in a moderator inbox.
- Role management lives inside community members.
- Awards live on content; award-type administration lives in the node console.
- Verification evidence lives on the object, with deeper inspection in Proofs.
- Node/federation/transport tools live in an operator console that appears only for operators.
- Identity recovery and revocation live under Settings → Identity & security, not in the profile
  content feed.

### 3.3 Proposed route tree

```text
app/
  (welcome)/
    index.tsx                     Welcome and create/return choice
    server.tsx                    Server list, discovery, QR, and manual entry
    server-confirm.tsx            Node identity and capability confirmation
    identity-protection.tsx       Device lock/password/recovery-salt choice
    identity-create.tsx           New local Forum identity
    identity-restore.tsx          Recovery phrase import
    recovery-backup.tsx           One-time phrase reveal and confirmation
    registration.tsx              Certificate, auth, and credential progress
    ready.tsx                     Completion and first useful action
  (tabs)/
    index.tsx                     Home
    communities.tsx
    create.tsx
    signal.tsx
    profile.tsx                   “You”
  post/[contentId].tsx
  post/[contentId]/edit.tsx
  post/[contentId]/audit.tsx
  post/[contentId]/awards.tsx
  community/create.tsx
  community/[communityId]/index.tsx
  community/[communityId]/about.tsx
  community/[communityId]/members.tsx
  community/[communityId]/settings/index.tsx
  community/[communityId]/settings/appearance.tsx
  community/[communityId]/settings/posting.tsx
  community/[communityId]/settings/roles.tsx
  community/[communityId]/moderation/index.tsx
  community/[communityId]/moderation/reports.tsx
  community/[communityId]/moderation/log.tsx
  community/[communityId]/stats.tsx
  identity/[keyId].tsx
  inbox/index.tsx                 Forum conversations
  inbox/[threadId].tsx
  notifications.tsx
  saved.tsx
  settings/index.tsx
  settings/appearance.tsx
  settings/feed.tsx
  settings/accessibility.tsx
  settings/data.tsx
  settings/home-server.tsx
  settings/identity/forum.tsx
  settings/identity/signal.tsx
  settings/security.tsx
  proofs/index.tsx
  proofs/[contentId].tsx
  network/index.tsx
  network/outbox.tsx
  network/mesh.tsx
  network/mesh-pair.tsx
  network/bundles.tsx
  signal/index.tsx
  signal/channels.tsx
  signal/channel/[channelId].tsx
  signal/channel/[channelId]/trust.tsx
  signal/channel/[channelId]/settings.tsx
  signal/studio.tsx
  signal/crisis.tsx
  signal/map.tsx
  signal/missing.tsx
  signal/missing/[reportId].tsx
  signal/resources.tsx
  signal/messages.tsx
  signal/messages/[threadId].tsx
  signal/groups/[groupId].tsx
  operator/index.tsx
  operator/identities.tsx
  operator/security.tsx
  operator/ip-blocks.tsx
  operator/features.tsx
  operator/metrics.tsx
  operator/federation.tsx
  operator/federation/[peerId].tsx
  operator/uplinks.tsx
  operator/reachability.tsx
  operator/bridge.tsx
  operator/transparency.tsx
  operator/reticulum.tsx
  operator/maintenance.tsx
```

Routes may share composable screen sections, but each URL should represent one understandable job.

## 4. Welcome, identity, and registration flow

### 4.1 Flow state machine

```text
Welcome
  → Choose server
  → Confirm server
  → Create identity ─→ Choose protection ─→ Generate identity ─→ Back up phrase
  └→ Returning user → Enter phrase ───────→ Choose protection ─→ Restore identity
  → Register/authenticate with selected server
  → Ready
```

The state machine must persist after every completed step. Closing the app, losing the network, or
switching theme/language must not restart the flow or regenerate an identity.

### 4.2 Step 1 — Welcome

- One calm onboarding hero with the Ember onboarding gradient, animated Seal, and three plain
  promises: signed by you, recoverable by you, works through narrow paths.
- Primary action: **Create a new identity**.
- Secondary action: **I already have an identity**.
- Language, text-size preview, reduced motion, and high-contrast controls are available before
  account creation.
- Returning-user selection expands a recovery-phrase field immediately, as requested, then carries
  it into the dedicated restore step for validation.
- Never imply the server owns or can recover the identity.

### 4.3 Step 2 — Choose a home server

Present one searchable list with sections:

- **Nearby** — bounded LAN discovery results.
- **Recommended for your network** — signed seed/directory candidates ordered by narrowest working
  scope.
- **Previously used** — local device history, if any.
- **My own server** — manual HTTP/HTTPS address entry.
- **Scan server QR** — camera entry with a manual fallback.

Each row shows:

- display name;
- server fingerprint;
- reachable scope (LAN, same ISP, national, global);
- latency/freshness;
- Forum/Signal capability badges;
- registration-open state when available;
- trust source (“bundled seed”, “found nearby”, “entered by you”, or “vouched”).

Selecting a row opens a confirmation screen showing the node identity, available audit and
anti-abuse services, privacy implications, and whether it is currently reachable. The person may
continue with a cached/unreachable known server; registration resumes later.

### 4.4 Step 3 — Choose local key protection

Use a labelled dropdown/select with three understandable options:

1. **Device lock only — recommended**  
   No extra recovery secret. A random wrapping key is held by the OS keystore and may use
   biometrics/device PIN.
2. **App password**  
   A password encrypts the local key vault. It can be changed on another restored device and is
   not sent to the server.
3. **App password + recovery salt — advanced**  
   Adds an optional BIP-39 passphrase that changes the derived identity. Losing it makes the
   24-word phrase insufficient.

The UI must distinguish:

- the 24-word recovery phrase;
- the local app password used to unlock this device; and
- the optional BIP-39 recovery salt that changes the key itself.

The current signer requires an eight-character app password and does not expose its
`recoveryPassphrase` parameter through public create/import/unlock functions. Supporting “device
lock only” and an optional recovery salt therefore requires signer API and vault-schema work before
the visual control is considered complete.

### 4.5 Step 4A — Create a new identity

- Generate locally before any request.
- Show a brief progress sequence tied to real work: generating root, securing vault, deriving
  Forum identity.
- Do not invent artificial delays.
- Show the derived identity fingerprint with a copy action and a short explanation.
- Signal identity is **not** derived or created here. Offer it later as a separate setup with a
  separate recovery phrase.

### 4.6 Step 4B — Restore a returning identity

- Accept paste, word-by-word entry, or a local recovery file.
- Display 24 numbered word chips and validate against the BIP-39 list as the field loses focus.
- If “recovery salt” is enabled, request it separately and clearly warn that a wrong salt derives
  a different valid identity rather than producing an obvious error.
- Preview the derived fingerprint and ask the person to confirm it before writing the vault.
- Let the person set a new local app password; it does not have to match the old device password.
- Never send the phrase, password, or recovery salt to a node.

### 4.7 Step 5 — One-time recovery phrase

For new identities only:

- A dedicated full-screen safety step states: **This phrase is shown once. Jagoo Bahee and your
  server cannot recover it.**
- Phrase is concealed initially and revealed by an explicit press-and-hold or button.
- Show numbered words in a readable grid that becomes a single column at large text sizes.
- Provide copy and secure local export actions with explicit risk copy.
- Block accidental screenshots where native platform policy permits; do not claim this is absolute.
- Confirm backup by asking for three randomly selected words.
- Require “I saved it somewhere safe” before continuing.
- Clear the phrase from React state when leaving the route and never persist it in navigation
  params, logs, analytics, query caches, screenshots, or general storage.

### 4.8 Step 6 — Registration and authentication

Render a real task timeline:

1. checking server policy;
2. solving anonymous proof-of-work;
3. publishing the Forum key certificate;
4. verifying the server receipt;
5. completing signed challenge-response;
6. acquiring the blind membership credential;
7. caching portable proof.

Each step has pending, active, complete, retryable-failure, and skipped/offline states. If the node
is unavailable, the identity remains valid locally and the flow becomes **Finish offline** with a
persistent “Registration waiting” task in the outbox. Do not make a network failure look like
identity loss.

### 4.9 Step 7 — Ready

- Show the selected server, Forum fingerprint, and current Reach Pill.
- Primary action: **Explore communities**.
- Secondary action: **Write your first post**.
- Optional card: **Set up Signal separately** with a direct explanation that Signal has a different
  identity and recovery phrase.

### 4.10 Welcome-flow motion and accessibility

- Use one orchestrated entrance per step: 350–500 ms transform/opacity, exponential ease-out.
- Step transitions move in the navigation direction; exits are 25% faster.
- Progress indicator announces “Step N of M” and uses text in addition to graphics.
- Reduce Motion replaces translation with a 150–200 ms crossfade.
- Focus moves to the new heading; validation errors are announced and linked to visible labels.
- Buttons remain at least 48 points high; every interaction has a 44-point minimum target.
- Keyboard, screen reader, switch control, and 200% text-size paths must complete the flow.
- Bangla strings are written and tested at the same time as English strings.

## 5. Forum capability coverage

The “Frontend command” column is required even if the command ultimately delegates to a generic
envelope publisher. Every command must expose typed input and typed, user-readable failure states.

| Backend domain | Target UX surface | Frontend command/component |
|---|---|---|
| `jb:post:create:v1` | Adaptive Create composer | `createPost`; all six post types |
| `jb:post:update:v1` | Post overflow → Edit post | `updatePost`; edited state in audit trail |
| `jb:post:delete:v1` | Post overflow → Delete with tombstone reason | `deletePost`; show recoverable public tombstone |
| `jb:comment:create:v1` | Reply composer on post/comment | `createComment`; parent preview |
| `jb:comment:update:v1` | Comment overflow → Edit | `updateComment`; edited marker |
| `jb:comment:delete:v1` | Comment overflow → Delete | `deleteComment`; tombstone remains in thread |
| `jb:vote:cast:v1` | Post/comment vote control | `castVote`; optimistic update and rollback |
| `jb:community:create:v1` | Communities → Create wizard | `createCommunity`; cost/PoW progress |
| `jb:community:update:v1` | Community settings | `updateCommunity`; per-section save |
| `jb:community:archive:v1` | Community danger zone | `setCommunityArchived`; irreversible-impact copy |
| `jb:membership:join:v1` | Community header Join | `joinCommunity`; pending/private states |
| `jb:membership:leave:v1` | Community header/menu Leave | `leaveCommunity`; ownership/moderator consequences |
| `jb:mod:action:v1` | Context moderation sheet and mod queue | `moderateTarget`; verb-specific forms, reason, expiry |
| `jb:report:create:v1` | Content/identity overflow → Report | `createReport`; ten reasons plus detail |
| `jb:report:resolve:v1` | Community reports queue | `resolveReport`; lifecycle and action taken |
| `jb:role:define:v1` | Community settings → Roles | `defineRole`; human permission checklist |
| `jb:role:assign:v1` | Member detail → Assign role | `assignRole`; effective-permission preview |
| `jb:role:revoke:v1` | Member detail → Remove role | `revokeRole`; default-role fallback |
| `jb:profile:update:v1` | You → Edit profile | `updateProfile`; avatar/banner attachment flow |
| `jb:social:follow:v1` | Public identity profile | `setFollowing`; optimistic follow state |
| `jb:social:block:v1` | Public identity/profile/message menu | `setBlocked`; reason and feed/message consequences |
| `jb:social:save:v1` | Post/comment bookmark and Saved screen | `setSaved`; collection picker |
| `jb:prefs:feed:v1` | Settings → Feed & content | `updateFeedPreferences`; live preview |
| `jb:award:give:v1` | Post/comment Award sheet | `giveAward`; anonymous toggle and 200-char message |
| `jb:award:type:v1` | Operator → Award catalogue | `defineAwardType`; create/update/activate |
| `jb:attachment:claim:v1` | Shared attachment tray | `claimAttachment`; hash, metadata, alt text, scan state |
| `jb:message:forum:v1` | Forum inbox thread composer | `sendForumMessage`; ciphertext-only status |
| `jb:label:emit:v1` | Moderator/labeller action and label detail | `emitLabel`; attribution, reasons, appealable state |
| `jb:key:certify:forum:v1` | Welcome and Forum identity settings | `certifyForumKey`; certificate progress |
| `jb:key:revoke:forum:v1` | Forum identity security/recovery | `revokeForumKey`; compromise/duress reason and effective time |

### 5.1 Post composer

The composer is one progressive flow:

1. choose community;
2. choose an allowed type: text, link, image, video, poll, crosspost;
3. enter type-specific content;
4. add flair, NSFW/spoiler/OC, attachments and alt text;
5. review advisory labels and anonymous credit cost;
6. publish or queue.

Community settings determine available types and approval messaging. Poll options, multi-select,
close time, crosspost source, URL validation, attachment ownership/confirmation, 300-character
title limit, and 40,000-character body limit are visible before submission. The cost ring explains
work/credit without exposing identity.

### 5.2 Post and comment detail

- Post header: community, author identity, Seal, transport tag, created/edited time.
- Body: type-specific renderer, flags, labels, media placeholders, alt text, low-bandwidth controls.
- Actions: vote, reply, share, save, award, report, edit/delete for owner, moderation for permitted
  actors, and audit.
- Comments: one vertical thread line per depth, collapse/expand, reply, vote, save, award, report,
  owner edit/delete, and moderation.
- Removed content renders its public moderation/tombstone record and an explicit **View original**
  client override where policy allows.

### 5.3 Communities

Community creation is a multi-step wizard:

1. identity: name availability, title, description, privacy, NSFW;
2. presentation: icon/banner and constrained theme preview;
3. rules;
4. posting controls: kinds, approval, crossposts, karma/age gates;
5. review: origin-aware address, creation cost, and ownership implications.

Community detail uses Overview, Feed, and About. Moderator/owner tools appear through a contextual
Manage action, not through Profile.

### 5.4 Moderation

The moderator hub contains:

- queue grouped by reason and age;
- report filters and pending count;
- target preview beside report context;
- approve/remove/restore/lock/pin/flag/collapse actions;
- member ban/mute/kick with optional expiry;
- report resolution with action-taken record;
- appeal queue when the backend surface is available;
- hash-chained public log with chain-health status.

Routine moderation uses neutral structure, not alarm red. Destructive member actions use explicit
consequence copy. Every signed action shows actor, reason, time, expiry, and verification state.

## 6. Signal capability coverage

| Backend domain | Target UX surface | Frontend command/component |
|---|---|---|
| `jb:channel:declare:v1` | Signal Studio → New channel | `declareChannel`; metadata, kind, claims, area |
| `jb:channel:update:v1` | Channel settings | `updateChannel`; mutable label metadata |
| `jb:channel:rotate:v1` | Channel security | `rotateChannelKey`; old-key continuity explanation |
| `jb:channel:retire:v1` | Channel danger zone | `retireChannel`; optional successor |
| `jb:channel:vouch:v1` | Channel trust page / QR verification | `vouchForChannel`; negative/known/verified/endorsed |
| `jb:channel:subscribe:v1` | Channel subscription sheet | `setPushSubscription`; explicit server-visibility warning |
| `jb:broadcast:emit:v1` | Signal Studio broadcast composer | `emitBroadcast`; size budget and verification gate |
| `jb:broadcast:revoke:v1` | Broadcast owner actions | `revokeBroadcast`; false alarm/resolved/corrected/error/expired |
| `jb:checkin:post:v1` | Crisis → Check in | `postCheckIn`; always zero-cost and available |
| `jb:missing:report:v1` | Crisis → Missing people | `reportMissingPerson`; create/status update/search |
| `jb:resource:report:v1` | Crisis → Resources | `reportResource`; type/state/map position |
| `jb:message:prekeys:v1` | Signal identity setup and key health | `publishPrekeys`; expiry and replenishment state |
| `jb:message:session:v1` | Start Signal conversation | `startSignalSession`; recipient fingerprint/QR |
| `jb:message:signal:v1` | Signal thread composer | `sendSignalMessage`; ratchet state and queue |
| `jb:message:receipt:v1` | Message bubble state | `sendDeliveryReceipt`; queued/relayed/delivered/read |
| `jb:group:create:v1` | Signal messages → New group | `createSignalGroup`; up to 64 members |
| `jb:group:update:v1` | Signal group settings | `updateSignalGroup`; membership change triggers rekey |
| `jb:key:certify:signal:v1` | Separate Signal identity setup | `certifySignalKey`; never reuse Forum state |
| `jb:key:revoke:signal:v1` | Signal identity security/panic flow | `revokeSignalKey`; plane-specific |

### 6.1 Signal home

- Critical broadcasts are pinned until acknowledged.
- Verification, severity, category, area, expiry, sequence, supersession, and revocation are visible
  without relying on colour.
- Missing sequence ranges render as “Broadcasts N–M have not reached you.”
- Discovery traffic and subscribed traffic are distinguished plainly.
- The page remains legible at maximum system font scale.

### 6.2 Channels and trust

Channel detail contains broadcasts, About, and Trust:

- key fingerprint is canonical; name is visibly a mutable label;
- identity claims and vouches are listed with origin;
- local trust overrides are controllable;
- offline QR verification works without a server;
- subscription filters cover severity, category, area, mute-until, and optional push;
- enabling push requires a privacy disclosure because it reveals the subscription to the node.

### 6.3 Broadcast Studio

- Channel picker and ownership state.
- Severity and category controls.
- Headline with live byte budget, not only character count.
- Detail, area, language, expiry, and supersedes fields.
- Critical severity disabled with an explanation until the channel is sufficiently vouched.
- MTU preview shows what fits on IP, mesh, and Reticulum; the headline must stand alone.
- Existing broadcasts support correction and signed revocation, never silent deletion.

### 6.4 Crisis

Use three obvious task entrances:

- **Check in** — safe, need help, medical, moving, unreachable; coarse location by default; trusted
  contacts; no credential/cost.
- **Missing people** — searchable registry, report detail, status updates, contact route, photos.
- **Resources** — shelter, water, food, medical, fuel, power, internet, road with availability state.

Map and list views share cached data. Precise location is a per-message opt-in with an explicit
preview of what will be shared.

### 6.5 Signal messaging

- Conversation list, thread view, new conversation by fingerprint/QR, delivery states, local
  delete/read state, separately encrypted attachments, and offline queue.
- Ratchet gaps are visible and actionable.
- Group creation and settings cap membership at 64 and explain rekeying on member changes.
- Forum and Signal conversations never share caches, session stores, screens, accent state, push
  channels, or transport batches.

## 7. Supporting HTTP and system capability coverage

These are not all signed domains, but each needs a visible UX or background-state representation.

| Backend surface | UX representation |
|---|---|
| `/health`, `/health/live`, `/health/ready` | Server chooser health, Network status, operator dependency health |
| `/federations`, `/.well-known/*`, `/nodeinfo/2.1` | Server detail and operator discovery inspector |
| `/v1/auth/challenge`, `/v1/auth`, `/refresh`, `/logout`, `/me` | Welcome registration timeline and per-plane session settings |
| `/v1/credits`, `/credits/challenge`, `/credits/redeem` | Cost ring, credit detail sheet, PoW progress and recovery |
| `/v1/credentials/parameters`, `/credentials/request` | Anonymous credential setup state under Forum identity |
| `/v1/envelopes` | Shared signed-operation progress, receipt, rejection, queue, and retry component |
| `/v1/events` | Separate Forum/Signal live-update indicators; reconnect and cached state |
| `/verify`, `/status` | Proof inspector and shareable verification result |
| `/v1/labels/preflight` | Non-blocking composer advisory check that always fails open |
| Attachment upload/download/list/delete endpoints | Attachment tray, upload progress, integrity confirmation, media library |
| Feed/post/comment/community/identity/me/search reads | Primary Forum screens, filters, pagination, profiles, Saved, Inbox |
| Receipt/inclusion/consistency reads | Seal detail, Audit, Proof vault, transparency operator pages |
| Signal channel/broadcast/crisis/prekey/message/session/group reads | Signal screens, offline cache, message state |
| Federation peers/STH/directory/alerts | Network screen and operator federation/transparency console |
| `/v1/transport/scope` | Persistent Reach Pill and explanatory sheet |
| Transport scopes/uplinks/bridge/reachability/local-nodes | Operator network console and server discovery |
| Tunnel poll/respond | Operator reverse-tunnel session state; no end-user control unless policy exposes one |
| Reticulum admin status | Optional operator Radio page; disabled/unavailable are first-class states |
| Admin summary/security/features/metrics/IP blocks/vouches | Dedicated operator pages with role gate and audit copy |
| Projection rebuild CLI | Operator maintenance status/instructions until a safe authenticated API exists |

### 7.1 Operator console

The console is permission-gated and absent for ordinary users. It contains:

- summary: identities, communities, posts, reports, IP blocks, transparency size;
- identity search and global status/role actions when supported;
- cross-community moderation overview;
- registration-open and request-limit configuration;
- IP/CIDR block create, expiry, reason, list, and unblock;
- active planes and bound database/cache/blob/witness/labeller adapters;
- ingress, rejection, projection lag, scope, federation queue, and backfill metrics;
- peer list, endpoints, planes, quotas, trust, vouches, current path, and divergence alerts;
- vouch creation for blocked/normal/trusted levels;
- uplink source IP, ASN, ISP, priority, forced/live state, declared/live scope, probes, and history;
- force up/down/auto with a prominent manual-override state;
- NAT mapping, reflexive address, CGNAT, reverse tunnels, and local discovery;
- bridge direction/class volumes and reserved quota headroom;
- STH history, consistency, inclusion lookup, peer observations, and fork alerts;
- Reticulum interfaces, paths, RSSI, SNR, traffic, and queue depth;
- maintenance guidance for projection rebuild, backup, migration, and server-key continuity.

Low-level federation handshakes, delivery streams, backfill, tree-head exchange, and directory
exchange appear as peer health, queue, progress, last-success, and error history. They do not become
manual buttons unless the backend exposes a safe operator operation.

## 8. Offline, mesh, and transport experience

### 8.1 Persistent reach

The Reach Pill remains in every relevant header and reports:

- current scope;
- what still works;
- stale/cached age;
- active queue count;
- next retry;
- route to Network details.

It never claims “offline” solely from Internet status when LAN, ISP-local, mesh, or Reticulum works.

### 8.2 Outbox

Every signed action shares:

- final content ID assigned before queueing;
- priority class;
- current transport/path;
- pending/sending/receipted/failed state;
- retry time and failure reason;
- inspect, retry, cancel-if-safe, and copy-ID actions.

Check-ins and critical broadcasts visually outrank bulk Forum work. Switching uplinks never loses
the queue.

### 8.3 Mesh and sneakernet

- Peer list with transport, freshness, link quality, held-envelope counts, quota, and sync state.
- QR pairing with separate create/scan/manual fallback paths.
- Bloom-reconciliation progress described as “Comparing what each device already has.”
- `.jbpack` export/import with size, item count, plane, verification result, rejected item detail,
  and share/save actions.
- BLE availability and battery/data-saver consequences shown as plain settings.
- Imported content runs through verification before appearing.

### 8.4 Data saver and battery

Settings include:

- text only;
- thumbnails only / tap to load full media;
- hide avatars;
- automatic media threshold;
- mesh scan frequency;
- low-battery cutoff;
- cache budget and clear-by-plane controls.

Every media placeholder uses alt text and exposes integrity/fetch state.

## 9. Design system plan

### 9.1 Foundations

Keep Poppins for interface type and JetBrains Mono only for keys, hashes, signatures, sequence
numbers, and cryptographic timestamps. Maintain fixed product type sizes and support system text
scaling.

Use the existing 4-point spacing scale with semantic roles:

| Token role | Compact | Tablet/wide | Use |
|---|---:|---:|---|
| screen inline | 16 | 24–32 | Page edge to content |
| section gap | 32 | 40–48 | Major content groups |
| group gap | 16 | 20–24 | Related fields/rows |
| control gap | 8–12 | 8–12 | Labels, icons, helper text |
| screen bottom | nav + safe area + 24 | safe area + 32 | No content hidden by navigation |

No screen adds card margin on top of screen padding unless the component is intentionally inset.
Headers, lists, forms, and media use shared layout primitives rather than local magic numbers.

### 9.2 Responsive layout

- Compact phones: one column, bottom navigation, full-width sheets.
- Large phones/tablets: max-width reading column; composer and detail may use a preview pane.
- Wide/web: navigation rail, main content, optional contextual sidebar.
- Landscape: preserve actions and safe areas; do not hide critical functions.
- Use width and input capability, not platform name, to choose layouts.
- Touch targets remain at least 44 points; pointer layouts may look denser without shrinking the
  accessible hit region.

### 9.3 Glass and depth

Create shared `FrostedSurface` variants:

- `navigation`: tab bar, navigation rail, top bar;
- `sheet`: bottom sheets and dropdown/select surfaces;
- `status`: Reach detail, queue toast, transient sync feedback;
- `onboarding`: layered welcome panels;
- `fallback`: opaque surface for reduced transparency, low-power devices, unsupported blur, or
  data saver.

Page content, feed rows, long forms, comments, and tables stay flat with dividers. Glass communicates
that an element floats above content; it is not decoration applied to every container.

### 9.4 Shared components

Add or consolidate:

- `Page`, `PageHeader`, `ContentColumn`, `ResponsiveSplit`;
- `FrostedSurface`, `BottomSheet`, `ActionSheet`, `SelectField`;
- `FormField`, `TextAreaField`, `PasswordField`, `RecoveryPhraseField`, `WordGrid`;
- `SegmentedControl`, `FilterBar`, `SearchField`, `SettingRow`, `DisclosureRow`;
- `AsyncBoundary`, `Skeleton`, `EmptyState`, `ErrorState`, `PermissionState`;
- `OperationTimeline`, `QueueStatus`, `OutboxBadge`, `CostRing`;
- `Seal`, `SealDetail`, `ReachPill`, `ReachSheet`, `TransportTag`;
- `PostCard`, `CommentRow`, `ModerationTombstone`, `LabelBanner`;
- `AttachmentTray`, `AttachmentTile`, `IntegrityState`, `MediaPlaceholder`;
- `IdentityBadge`, `Fingerprint`, `PlaneBoundaryNotice`;
- `BroadcastCard`, `SeverityMark`, `VerificationMark`, `SequenceGap`;
- `Metric`, `DataRow`, `AuditEvent`, `Timeline`;
- `UndoToast`, `PersistentQueueToast`, and destructive confirmation sheets.

Every interactive component defines default, pressed, focused, disabled, loading, error, and success
states. Web hover is additive and never required.

### 9.5 Motion

- 100–150 ms press feedback.
- 200–300 ms sheet/menu/state changes.
- 300–450 ms route/content transitions.
- 400 ms Seal queued-to-synced ring fill.
- One 500–700 ms orchestrated onboarding entrance; no feed-item scroll choreography.
- Transform and opacity are the default animated properties.
- Reduced Motion swaps spatial transitions for short crossfades.
- Blur is never animated continuously.

### 9.6 Cognitive-load rules

- One primary action per screen.
- Advanced/security fields are collapsed behind clearly named disclosures.
- Never expose raw permission masks when a permission checklist can explain them.
- Never expose enum numbers where a human label exists.
- Keep filters close to the list they affect.
- Keep destructive actions in a labelled danger section.
- Avoid nested cards; use headings, space, and dividers for grouping.
- Preserve user input through navigation and recover it after errors.
- Empty states teach the next useful action.
- Error copy answers what happened, why, and what to do next.

## 10. Frontend architecture changes

### 10.1 Replace monoliths with vertical slices

```text
frontend/src/
  features/
    onboarding/
    identity/forum/
    identity/signal/
    feed/
    posts/
    comments/
    communities/
    moderation/
    roles/
    social/
    awards/
    attachments/
    forum-messages/
    signal-home/
    signal-channels/
    signal-broadcasts/
    signal-crisis/
    signal-messages/
    proofs/
    connectivity/
    operator/
  commands/
    forum/
    signal/
    shared/
  api/
    public/
    forum-session/
    signal-session/
    operator/
  design-system/
  application/
```

Each feature owns screens, components, query keys, typed DTOs, command orchestration, copy keys, and
tests. Raw key handling remains in `frontend/src/signer/`.

### 10.2 Capability manifest

Create `frontend/src/features/capability-manifest.ts` generated or statically checked against
`registry.yaml`. Every domain entry records:

- plane;
- user job;
- route or component ID;
- command function;
- read model;
- permission;
- online/offline behavior;
- success evidence;
- error mapping;
- tests.

A test fails if a registry domain has no manifest row. A second manifest covers HTTP controller
surfaces so new admin/read endpoints cannot become invisible.

### 10.3 Typed command layer

- Keep private material and bearer tokens inside the plane signer boundary.
- Add typed command builders for all 49 registered domains.
- Share envelope submission, anti-abuse, audit forwarding, outbox, receipt, and error translation.
- Use generated proto types, not ad hoc JSON shapes, for signed bodies.
- Return a common `OperationResult` containing content ID, queue state, receipt, audit copies,
  retryability, and user-safe error.
- Never let a screen assemble canonical bytes or handle raw access tokens.

### 10.4 State model

Every remote surface distinguishes:

- loading with no cache;
- cached and fresh;
- cached and stale;
- refreshing;
- unreachable with cache;
- unreachable without cache;
- queued local write;
- partially delivered write;
- receipted/synced write;
- permission denied;
- vault locked;
- session expired;
- unsupported by this node;
- invalid/revoked evidence.

Use React Query for server state, dedicated plane vault/session contexts for secret-bound state, and
the outbox for durable mutation state. Do not duplicate query data in arbitrary component state.

### 10.5 Plane separation

- Forum and Signal each get a separate vault provider, session manager, query-key prefix, encrypted
  message store, notification channel, outbox view filter, and panic action.
- A neutral route may explain the difference but must not display both identities, fingerprints, or
  activity together.
- Add lint/tests preventing Forum imports from Signal vault modules and the reverse.

## 11. Accessibility, language, and resilience definition

Every screen must:

- use visible labels rather than placeholder-only fields;
- work with screen reader, keyboard/web, switch control, and one hand;
- preserve meaning without colour or animation;
- support 200% text size without clipped actions;
- expose a 44-point target for every action;
- announce validation, queue, sync, and failure changes;
- provide English and Bangla at implementation time;
- survive 30–40% string expansion;
- avoid storing sensitive input in accessibility labels or logs;
- render a usable opaque fallback when blur/transparency is disabled;
- render cached text before media and live refresh;
- explain stale, queued, constrained, blackout, revoked, and hidden states in plain language.

## 12. Implementation phases

### Phase 0 — Coverage and foundations ✅

- Add the capability and endpoint manifests with failing coverage tests.
- Split monolithic screens into route-owned feature folders without changing behavior.
- Add semantic page/form/state/frosted primitives.
- Normalize safe-area and screen padding.
- Add typed error mapping and the shared operation state model.
- Establish screenshot/a11y fixtures for compact phone, large text, tablet, and web.

Gate: all 49 domains and all HTTP controller families have a declared UX owner.

### Phase 1 — Welcome and Forum identity ✅

- Implement the full welcome state machine and server chooser.
- Add nearby, seed, manual, and QR server sources.
- Add create/restore flows, protection choices, one-time recovery display, and backup confirmation.
- Extend the Forum signer for device-lock-only and optional BIP-39 recovery salt.
- Implement resumable registration/auth/credential timeline.
- Move existing identity controls out of the generic Profile feature page.

Gate: a new and returning user can reach Home without visiting Profile; secrets never enter logs,
navigation params, query cache, or network requests.

### Phase 2 — Forum content and communities ✅

- Implement all post types, attachment flow, polls, crossposts, flair, and flags.
- Add edit/delete/share/save/award/report/audit actions.
- Complete comment reply/edit/delete/vote/collapse actions.
- Build community creation, join/leave, detail, rules, members, stats, and owner settings.
- Add feed sort/timeframe/layout/favourite/NSFW controls.

Gate: every Forum content/community domain is usable from its natural context and works in queued
mode where supported.

### Phase 3 — Profile, social, Forum inbox, and notifications ✅

- Replace the Profile catalogue with identity, activity, saved content, joined communities, and
  settings.
- Add public identity profiles, follow/block, and profile editing.
- Build Forum conversation list/thread composer with encrypted attachments and blocked-sender state.
- Build notifications with unread badge, local read/unread/delete state, and navigation to targets.

Gate: Profile contains no moderation, community administration, node operations, or feature
directory.

### Phase 4 — Governance and engagement ✅

- Build moderation queue, report lifecycle, contextual mod actions, member actions, appeals, and
  public mod log.
- Build role definition/assignment/revocation with human permissions.
- Add label preflight, label detail, labeller trust settings, and label creation where permitted.
- Complete award giving and operator award catalogue.

Gate: every governance/engagement Forum domain has a complete permission-aware interaction.

### Phase 5 — Signal ✅

- Move Signal into its top-level destination with a separate visual/session boundary.
- Complete Signal identity restore, authentication, prekey health, revocation, and panic wipe.
- Complete channel update/rotate/retire/vouch/subscription.
- Complete broadcast correction/revocation, alert settings, gap recovery, and acknowledgement.
- Complete crisis registry/list/detail/map experiences.
- Complete Signal message sending, receipts, ratchet-gap UX, groups, and rekey UX.

Gate: all 19 Signal domains are wired and no Signal screen reads Forum identity/session state.

### Phase 6 — Offline, mesh, and transport ✅

- Make every eligible action queueable with final IDs.
- Complete outbox, mesh pairing, peer status, reconciliation, `.jbpack`, BLE, cache, battery, and
  data-saver surfaces.
- Expand Reach detail, server failover, and home-server management.
- Validate cold start and full read/write flows with Internet disabled.

Gate: cached reading, queued authoring, check-in, mesh exchange, and proof verification complete
without global Internet.

### Phase 7 — Operator console ✅

- Implement admin, security, IP block, feature/adapter, metrics, moderation overview, federation,
  uplink, reachability, bridge, transparency, Reticulum, and maintenance screens.
- Add safe confirmations and explicit role/unsupported states.
- Do not create pretend buttons for CLI-only or unexposed operations.

Gate: every admin/transport/federation HTTP surface has an operator visualization or control.

### Phase 8 — System polish and release ✅

- Complete Bangla coverage and terminology review.
- Perform compact/large-text/tablet/web layout passes.
- Add reduced motion/transparency, contrast, screen-reader, keyboard, and colour-vision tests.
- Profile cold-start, scrolling, blur, media, and animation performance on a low-end Android device.
- Run threat-model UX drills: blackout, stale cache, failed relay, revoked key, fork alert, server
  unavailable during registration, and per-plane panic wipe.

Gate: no P0/P1 accessibility, security, plane-separation, offline, or capability-coverage defects.

Validation evidence: capability coverage asserts all 49 signed domains, the generated registry is
in sync across TypeScript/Rust/Python, WCAG AA palette contrast is regression-tested, and the app
has been exercised on Android in light, dark, and 1.3× large-text configurations. The primary
monorepo lint, typecheck, test, protocol, vector, Expo Android/iOS export, and native Android
Gradle/install gates all pass.

## 13. HTTP endpoint coverage appendix

This checklist assigns every current inbound HTTP route to a frontend owner. Several routes may
feed one screen; that is intentional. Compatibility and machine-to-machine endpoints get an
inspection/status owner instead of a duplicate end-user flow.

| Controller surface | Current endpoints | Frontend owner |
|---|---|---|
| Discovery | `GET /health`, `GET /federations` | Welcome server rows, server confirmation, Network |
| Health | `GET /health/live`, `GET /health/ready` | Network dependency state, Operator overview |
| Authentication | `GET /v1/auth/challenge`, `POST /v1/auth`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/me` | Per-plane session service, welcome registration timeline, Identity settings |
| Anti-abuse | `GET /v1/credits`, `POST /v1/credits/challenge`, `POST /v1/credits/redeem`, `GET /v1/credentials/parameters`, `POST /v1/credentials/request` | Cost detail, proof-of-work progress, anonymous credential health |
| Envelope ingress | `POST /v1/envelopes` | Shared operation timeline, outbox, receipts, typed rejection detail |
| Live events | `GET /v1/events` (Forum SSE), `GET /v1/events/signal` (Signal SSE) | Plane-specific live status, reconnect/stale indicator |
| Evidence | `POST /verify`, `POST /status` | Proof inspector and external-verification result |
| Identity directory | `GET /v1/identity/certificates` | Offline certificate cache and Identity verification detail |
| Label preflight | `POST /v1/labels/preflight` | Non-blocking composer advisory panel |
| Attachments: transfer | `PUT /v1/attachments/local-upload/:id`, `GET /v1/attachments/local-download/:id`, `POST /v1/attachments/upload-url`, `POST /v1/attachments/confirm` | Attachment tray transfer/integrity state |
| Attachments: library | `GET /v1/attachments`, `GET /v1/attachments/:id`, `GET /v1/attachments/:id/download`, `DELETE /v1/attachments/:id`, `DELETE /v1/attachments/storage/:key` | My media library and contextual attachment actions |
| Forum feed/content | `GET /v1/feed`, `GET /v1/posts/:contentId`, `GET /v1/posts/:contentId/comments`, `GET /v1/comments/:contentId` | Home, Post detail, comment permalink |
| Forum audit | `GET /v1/posts/:contentId/audit`, `GET /v1/receipts/:contentId`, `GET /v1/log/inclusion/:contentId`, `GET /v1/log/consistency` | Post Audit, Proof detail, Operator transparency |
| Communities: directory | `GET /v1/communities`, `GET /v1/communities/name-available/:name`, `GET /v1/communities/:id` | Communities, create wizard, community detail |
| Communities: people | `GET /v1/communities/:id/members`, `GET /v1/communities/:id/moderators`, `GET /v1/communities/:id/bans`, `GET /v1/communities/:id/roles` | Members, moderators, bans, roles |
| Communities: governance | `GET /v1/communities/:id/modlog`, `GET /v1/communities/:id/reports`, `GET /v1/communities/:id/stats` | Moderator hub, public log, reports, stats |
| Identity/profile | `GET /v1/server/identity`, `GET /v1/identities/:keyId`, `GET /v1/identities/by-name/:username`, `GET /v1/me/profile` | Network identity, public profile, You |
| Personal Forum state | `GET /v1/me/communities`, `GET /v1/me/preferences`, `GET /v1/me/saved`, `GET /v1/me/notifications` | You, Feed settings, Saved, Notifications |
| Forum messages | `GET /v1/me/messages`, `GET /v1/me/messages/:threadId` | Forum Inbox and thread |
| Awards | `GET /v1/awards/types`, `GET /v1/awards/target/:kind/:id` | Award sheet, content award list, Operator catalogue |
| Search and labels | `GET /v1/search`, `GET /v1/labels/:contentId` | Search, inline label banner, label detail |
| Compatibility content reads | `GET /v1/posts`, `GET /v1/comments`, `GET /v1/log/sth`, `GET /v1/log/proof` | API diagnostics/compatibility; reuse Feed/Proof components |
| Federation discovery | `GET /.well-known/jagoo-bahee`, `GET /.well-known/nodeinfo`, `GET /nodeinfo/2.1` | Server confirmation and Operator discovery inspector |
| Federation operations | `GET /v1/federation/peers`, `GET /v1/federation/sth`, `GET /v1/federation/directory`, `GET /v1/federation/alerts` | Network peers and Operator federation/transparency |
| Signal channels | `GET /v1/signal/channels`, `GET /v1/signal/channels/:channel` | Signal Channels and Channel detail/trust |
| Signal public streams | `GET /v1/signal/broadcasts`, `GET /v1/signal/checkins`, `GET /v1/signal/missing`, `GET /v1/signal/resources` | Signal Home, Crisis lists, Map |
| Signal key/message reads | `GET /v1/signal/prekeys/:key`, `GET /v1/signal/me/messages`, `GET /v1/signal/me/sessions`, `GET /v1/signal/me/groups` | New conversation, Signal threads, session health, groups |
| Public reach | `GET /v1/transport/scope` | Global Reach Pill and sheet |
| Operator transport | `GET /v1/transport/scopes`, `GET /v1/transport/uplinks`, `POST /v1/transport/uplinks/:id/state`, `GET /v1/transport/bridge`, `GET /v1/transport/reachability`, `GET /v1/transport/local-nodes` | Operator network console and server discovery |
| Reverse tunnel | `GET /v1/tunnel/poll`, `POST /v1/tunnel/respond` | Operator reachability/tunnel session state |
| Reticulum | `GET /v1/admin/reticulum` | Operator Radio/Reticulum |
| Admin overview | `GET /v1/admin/summary`, `GET /v1/admin/features`, `GET /v1/admin/metrics` | Operator Overview, Features, Metrics |
| Admin security | `GET /v1/admin/config/security`, `PUT /v1/admin/config/security`, `GET /v1/admin/ip-blocks`, `POST /v1/admin/ip-blocks`, `DELETE /v1/admin/ip-blocks/:subject` | Operator Security and IP Blocks |
| Admin federation trust | `POST /v1/admin/federation/vouches` | Operator Peer detail → Vouch |

## 14. Test and release gates

### Automated

- Registry-to-capability-manifest coverage: 49/49 domains.
- Controller-to-surface manifest coverage for every public/operator route family.
- Route tests for all primary and permission-gated destinations.
- Unit tests for every command builder and error mapper.
- State tests for loading, empty, cached, stale, queued, failed, forbidden, locked, and revoked.
- Plane-separation import and storage-key tests.
- Recovery phrase non-persistence and one-time display tests.
- Accessibility queries for labels, roles, state announcements, and target sizes.
- Snapshot/visual tests in light/dark, English/Bangla, standard/maximum text, compact/tablet/wide.
- Offline tests with all network interfaces disabled.
- Existing frontend lint, typecheck, Jest, Expo Doctor, and native builds.

### Manual device matrix

- Low-end Android phone, current Android phone, iPhone, tablet, and keyboard-driven web.
- Notched device and landscape orientation.
- TalkBack and VoiceOver.
- Reduced Motion, bold/large text, reduced transparency/high contrast.
- Slow 2G, LAN-only, ISP-local, no Internet, mesh-only, and server unreachable.
- App killed during each welcome step, upload, publication, and queue retry.

## 15. Definition of done for one capability

A capability is complete only when:

1. it is mapped in the capability manifest;
2. its entry point is discoverable in the correct context;
3. its screen/component uses real backend data or a clearly labelled unsupported state;
4. its action is typed and signed through the correct plane boundary;
5. default, loading, empty, error, success, permission, locked, offline, and queued states are handled
   where applicable;
6. verification, reach, privacy, and transport consequences are visible;
7. English and Bangla copy exists;
8. large text, screen reader, keyboard, touch target, reduced motion, and reduced transparency pass;
9. compact, tablet, and wide layouts pass;
10. unit, integration, route, and coverage tests pass.

The capability manifest is the permanent guardrail: future backend additions fail frontend CI until
they are assigned a real UX surface.
