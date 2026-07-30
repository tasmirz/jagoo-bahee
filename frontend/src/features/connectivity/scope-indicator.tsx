/**
 * Turning a wire scope into something a person can act on (T3.20, TP-20, TG-10).
 *
 * ── Two artefacts, one source ──────────────────────────────────────────────────────
 * `scopeDisplay` feeds the always-visible Reach Pill; `ScopeSheet` is what opens when it is
 * tapped. design.md §4.1: "Tapping it opens a short sheet: what's degraded right now, in
 * plain language — never a status code, always the sentence a person needs to decide what to
 * do next." Both read the same `ScopeStatus`, so the pill and the sheet can never disagree.
 *
 * ── Every scope has its own glyph ──────────────────────────────────────────────────
 * Not decoration. Three of the seven scopes share a tone, so colour alone cannot tell
 * `ISP_LOCAL` from `MESH`; the icon and the label do. That is NFR-A06, and it is also what
 * keeps the pill readable on a cracked screen in sunlight.
 */

import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Button,
  Divider,
  Seal,
  radius,
  spacing,
  type as typography,
  type AppPalette,
  type ReachScopeDisplay,
} from '../../design-system';
import { translate, type Locale } from '../../i18n';
import {
  LINK_CONSEQUENCE_KEY,
  LINK_MESSAGE_KEY,
  SCOPE_CONSEQUENCE_KEY,
  SCOPE_MESSAGE_KEY,
  linkTone,
  scopeTone,
  type LinkScope,
  type ReachabilityScope,
  type ScopeStatus,
} from './scope';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * One glyph per scope, chosen so the shapes are distinguishable at 15 pt and in greyscale.
 * `LAN` is a building, `ISP_LOCAL` a branching network, `NATIONAL` a map, `GLOBAL` a globe:
 * each is literally the extent of the reach it stands for.
 */
export const SCOPE_ICON: Readonly<Record<ReachabilityScope, IconName>> = {
  LAN: 'business-outline',
  ISP_LOCAL: 'git-network-outline',
  NATIONAL: 'map-outline',
  GLOBAL: 'globe-outline',
  MESH: 'bluetooth-outline',
  RETICULUM: 'radio-outline',
  UNREACHABLE: 'cloud-offline-outline',
};

/**
 * One glyph per link state. `LAN` keeps the building, because "same network" means the
 * same physical place; the internet gets the globe; an unresolvable route gets a question
 * rather than borrowing a shape that would imply an answer.
 */
export const LINK_ICON: Readonly<Record<LinkScope, IconName>> = {
  LAN: 'business-outline',
  ISP_LOCAL: 'git-network-outline',
  GLOBAL: 'globe-outline',
  UNKNOWN: 'help-circle-outline',
};

/**
 * What the always-visible pill shows: the LINK, not the node's onward reach.
 *
 * These were the same value until now, which is how a phone on the far side of the
 * internet was told "Same network — nothing you post leaves this building yet". The node's
 * reach is still shown, in the sheet, labelled as what it is.
 */
export function scopeDisplay(
  status: ScopeStatus | null,
  locale: Locale,
): ReachScopeDisplay | null {
  if (!status) return null;
  return {
    label: translate(locale, LINK_MESSAGE_KEY[status.link]),
    tone: linkTone(status.link),
    icon: LINK_ICON[status.link],
    consequence: translate(locale, LINK_CONSEQUENCE_KEY[status.link]),
  };
}

const relative = (locale: Locale, ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return locale === 'bn' ? `${seconds} সেকেন্ড আগে` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return locale === 'bn' ? `${minutes} মিনিট আগে` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return locale === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours}h ago`;
};

/**
 * The sheet behind the pill.
 *
 * Rendered as a plain overlay rather than a platform modal so it works identically on a
 * 320 pt phone and a tablet in split screen, and so it cannot be the thing that fails when
 * everything else is failing.
 */
export function ScopeSheet({
  colors,
  status,
  fromCache,
  locale = 'en',
  onClose,
  onOpenNetwork,
}: {
  readonly colors: AppPalette;
  readonly status: ScopeStatus | null;
  readonly fromCache?: boolean;
  readonly locale?: Locale;
  readonly onClose: () => void;
  readonly onOpenNetwork?: () => void;
}) {
  const display = scopeDisplay(status, locale);
  const tone = status ? linkTone(status.link) : 'critical';
  const accent =
    tone === 'ok' ? colors.verified : tone === 'limited' ? colors.constrained : colors.blackout;
  const reachTone = status ? scopeTone(status.scope) : 'critical';
  const reachAccent =
    reachTone === 'ok'
      ? colors.verified
      : reachTone === 'limited'
        ? colors.constrained
        : colors.blackout;

  return (
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={locale === 'bn' ? 'বন্ধ করুন' : 'Close'}
        onPress={onClose}
        style={styles.backdropPress}
      />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.sheetGrip}>
          <View style={[styles.grip, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[typography.overline, { color: colors.text2 }]}>
          {translate(locale, 'linkTitle')}
        </Text>
        <View style={styles.headline}>
          <Ionicons
            name={display?.icon ?? LINK_ICON.UNKNOWN}
            size={26}
            color={accent}
          />
          <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
            {display?.label ?? translate(locale, 'linkUnknown')}
          </Text>
        </View>

        {/* Plain language, never a status code — design.md §4.1. */}
        <Text style={[typography.bodyLarge, { color: colors.text2 }]}>
          {display?.consequence ?? translate(locale, 'linkUnknownBody')}
        </Text>

        <Divider colors={colors} />

        {/*
          The node's onward reach — a second, genuinely different fact. Shown here rather
          than in the pill because "how far does this server forward my post" is not "am I
          on the same network as it", and presenting one as the other is what made a
          stock node tell every client it was on their LAN.
        */}
        <Text style={[typography.overline, { color: colors.text2 }]}>
          {translate(locale, 'scopeReach')}
        </Text>
        <View style={styles.headline}>
          <Ionicons name={SCOPE_ICON[status?.scope ?? 'UNREACHABLE']} size={20} color={reachAccent} />
          <Text style={[typography.h2, { color: colors.text }]}>
            {translate(locale, SCOPE_MESSAGE_KEY[status?.scope ?? 'UNREACHABLE'])}
          </Text>
        </View>
        <Text style={[typography.body, { color: colors.text2 }]}>
          {translate(locale, SCOPE_CONSEQUENCE_KEY[status?.scope ?? 'UNREACHABLE'])}
        </Text>
        {/*
          Assumed vs measured carries TEXT, not a tint. A person deciding whether a post
          leaves the building must be able to tell a configured claim from a checked one,
          and this is exactly the row that gets read on a washed-out screen.
        */}
        <Text
          style={[
            typography.caption,
            { color: status?.measured ? colors.verified : colors.constrained },
          ]}
        >
          {translate(locale, status?.measured ? 'scopeMeasured' : 'scopeAssumed')}
        </Text>
        {status && !status.measured ? (
          <Text style={[typography.caption, { color: colors.text2 }]}>
            {translate(locale, 'scopeAssumedBody')}
          </Text>
        ) : null}

        <Divider colors={colors} />

        <View style={styles.facts}>
          <Text style={[typography.body, { color: colors.text2 }]}>
            {translate(locale, 'scopeUplinks', {
              up: String(status?.uplinksUp ?? 0),
              total: String(status?.uplinksTotal ?? 0),
            })}
          </Text>
          {status?.bridging ? (
            <View style={styles.factRow}>
              <Ionicons name="swap-horizontal-outline" size={15} color={colors.ember} />
              <Text style={[typography.body, { color: colors.text2 }]}>
                {translate(locale, 'scopeBridging')}
              </Text>
            </View>
          ) : null}
          {/* Honest staleness: a cached answer says so rather than passing for live. */}
          <Seal
            colors={colors}
            state={fromCache ? 'queued' : 'synced'}
            label={`${translate(locale, 'stale', { time: relative(locale, status?.asOfMs ?? 0) })}`}
          />
        </View>

        <View style={styles.actions}>
          {onOpenNetwork ? (
            <Button
              colors={colors}
              label={locale === 'bn' ? 'নেটওয়ার্ক বিবরণ' : 'Network detail'}
              variant="secondary"
              icon="git-network-outline"
              onPress={onOpenNetwork}
            />
          ) : null}
          <Button
            colors={colors}
            label={locale === 'bn' ? 'বন্ধ করুন' : 'Close'}
            variant="ghost"
            onPress={onClose}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 20 },
  backdropPress: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetGrip: { alignItems: 'center', paddingBottom: spacing.xs },
  grip: { width: 40, height: 4, borderRadius: radius.pill },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  facts: { gap: spacing.xs },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { gap: spacing.xs, paddingTop: spacing.xs },
});
