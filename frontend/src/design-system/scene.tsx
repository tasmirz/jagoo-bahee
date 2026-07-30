import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPalette } from './tokens';
import { spacing } from './tokens';
import { WorkProgress } from './feedback';

export function AppScene({
  children,
  colors,
}: PropsWithChildren<{ readonly colors: AppPalette }>) {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.scene, { backgroundColor: colors.bg }]}
    >
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
