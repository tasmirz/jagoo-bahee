import type { PropsWithChildren } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPalette } from './tokens';
import { spacing } from './tokens';

/**
 * The route-level frame.
 *
 * `edges` deliberately excludes `top` by default. `PageHeader` already adds `insets.top` itself
 * — it has to, because it is a sticky frosted surface that must extend *under* the status bar
 * rather than start below it. With `AppScene` also claiming the top edge, every screen that used
 * both paid the notch twice and its title sat ~47px lower than intended. The two onboarding
 * routes have no `PageHeader` and draw their own full-bleed hero, so they opt back in.
 */
export function AppScene({
  children,
  colors,
  edges = ['left', 'right'],
}: PropsWithChildren<{
  readonly colors: AppPalette;
  readonly edges?: readonly ('top' | 'left' | 'right' | 'bottom')[];
}>) {
  return (
    <SafeAreaView edges={edges} style={[styles.scene, { backgroundColor: colors.bg }]}>
      {children}
    </SafeAreaView>
  );
}

/**
 * The single boot image — app mark and app name, nothing else.
 *
 * Three gates can be on screen during a launch: the OS splash from `app.json`, the font
 * gate in `app/_layout.tsx` (which runs BEFORE `AppProvider`, so it has no palette and no
 * Poppins yet), and `AppLoading` while the home node and session restore. They used to
 * look like three different screens — the OS drew the icon, then a 32pt abstract ring and
 * a pulsing progress bar appeared in its place. One component, taking raw colours rather
 * than an `AppPalette`, is what lets the pre-provider gate render the identical thing.
 *
 * Deliberately no spinner or progress bar: a determinate-looking bar over an
 * indeterminate wait (session restore can sit on a dead link for a full HTTP timeout) is
 * a lie about progress, and the OS splash it replaces never had one.
 *
 * The system font is used on purpose even once Poppins is available, so the handoff from
 * the font gate to `AppLoading` does not swap typeface mid-launch.
 */
export function SplashScreen({
  backgroundColor,
  label = 'Opening Jagoo Bahee',
  name = 'Jagoo Bahee',
  textColor,
}: {
  readonly backgroundColor: string;
  readonly label?: string;
  readonly name?: string;
  readonly textColor: string;
}) {
  return (
    <View accessibilityLabel={label} accessibilityLiveRegion="polite" style={[styles.splash, { backgroundColor }]}>
      <Image
        accessibilityIgnoresInvertColors
        // Metro resolves bundled image assets through the React Native `require` contract.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../../assets/jagoo-app-icon.png')}
        style={styles.splashLogo}
      />
      <Text maxFontSizeMultiplier={1.4} style={[styles.splashName, { color: textColor }]}>
        {name}
      </Text>
    </View>
  );
}

export function AppLoading({
  colors,
  label = 'Opening Jagoo Bahee',
  name,
}: {
  readonly colors: AppPalette;
  readonly label?: string;
  readonly name?: string;
}) {
  return (
    <SplashScreen
      backgroundColor={colors.bg}
      label={label}
      textColor={colors.text}
      {...(name ? { name } : {})}
    />
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  splashLogo: { width: 132, height: 132, borderRadius: 66 },
  splashName: { fontSize: 20, fontWeight: '600', letterSpacing: 0.2 },
});
