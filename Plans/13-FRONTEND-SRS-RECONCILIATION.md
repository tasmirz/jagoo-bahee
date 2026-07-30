# Legacy Web SRS Reconciliation

> Companion to `12-FRONTEND-UX-COVERAGE-PLAN.md`.
> Sources: the React Native SRS supplied on 2026-07-30, `registry.yaml`, and current backend HTTP controllers.

The legacy SRS is a UX inventory, not a contract for this app. Its matching user jobs are retained;
its legacy-only controls must not be recreated as pretend functionality.

## Decisions

| Legacy SRS area | Backend-backed Jagoo mobile outcome | Delivery surface |
|---|---|---|
| Mnemonic sign-in, server URL, PoW, challenge signing | Keep and expand | Multi-step welcome flow and registration timeline |
| Password account, email, OAuth, gender/location, 2FA | No current backend contract | Do not create controls; only local identity protection remains |
| Home, sorting, feed, post detail, voting, comments | Keep and complete | Home, post detail, adaptive composer |
| Two duplicate community directories and duplicate post detail routes | Consolidate | Communities and canonical post route |
| Community wizard, rules, privacy, types, membership | Keep where signed domains/reads exist | Community create/detail/settings |
| Ownership transfer, scheduled posts, wiki, automod, flair configuration | No current contract | Excluded until a backend domain exists |
| Mod queue, reports, bans, mod log, roles | Keep and complete | Community moderation hub and role screens |
| Rich text decoration and social-network sharing | Progressive text composer and native share only | Composer and post action sheet |
| Notifications, saved, profiles, follow/block, Forum messages | Keep and complete | You, Inbox, public identity |
| Award catalogue and award giving | Keep and complete | Post/comment action sheet and operator catalogue |
| Proof archive, proof verification, audit tools | Keep and complete | Proofs and audit detail |
| Global admin users, arbitrary peer CRUD, rate-limit editing | Only exposed current admin/transport endpoints | Operator console; no invented user/peer controls |
| File upload, attachment confirmation, Markdown rendering | Keep and complete | Attachment tray and content renderer |

## Explicitly resolved differences

1. **Identity:** the SRS calls the BIP-39 optional passphrase a "25th word." The mobile UI uses
   *recovery salt* and explains that it changes the derived identity. It does not conflate it with
   the local vault password.
2. **Server selection:** the SRS has one URL input. The mobile experience adds known seed routes,
   compatibility verification, node identity, advertised services, and an explicit confirmation.
3. **Navigation:** the legacy desktop left rail is not copied to a phone. Its jobs are placed in
   Home, Communities, Create, Signal, You, and context-specific headers/actions.
4. **Moderation:** the legacy SRS has several UI-only bulk/scheduling controls. Only report,
   moderation action, role, membership, label, and mod-log flows that map to current backend
   domains belong in the initial mobile product.
5. **Administration:** current backend endpoints are represented as status/control screens only
   where the endpoint exists. User promotion, arbitrary federation-peer deletion, and broad rate
   limit editing are intentionally omitted.

## Acceptance checklist added by the SRS

- A new identity has a one-time recovery phrase, a confirmation prompt, no server upload, and
  a clear distinction between device lock, app password, and recovery salt.
- A returning identity can paste all 24 words and restore to a new local protection method.
- Every list has loading, retry, empty, inaccessible, cached/stale, and queued states as relevant.
- Community creation is a guided decision, not a raw form; settings, roles, reports, and member
  actions are contextual to the community.
- Post creation handles text, link, media, poll, and crosspost only when the selected community
  and backend contract allow it.
- Proofs are useful local evidence: verify, inspect, export/import, and retain even when content
  is moderated later.
- Every legacy action without a matching backend route/domain is absent or is displayed as an
  honest unsupported capability—not as a disabled-looking fake control.

## Implementation tracker

| Work | Status |
|---|---|
| Master capability/endpoint mapping | Complete: 49 signed domains, 102 inbound routes |
| SRS reconciliation | Complete: this document |
| Multi-step server and Forum identity welcome flow | Implemented in `frontend/src/features/onboarding/` |
| Contextual Forum, Signal, moderation, and operator surfaces | Complete: phases 2–8 implemented and validated |
