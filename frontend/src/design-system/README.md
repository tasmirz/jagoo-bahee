# Jagoo Bahee design system

This directory is the single source of truth for the Expo interface.

- `tokens.ts` defines semantic color, type, spacing, radius, size, layout, motion, and elevation.
- `components.tsx` contains reusable interactive and trust components.
- `layout.tsx` owns the screen shell — `Page`, `PageHeader`, `Section`, `Card`.
- `scene.tsx` owns the route frame and application loading.

## Spacing has exactly one owner per axis

Every screen used to split its insets with its own children: `Page` had no gutter, while
`StatusBanner`, `SectionHeader`, `PostCard` and `SkeletonPostCard` each carried their own
`marginHorizontal: 16` and a `Button` or a `Row` carried none. So on the same screen a heading
sat flush against the edge of the phone and the card under it was inset by 16. `AppScene` and
`PageHeader` had the same problem on the vertical axis and both claimed the notch.

Two rules, both covered by `gutter.test.tsx`, which asserts the passing shape *and* the shape
that reintroduces the bug:

- **The horizontal gutter belongs to `Page`.** It reads `useGutter()` — 16 / 24 / 32 by
  breakpoint — applies it once, and stacks its direct children with a `gap`. Every shared
  component is gutter-free. A screen whose child owns the scroll container (a `FlatList` that
  must reach the screen edge) passes `gutter={false}` and lets `InfiniteList` apply the same
  `useGutter()` value to its content container.
- **The top safe-area inset belongs to `PageHeader`,** which needs it because its frosted
  surface extends under the status bar. `AppScene` therefore defaults to
  `edges={['left', 'right']}`; only a route with no `PageHeader` and its own full-bleed hero
  (onboarding) opts back into `top`.

A style that hardcodes `paddingHorizontal: spacing.md` on a direct child of `Page` is the bug
coming back. Read the number from `useGutter()` or let `Page` supply it.

## Product rules

- Ember belongs to pseudonymous Forum space; Signal blue belongs to private messaging space.
- Trust is ambient: use `Seal` for provenance and `ReachPill` for network state.
- Page content is flat. Blur/elevation is reserved for floating navigation and overlays.
- Text, icon shape, and color all communicate status; color is never the only signal.
- Interactive targets are at least 44 × 44 points.
- JetBrains Mono is reserved for identifiers, keys, hashes, and receipt metadata.
- New screens must provide loading, empty, cached/offline, error, and permission states where
  those states are possible.
