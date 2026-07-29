# Jagoo Bahee design system

This directory is the single source of truth for the Expo interface.

- `tokens.ts` defines semantic color, type, spacing, radius, size, layout, motion, and elevation.
- `components.tsx` contains reusable interactive and trust components.
- `scene.tsx` owns safe-area scenes and application loading.

## Product rules

- Ember belongs to pseudonymous Forum space; Signal blue belongs to private messaging space.
- Trust is ambient: use `Seal` for provenance and `ReachPill` for network state.
- Page content is flat. Blur/elevation is reserved for floating navigation and overlays.
- Text, icon shape, and color all communicate status; color is never the only signal.
- Interactive targets are at least 44 × 44 points.
- JetBrains Mono is reserved for identifiers, keys, hashes, and receipt metadata.
- New screens must provide loading, empty, cached/offline, error, and permission states where
  those states are possible.
