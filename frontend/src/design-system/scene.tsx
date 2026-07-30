import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPalette } from './tokens';
import { spacing } from './tokens';
import { WorkProgress } from './feedback';

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

export function AppLoading({
  colors,
  label = 'Opening Jagoo Bahee',
}: {
  readonly colors: AppPalette;
  readonly label?: string;
}) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={[styles.loading, { backgroundColor: colors.bg }]}
    >
      <View style={[styles.mark, { backgroundColor: colors.ember }]}>
        <View style={[styles.markHole, { backgroundColor: colors.bg }]} />
      </View>
      <View style={styles.progress}>
        <WorkProgress colors={colors} label={label} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mark: { width: 32, height: 32, borderRadius: 999, padding: 8 },
  markHole: { flex: 1, borderRadius: 999 },
  progress: { width: 220 },
});
