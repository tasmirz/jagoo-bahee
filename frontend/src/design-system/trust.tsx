import { useEffect, useRef, type ComponentProps } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppPalette } from './tokens';
import { maxFontScale, motion, radius, spacing, type as typography } from './tokens';
import { useReachScope, type ReachTone } from './reach-scope';

/**
 * The signature trust devices — design.md §4. Moved out of `components.tsx` into their own
 * module so the seven devices `design.md` §9 says every trust/identity/reach screen must reuse
 * (Seal, Reach Pill, moderation banner, transport tag, cost ring, queue state, plane boundary
 * notice) live in one place instead of being redefined per feature.
 */

type IconName = ComponentProps<typeof Ionicons>['name'];
export type ReachState = 'connected' | 'constrained' | 'blackout';

/**
 * The Reach Pill — design.md §4.1, extended for TP-20. See the original design note this
 * carried in `components.tsx`: colour is never the sole carrier, so each state/scope pairs an
 * icon shape and a text label that survive greyscale and screen readers alike.
 */
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
  const { display: scope, onInspect } = useReachScope();
  const toneColor: Record<ReachTone, string> = {
    ok: colors.verified,
    limited: colors.constrained,
    critical: colors.blackout,
  };
  const fallback = {
    connected: {
      label: 'Connected',
      icon: 'cellular-outline' as IconName,
      color: colors.verified,
      hint: 'Shows what still works right now',
    },
    constrained: {
      label: 'Constrained',
      icon: 'swap-vertical-outline' as IconName,
      color: colors.constrained,
      hint: 'Shows what still works right now',
    },
    blackout: {
      label: 'Blackout',
      icon: 'cloud-offline-outline' as IconName,
      color: colors.blackout,
      hint: 'Shows what still works right now',
    },
  }[state];
  const settings = scope
    ? { label: scope.label, icon: scope.icon, color: toneColor[scope.tone], hint: scope.consequence }
    : fallback;

  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: motion.stateMs,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [fade, settings.label, settings.color]);

  return (
    <Animated.View style={{ opacity: fade }}>
      <View
        accessible
        accessibilityRole={onPress || onInspect ? 'button' : 'text'}
        accessibilityLabel={`Network reach: ${settings.label}`}
        accessibilityHint={settings.hint}
        onTouchEnd={onInspect ?? onPress}
        style={[
          styles.reach,
          {
            backgroundColor: colors.surface2,
            borderColor: settings.color,
            paddingHorizontal: compact ? spacing.sm : spacing.md,
          },
        ]}
      >
        <Ionicons name={settings.icon} size={15} color={settings.color} />
        {!compact ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.caption}
            style={[typography.caption, { color: settings.color }]}
          >
            {settings.label}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export type SealState = 'synced' | 'queued' | 'failed' | 'unsigned';

/**
 * The Seal — design.md §4.2. No default state (L-25): a caller must say what it checked,
 * because a badge that claims verification by default is the server's word wearing the
 * client's uniform.
 */
export function Seal({
  colors,
  state,
  label,
  onPress,
}: {
  readonly colors: AppPalette;
  readonly state: SealState;
  readonly label?: string;
  readonly onPress?: () => void;
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
    unsigned: {
      color: colors.text3,
      icon: 'shield-outline' as IconName,
      text: 'no proof attached',
      dashed: true,
    },
  }[state];
  const content = (
    <>
      <Ionicons name={setting.icon} size={14} color={setting.color} />
      <Text
        maxFontSizeMultiplier={maxFontScale.mono}
        style={[typography.mono, { color: setting.color }]}
      >
        {label ?? setting.text}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={12} color={setting.color} /> : null}
    </>
  );
  const style = [
    styles.seal,
    setting.dashed ? { borderStyle: 'dashed' as const, borderWidth: 1, borderColor: setting.color } : null,
  ];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? setting.text}. View cryptographic proof`}
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label ?? setting.text} style={style}>
      {content}
    </View>
  );
}

/** Long-press / tap-through detail for a Seal — the truncated key or hash (design.md §4.2). */
export function SealDetail({
  colors,
  contentId,
  authorKey,
  signedAtMs,
}: {
  readonly colors: AppPalette;
  readonly contentId: string;
  readonly authorKey: string;
  readonly signedAtMs: number | null;
}) {
  return (
    <View style={[styles.sealDetail, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Text maxFontSizeMultiplier={maxFontScale.mono} style={[typography.mono, { color: colors.text2 }]}>
        {contentId}
      </Text>
      <Text maxFontSizeMultiplier={maxFontScale.mono} style={[typography.mono, { color: colors.text2 }]}>
        author {authorKey.slice(0, 16)}…
      </Text>
      {signedAtMs !== null ? (
        <Text maxFontSizeMultiplier={maxFontScale.mono} style={[typography.mono, { color: colors.text2 }]}>
          signed {new Date(signedAtMs).toLocaleString()}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The transport tag — design.md §5, VIS-04. Informational only: it names the wire path an
 * envelope actually travelled, never a different rendering. Previously the feed hardcoded
 * "via HTTP · proof stored" on every card regardless of what actually happened.
 */
export function TransportTag({
  colors,
  transport,
}: {
  readonly colors: AppPalette;
  readonly transport: 'http' | 'grpc' | 'mesh' | 'reticulum' | null;
}) {
  if (!transport) return null;
  const label = { http: 'via HTTP', grpc: 'via federation', mesh: 'via mesh', reticulum: 'via radio' }[
    transport
  ];
  const icon: IconName =
    transport === 'mesh' ? 'bluetooth-outline' : transport === 'reticulum' ? 'radio-outline' : 'git-network-outline';
  return (
    <View style={styles.transport}>
      <Ionicons name={icon} size={13} color={colors.text2} />
      <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The moderation banner — design.md §4.3. Deliberately calm: no red, no alarm styling.
 * Removal is a tombstone (`CLAUDE.md` §9), never a blank hole — the reader can always see what
 * happened and override the client-side hide.
 */
export function ModerationTombstone({
  colors,
  reason,
  onViewOriginal,
}: {
  readonly colors: AppPalette;
  readonly reason?: string;
  readonly onViewOriginal?: () => void;
}) {
  return (
    <View style={[styles.tombstone, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Ionicons name="eye-off-outline" size={18} color={colors.text2} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
          Hidden by community moderators
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
          {reason || 'The post itself has not changed — this is a client-side choice you can override.'}
        </Text>
        {onViewOriginal ? (
          <Text
            onPress={onViewOriginal}
            maxFontSizeMultiplier={maxFontScale.label}
            style={[typography.label, { color: colors.ember, marginTop: spacing.xxs }]}
          >
            View original →
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Inline advisory label — additive, never a publish gate (`R5-MODERATION.md`). */
export function LabelBanner({
  colors,
  text,
  reasons,
}: {
  readonly colors: AppPalette;
  readonly text: string;
  readonly reasons?: readonly string[];
}) {
  return (
    <View style={[styles.tombstone, { borderColor: colors.constrained, backgroundColor: colors.surface2 }]}>
      <Ionicons name="information-circle-outline" size={18} color={colors.constrained} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
          {text}
        </Text>
        {reasons && reasons.length > 0 ? (
          <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
            {reasons.join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A key/hash shown in mono with copy affordance — used wherever an identifier must be checkable. */
export function Fingerprint({
  colors,
  value,
  full,
}: {
  readonly colors: AppPalette;
  readonly value: string;
  readonly full?: string;
}) {
  return (
    <Text
      selectable
      accessibilityLabel={full ?? value}
      maxFontSizeMultiplier={maxFontScale.mono}
      style={[typography.mono, { color: colors.text2 }]}
    >
      {value}
    </Text>
  );
}

/** design.md §1.3's hard rule, made visible: a neutral notice when a screen must explain the
 * Forum/Signal separation without displaying both identities together. */
export function PlaneBoundaryNotice({ colors, plane }: { readonly colors: AppPalette; readonly plane: 'forum' | 'signal' }) {
  const accent = plane === 'signal' ? colors.signal : colors.ember;
  return (
    <View style={[styles.tombstone, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Ionicons name="shield-half-outline" size={18} color={accent} />
      <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2, flex: 1 }]}>
        {plane === 'signal'
          ? 'This is your identified Signal identity — kept separate from your pseudonymous Forum identity.'
          : 'This is your pseudonymous Forum identity — kept separate from your identified Signal identity.'}
      </Text>
    </View>
  );
}

/**
 * The vote-control cost ring — design.md §5, VIS-07. A quiet clockwise fill while the client
 * computes the proof-of-work/credit cost of posting anonymously, so the anti-abuse mechanism
 * that already exists in the backend is not invisible in the client.
 */
export function CostRing({
  colors,
  progress,
  size: ringSize = 28,
}: {
  readonly colors: AppPalette;
  /** 0..1, or null when idle (no ring shown). */
  readonly progress: number | null;
  readonly size?: number;
}) {
  if (progress === null) return null;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View
      accessibilityLabel={`Computing proof of work, ${Math.round(clamped * 100)}% complete`}
      style={[
        styles.costRing,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderColor: colors.surface2,
        },
      ]}
    >
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 2,
          borderColor: colors.ember,
          opacity: 0.25 + clamped * 0.75,
        }}
      />
    </View>
  );
}

/** design.md §5 — the composer's honest send-state, reused wherever a write can queue. */
export function QueueStatus({
  colors,
  state,
}: {
  readonly colors: AppPalette;
  readonly state: 'sending' | 'queued' | 'synced' | 'failed';
}) {
  const setting = {
    sending: { color: colors.text2, icon: 'time-outline' as IconName, text: 'Sending…' },
    queued: {
      color: colors.constrained,
      icon: 'time-outline' as IconName,
      text: 'Queued — sends the moment a path opens',
    },
    synced: { color: colors.verified, icon: 'checkmark-circle-outline' as IconName, text: 'Sent' },
    failed: { color: colors.blackout, icon: 'alert-circle-outline' as IconName, text: 'Could not send' },
  }[state];
  return (
    <View style={styles.transport}>
      <Ionicons name={setting.icon} size={14} color={setting.color} />
      <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: setting.color }]}>
        {setting.text}
      </Text>
    </View>
  );
}

/** A small badge for the count of items waiting in the offline outbox. */
export function OutboxBadge({ colors, count }: { readonly colors: AppPalette; readonly count: number }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.outboxBadge, { backgroundColor: colors.constrained }]}>
      <Text maxFontSizeMultiplier={1.2} style={[typography.caption, { color: colors.onAccent, fontSize: 10 }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reach: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    maxWidth: 190,
  },
  seal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexShrink: 1 },
  sealDetail: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xxs,
  },
  transport: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  tombstone: {
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  costRing: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  outboxBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
});
