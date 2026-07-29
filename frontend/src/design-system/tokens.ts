import { useColorScheme } from 'react-native';

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

const shared = {
  ember: '#E85D2C',
  emberDark: '#F0723F',
  signal: '#3654A6',
  signalDark: '#6C8FE0',
  verified: '#1F9D77',
  verifiedDark: '#3CBE94',
  constrained: '#D98C1D',
  constrainedDark: '#E8A23D',
  blackout: '#C23B3B',
  blackoutDark: '#E05C5C',
  link: '#2E5FE0',
  linkDark: '#7DA0FF',
  onAccent: '#FFF9F5',
} as const;

export const palettes = {
  light: {
    ...shared,
    bg: '#F6F5F2',
    surface: '#FFFFFF',
    surface2: '#ECEAE5',
    border: '#D9D7D2',
    text: '#1B1B1D',
    text2: '#6B6B70',
    text3: '#76757A',
    overlay: '#F6F5F2E8',
  },
  dark: {
    ...shared,
    bg: '#0E0F11',
    surface: '#17181B',
    surface2: '#202226',
    border: '#35373D',
    text: '#F2F1EE',
    text2: '#A7A7AC',
    text3: '#85858B',
    overlay: '#17181BE8',
  },
} as const;

export type AppPalette = (typeof palettes)[keyof typeof palettes];
export type ThemeMode = keyof typeof palettes;

export function useAppTheme(forced?: ThemeMode): {
  readonly mode: ThemeMode;
  readonly colors: AppPalette;
} {
  const system = useColorScheme();
  const mode = forced ?? (system === 'dark' ? 'dark' : 'light');
  return { mode, colors: palettes[mode] };
}

export const motion = {
  pressMs: 100,
  stateMs: 300,
  sealMs: 400,
} as const;
