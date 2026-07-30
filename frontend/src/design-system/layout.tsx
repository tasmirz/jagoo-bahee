import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Router } from 'expo-router';
import type { AppPalette, ThemeMode } from './tokens';
import { maxFontScale, radius, size, spacing, type as typography, useResponsive } from './tokens';
import { ReachPill, type ReachState } from './trust';

/**
 * The content-inset contract (root cause #2 in the rebuild plan).
 *
 * `Screen`'s old default (`bottomInset = spacing.lg`, 24px) never knew whether it sat inside
 * the tab bar or a plain stack screen, so every tab screen — including the composer's publish
 * button — rendered 50-90px of its bottom content behind the translucent `BottomNavigation`.
 * `Page` provides the real answer once, from one place: bottom = tab-bar height + safe area
 * inset when inside `(tabs)`, or just the safe area elsewhere.
 */
interface ContentInsetsValue {
  readonly bottom: number;
  readonly insideTabs: boolean;
}

const ContentInsetsContext = createContext<ContentInsetsValue>({ bottom: spacing.lg, insideTabs: false });

export function useContentInsets(): ContentInsetsValue {
  return useContext(ContentInsetsContext);
}

export function TabBarInsetProvider({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const bottom = size.bottomNavigation - 8 + Math.max(insets.bottom, spacing.xs) + spacing.md;
  const value = useMemo<ContentInsetsValue>(() => ({ bottom, insideTabs: true }), [bottom]);
  return <ContentInsetsContext.Provider value={value}>{children}</ContentInsetsContext.Provider>;
}

/**
 * The reading column (root cause: two duplicated `760` literals, `layout.wideMin` unused).
 * Centres content on wide/tablet screens without every screen re-deriving the breakpoint math.
 */
export function ContentColumn({ children }: { readonly children: ReactNode }) {
  const { bp, contentMax } = useResponsive();
  return (
    <View style={bp === 'compact' ? undefined : [styles.columnWide, { maxWidth: contentMax }]}>
      {children}
    </View>
  );
}

export function FrostedSurface({
  colors,
  mode,
  variant = 'navigation',
  style,
  children,
}: PropsWithChildren<{
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly variant?: 'navigation' | 'sheet' | 'status' | 'onboarding' | 'fallback';
  readonly style?: ViewStyle | ViewStyle[];
}>) {
  // Plan 12 §9.3 — a `fallback` opaque surface stands in for reduced transparency, low-power
  // devices, and platforms without a real blur. Everywhere else, glass is reserved for things
  // that float above content (design.md §3): nav, sheets, transient status, onboarding.
  if (variant === 'fallback') {
    return <View style={[{ backgroundColor: colors.surface }, style]}>{children}</View>;
  }
  const intensity =
    variant === 'sheet' ? (Platform.OS === 'android' ? 40 : 70) : Platform.OS === 'android' ? 30 : 55;
  return (
    <BlurView intensity={intensity} tint={mode === 'dark' ? 'dark' : 'light'} style={style}>
      {children}
    </BlurView>
  );
}

interface PageHeaderAction {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
  readonly badge?: boolean;
}

/**
 * The one header every screen should use (root cause #1: six divergent hand-rolled headers,
 * two Signal routes with no back control at all, and `mesh-screen.tsx` wiring the Reach Pill
 * *as* its back button). Sticky — rendered outside any ScrollView by the caller — and shows a
 * back control automatically whenever the router has somewhere to go back to, so a screen
 * cannot ship without one by omission.
 */
export function PageHeader({
  colors,
  mode,
  title,
  subtitle,
  onBack,
  reach,
  onReach,
  actions = [],
  variant = 'frosted',
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly title?: string;
  readonly subtitle?: string;
  /** Explicit override. Defaults to `router.back()` when the router can go back. */
  readonly onBack?: () => void;
  readonly reach?: ReachState;
  readonly onReach?: () => void;
  readonly actions?: readonly PageHeaderAction[];
  readonly variant?: 'frosted' | 'flat';
}) {
  const insets = useSafeAreaInsets();
  const router: Router = useRouter();
  const canGoBack = router.canGoBack();
  const showBack = Boolean(onBack) || canGoBack;
  const handleBack = onBack ?? (() => router.back());
  const headerStyle = [
    styles.header,
    {
      paddingTop: insets.top + spacing.xs,
      borderBottomColor: colors.border,
      backgroundColor: variant === 'flat' ? colors.bg : undefined,
    },
  ];
  const content = (
    <>
      <View style={styles.headerRow}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={handleBack}
            style={styles.headerIconButton}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerIconButton} />
        )}
        <View style={styles.headerTitleWrap}>
          {title ? (
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontScale.h2}
              style={[typography.h2, { color: colors.text }]}
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontScale.caption}
              style={[typography.caption, { color: colors.text2 }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {reach !== undefined ? (
            <ReachPill colors={colors} state={reach} onPress={onReach} compact />
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={8}
              onPress={action.onPress}
              style={styles.headerIconButton}
            >
              <Ionicons name={action.icon} size={21} color={colors.text2} />
              {action.badge ? (
                <View style={[styles.headerBadge, { backgroundColor: colors.ember, borderColor: colors.bg }]} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );
  if (variant === 'flat') {
    return <View style={headerStyle}>{content}</View>;
  }
  return (
    <FrostedSurface colors={colors} mode={mode} style={headerStyle}>
      {content}
    </FrostedSurface>
  );
}

/**
 * `Page` = the whole-screen shell: safe top/side insets, a sticky `PageHeader` slot, and a
 * scroll body that automatically reserves space for whatever sits below it (tab bar or none).
 * Replaces the `AppScene` + `Screen` + inline `AppHeader` combination that let the header
 * scroll away with the content (root cause #3).
 */
export function Page({
  colors,
  children,
  scroll = true,
  edges = ['top', 'left', 'right'],
}: PropsWithChildren<{
  readonly colors: AppPalette;
  readonly scroll?: boolean;
  readonly edges?: readonly ('top' | 'left' | 'right' | 'bottom')[];
}>) {
  const insets = useSafeAreaInsets();
  const { bottom } = useContentInsets();
  const paddingTop = edges.includes('top') ? 0 : undefined; // header owns top inset itself
  const paddingLeft = edges.includes('left') ? insets.left : 0;
  const paddingRight = edges.includes('right') ? insets.right : 0;
  const paddingBottom = edges.includes('bottom') ? bottom : 0;
  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bg, paddingLeft, paddingRight, paddingTop }]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.scrollContent, { paddingLeft, paddingRight, paddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Section({
  title,
  action,
  onAction,
  colors,
  children,
}: PropsWithChildren<{
  readonly title?: string;
  readonly action?: string;
  readonly onAction?: () => void;
  readonly colors: AppPalette;
}>) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={maxFontScale.h2}
            style={[typography.h2, { color: colors.text }]}
          >
            {title}
          </Text>
          {action ? (
            <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
              <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.ember }]}>
                {action}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({
  children,
  gap = spacing.sm,
  wrap = false,
  style,
}: PropsWithChildren<{ readonly gap?: number; readonly wrap?: boolean; readonly style?: ViewStyle }>) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card({
  colors,
  style,
  children,
}: PropsWithChildren<{ readonly colors: AppPalette; readonly style?: ViewStyle }>) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ colors }: { readonly colors: AppPalette }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function SafeBottomSpacer() {
  const { bottom } = useContentInsets();
  return <View style={{ height: bottom }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  columnWide: { width: '100%', alignSelf: 'center' },
  section: { gap: spacing.sm },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
});
