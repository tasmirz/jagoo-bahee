import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppPalette } from './tokens';
import { maxFontScale, radius, spacing, type as typography } from './tokens';
import { EmptyState } from './components';

/** A shimmering placeholder block — used to build skeleton screens without a new dependency. */
export function Skeleton({
  colors,
  width = '100%',
  height = 16,
  radius: cornerRadius = 6,
}: {
  readonly colors: AppPalette;
  readonly width?: number | `${number}%`;
  readonly height?: number;
  readonly radius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
    };
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: cornerRadius,
        backgroundColor: colors.surface2,
        opacity,
      }}
    />
  );
}

export function SkeletonPostCard({ colors }: { readonly colors: AppPalette }) {
  return (
    <View style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.skeletonRow}>
        <Skeleton colors={colors} width={28} height={28} radius={14} />
        <Skeleton colors={colors} width="40%" height={12} />
      </View>
      <Skeleton colors={colors} width="90%" height={18} />
      <Skeleton colors={colors} width="70%" height={14} />
      <Skeleton colors={colors} width="50%" height={14} />
    </View>
  );
}

export function ErrorState({
  colors,
  title,
  body,
  onRetry,
}: {
  readonly colors: AppPalette;
  readonly title: string;
  readonly body: string;
  readonly onRetry?: () => void;
}) {
  return (
    <EmptyState
      colors={colors}
      icon="cloud-offline-outline"
      title={title}
      body={body}
      action={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

export function PermissionState({
  colors,
  title = 'You do not have access',
  body,
}: {
  readonly colors: AppPalette;
  readonly title?: string;
  readonly body: string;
}) {
  return <EmptyState colors={colors} icon="lock-closed-outline" title={title} body={body} />;
}

/**
 * The single place that decides what a remote surface shows — Plan 12 §10.4's state set
 * (loading-no-cache / cached-fresh / cached-stale / refreshing / unreachable-with-cache /
 * unreachable-without-cache / permission-denied / vault-locked / unsupported), instead of each
 * screen improvising its own subset of `isLoading`/`isError`/`data` checks.
 */
export interface AsyncBoundaryState<T> {
  readonly data: T | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isStale?: boolean;
  readonly cached?: boolean;
}

export function AsyncBoundary<T>({
  colors,
  state,
  onRetry,
  errorTitle = 'Could not load this',
  errorBody = 'No saved copy is available yet.',
  loading,
  children,
}: {
  readonly colors: AppPalette;
  readonly state: AsyncBoundaryState<T>;
  readonly onRetry?: () => void;
  readonly errorTitle?: string;
  readonly errorBody?: string;
  readonly loading?: ReactNode;
  readonly children: (data: T) => ReactNode;
}) {
  if (state.data !== undefined) return <>{children(state.data)}</>;
  if (state.isLoading) return <>{loading ?? <Skeleton colors={colors} height={120} />}</>;
  if (state.isError) return <ErrorState colors={colors} title={errorTitle} body={errorBody} onRetry={onRetry} />;
  return null;
}

// ── Toast ────────────────────────────────────────────────────────────────────────────────

interface ToastEntry {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly tone: 'neutral' | 'verified' | 'warning' | 'danger';
  readonly persistent?: boolean;
}

interface ToastContextValue {
  readonly show: (entry: Omit<ToastEntry, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

/**
 * design.md §5 — toasts use the frosted treatment and auto-dismiss, except blackout-queue
 * confirmations, which persist until tapped so a person never mistakes "queued" for "sent".
 */
export function ToastHost({ colors, children }: PropsWithChildren<{ readonly colors: AppPalette }>) {
  const [entries, setEntries] = useState<readonly ToastEntry[]>([]);
  const show = (entry: Omit<ToastEntry, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    setEntries((current) => [...current, { ...entry, id }]);
    if (!entry.persistent) {
      setTimeout(() => setEntries((current) => current.filter((item) => item.id !== id)), 4000);
    }
  };
  const dismiss = (id: string) => setEntries((current) => current.filter((item) => item.id !== id));
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="box-none" style={styles.toastHost}>
        {entries.map((entry) => {
          const color =
            entry.tone === 'verified'
              ? colors.verified
              : entry.tone === 'warning'
                ? colors.constrained
                : entry.tone === 'danger'
                  ? colors.blackout
                  : colors.text2;
          return (
            <Pressable
              key={entry.id}
              onPress={() => dismiss(entry.id)}
              style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="information-circle-outline" size={18} color={color} />
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
                  {entry.title}
                </Text>
                {entry.body ? (
                  <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
                    {entry.body}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  skeletonCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toastHost: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
    gap: spacing.xs,
  },
  toast: {
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
});
