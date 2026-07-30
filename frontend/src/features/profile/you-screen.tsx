import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Fingerprint,
  Page,
  PageHeader,
  Section,
  Seal,
  maxFontScale,
  radius,
  spacing,
  type as typography,
  type AppPalette,
  type ReachState,
  type ThemeMode,
} from '../../design-system';
import { forumSessionSummary, type ForumSessionSummary } from '../../signer';
import type { Locale } from '../../i18n';

interface Row {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly body: string;
  readonly onPress: () => void;
}

/**
 * "You" — replaces the 14-row capability directory (`features/catalog.ts` +
 * `app/feature/[featureId].tsx`) that put identity, moderation, proofs, node operations, and
 * instance administration behind one undifferentiated list (root cause #9). Saved and
 * Notifications now have real routes; the remaining rows link to their dedicated destinations.
 */
export function YouScreen({
  colors,
  mode,
  reach,
  locale,
  onOpenNetwork,
  onLocaleChange,
  onThemeChange,
  onOpenSaved,
  onOpenNotifications,
  onOpenIdentity,
  onOpenProofs,
  onOpenOperator,
  onSignOut,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly reach: ReachState;
  readonly locale: Locale;
  readonly onOpenNetwork: () => void;
  readonly onLocaleChange: () => void;
  readonly onThemeChange: () => void;
  readonly onOpenSaved: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenIdentity: () => void;
  readonly onOpenProofs: () => void;
  /** Absent entirely for a non-operator — hidden, not a fake/disabled control (Plan 12 §7.1). */
  readonly onOpenOperator?: () => void;
  readonly onSignOut: () => void;
}) {
  const [session, setSession] = useState<ForumSessionSummary | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  useEffect(() => {
    void forumSessionSummary().then(setSession);
  }, []);

  const rows: readonly Row[] = [
    { icon: 'bookmark-outline', title: 'Saved', body: 'Posts and comments you saved for later.', onPress: onOpenSaved },
    { icon: 'notifications-outline', title: 'Notifications', body: 'Replies, mentions, awards, and moderation activity.', onPress: onOpenNotifications },
    { icon: 'key-outline', title: 'Identity & security', body: 'Recovery phrase, certificates, lock state, and revocation.', onPress: onOpenIdentity },
    { icon: 'shield-checkmark-outline', title: 'Proofs & audit trail', body: 'Every signed action, with its inclusion proof.', onPress: onOpenProofs },
    { icon: 'globe-outline', title: 'Network & home server', body: 'Reach, federation, mesh, and the selected server.', onPress: onOpenNetwork },
    ...(onOpenOperator
      ? [{ icon: 'construct-outline' as const, title: 'Operator console', body: 'Admin, security, federation, and transport controls for this node.', onPress: onOpenOperator }]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader colors={colors} mode={mode} title="You" reach={reach} onReach={onOpenNetwork} />
      <Page colors={colors}>
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: colors.ember }]}>
            <Ionicons name="person-outline" size={28} color={colors.onAccent} />
          </View>
          {session?.identityId ? (
            <Fingerprint colors={colors} value={`${session.identityId.slice(0, 20)}…`} full={session.identityId} />
          ) : (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
              {session?.configured ? 'Identity locked on this device' : 'No identity configured yet'}
            </Text>
          )}
          <Seal
            colors={colors}
            label={session?.unlocked ? 'key vault unlocked' : 'key vault protected'}
            state={session?.unlocked ? 'synced' : 'queued'}
          />
        </View>

        <Section title="Your space" colors={colors}>
          {rows.map((row) => (
            <Pressable key={row.title} accessibilityRole="button" onPress={row.onPress} style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
                <Ionicons name={row.icon} size={19} color={colors.ember} />
              </View>
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>{row.title}</Text>
                <Text numberOfLines={2} maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>{row.body}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text2} />
            </Pressable>
          ))}
        </Section>

        <Section title="App" colors={colors}>
          <Pressable accessibilityRole="button" onPress={onLocaleChange} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="language-outline" size={19} color={colors.ember} />
            </View>
            <View style={styles.flex}>
              <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>Language</Text>
              <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>{locale === 'bn' ? 'বাংলা' : 'English'} · tap to switch</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onThemeChange} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
              <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={19} color={colors.ember} />
            </View>
            <View style={styles.flex}>
              <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>Appearance</Text>
              <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>{mode === 'dark' ? 'Dark' : 'Light'} · tap to switch</Text>
            </View>
          </Pressable>
        </Section>

        {/*
          Sign out locks the vault and remembers that it is locked; it deletes nothing. The
          confirmation exists because "keeps your identity" is the part people cannot verify
          from the button alone, and getting that wrong on a device that holds the only copy
          of a key is not a recoverable mistake. Removing the identity for real lives behind
          Identity & security, where the recovery phrase is in front of you.
        */}
        <Section title="Session" colors={colors}>
          {confirmingSignOut ? (
            <View style={styles.confirm}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
                Your recovery phrase, keys, and home server stay on this device. You can sign
                back in with your app password — or your phrase if you set no password.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmingSignOut(false)}
                  style={[styles.confirmButton, { borderColor: colors.border }]}
                >
                  <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onSignOut}
                  style={[styles.confirmButton, { borderColor: colors.blackout, backgroundColor: colors.blackout }]}
                >
                  <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.onAccent }]}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmingSignOut(true)}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
                <Ionicons name="log-out-outline" size={19} color={colors.ember} />
              </View>
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>Sign out</Text>
                <Text numberOfLines={2} maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
                  Locks this device. Your identity and recovery phrase stay here.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text2} />
            </Pressable>
          )}
        </Section>
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  // Gutter-free by contract — `Page` owns the screen's inline inset.
  hero: { paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.xs },
  avatar: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  row: {
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  confirm: { gap: spacing.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
