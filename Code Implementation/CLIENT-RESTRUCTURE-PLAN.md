# Client restructure — Stage 1

> **Status: COMPLETE.** This document records the plan that was missing from Claude's Stage 0
> handoff and reconciles it with the implementation that landed immediately afterward.

## Goal

Replace the demo-era in-memory screen switcher with a production Expo Router application that
can host the Signal, offline-mesh and Reticulum surfaces without coupling them to Forum state.

## Deliverables and evidence

| Deliverable | Status | Evidence |
|---|---:|---|
| Real Expo Router routes and native tab shell | ✓ | `frontend/app/`, including post, audit, community, search, network and proof routes |
| Application composition outside the route tree | ✓ | `frontend/src/application/app-provider.tsx` |
| Domain feature boundaries | ✓ | `frontend/src/features/{forum,communities,connectivity,capabilities}` |
| Shared semantic design system | ✓ | `frontend/src/design-system/` |
| Offline-first query policy and request timeout | ✓ | `frontend/src/data/index.ts` |
| Signed vote/reply and ALS certificate forwarding | ✓ | `frontend/src/signer/index.ts` |
| Safe areas, 44 pt targets, screen-reader semantics | ✓ | shared primitives and tab navigation |
| Light/dark/system appearance persistence | ✓ | application provider + semantic tokens |
| Bangla/English catalogue | ◐ | catalogue exists in `frontend/src/i18n`; full route adoption is owned by the P4 UI pass |
| Production native identity and splash | ✓ | `frontend/app.json`, `frontend/assets/jagoo-app-icon.png` |

## Gate

- `pnpm --filter @jagoo/frontend lint` — pass
- `pnpm --filter @jagoo/frontend typecheck` — pass
- `pnpm --filter @jagoo/frontend test` — 39/39 pass
- `pnpm dlx expo-doctor frontend` — 18/18 pass
- `pnpm --filter @jagoo/frontend build` — Android and iOS export, 3.79 MB Hermes each

## Boundary for later stages

Signal keys and Signal persisted state must not be added to the Forum provider or Forum signer.
P4 gets its own vault, cache namespace and routes. P5's outbox stores opaque signed envelopes and
does not know either plane's key. P6 is an optional transport adapter and cannot become a frontend
dependency.
