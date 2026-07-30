import {
  useRef,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppPalette, ThemeMode } from './tokens';
import { maxFontScale, motion, radius, size, spacing, type as typography } from './tokens';
import { ReachPill, type ReachState } from './trust';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  colors,
  scroll = true,
  bottomInset = spacing.lg,
}: PropsWithChildren<{
  readonly colors: AppPalette;
  readonly scroll?: boolean;
  readonly bottomInset?: number;
}>) {
  if (!scroll) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg, paddingBottom: bottomInset }]}>
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
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/**
 * @deprecated Prefer `PageHeader` from `design-system/layout` for new screens — it is sticky
 * (rendered outside the scroll body, fixing root cause #3: this header used to scroll away
 * with the content) and shows a back control automatically. Kept for screens not yet migrated.
 */
export function AppHeader({
  colors,
  mode,
  reach,
  title = 'Jagoo',
  onBack,
  onReach,
  onSearch,
}: {
  readonly colors: AppPalette;
  /** Which palette is active — avoids string-comparing `colors.bg` against a literal hex. */
  readonly mode?: ThemeMode;
  readonly reach: ReachState;
  readonly title?: string;
  /**
   * When present, renders a leading back control in place of the brand mark — every pushed
   * (non-tab-root) screen using this legacy header should pass one (root cause #1: several
   * Signal screens had no back control at all beyond an implicit OS gesture).
   */
  readonly onBack?: () => void;
  readonly onReach?: () => void;
  readonly onSearch?: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const compactReach = width < 420 || fontScale > 1.1;
  return (
    <BlurView
      intensity={Platform.OS === 'android' ? 30 : 55}
      tint={mode === 'dark' ? 'dark' : 'light'}
      style={[styles.header, { borderBottomColor: colors.border }]}
    >
      <View style={styles.brand}>
        {onBack ? (
          <IconButton colors={colors} icon="arrow-back" label="Go back" onPress={onBack} />
        ) : (
          <View style={[styles.brandMark, { backgroundColor: colors.ember }]}>
            <View style={[styles.brandMarkHole, { backgroundColor: colors.bg }]} />
          </View>
        )}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={maxFontScale.h2}
          style={[typography.h2, styles.flex, { color: colors.text }]}
        >
          {title}
        </Text>
      </View>
      <View style={styles.headerActions}>
        <ReachPill colors={colors} state={reach} onPress={onReach} compact={compactReach} />
        {onSearch ? (
          <IconButton colors={colors} icon="search-outline" label="Search" onPress={onSearch} />
        ) : null}
      </View>
    </BlurView>
  );
}

export function IconButton({
  colors,
  icon,
  label,
  onPress,
  active = false,
  signal = false,
  disabled = false,
}: {
  readonly colors: AppPalette;
  readonly icon: IconName;
  readonly label: string;
  readonly onPress?: () => void;
  readonly active?: boolean;
  readonly signal?: boolean;
  readonly disabled?: boolean;
}) {
  const tint = signal ? colors.signal : active ? colors.ember : colors.text2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: disabled ? 0.4 : pressed ? 0.55 : 1 },
      ]}
    >
      <Ionicons name={icon} size={21} color={tint} />
    </Pressable>
  );
}

export function Button({
  colors,
  label,
  onPress,
  variant = 'primary',
  system = 'ember',
  icon,
  disabled,
  loading = false,
  accessibilityLabel,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  readonly system?: 'ember' | 'signal';
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /**
   * Spoken name, when the visible label is only unambiguous next to its row. A screen
   * reader hears a list of "Remove" buttons with no indication of what each one removes.
   */
  readonly accessibilityLabel?: string;
}) {
  const fill =
    variant === 'primary'
      ? system === 'signal'
        ? colors.signal
        : colors.ember
      : variant === 'destructive'
        ? colors.blackout
        : variant === 'secondary'
          ? colors.surface2
          : 'transparent';
  const textColor =
    variant === 'primary' || variant === 'destructive' ? colors.onAccent : colors.text;
  // Existing feature buttons already switch their copy to “Signing…”, “Encrypting…”, etc.
  // Treat that shared convention as loading so every long-running action gets a spinner even
  // before its call site is migrated to the explicit prop.
  const isLoading = loading || /(?:…|\.{3})$/.test(label.trim());
  const isDisabled = Boolean(disabled) || isLoading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: fill,
          borderColor: variant === 'secondary' ? colors.border : fill,
          opacity: isDisabled ? 0.55 : pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {isLoading ? (
        <ActivityIndicator
          accessibilityLabel={`${label} in progress`}
          color={textColor}
          size="small"
        />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={textColor} />
      ) : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontScale.label}
        style={[typography.label, { color: textColor }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  colors,
  title,
  action,
  onAction,
}: {
  readonly colors: AppPalette;
  readonly title: string;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  return (
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
  );
}

export function Pill({
  colors,
  label,
  selected,
  onPress,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? colors.ember : colors.surface2,
          borderColor: selected ? colors.ember : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontScale.caption}
        style={[typography.caption, { color: selected ? colors.onAccent : colors.text2 }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  colors,
  icon,
  title,
  body,
  action,
  onAction,
  system = 'ember',
}: {
  readonly colors: AppPalette;
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly action?: string;
  readonly onAction?: () => void;
  readonly system?: 'ember' | 'signal';
}) {
  const accent = system === 'signal' ? colors.signal : colors.ember;
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={28} color={accent} />
      </View>
      <Text maxFontSizeMultiplier={maxFontScale.h2} style={[typography.h2, { color: colors.text }]}>
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={maxFontScale.body}
        style={[typography.body, styles.centerText, { color: colors.text2 }]}
      >
        {body}
      </Text>
      {action ? <Button colors={colors} label={action} onPress={onAction} system={system} /> : null}
    </View>
  );
}

export function StatusBanner({
  colors,
  icon,
  title,
  body,
  tone = 'neutral',
  action,
  onAction,
}: {
  readonly colors: AppPalette;
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly tone?: 'neutral' | 'verified' | 'warning' | 'danger';
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  const color =
    tone === 'verified'
      ? colors.verified
      : tone === 'warning'
        ? colors.constrained
        : tone === 'danger'
          ? colors.blackout
          : colors.text2;
  return (
    <View style={[styles.banner, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.flex}>
        <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
          {title}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
          {body}
        </Text>
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} style={styles.bannerAction}>
            <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color }]}>
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export interface TabDescriptor {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly activeIcon: IconName;
  readonly signal?: boolean;
  readonly badge?: boolean;
}

/**
 * The single source of truth for the tab bar (root cause #10: the item list previously lived
 * twice — once as `<Tabs.Screen>` entries in `app/(tabs)/_layout.tsx`, once as this component's
 * own array — bridged by a fragile string mapping. `app/(tabs)/_layout.tsx` now imports this
 * same list instead of re-declaring it.
 */
export const TABS: readonly TabDescriptor[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { id: 'communities', label: 'Communities', icon: 'people-outline', activeIcon: 'people' },
  { id: 'create', label: 'Create', icon: 'add', activeIcon: 'add' },
  { id: 'signal', label: 'Signal', icon: 'radio-outline', activeIcon: 'radio', signal: true },
  { id: 'profile', label: 'You', icon: 'person-outline', activeIcon: 'person' },
] as const;

export function BottomNavigation({
  colors,
  mode,
  active,
  onChange,
  unreadCount = 0,
}: {
  readonly colors: AppPalette;
  /** Which palette is active — avoids string-comparing `colors.bg` against a literal hex. */
  readonly mode?: ThemeMode;
  readonly active: string;
  readonly onChange: (id: string) => void;
  /** Badge count on the Home item, for unread notifications/messages. */
  readonly unreadCount?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <BlurView
      intensity={Platform.OS === 'android' ? 35 : 65}
      tint={mode === 'dark' ? 'dark' : 'light'}
      style={[
        styles.bottomNav,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: size.bottomNavigation - 8 + insets.bottom,
          paddingBottom: Math.max(spacing.sm, insets.bottom),
        },
      ]}
    >
      {TABS.map((item) => {
        const selected = active === item.id;
        const tint = item.signal ? colors.signal : selected ? colors.ember : colors.text2;
        const create = item.id === 'create';
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.id)}
            style={styles.navItem}
          >
            <View
              style={[
                create ? styles.createButton : styles.navIconWrap,
                create ? { backgroundColor: colors.ember } : null,
              ]}
            >
              <Ionicons
                name={selected && !create ? item.activeIcon : item.icon}
                size={create ? 25 : 20}
                color={create ? colors.onAccent : tint}
              />
              {item.id === 'home' && unreadCount > 0 ? (
                <View style={[styles.navBadge, { backgroundColor: colors.ember, borderColor: colors.bg }]} />
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={[typography.caption, styles.navLabel, { color: tint }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </BlurView>
  );
}

export function PressScale({
  children,
  onPress,
  label,
}: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly label: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = async (toValue: number) => {
    if (await AccessibilityInfo.isReduceMotionEnabled()) return;
    Animated.timing(scale, {
      toValue,
      duration: motion.pressMs,
      useNativeDriver: true,
    }).start();
  };
  if (!onPress) return <View>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => void animate(0.98)}
      onPressOut={() => void animate(1)}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  flex: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandMark: { width: 22, height: 22, borderRadius: radius.pill, padding: 5 },
  brandMarkHole: { flex: 1, borderRadius: radius.pill },
  headerActions: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  centerText: { textAlign: 'center', maxWidth: 320 },
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bannerAction: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  bottomNav: {
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    overflow: 'visible',
  },
  navItem: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  navIconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 10, lineHeight: 13 },
  navBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  createButton: {
    width: 44,
    height: 44,
    marginTop: -18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
