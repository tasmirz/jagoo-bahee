import { useWindowDimensions } from 'react-native';

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  huge: 64,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const size = {
  touch: 44,
  control: 48,
  header: 64,
  bottomNavigation: 84,
  readingMeasure: 760,
} as const;

export const layout = {
  compactMax: 639,
  tabletMin: 640,
  wideMin: 960,
  contentMax: 760,
  shellMax: 1180,
} as const;

/**
 * Breakpoint + semantic spacing, resolved from the live window size (Plan 12 §9.2/§9.1).
 *
 * `useWindowDimensions` was previously read ad hoc in two places (`ContentColumn` in
 * `features/forum/screens.tsx`, the onboarding split in `features/connectivity/screens.tsx`),
 * each hardcoding its own `760` literal instead of `layout.contentMax`, and `layout.wideMin`
 * had zero callers. One hook now owns "how wide is the window" so a tablet/landscape pass is a
 * one-file change instead of a grep-and-hope.
 */
export type Breakpoint = 'compact' | 'medium' | 'expanded';

export interface ResponsiveInfo {
  readonly width: number;
  readonly height: number;
  readonly bp: Breakpoint;
  readonly isLandscape: boolean;
  /** Page edge-to-content padding — Plan 12 §9.1 "screen inline". */
  readonly gutter: number;
  /** The reading column's max width at this breakpoint. */
  readonly contentMax: number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint =
    width >= layout.wideMin ? 'expanded' : width >= layout.tabletMin ? 'medium' : 'compact';
  return {
    width,
    height,
    bp,
    isLandscape: width > height,
    gutter: bp === 'compact' ? spacing.md : spacing.lg,
    contentMax: bp === 'compact' ? width : layout.contentMax,
  };
}

/** Plan 12 §9.1 — semantic spacing roles, resolved per breakpoint rather than one flat scale. */
export interface SemanticSpacing {
  readonly screenInline: number;
  readonly sectionGap: number;
  readonly groupGap: number;
  readonly controlGap: number;
}

export function useSemanticSpacing(): SemanticSpacing {
  const { bp } = useResponsive();
  if (bp === 'compact') {
    return { screenInline: 16, sectionGap: 32, groupGap: 16, controlGap: 8 };
  }
  return { screenInline: bp === 'expanded' ? 32 : 24, sectionGap: 44, groupGap: 22, controlGap: 12 };
}

/**
 * The one edge-to-content inset for a screen, in one place.
 *
 * Before this existed, every screen hardcoded `spacing.md` on some of its children and nothing
 * on the rest, and shared components (`StatusBanner`, `SectionHeader`, `PostCard`) each carried
 * their own `marginHorizontal` on the assumption that their page had none. Mixing the two is
 * what put Signal's buttons, banners and headings flush against the screen edge while the cards
 * beside them were inset. `Page` now owns the gutter and every child is gutter-free; a screen
 * that manages its own scroll container (a `FlatList`) reads the same number from here so the
 * two paths cannot drift.
 */
export function useGutter(): number {
  return useSemanticSpacing().screenInline;
}

export const elevation = {
  none: {},
  floating: {
    shadowColor: '#0E0F11',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

export const type = {
  display: { fontFamily: 'Poppins_600SemiBold', fontSize: 32, lineHeight: 40 },
  h1: { fontFamily: 'Poppins_600SemiBold', fontSize: 22, lineHeight: 30 },
  h2: { fontFamily: 'Poppins_600SemiBold', fontSize: 18, lineHeight: 26 },
  label: { fontFamily: 'Poppins_500Medium', fontSize: 15, lineHeight: 20 },
  bodyLarge: { fontFamily: 'Poppins_400Regular', fontSize: 16, lineHeight: 26 },
  body: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 },
  overline: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.66,
    textTransform: 'uppercase' as const,
  },
  mono: { fontFamily: 'JetBrainsMono_400Regular', fontSize: 12, lineHeight: 18 },
} as const;

/**
 * Font-scale ceiling per role (NFR-A — large-text support without breaking layout).
 *
 * Fixed `fontSize` values were previously handed to `<Text>` with no
 * `maxFontSizeMultiplier`, so a system text-size setting above 100% pushed labels, nav
 * captions and card metadata past their containers with no clamp — the overflow the user
 * reported. Sizes stay exactly as `design.md` §2 specifies; only the ceiling is new. Body
 * roles get the most headroom since paragraphs can wrap; single-line UI chrome (nav labels,
 * overlines, mono) gets less so a 44pt touch target does not need to grow with it.
 */
export const maxFontScale: Record<keyof typeof type, number> = {
  display: 1.3,
  h1: 1.4,
  h2: 1.4,
  label: 1.3,
  bodyLarge: 1.6,
  body: 1.6,
  caption: 1.5,
  overline: 1.2,
  mono: 1.2,
} as const;

const shared = {
  emberDark: '#F0723F',
  signalDark: '#6C8FE0',
  verifiedDark: '#3CBE94',
  constrainedDark: '#E8A23D',
  blackoutDark: '#E96868',
  linkDark: '#7DA0FF',
} as const;

/**
 * `light.ember` and `light.blackout` are deliberately darker than `Plans/design.md` §1.3's
 * `#E85D2C` / `#C23B3B` — those hexes fail 4.5:1 body-text contrast against `light.bg`
 * (`#F6F5F2`). `design-system/accessibility.test.ts` asserts the WCAG AA sweep against these
 * values; do not "restore" the doc's exact hex without also proving contrast holds.
 */
export const palettes = {
  light: {
    ...shared,
    ember: '#B84016',
    signal: '#3654A6',
    verified: '#137557',
    constrained: '#8A5A00',
    blackout: '#B93434',
    link: '#2E5FE0',
    onAccent: '#FFF9F5',
    bg: '#F6F5F2',
    surface: '#FFFFFF',
    surface2: '#ECEAE5',
    border: '#D9D7D2',
    text: '#1B1B1D',
    text2: '#626166',
    text3: '#69686D',
    overlay: '#F6F5F2E8',
  },
  dark: {
    ...shared,
    ember: shared.emberDark,
    signal: shared.signalDark,
    verified: shared.verifiedDark,
    constrained: shared.constrainedDark,
    blackout: shared.blackoutDark,
    link: shared.linkDark,
    onAccent: '#0E0F11',
    bg: '#0E0F11',
    surface: '#17181B',
    surface2: '#202226',
    border: '#35373D',
    text: '#F2F1EE',
    text2: '#A7A7AC',
    text3: '#8F8F95',
    overlay: '#17181BE8',
  },
} as const;

export type AppPalette = (typeof palettes)[keyof typeof palettes];
export type ThemeMode = keyof typeof palettes;

/**
 * Plan 12 §9.5 motion budget. `PressScale` previously hardcoded `duration: 100` instead of
 * reading `pressMs`; every animated component should read from here so the timings stay a
 * single edit.
 */
export const motion = {
  pressMs: 100,
  stateMs: 300,
  sheetMs: 250,
  routeMs: 350,
  sealMs: 400,
} as const;
