import { useRef, type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppPalette } from './tokens';
import { radius, spacing, type as typography } from './tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type ReachState = 'connected' | 'constrained' | 'blackout';

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

export function AppHeader({
  colors,
  reach,
  title = 'Jagoo',
  onReach,
  onSearch,
}: {
  readonly colors: AppPalette;
  readonly reach: ReachState;
  readonly title?: string;
  readonly onReach?: () => void;
  readonly onSearch?: () => void;
}) {
  return (
    <BlurView
      intensity={Platform.OS === 'android' ? 30 : 55}
      tint={colors.bg === '#0E0F11' ? 'dark' : 'light'}
      style={[styles.header, { borderBottomColor: colors.border }]}
    >
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: colors.ember }]}>
          <View style={[styles.brandMarkHole, { backgroundColor: colors.bg }]} />
        </View>
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          {title}
        </Text>
      </View>
      <View style={styles.headerActions}>
        <ReachPill colors={colors} state={reach} onPress={onReach} />
        {onSearch ? (
          <IconButton colors={colors} icon="search-outline" label="Search" onPress={onSearch} />
        ) : null}
      </View>
    </BlurView>
  );
}

export function ReachPill({
  colors,
  state,
  onPress,
  compact = false,
}: {
  readonly colors: AppPalette;
  readonly state: ReachState;
  readonly onPress?: () => void;
  readonly compact?: boolean;
}) {
  const settings = {
    connected: {
      label: 'Connected',
      icon: 'cellular-outline' as IconName,
      color: colors.verified,
    },
    constrained: {
      label: 'Constrained',
      icon: 'swap-vertical-outline' as IconName,
      color: colors.constrained,
    },
    blackout: {
      label: 'Blackout',
      icon: 'cloud-offline-outline' as IconName,
      color: colors.blackout,
    },
  }[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Network reach: ${settings.label}`}
      accessibilityHint="Shows what still works right now"
      onPress={onPress}
      style={({ pressed }) => [
        styles.reach,
        {
          backgroundColor: colors.surface2,
          borderColor: settings.color,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: compact ? spacing.sm : spacing.md,
        },
      ]}
    >
      <Ionicons name={settings.icon} size={15} color={settings.color} />
      {!compact ? (
        <Text style={[typography.caption, { color: settings.color }]}>{settings.label}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The Seal — design.md §4.2.
 *
 * ── There is no default state, on purpose ───────────────────────────────────────────
 * `state` used to default to `'synced'`, so every `<Seal colors={...} />` in the app
 * asserted "verified · synced" whether or not anything had been verified. A badge that
 * claims verification by default is worse than no badge: it is the server's word wearing
 * the client's uniform. Callers must now say what they checked, and the only honest source
 * for that is `sealStateFor` in `src/verify`.
 *
 * Colour is never the sole carrier (NFR-A06): the ring style — solid for synced, dashed
 * for queued and unverified — carries the same meaning, and the mono caption states it in
 * words for a screen reader and for a grayscale display.
 */
export function Seal({
  colors,
  state,
  label,
}: {
  readonly colors: AppPalette;
  readonly state: 'synced' | 'queued' | 'failed' | 'unsigned';
  readonly label?: string;
}) {
  const setting = {
    synced: {
      color: colors.verified,
      icon: 'shield-checkmark' as IconName,
      text: 'verified · synced',
      dashed: false,
    },
    queued: {
      color: colors.constrained,
      icon: 'shield-outline' as IconName,
      text: 'verified · queued',
      dashed: true,
    },
    failed: {
      color: colors.blackout,
      icon: 'shield-outline' as IconName,
      text: 'verification failed',
      dashed: true,
    },
    // No claim is being made. design.md §4.2: the absence of a seal is itself informative.
    unsigned: {
      color: colors.text3,
      icon: 'shield-outline' as IconName,
      text: 'no proof attached',
      dashed: true,
    },
  }[state];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label ?? setting.text}
      style={[
        styles.seal,
        setting.dashed ? { borderStyle: 'dashed', borderWidth: 1, borderColor: setting.color } : null,
      ]}
    >
      <Ionicons name={setting.icon} size={14} color={setting.color} />
      <Text style={[typography.mono, { color: setting.color }]}>{label ?? setting.text}</Text>
    </View>
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
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  readonly system?: 'ember' | 'signal';
  readonly icon?: IconName;
  readonly disabled?: boolean;
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: fill,
          borderColor: variant === 'secondary' ? colors.border : fill,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={textColor} /> : null}
      <Text style={[typography.label, { color: textColor }]}>{label}</Text>
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
      <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
        {title}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={[typography.label, { color: colors.ember }]}>{action}</Text>
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
      <Text style={[typography.caption, { color: selected ? colors.onAccent : colors.text2 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Divider({ colors }: { readonly colors: AppPalette }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
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
      <Text style={[typography.h2, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.body, styles.centerText, { color: colors.text2 }]}>{body}</Text>
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
        <Text style={[typography.label, { color: colors.text }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.text2 }]}>{body}</Text>
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} style={styles.bannerAction}>
            <Text style={[typography.label, { color }]}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function BottomNavigation({
  colors,
  active,
  onChange,
}: {
  readonly colors: AppPalette;
  readonly active: string;
  readonly onChange: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const items: readonly { id: string; label: string; icon: IconName; signal?: boolean }[] = [
    { id: 'home', label: 'Home', icon: 'home-outline' },
    { id: 'communities', label: 'Communities', icon: 'people-outline' },
    { id: 'create', label: 'Create', icon: 'add' },
    { id: 'inbox', label: 'Inbox', icon: 'mail-outline', signal: true },
    { id: 'profile', label: 'Profile', icon: 'person-outline' },
  ];
  return (
    <BlurView
      intensity={Platform.OS === 'android' ? 35 : 65}
      tint={colors.bg === '#0E0F11' ? 'dark' : 'light'}
      style={[
        styles.bottomNav,
        {
          borderTopColor: colors.border,
          minHeight: 76 + insets.bottom,
          paddingBottom: Math.max(spacing.sm, insets.bottom),
        },
      ]}
    >
      {items.map((item) => {
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
                create ? styles.createButton : null,
                create ? { backgroundColor: colors.ember } : null,
              ]}
            >
              <Ionicons
                name={
                  selected && !create ? (item.icon.replace('-outline', '') as IconName) : item.icon
                }
                size={create ? 25 : 20}
                color={create ? colors.onAccent : tint}
              />
            </View>
            <Text style={[typography.caption, { color: tint, fontSize: 10 }]}>{item.label}</Text>
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
      duration: 100,
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  brandMark: { width: 22, height: 22, borderRadius: radius.pill, padding: 5 },
  brandMarkHole: { flex: 1, borderRadius: radius.pill },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reach: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  seal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexShrink: 1 },
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
    minHeight: 76,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  navItem: { width: 68, minHeight: 56, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  createButton: {
    width: 44,
    height: 44,
    marginTop: -18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
