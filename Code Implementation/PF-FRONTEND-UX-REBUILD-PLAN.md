# PF — Frontend UI/UX Rebuild

> Written after `Plans/12-FRONTEND-UX-COVERAGE-PLAN.md` was found to be false (Phases 0–8 marked
> ✅ "implemented and validated" while the monoliths, route tree, and shared components it
> describes did not exist — see the correction note at the top of that file and `BUILD-LOG.md`
> 2026-07-30, L-27). This document records what was actually rebuilt in this pass and, honestly,
> what was not, per `CLAUDE.md` §7.2 ("plan before code, log after").

## Root causes addressed

1. No page/header/back contract → `design-system/layout.tsx`'s `PageHeader`, applied to the new
   Feed/Post/Composer/Community/Saved/Notifications/You screens and to all 7 pushed Signal routes.
2. Content padded 24px against a 76–110px tab bar → `Page`'s `useContentInsets()` context.
3. `AppHeader` scrolling away with content → `PageHeader` is sticky, rendered outside `Page`'s scroll body.
4. Composer pills stacking one-per-line (missing `flexDirection: row`) → `ChipGroup`/`SegmentedControl`.
5. No font-scale ceiling → `maxFontScale` per type role, applied across all new components.
6. Fabricated vote/save/join state → backend additive `myVote`/`saved`/`joined` fields +
   `VoteButtons`' `useMutation`.
7. No pagination → `useInfiniteFeed` + `InfiniteList` (`FlatList`).
8. Dark-mode holes → broken duplicate `CommunityCreateScreen` deleted; `wordmarkSeal` fixed to
   theme correctly; `AppHeader`/`BottomNavigation` take an explicit `mode` prop instead of
   string-comparing a hex literal.
9. 14-row capability catalogue → `YouScreen` with real destinations for Saved and Notifications;
   Identity/Proofs/Operator remain routed through the old workspace as a scoped stopgap (below).
10. Broken/duplicated tab bar → `TABS` is the single source of truth; `/inbox` moved out of the
    tab group to a real stack route with a back button.

## Status by phase

| Phase | Scope | Status |
|---|---|---|
| F0 | Design system foundation | **Done** — `layout`, `forms`, `sheet`, `feedback`, `list`, `motion`, extended `trust`, native deps wired |
| F1 | Navigation shell | **Done** — root gestures/transitions, single-source tab list, composer modal route, all Signal + mesh back buttons |
| F2 | Feed, post detail, comments, votes | **Done** — real pagination, canonical `PostCard`/`VoteButtons`, real comment tree, markdown body |
| F3 | Composer rewrite | **Done** — community-picker sheet, kind tabs gated by community settings, image picker, poll/link/crosspost editors, draft persistence |
| F4 | Communities | **Done** — `CommunityScreen` (FAB, real join, Posts/About tabs, moderator-gated Manage entry), consolidated `CommunitiesScreen` |
| F5 | You, notifications, saved | **Partial** — `YouScreen`, `NotificationsScreen`, `SavedScreen` built and wired. **Not done**: `app/settings/*` tree; Identity/Proofs/Operator still route through the legacy `feature/[featureId]` workspace |
| F6 | Governance | **Not started** — mod queue/reports/roles/log UI is unchanged from before this pass |
| F7 | Signal plane | **Not started** beyond the F1 back-button fix — screens are functionally intact but still use the legacy `AppHeader`/`Screen` primitives, not the new design system |
| F8 | Network, offline, proofs, operator | **Not started** — unchanged from before this pass |
| F9 | i18n, accessibility, responsive, tests | **Partial** — font-scale ceiling and responsive hooks exist and are used by all new screens; i18n catalogue growth, the bare-string-literal lint rule, and a manual device/screen-reader pass were not done |

## Verification

```bash
pnpm --filter @jagoo/frontend lint        # 0 errors, 33 pre-existing console warnings
pnpm --filter @jagoo/frontend exec tsc --noEmit
pnpm --filter @jagoo/frontend test        # 19/19 suites, 71/71 tests
pnpm --filter @jagoo/backend exec vitest run   # 431/444, 13 skipped (no Mongo/Redis)
pnpm test                                 # 6/6 workspace tasks
pnpm --filter @jagoo/frontend exec expo export --platform ios --platform android
npx expo-doctor                           # 17/18 — same baseline, +1 new advisory (below)
```

`expo-doctor`'s one failing check flags `react-native-markdown-display` as unmaintained, alongside
the pre-existing `react-native-webrtc`/`@jagoo/sdk` advisories. Retained rather than hidden with an
exclusion, per this project's existing convention for the same check (see the 2026-07-30 B1–B4
entry in `BUILD-LOG.md`).

## What a follow-up session should do first

1. Build `app/settings/*` and move Identity/Proofs/Operator off the legacy workspace.
2. Rebuild Signal-plane screens on the new design system (functionally they still work).
3. Grow `src/i18n` to cover every new screen and add the bare-string-literal lint rule.
4. Governance UI (mod queue, reports, roles, public mod log) on the new primitives.
5. A manual device pass: light/dark, English/Bangla, 1.3× text, TalkBack/VoiceOver, reduced
   motion/transparency, and the node stopped (cached read, queued author, outbox drain).
