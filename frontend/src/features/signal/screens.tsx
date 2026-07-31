import Ionicons from '@expo/vector-icons/Ionicons';
import { DeliveryState, VouchLevel } from '@jagoo/sdk/proto';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppPalette, ReachState, ThemeMode } from '../../design-system';
import {
  ActionProgress,
  Button,
  Card,
  Disclosure,
  EmptyState,
  Fingerprint,
  Page,
  PageHeader,
  PasswordField,
  Pill,
  Row,
  SectionHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatusBanner,
  TextAreaField,
  TextField,
} from '../../design-system';
import { maxFontScale, radius, spacing, type as typography } from '../../design-system';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PeoplePicker } from './people-picker';
import { loadSignalContacts, type SignalContact } from './contacts';
import { encodeSignalIdentityCard } from './identity-card';
import { clearSignalBackupOwed, isSignalBackupOwed } from './storage';
import {
  deleteSignalChat,
  loadDeletedSignalChats,
  loadOutgoingSignalMessages,
  recordOutgoingSignalMessage,
  type OutgoingSignalMessage,
} from './outgoing';
import { listOutbox } from '../../offline/outbox';
import {
  clearKillswitchPassphrase,
  isKillswitchConfigured,
  isKillswitchPassphrase,
  setKillswitchPassphrase,
  triggerKillswitch,
} from '../../security/killswitch';
import { useAsyncAction } from '../../hooks/use-async-action';
import { useNodeDocument, type NodePage } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import {
  authenticateSignalIdentity,
  continueSignalSession,
  createSecureSignalGroup,
  createSignalIdentity,
  declareSignalChannel,
  importSignalIdentity,
  panicSignal,
  loadSignalInbox,
  loadSignalMessages,
  publishMissingPerson,
  ownedSignalChannels,
  publishSignalBroadcast,
  publishSignalCheckIn,
  publishSignalPrekeys,
  publishSignalDeliveryReceipt,
  publishSignalPushSubscription,
  publishSignalResource,
  revokeSignalBroadcast,
  revokeSignalKey,
  registerSignalIdentity,
  retireSignalChannel,
  rotateOwnedSignalChannel,
  signalSessionSummary,
  signalSessionRequest,
  startSignalSession,
  updateSecureSignalGroup,
  updateOwnedSignalChannel,
  vouchSignalChannel,
  revealSignalRecoveryPhrase,
  unlockSignalIdentity,
  verifySignalQrFingerprint,
  type SignalSessionSummary,
  type DecryptedSignalSession,
  type DecryptedSignalMessage,
} from '../../signer/signal';
import {
  acknowledgeSignalAlert,
  acknowledgedSignalAlerts,
  isSignalFingerprintVerified,
  isSignalPushEnabled,
  loadSignalSubscriptions,
  markSignalFingerprintVerified,
  markSignalPushEnabled,
  saveSignalSubscription,
  subscriptionAllows,
  type LocalSignalSubscription,
  type SignalArea,
} from './storage';

interface SignalScreenProps {
  readonly colors: AppPalette;
  /** Required: `PageHeader` renders a frosted surface that must match the active theme. */
  readonly mode: ThemeMode;
  readonly homeNode: HomeNode;
  readonly reach: ReachState;
  readonly onNetwork: () => void;
  /** Root cause #1 — every pushed Signal screen previously had no back control at all. */
  readonly onBack?: () => void;
}

export interface SignalChannel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currentSigningKey: string;
  readonly language: string;
  readonly confusableWith: readonly string[];
  readonly verification: 'unverified' | 'known' | 'verified' | 'endorsed' | 'disputed';
  readonly lastSequence: string;
  readonly retiredAtMs: number | null;
}

export interface SignalBroadcast {
  readonly id: string;
  readonly channel: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly severity: number;
  readonly category: number;
  readonly headline: string;
  readonly detail: string;
  readonly area: SignalArea | null;
  readonly expiresAtMs: number;
  readonly language: string;
  readonly verification: SignalChannel['verification'];
  readonly createdAtMs: number;
  readonly revokedAtMs: number | null;
  readonly revokeNote: string;
  readonly gap: { readonly from: string; readonly to: string } | null;
}

interface SignalCheckIn {
  readonly id: string;
  readonly authorKey: string;
  readonly status: number;
  readonly area: SignalArea | null;
  readonly note: string;
  readonly createdAtMs: number;
}

interface SignalResource {
  readonly id: string;
  readonly kind: number;
  readonly state: number;
  readonly area: SignalArea | null;
  readonly detail: string;
  readonly reportedAtMs: number;
}

interface SignalGroupDocument {
  readonly id: string;
  readonly name: string;
  readonly adminKey: string;
  readonly memberKeys: readonly string[];
  readonly updatedAtMs: number;
}

const severity = {
  1: { label: 'Information', icon: 'information-circle-outline' as const, tone: 'neutral' as const },
  2: { label: 'Advisory', icon: 'navigate-circle-outline' as const, tone: 'neutral' as const },
  3: { label: 'Warning', icon: 'warning-outline' as const, tone: 'warning' as const },
  4: { label: 'Critical', icon: 'alert-circle' as const, tone: 'danger' as const },
} as const;

const defaultSubscription = (channel: string): LocalSignalSubscription => ({
  channel,
  alertCritical: true,
  alertWarning: true,
  alertAdvisory: true,
  alertInfo: false,
  areaFilter: null,
  categoryFilter: [],
  mutedUntilMs: 0,
});

/**
 * Adapter onto the shared form fields.
 *
 * This file used to render its own `TextInput` with local border, radius and label styles, so
 * every Signal input looked subtly unlike the same input on a Forum screen — different label
 * weight, different focus treatment, no character counter, and a password field with no
 * reveal control. `design-system/forms` already solves all of that once.
 *
 * Kept as a thin adapter rather than rewriting all 34 call sites: the mapping from
 * `multiline`/`secureTextEntry` to the right shared component is exactly what an adapter is
 * for, and doing it here means no call site can pick the wrong one.
 */
function Field({
  colors,
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
  hint,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly secureTextEntry?: boolean;
  readonly keyboardType?: 'default' | 'number-pad';
  readonly hint?: string;
}) {
  if (secureTextEntry) {
    // PasswordField adds the show/hide control the local input never had — typing a long
    // passphrase blind on a phone keyboard is how people get locked out of their own vault.
    return (
      <PasswordField
        colors={colors}
        hint={hint}
        label={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        value={value}
      />
    );
  }
  if (multiline) {
    return (
      <TextAreaField
        colors={colors}
        hint={hint}
        label={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        value={value}
      />
    );
  }
  return (
    <TextField
      colors={colors}
      hint={hint}
      keyboardType={keyboardType}
      label={label}
      onChangeText={onChangeText}
      placeholder={placeholder}
      value={value}
    />
  );
}

/**
 * Every secondary Signal destination, as one grid.
 *
 * They used to be three different shapes in three places — a full-width button, a three-tile
 * rail and a two-button row — which is most of what "scattered" meant. One grid of equal
 * tiles says these are peers and none of them is the reason you came. Tiles wrap, so the
 * layout is the same at any width and at any font scale.
 */
function SignalActions({
  colors,
  onChannels,
  onCheckIn,
  onMap,
  onIdentity,
  onMesh,
}: {
  readonly colors: AppPalette;
  readonly onChannels: () => void;
  readonly onCheckIn: () => void;
  readonly onMap: () => void;
  readonly onIdentity: () => void;
  readonly onMesh: () => void;
}) {
  const tiles: readonly [IconName, string, () => void][] = [
    ['people-outline', 'Channels', onChannels],
    ['hand-left-outline', 'Check in', onCheckIn],
    ['map-outline', 'Area map', onMap],
    ['qr-code-outline', 'Your code', onIdentity],
    ['radio-outline', 'Radio (LXMF)', onMesh],
  ];
  return (
    <View style={styles.actionGrid}>
      {tiles.map(([icon, label, action]) => (
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          key={label}
          onPress={action}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name={icon} color={colors.signal} size={22} />
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.15}
            minimumFontScale={0.85}
            numberOfLines={2}
            style={[typography.label, styles.actionLabel, { color: colors.text }]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** "4m ago" / "2h ago" — an alert's age is what a person judges it by, not a wall clock. */
function ago(atMs: number, nowMs = Date.now()): string {
  const minutes = Math.max(0, Math.round((nowMs - atMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/**
 * One alert, readable at a glance.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────────────
 * The card led with `SEVERITY  #17  14:32:07` — a sequence number and a wall-clock time to
 * the second, which is broadcaster bookkeeping, not what someone deciding whether to move
 * their family needs. The headline came third. Below it, a sequence gap and a retraction were
 * each rendered as a nested `StatusBanner`: a bordered card inside a bordered card inside a
 * scrolling list of bordered cards, which is the "scattered" reading — nothing established
 * which box was the alert and which was a note about it.
 *
 * ── What it is now ─────────────────────────────────────────────────────────────────
 * Severity, channel and age on one quiet meta line; the headline dominant; the detail under
 * it. Notes about the alert are inline rows sharing the card's surface, so the card stays one
 * object. The whole card opens the channel, so "View channel" stops competing with the only
 * action that ever matters here — acknowledging a critical alert.
 *
 * Severity carries its word AND its glyph, never colour alone (NFR-A06), and the left edge
 * repeats it so a column of alerts is scannable without reading any of them.
 */
function AlertCard({
  broadcast,
  channelName,
  colors,
  acknowledged,
  onAcknowledge,
  onChannel,
}: {
  readonly broadcast: SignalBroadcast;
  readonly channelName?: string;
  readonly colors: AppPalette;
  readonly acknowledged: boolean;
  readonly onAcknowledge: () => void;
  readonly onChannel: () => void;
}) {
  const setting = severity[broadcast.severity as keyof typeof severity] ?? severity[1];
  const accent =
    setting.tone === 'danger'
      ? colors.blackout
      : setting.tone === 'warning'
        ? colors.constrained
        : colors.signal;
  const needsAcknowledgement = broadcast.severity === 4 && !acknowledged;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${setting.label} from ${channelName ?? 'a channel'}: ${broadcast.headline}`}
      accessibilityHint="Opens the channel that published this"
      onPress={onChannel}
      style={({ pressed }) => [styles.alertPress, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Card colors={colors} style={{ ...styles.alert, borderLeftColor: accent }}>
        <View style={styles.alertMeta}>
          <Ionicons name={setting.icon} size={16} color={accent} />
          <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: accent }]}>
            {setting.label}
          </Text>
          <Text style={[typography.caption, { color: colors.text3 }]}>·</Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.caption}
            style={[typography.caption, styles.flex, { color: colors.text2 }]}
          >
            {channelName ?? `${broadcast.channel.slice(0, 14)}…`}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text3 }]}>
            {ago(broadcast.createdAtMs)}
          </Text>
        </View>

        <Text maxFontSizeMultiplier={maxFontScale.h2} style={[typography.h2, { color: colors.text }]}>
          {broadcast.headline}
        </Text>
        {broadcast.detail ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
            {broadcast.detail}
          </Text>
        ) : null}

        {/* Notes ABOUT the alert, on the alert's own surface — not cards within a card. */}
        {broadcast.revokedAtMs ? (
          <View style={styles.alertNote}>
            <Ionicons name="return-down-back-outline" size={15} color={colors.blackout} />
            <Text style={[typography.caption, styles.flex, { color: colors.blackout }]}>
              Retracted by the broadcaster — kept visible.{' '}
              {broadcast.revokeNote || 'No reason was given.'}
            </Text>
          </View>
        ) : null}
        {broadcast.gap ? (
          <View style={styles.alertNote}>
            <Ionicons name="cut-outline" size={15} color={colors.constrained} />
            <Text style={[typography.caption, styles.flex, { color: colors.constrained }]}>
              {broadcast.gap.from === broadcast.gap.to
                ? `Broadcast ${broadcast.gap.from} never reached you.`
                : `Broadcasts ${broadcast.gap.from}–${broadcast.gap.to} never reached you.`}
            </Text>
          </View>
        ) : null}

        {needsAcknowledgement ? (
          <Button
            colors={colors}
            icon="checkmark-circle-outline"
            label="Acknowledge"
            onPress={onAcknowledge}
            system="signal"
          />
        ) : null}
      </Card>
    </Pressable>
  );
}

export function SignalHomeScreen({
  colors,
  mode,
  homeNode,
  reach,
  onNetwork,
  onChannels,
  onCheckIn,
  onMap,
  onIdentity,
  onMessages,
  onMesh,
  onChannel,
}: SignalScreenProps & {
  readonly onChannels: () => void;
  readonly onCheckIn: () => void;
  readonly onMap: () => void;
  readonly onIdentity: () => void;
  readonly onMessages: () => void;
  readonly onMesh: () => void;
  readonly onChannel: (channel: string) => void;
}) {
  const query = useNodeDocument<NodePage<SignalBroadcast>>(
    homeNode.baseUrl,
    '/v1/signal/broadcasts?limit=200',
    { refetchInterval: 10_000 },
  );
  const [subscriptions, setSubscriptions] = useState<readonly LocalSignalSubscription[]>([]);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    void Promise.all([loadSignalSubscriptions(), acknowledgedSignalAlerts()]).then(
      ([savedSubscriptions, savedAcknowledged]) => {
        setSubscriptions(savedSubscriptions);
        setAcknowledged(savedAcknowledged);
      },
    );
  }, []);
  const rows = query.data?.value.items ?? [];
  const visible = useMemo(
    () =>
      rows.filter((row) => subscriptionAllows(row, subscriptions, Date.now())),
    [rows, subscriptions],
  );
  const ordered = [...visible].sort((left, right) => {
    const leftPinned = left.severity === 4 && !acknowledged.has(left.id) ? 1 : 0;
    const rightPinned = right.severity === 4 && !acknowledged.has(right.id) ? 1 : 0;
    return rightPinned - leftPinned || right.createdAtMs - left.createdAtMs;
  });

  const acknowledge = async (id: string) => {
    await acknowledgeSignalAlert(id);
    setAcknowledged(new Set([...acknowledged, id]));
  };

  // Channel names for the alert meta line. The broadcast carries only an ID, and an ID is
  // not who is speaking — which is the one thing this plane exists to make legible.
  const channelQuery = useNodeDocument<NodePage<SignalChannel>>(
    homeNode.baseUrl,
    '/v1/signal/channels?limit=200',
  );
  const channelNames = useMemo(
    () =>
      new Map((channelQuery.data?.value.items ?? []).map((item) => [item.id, item.name] as const)),
    [channelQuery.data],
  );

  const urgent = ordered.filter(
    (item) => item.severity === 4 && !acknowledged.has(item.id),
  ).length;

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title="Signal" onReach={onNetwork} />
      <Page colors={colors}>
        {/*
          ── The order of this screen is the design ────────────────────────────────────
          Alerts used to begin below a hero paragraph, a full-width Messages button, a
          three-tile rail and two more buttons: five navigation surfaces and a sentence of
          product copy before the first thing anyone opened this tab to see. On a 320 pt
          phone that is a full screen of scrolling to answer "is anything wrong?".

          Now: one line that answers that question, then the alerts, then everywhere else.
          The hero is gone — the header already says "Signal", and a person under a shutdown
          does not need to be told what the app is every time they check it.
        */}
        <View style={[styles.pulse, { borderColor: urgent > 0 ? colors.blackout : colors.border }]}>
          <Ionicons
            color={urgent > 0 ? colors.blackout : colors.signal}
            name={urgent > 0 ? 'alert-circle' : 'radio-outline'}
            size={22}
          />
          <View style={styles.flex}>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={maxFontScale.label}
              style={[typography.label, { color: urgent > 0 ? colors.blackout : colors.text }]}
            >
              {urgent > 0
                ? `${urgent} critical alert${urgent === 1 ? '' : 's'} need you`
                : ordered.length > 0
                  ? `${ordered.length} alert${ordered.length === 1 ? '' : 's'}`
                  : 'No alerts right now'}
            </Text>
            <Text
              maxFontSizeMultiplier={maxFontScale.caption}
              style={[typography.caption, { color: colors.text2 }]}
            >
              {subscriptions.length === 0
                ? 'You are following no channels yet.'
                : `Listening on ${subscriptions.length} channel${subscriptions.length === 1 ? '' : 's'}.`}
            </Text>
          </View>
          {/* Messaging stays reachable in one tap from the top of the tab. */}
          <Button
            colors={colors}
            icon="chatbubbles-outline"
            label="Messages"
            onPress={onMessages}
            system="signal"
            variant="secondary"
          />
        </View>

        {query.isError ? (
          <StatusBanner
            action="Retry"
            body="Saved alerts remain available while this node is unreachable."
            colors={colors}
            icon="cloud-offline-outline"
            onAction={() => void query.refetch()}
            title="Could not refresh Signal"
            tone="warning"
          />
        ) : null}
        {query.isLoading ? (
          <View style={styles.loadingStack}>
            <Skeleton colors={colors} height={92} />
            <Skeleton colors={colors} height={92} />
          </View>
        ) : ordered.length === 0 ? (
          /*
            One empty state, not an empty state plus a separate banner about filters. Which
            of the two reasons applies decides the words and the action, so a person is told
            what to do rather than shown two boxes and left to work out which is theirs.
          */
          <EmptyState
            action={subscriptions.length === 0 ? 'Find channels' : undefined}
            body={
              subscriptions.length === 0
                ? 'Follow a channel and its signed broadcasts arrive here. Who you follow is stored only on this device.'
                : 'Nothing has matched your filters yet. This screen keeps working with the network gone.'
            }
            colors={colors}
            icon="radio-outline"
            onAction={subscriptions.length === 0 ? onChannels : undefined}
            system="signal"
            title={subscriptions.length === 0 ? 'Follow a channel to begin' : 'Listening quietly'}
          />
        ) : (
          ordered.map((broadcast) => (
            <AlertCard
              acknowledged={acknowledged.has(broadcast.id)}
              broadcast={broadcast}
              {...(channelNames.get(broadcast.channel)
                ? { channelName: channelNames.get(broadcast.channel) }
                : {})}
              colors={colors}
              key={broadcast.id}
              onAcknowledge={() => void acknowledge(broadcast.id)}
              onChannel={() => onChannel(broadcast.channel)}
            />
          ))
        )}

        {/* Everything else, below the content it used to sit on top of. */}
        <SectionHeader colors={colors} title="Signal tools" />
        <SignalActions
          colors={colors}
          onChannels={onChannels}
          onCheckIn={onCheckIn}
          onIdentity={onIdentity}
          onMap={onMap}
          onMesh={onMesh}
        />
      </Page>
    </View>
  );
}

export function SignalChannelsScreen({
  colors,
  mode,
  homeNode,
  reach,
  onNetwork,
  onBack,
  onChannel,
  onStudio,
}: SignalScreenProps & {
  readonly onChannel: (channel: string) => void;
  readonly onStudio: (options?: { readonly channel?: string }) => void;
}) {
  const [queryText, setQueryText] = useState('');
  const query = useNodeDocument<NodePage<SignalChannel>>(
    homeNode.baseUrl,
    `/v1/signal/channels?q=${encodeURIComponent(queryText)}&limit=100`,
  );
  /*
    Two different relationships to a channel, which the screen used to flatten into one.

    "Create or publish" sat under the search box as a single primary button doing three jobs
    behind it, and the list below mixed the channels you speak FOR with the channels you
    listen TO — so the screen could not answer either "where do I publish?" or "who else is
    out there?". Ownership is local knowledge: the vault's channel map is exactly the set
    this device can sign for, and it is the same set the node enforces.
  */
  const [owned, setOwned] = useState<readonly string[]>([]);
  useEffect(() => {
    void ownedSignalChannels().then(setOwned);
  }, []);
  const rows = query.data?.value.items ?? [];
  const yours = rows.filter((channel) => owned.includes(channel.id));
  const discovered = rows.filter((channel) => !owned.includes(channel.id));
  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title="Channels" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
        {/* ── Yours: the publishing surface ─────────────────────────────────────── */}
        <SectionHeader colors={colors} title="Your channels" />
        {yours.length === 0 ? (
          <EmptyState
            action="Create a channel"
            body="A channel is declared once. After that you publish to it from here, and only this device can sign for it."
            colors={colors}
            icon="megaphone-outline"
            onAction={() => onStudio()}
            system="signal"
            title="You broadcast on no channel yet"
          />
        ) : (
          <>
            <View style={styles.rowGroup}>
              {yours.map((channel) => (
                <View key={channel.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${channel.name}`}
                    onPress={() => onChannel(channel.id)}
                    style={styles.listRowMain}
                  >
                    <View style={[styles.channelAvatar, { backgroundColor: colors.surface2 }]}>
                      <Ionicons name="megaphone-outline" color={colors.signal} size={22} />
                    </View>
                    <View style={styles.listRowBody}>
                      <Text numberOfLines={1} style={[typography.label, { color: colors.text }]}>
                        {channel.name}
                      </Text>
                      <Text style={[typography.caption, { color: colors.text2 }]}>
                        {channel.lastSequence === '0'
                          ? 'Nothing published yet'
                          : `${channel.lastSequence} published`}
                      </Text>
                    </View>
                  </Pressable>
                  {/* The repeat action, on the thing it acts on. */}
                  <Button
                    colors={colors}
                    icon="send-outline"
                    label="Publish"
                    onPress={() => onStudio({ channel: channel.id })}
                    system="signal"
                  />
                </View>
              ))}
            </View>
            {/*
              Declaring is a once-per-channel act, so it is a quiet secondary control here
              rather than the primary button it used to be for everyone for ever.
            */}
            <Button
              colors={colors}
              icon="add-circle-outline"
              label="Create another channel"
              onPress={() => onStudio()}
              variant="ghost"
              system="signal"
            />
          </>
        )}

        {/* ── Everyone else: the listening surface ──────────────────────────────── */}
        <SectionHeader colors={colors} title="Discover" />
        <Field colors={colors} label="Find a broadcaster" onChangeText={setQueryText} value={queryText} />
        {discovered.length > 0 ? (
          <View style={styles.rowGroup}>
            {discovered.map((channel) => (
              <Pressable
                accessibilityRole="button"
                key={channel.id}
                onPress={() => onChannel(channel.id)}
                style={({ pressed }) => [
                  styles.listRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 },
                ]}
              >
                <View style={[styles.channelAvatar, { backgroundColor: colors.surface2 }]}>
                  <Ionicons name="radio-outline" color={colors.signal} size={22} />
                </View>
                <View style={styles.listRowBody}>
                  <Row gap={spacing.xs} wrap>
                    <Text numberOfLines={1} style={[typography.label, { color: colors.text }]}>
                      {channel.name}
                    </Text>
                    <Pill colors={colors} label={channel.verification} />
                  </Row>
                  <Text numberOfLines={2} style={[typography.caption, { color: colors.text2 }]}>
                    {channel.description}
                  </Text>
                  {channel.confusableWith.length > 0 ? (
                    <Text style={[typography.caption, { color: colors.constrained }]}>
                      Similar-looking name — verify the fingerprint
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" color={colors.text2} size={18} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {!query.isLoading && discovered.length === 0 ? (
          <EmptyState
            body={
              queryText.trim()
                ? 'No channel here matches that. Discovery only reaches servers yours has heard of.'
                : 'Connected nodes have not announced an identified channel yet.'
            }
            colors={colors}
            icon="search-outline"
            system="signal"
            title="Nothing to follow yet"
          />
        ) : null}
      </Page>
    </View>
  );
}

function hexToBase64(value: string): string {
  const bytes = value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  return globalThis.btoa(String.fromCharCode(...bytes));
}

export function SignalChannelScreen({
  channelId,
  colors,
  mode,
  homeNode,
  reach,
  onNetwork,
  onBack,
}: SignalScreenProps & { readonly channelId: string }) {
  const channelQuery = useNodeDocument<SignalChannel>(
    homeNode.baseUrl,
    `/v1/signal/channels/${encodeURIComponent(channelId)}`,
  );
  const broadcastsQuery = useNodeDocument<NodePage<SignalBroadcast>>(
    homeNode.baseUrl,
    `/v1/signal/broadcasts?channel=${encodeURIComponent(channelId)}&limit=100`,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [personallyVerified, setPersonallyVerified] = useState(false);
  const [scannedFingerprint, setScannedFingerprint] = useState('');
  const [verifyScanning, setVerifyScanning] = useState(false);
  const [verifyPermission, requestVerifyPermission] = useCameraPermissions();
  const [notice, setNotice] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [trustBasis, setTrustBasis] = useState('');
  const [retireNote, setRetireNote] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [rotationConfirm, setRotationConfirm] = useState('');
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const channel = channelQuery.data?.value;
  useEffect(() => {
    void loadSignalSubscriptions().then((items) =>
      setSubscribed(items.some((item) => item.channel === channelId)),
    );
    void isSignalPushEnabled(channelId).then(setPushEnabled);
  }, [channelId]);
  useEffect(() => {
    if (!channel) return;
    void isSignalFingerprintVerified(channel.currentSigningKey).then(setPersonallyVerified);
  }, [channel]);

  const verify = async (scanned = scannedFingerprint) => {
    if (!channel) return;
    if (!verifySignalQrFingerprint(Uint8Array.from(channel.currentSigningKey.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []), scanned)) {
      setNotice('Fingerprint does not match this channel. Do not trust the claim.');
      return;
    }
    await markSignalFingerprintVerified(channel.currentSigningKey);
    setPersonallyVerified(true);
    setNotice('Personally verified on this device. Nothing was sent to the server.');
  };

  const togglePush = async () => {
    setPushBusy(true);
    setNotice('');
    try {
      const next = !pushEnabled;
      await publishSignalPushSubscription(
        homeNode.baseUrl,
        channelId,
        next,
        homeNode.discovery.services.auditLogs,
      );
      await markSignalPushEnabled(channelId, next);
      setPushEnabled(next);
      setNotice(
        next
          ? 'Push is enabled. This home node can now see your device delivery token.'
          : 'Push is disabled and the token projection was removed from this home node.',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update push delivery');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title={channel?.name ?? 'Channel'} onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
      {channel ? (
        <>
          <View style={styles.hero}>
            <View style={[styles.channelAvatarLarge, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="radio-outline" color={colors.signal} size={30} />
            </View>
            <View style={styles.heroText}>
              <Text style={[typography.h1, { color: colors.text }]}>{channel.name}</Text>
              <Text style={[typography.body, { color: colors.text2 }]}>{channel.description}</Text>
            </View>
          </View>
          <Row gap={spacing.xs} wrap>
            <Pill colors={colors} label={personallyVerified ? 'personally verified' : channel.verification} />
            <Pill colors={colors} label={channel.language.toUpperCase()} />
          </Row>
          {channel.confusableWith.length > 0 ? (
            <StatusBanner
              body="Another channel has a visually similar name. Compare the fingerprint in person."
              colors={colors}
              icon="warning-outline"
              title="Confusable name detected"
              tone="warning"
            />
          ) : null}
          <Button
            colors={colors}
            label={subscribed ? 'Update local filters' : 'Subscribe on this device'}
            onPress={() =>
              void saveSignalSubscription(defaultSubscription(channel.id)).then(() => setSubscribed(true))
            }
            system="signal"
          />
          <StatusBanner
            body="Local filters stay private. Push is different: enabling it reveals this channel subscription and a device delivery token to your selected home node."
            colors={colors}
            icon="notifications-outline"
            title="Optional server-visible push"
            tone="warning"
          />
          <Button
            colors={colors}
            disabled={pushBusy}
            label={
              pushBusy
                ? 'Updating push…'
                : pushEnabled
                  ? 'Disable server push'
                  : 'Enable server push'
            }
            onPress={() => void togglePush()}
            system="signal"
            variant="secondary"
          />
          <SectionHeader colors={colors} title="In-person verification" />
          <Fingerprint colors={colors} full={channel.currentSigningKey} value={channel.currentSigningKey.match(/.{1,4}/g)?.join(' ') ?? channel.currentSigningKey} />
          {/*
            This asked the user to READ a base64 fingerprint off another device and TYPE it
            in, on the screen whose entire purpose is confirming an identity in person —
            while `verifySignalQrFingerprint` was written to receive a scan and a working
            camera scanner already existed elsewhere in the app. Typing stays as the fallback
            for a device with no camera, or a fingerprint that arrived on paper.
          */}
          <Button
            colors={colors}
            icon="camera-outline"
            label={verifyScanning ? 'Stop scanning' : 'Scan their code'}
            onPress={() =>
              void (verifyScanning
                ? setVerifyScanning(false)
                : verifyPermission?.granted
                  ? setVerifyScanning(true)
                  : requestVerifyPermission().then((result) => setVerifyScanning(result.granted)))
            }
            system="signal"
          />
          {verifyScanning ? (
            <View style={styles.scanner}>
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(result) => {
                  setVerifyScanning(false);
                  setScannedFingerprint(result.data);
                  void verify(result.data);
                }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          ) : null}
          <Disclosure colors={colors} title="Type it instead">
            <Field
              colors={colors}
              label="Fingerprint from their device (base64)"
              onChangeText={setScannedFingerprint}
              placeholder={hexToBase64(channel.currentSigningKey)}
              value={scannedFingerprint}
            />
            <Button colors={colors} label="Verify locally" onPress={() => void verify()} variant="secondary" system="signal" />
          </Disclosure>
          <SectionHeader colors={colors} title="Trust & lifecycle" action={lifecycleOpen ? 'Close' : 'Manage'} onAction={() => setLifecycleOpen((value) => !value)} />
          {lifecycleOpen ? (
            <Card colors={colors} style={styles.lifecycle}>
              <Text style={[typography.label, { color: colors.text }]}>Owned channel details</Text>
              <Field colors={colors} label="Channel name" onChangeText={setChannelName} placeholder={channel.name} value={channelName} />
              <Field colors={colors} label="Description" multiline onChangeText={setChannelDescription} placeholder={channel.description} value={channelDescription} />
              <Button
                colors={colors}
                disabled={lifecycleBusy || (!channelName.trim() && !channelDescription.trim())}
                label={lifecycleBusy ? 'Signing update…' : 'Update channel'}
                onPress={() => {
                  setLifecycleBusy(true);
                  void updateOwnedSignalChannel(
                    homeNode.baseUrl,
                    {
                      channel: channel.id,
                      name: channelName.trim() || channel.name,
                      description: channelDescription.trim() || channel.description,
                      language: channel.language,
                    },
                    homeNode.discovery.services.auditLogs,
                  )
                    .then(async () => {
                      setNotice('Channel update signed and queued.');
                      setChannelName('');
                      setChannelDescription('');
                      await channelQuery.refetch();
                    })
                    .catch((error: Error) => setNotice(error.message))
                    .finally(() => setLifecycleBusy(false));
                }}
                system="signal"
                variant="secondary"
              />
              <Text style={[typography.label, { color: colors.text }]}>Vouch for this channel</Text>
              <Field colors={colors} label="How do you know this channel?" multiline onChangeText={setTrustBasis} value={trustBasis} />
              <Button
                colors={colors}
                disabled={lifecycleBusy || !trustBasis.trim()}
                label={lifecycleBusy ? 'Signing trust statement…' : 'Publish vouch'}
                onPress={() => {
                  setLifecycleBusy(true);
                  void vouchSignalChannel(
                    homeNode.baseUrl,
                    { channel: channel.id, level: VouchLevel.VOUCH_LEVEL_KNOWN, basis: trustBasis, asserted_at_ms: BigInt(Date.now()) },
                    homeNode.discovery.services.auditLogs,
                  )
                    .then(() => setNotice('Vouch signed and queued. Trust remains evidence, not a universal verification badge.'))
                    .catch((error: Error) => setNotice(error.message))
                    .finally(() => setLifecycleBusy(false));
                }}
                system="signal"
                variant="secondary"
              />
              <Text style={[typography.label, { color: colors.text }]}>Rotate an owned channel key</Text>
              <Text style={[typography.caption, { color: colors.text2 }]}>
                Rotation is signed by the current channel key. Subscribers retain continuity while the vault adopts a fresh signing key.
              </Text>
              <Field colors={colors} label='Type "ROTATE" to confirm' onChangeText={setRotationConfirm} value={rotationConfirm} />
              <Button
                colors={colors}
                disabled={lifecycleBusy || rotationConfirm !== 'ROTATE'}
                label="Rotate channel keys"
                onPress={() => {
                  setLifecycleBusy(true);
                  void rotateOwnedSignalChannel(
                    homeNode.baseUrl,
                    channel.id,
                    homeNode.discovery.services.auditLogs,
                  )
                    .then(() => {
                      setNotice('Key rotation signed and queued. The old channel ID remains the subscription anchor.');
                      setRotationConfirm('');
                    })
                    .catch((error: Error) => setNotice(error.message))
                    .finally(() => setLifecycleBusy(false));
                }}
                system="signal"
                variant="secondary"
              />
              <Text style={[typography.label, { color: colors.blackout }]}>Retire an owned channel</Text>
              <Field colors={colors} label="Retirement note" multiline onChangeText={setRetireNote} value={retireNote} />
              <Button
                colors={colors}
                disabled={lifecycleBusy || !retireNote.trim()}
                label="Retire channel"
                onPress={() => {
                  setLifecycleBusy(true);
                  void retireSignalChannel(
                    homeNode.baseUrl,
                    { channel: channel.id, note: retireNote, successor_key: new Uint8Array() },
                    homeNode.discovery.services.auditLogs,
                  )
                    .then(() => setNotice('Channel retirement signed and queued.'))
                    .catch((error: Error) => setNotice(error.message))
                    .finally(() => setLifecycleBusy(false));
                }}
                system="signal"
                variant="destructive"
              />
            </Card>
          ) : null}
          {notice ? (
            <StatusBanner
              body={notice}
              colors={colors}
              icon={personallyVerified ? 'shield-checkmark-outline' : 'close-circle-outline'}
              title={personallyVerified ? 'Verification stored locally' : 'Verification failed'}
              tone={personallyVerified ? 'verified' : 'danger'}
            />
          ) : null}
          <SectionHeader colors={colors} title="Broadcast history" />
          {(broadcastsQuery.data?.value.items ?? []).map((broadcast) => (
            <AlertCard
              acknowledged
              broadcast={broadcast}
              colors={colors}
              key={broadcast.id}
              onAcknowledge={() => undefined}
              onChannel={() => undefined}
            />
          ))}
        </>
      ) : channelQuery.isLoading ? null : (
        <EmptyState
          body="This channel is not present in the local node directory."
          colors={colors}
          icon="radio-outline"
          system="signal"
          title="Channel unavailable"
        />
      )}
      </Page>
    </View>
  );
}

export function SignalCrisisScreen(props: SignalScreenProps) {
  const { colors, mode: themeMode, homeNode, reach, onNetwork, onBack } = props;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'checkin' | 'missing' | 'resource'>('checkin');
  const [status, setStatus] = useState(1);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [place, setPlace] = useState('');
  const [detail, setDetail] = useState('');
  const [resourceKind, setResourceKind] = useState(1);
  const [resourceState, setResourceState] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const audits = homeNode.discovery.services.auditLogs;

  const publish = async () => {
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'checkin') {
        await publishSignalCheckIn(homeNode.baseUrl, { status, note }, audits);
      } else if (mode === 'missing') {
        await publishMissingPerson(
          homeNode.baseUrl,
          {
            name,
            age: Number(age),
            description: detail,
            lastSeenPlace: place,
            contactChannel: '',
            status: 1,
          },
          audits,
        );
      } else {
        await publishSignalResource(
          homeNode.baseUrl,
          {
            kind: resourceKind,
            state: resourceState,
            detail,
            latE5: 0,
            lonE5: 0,
            radiusM: 2_000,
            placeName: place,
          },
          audits,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['node', homeNode.baseUrl] });
      setNotice('Signed, accepted and copied to the available audit log services.');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={themeMode} reach={reach} title="Crisis desk" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
        <SegmentedControl
          colors={colors}
          onChange={setMode}
          options={[
            { value: 'checkin', label: 'Check in' },
            { value: 'missing', label: 'Missing' },
            { value: 'resource', label: 'Resource' },
          ]}
          value={mode}
        />
        {mode === 'checkin' ? (
          <>
            <Card colors={colors} style={styles.formCard}>
              <Text style={[typography.h2, { color: colors.text }]}>How are you?</Text>
              <Row gap={spacing.xs} wrap>
                {[
                  [1, 'Safe'],
                  [2, 'Need help'],
                  [3, 'Medical'],
                  [4, 'Moving'],
                  [5, 'Unreachable'],
                ].map(([value, label]) => (
                  <Pill
                    colors={colors}
                    key={value}
                    label={label as string}
                    onPress={() => setStatus(value as number)}
                    selected={status === value}
                  />
                ))}
              </Row>
              <Field colors={colors} label="Short note (80 characters)" onChangeText={setNote} value={note} />
            </Card>
            <StatusBanner
              body="Check-ins cost zero credits and require no anti-abuse credential."
              colors={colors}
              icon="hand-left-outline"
              title="Safety is never rate-limited"
              tone="verified"
            />
          </>
        ) : mode === 'missing' ? (
          <Card colors={colors} style={styles.formCard}>
            <Field colors={colors} label="Person's name" onChangeText={setName} value={name} />
            <Field colors={colors} keyboardType="number-pad" label="Age" onChangeText={setAge} value={age} />
            <Field colors={colors} label="Last seen place" onChangeText={setPlace} value={place} />
            <Field colors={colors} label="Description" multiline onChangeText={setDetail} value={detail} />
          </Card>
        ) : (
          <Card colors={colors} style={styles.formCard}>
            <Text style={[typography.label, { color: colors.text }]}>What kind of resource?</Text>
            <Row gap={spacing.xs} wrap>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                <Pill
                  colors={colors}
                  key={value}
                  label={['', 'Shelter', 'Water', 'Food', 'Medical', 'Fuel', 'Power', 'Internet', 'Road'][value]!}
                  onPress={() => setResourceKind(value)}
                  selected={resourceKind === value}
                />
              ))}
            </Row>
            <Text style={[typography.label, { color: colors.text }]}>What is its state?</Text>
            <Row gap={spacing.xs} wrap>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pill
                  colors={colors}
                  key={value}
                  label={['', 'Available', 'Limited', 'Exhausted', 'Blocked', 'Damaged'][value]!}
                  onPress={() => setResourceState(value)}
                  selected={resourceState === value}
                />
              ))}
            </Row>
            <Field colors={colors} label="Area or landmark" onChangeText={setPlace} value={place} />
            <Field colors={colors} label="What did you observe?" multiline onChangeText={setDetail} value={detail} />
          </Card>
        )}
        <Button
          colors={colors}
          disabled={busy}
          icon="send-outline"
          label={busy ? 'Signing…' : 'Sign and publish'}
          onPress={() => void publish()}
          system="signal"
        />
        {notice ? (
          <StatusBanner
            body={notice}
            colors={colors}
            icon={notice.startsWith('Signed') ? 'shield-checkmark-outline' : 'warning-outline'}
            title={notice.startsWith('Signed') ? 'Published' : 'Could not publish'}
            tone={notice.startsWith('Signed') ? 'verified' : 'danger'}
          />
        ) : null}
      </Page>
    </View>
  );
}

export function SignalMapScreen({ colors, mode, homeNode, reach, onNetwork, onBack }: SignalScreenProps) {
  const checkins = useNodeDocument<NodePage<SignalCheckIn>>(
    homeNode.baseUrl,
    '/v1/signal/checkins?latest=true&limit=200',
  );
  const resources = useNodeDocument<NodePage<SignalResource>>(
    homeNode.baseUrl,
    '/v1/signal/resources?limit=200',
  );
  const points = [
    ...(checkins.data?.value.items ?? [])
      .filter((row) => row.area)
      .map((row) => ({ id: row.id, label: row.note || 'Check-in', area: row.area!, kind: 'check-in' })),
    ...(resources.data?.value.items ?? [])
      .filter((row) => row.area)
      .map((row) => ({ id: row.id, label: row.detail, area: row.area!, kind: 'resource' })),
  ];
  const latitudes = points.map((point) => point.area.latE5);
  const longitudes = points.map((point) => point.area.lonE5);
  const minLat = Math.min(...latitudes, 0);
  const maxLat = Math.max(...latitudes, 1);
  const minLon = Math.min(...longitudes, 0);
  const maxLon = Math.max(...longitudes, 1);

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title="Offline area map" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
      <Text style={[typography.body, { color: colors.text2 }]}>
        A lightweight coordinate plot cached with the reports. It does not load map tiles or reveal your viewport.
      </Text>
      <View
        accessibilityLabel={`Area map with ${points.length} reports`}
        style={[styles.map, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {points.map((point) => {
          const left = ((point.area.lonE5 - minLon) / Math.max(1, maxLon - minLon)) * 88 + 4;
          const top = (1 - (point.area.latE5 - minLat) / Math.max(1, maxLat - minLat)) * 82 + 8;
          return (
            <View
              accessible
              accessibilityLabel={`${point.kind}: ${point.label}, ${point.area.placeName}`}
              key={point.id}
              style={[
                styles.mapPoint,
                {
                  backgroundColor: point.kind === 'check-in' ? colors.verified : colors.signal,
                  left: `${left}%`,
                  top: `${top}%`,
                },
              ]}
            />
          );
        })}
        {points.length === 0 ? (
          <Text style={[typography.body, styles.mapEmpty, { color: colors.text3 }]}>
            No cached reports include an area yet.
          </Text>
        ) : null}
      </View>
      {points.length > 0 ? (
        <View style={styles.rowGroup}>
          {points.map((point) => (
            <View key={`legend:${point.id}`} style={[styles.listRow, { borderBottomColor: colors.border }]}>
              <Ionicons
                name={point.kind === 'check-in' ? 'hand-left-outline' : 'location-outline'}
                color={point.kind === 'check-in' ? colors.verified : colors.signal}
                size={20}
              />
              <View style={styles.listRowBody}>
                <Text style={[typography.label, { color: colors.text }]}>{point.label}</Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>{point.area.placeName}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      </Page>
    </View>
  );
}

/**
 * Which of three mutually exclusive things this screen is for right now.
 *
 * The old screen showed every control at once: "Create Signal identity" sat next to
 * "Unlock", both enabled whenever the passphrase was long enough, whether or not a vault
 * existed. A returning user could press Create; a new user could press Unlock; and the
 * restore field appeared under a heading that contradicted the buttons above it. There is
 * only ever one correct next step here, so the screen shows one.
 */
type VaultStage = 'setup' | 'locked' | 'unlocked';

function vaultStage(summary: SignalSessionSummary): VaultStage {
  if (!summary.configured) return 'setup';
  return summary.unlocked ? 'unlocked' : 'locked';
}

/** The optional recovery salt, folded away until asked for — most people should not use one. */
function RecoverySaltField({
  colors,
  value,
  onChangeText,
  hint,
}: {
  readonly colors: AppPalette;
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly hint: string;
}) {
  return (
    <Disclosure colors={colors} title="Recovery salt (optional)">
      <Field
        colors={colors}
        hint={hint}
        label="Recovery salt"
        onChangeText={onChangeText}
        placeholder="Leave empty unless you know you want one"
        secureTextEntry
        value={value}
      />
    </Disclosure>
  );
}

function VaultSetup({
  colors,
  busy,
  passphrase,
  onPassphrase,
  salt,
  onSalt,
  restorePhrase,
  onRestorePhrase,
  onCreate,
  onRestore,
}: {
  readonly colors: AppPalette;
  readonly busy: boolean;
  readonly passphrase: string;
  readonly onPassphrase: (next: string) => void;
  readonly salt: string;
  readonly onSalt: (next: string) => void;
  readonly restorePhrase: string;
  readonly onRestorePhrase: (next: string) => void;
  readonly onCreate: () => void;
  readonly onRestore: () => void;
}) {
  // Empty is allowed; short is not. Anything between 1 and 7 characters looks like
  // protection and is not, so it is the one input the button refuses.
  const passphraseUsable = passphrase.length === 0 || passphrase.length >= 8;
  const wordCount = restorePhrase.trim() ? restorePhrase.trim().split(/\s+/).length : 0;

  return (
    <>
      <SectionHeader colors={colors} title="Set up this device" />
      <Card colors={colors} style={styles.formCard}>
        <Field
          colors={colors}
          label="Vault passphrase (optional)"
          onChangeText={onPassphrase}
          placeholder="At least 8 characters, or leave empty"
          secureTextEntry
          value={passphrase}
        />
        <Text style={[typography.caption, { color: passphrase.length === 0 ? colors.constrained : colors.text2 }]}>
          {passphrase.length === 0
            ? '⚠ Without a passphrase, anyone who unlocks this phone can read your Signal messages. Your 24 words are still required to restore the identity elsewhere.'
            : passphraseUsable
              ? 'Needed every time you unlock. It is not recoverable — your 24 words are.'
              : 'Use at least 8 characters, or clear the field to go without one.'}
        </Text>
        <RecoverySaltField
          colors={colors}
          value={salt}
          onChangeText={onSalt}
          hint="Mixed into your keys and never stored. The same 24 words with and without it are two different identities — if you lose the salt, the identity is gone."
        />
        <Button
          colors={colors}
          disabled={busy || !passphraseUsable}
          icon="key-outline"
          label="Create Signal identity"
          onPress={onCreate}
          system="signal"
        />
      </Card>

      <SectionHeader colors={colors} title="Or restore an existing one" />
      <Card colors={colors} style={styles.formCard}>
        <Field
          colors={colors}
          hint={wordCount === 0 ? '24 words needed' : `${wordCount} of 24 words`}
          label="Signal recovery phrase"
          multiline
          onChangeText={onRestorePhrase}
          placeholder="Paste the 24 words stored when this Signal identity was created"
          value={restorePhrase}
        />
        <Button
          colors={colors}
          disabled={busy || !passphraseUsable || wordCount !== 24}
          label="Restore Signal identity"
          onPress={onRestore}
          system="signal"
          variant="secondary"
        />
      </Card>
    </>
  );
}

function VaultUnlock({
  colors,
  busy,
  passphrase,
  onPassphrase,
  salt,
  onSalt,
  onUnlock,
  onPanic,
}: {
  readonly colors: AppPalette;
  readonly busy: boolean;
  readonly passphrase: string;
  readonly onPassphrase: (next: string) => void;
  readonly salt: string;
  readonly onSalt: (next: string) => void;
  readonly onUnlock: () => void;
  readonly onPanic: () => void;
}) {
  return (
    <>
      <SectionHeader colors={colors} title="Unlock this device" />
      <Card colors={colors} style={styles.formCard}>
        <Field
          colors={colors}
          label="Vault passphrase"
          onChangeText={onPassphrase}
          placeholder="Leave empty if you created it without one"
          secureTextEntry
          value={passphrase}
        />
        <RecoverySaltField
          colors={colors}
          value={salt}
          onChangeText={onSalt}
          hint="Only if you set one when this identity was created. A wrong salt is refused, not silently accepted."
        />
        <Button
          colors={colors}
          disabled={busy}
          icon="lock-open-outline"
          label="Unlock"
          onPress={onUnlock}
          system="signal"
        />
      </Card>
      <Button
        colors={colors}
        disabled={busy}
        icon="trash-outline"
        label="Panic wipe Signal only"
        onPress={onPanic}
        variant="destructive"
      />
    </>
  );
}

/**
 * Your identity as something another person can point a camera at.
 *
 * The out-of-federation path. Directory search only reaches servers yours has heard of, and
 * the previous answer was to read out 64 hexadecimal characters. The QR generator and the
 * scanner both already existed in the mesh pairing screen; only the payload is new.
 *
 * The fingerprint is shown as text beside the code deliberately: a code scanned from a
 * screen someone else controls proves nothing about who is holding it, and comparing the
 * fingerprint aloud is what turns a scan into a verified contact.
 */
function SignalIdentityShare({
  colors,
  homeServer,
  identityKeyHex,
}: {
  readonly colors: AppPalette;
  readonly homeServer: string;
  readonly identityKeyHex: string;
}) {
  const card = useMemo(
    () =>
      encodeSignalIdentityCard({
        identityKey: Uint8Array.from(
          identityKeyHex.match(/.{2}/g) ?? [],
          (pair) => Number.parseInt(pair, 16),
        ),
        displayName: '',
        homeServer,
      }),
    [homeServer, identityKeyHex],
  );
  return (
    <>
      <SectionHeader colors={colors} title="Let someone add you" />
      <Card colors={colors} style={styles.share}>
        {/* Fixed light background regardless of theme — a QR code needs a light quiet zone
            to scan reliably, so this is not a themed surface. */}
        <View style={styles.qr}>
          <QRCode backgroundColor="#FFFFFF" quietZone={8} size={200} value={card} />
        </View>
        <Fingerprint colors={colors} full={identityKeyHex} value={identityKeyHex} />
        <Text style={[typography.caption, { color: colors.text2 }]}>
          They scan this to message you, even from a server yours has never met. Read the
          fingerprint aloud so you both know the code came from this device.
        </Text>
      </Card>
    </>
  );
}

function VaultActions({
  colors,
  busy,
  authenticated,
  revokeConfirm,
  onRevokeConfirm,
  onRegister,
  onAuthenticate,
  onPrekeys,
  onRevoke,
  onPanic,
  killswitchArmed,
  killswitch,
  onKillswitch,
  onArmKillswitch,
  onDisarmKillswitch,
}: {
  readonly colors: AppPalette;
  readonly busy: boolean;
  readonly authenticated: boolean;
  readonly revokeConfirm: string;
  readonly onRevokeConfirm: (next: string) => void;
  readonly onRegister: () => void;
  readonly onAuthenticate: () => void;
  readonly onPrekeys: () => void;
  readonly onRevoke: () => void;
  readonly onPanic: () => void;
  readonly killswitchArmed: boolean;
  readonly killswitch: string;
  readonly onKillswitch: (next: string) => void;
  readonly onArmKillswitch: () => void;
  readonly onDisarmKillswitch: () => void;
}) {
  return (
    <>
      <SectionHeader colors={colors} title="This identity on your server" />
      <Card colors={colors} style={styles.formCard}>
        <Button colors={colors} disabled={busy} icon="ribbon-outline" label="Register certificate" onPress={onRegister} system="signal" />
        <Button colors={colors} disabled={busy} label={authenticated ? 'Re-authenticate' : 'Authenticate'} onPress={onAuthenticate} system="signal" variant="secondary" />
        <Button colors={colors} disabled={busy} label="Publish offline prekeys" onPress={onPrekeys} system="signal" variant="secondary" />
        <Text style={[typography.caption, { color: colors.text2 }]}>
          Prekeys let someone start an encrypted conversation with you while your device is offline.
        </Text>
      </Card>

      <SectionHeader colors={colors} title="Danger zone" />
      <Card colors={colors} style={{ ...styles.formCard, borderColor: colors.blackout }}>
        <Field
          colors={colors}
          label='Type "REVOKE" to publish a key revocation'
          onChangeText={onRevokeConfirm}
          value={revokeConfirm}
        />
        <Button
          colors={colors}
          disabled={busy || revokeConfirm !== 'REVOKE'}
          label="Revoke Signal key"
          onPress={onRevoke}
          variant="destructive"
        />
        <Button colors={colors} disabled={busy} icon="trash-outline" label="Panic wipe Signal only" onPress={onPanic} variant="destructive" />
      </Card>

      {/*
        ── The killswitch ──────────────────────────────────────────────────────────────
        A button is useless in the situation a panic wipe exists for: with someone standing
        over you demanding the password, you cannot reach for a control labelled "destroy
        everything". You can comply — so compliance is the destruction. This passphrase is
        typed into the NORMAL unlock field and wipes both vaults.
      */}
      <SectionHeader colors={colors} title="Killswitch passphrase" />
      <Card colors={colors} style={styles.formCard}>
        <Text style={[typography.body, { color: colors.text2 }]}>
          A second passphrase for the ordinary unlock screen. Entering it erases both your
          Forum and Signal identities from this device and leaves the app looking like it was
          never set up. Nothing on the unlock screen hints that it exists.
        </Text>
        <Text style={[typography.caption, { color: colors.constrained }]}>
          It cannot be undone and it publishes nothing — with no network, it still works. To
          tell the network your key is compromised, use "Revoke Signal key" instead.
        </Text>
        {killswitchArmed ? (
          <>
            <Text style={[typography.label, { color: colors.verified }]}>
              ✓ Armed on this device
            </Text>
            <Button
              colors={colors}
              disabled={busy}
              label="Remove killswitch"
              onPress={onDisarmKillswitch}
              variant="secondary"
            />
          </>
        ) : (
          <>
            <PasswordField
              colors={colors}
              hint="Choose something you can type under pressure, and that is NOT your app password."
              label="Killswitch passphrase"
              onChangeText={onKillswitch}
              value={killswitch}
            />
            <Button
              colors={colors}
              disabled={busy || killswitch.trim().length < 4}
              icon="flash-outline"
              label="Arm killswitch"
              onPress={onArmKillswitch}
              variant="destructive"
            />
          </>
        )}
      </Card>
    </>
  );
}

export function SignalIdentityScreen({ colors, mode, homeNode, reach, onNetwork, onBack }: SignalScreenProps) {
  const [summary, setSummary] = useState<SignalSessionSummary>({
    configured: false,
    unlocked: false,
    authenticated: false,
  });
  const [passphrase, setPassphrase] = useState('');
  const [salt, setSalt] = useState('');
  const [recovery, setRecovery] = useState('');
  const [restorePhrase, setRestorePhrase] = useState('');
  const [revokeConfirm, setRevokeConfirm] = useState('');
  const [killswitch, setKillswitch] = useState('');
  const [killswitchArmed, setKillswitchArmed] = useState(false);
  const [done, setDone] = useState('');
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [backupOwed, setBackupOwed] = useState(false);
  const action = useAsyncAction();

  const refresh = useCallback(async () => {
    setSummary(await signalSessionSummary());
    setBackupOwed(await isSignalBackupOwed());
    setKillswitchArmed(await isKillswitchConfigured());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The debt is settled once the words have actually been on screen — not when the card was
  // dismissed, because dismissing is what people do to a prompt they intend to ignore.
  useEffect(() => {
    if (recoveryCopied && recovery) void clearSignalBackupOwed().then(() => setBackupOwed(false));
  }, [recovery, recoveryCopied]);

  const run = useCallback(
    (label: string, operation: () => Promise<unknown>) =>
      void (async () => {
        setDone('');
        const result = await action.run(label, async () => operation());
        if (result && typeof result === 'object' && 'recoveryPhrase' in result) {
          setRecovery(String((result as { recoveryPhrase: string }).recoveryPhrase));
        }
        // Null means cancelled — the runner already cleared its own state, and claiming
        // success for something the user stopped would be a lie.
        if (result !== null) {
          setDone(`${label} — done.`);
          setPassphrase('');
          setSalt('');
        }
        await refresh();
      })(),
    [action, refresh],
  );

  const stage = vaultStage(summary);
  const audits = homeNode.discovery.services.auditLogs;

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title="Signal identity" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
      <StatusBanner
        body="This vault has a separate recovery phrase and storage root. It cannot derive or reveal your Forum identity."
        colors={colors}
        icon="git-compare-outline"
        title="Unlinkable by construction"
        tone="verified"
      />
      <View style={styles.metrics}>
        <Pill colors={colors} label={summary.configured ? 'configured' : 'not configured'} />
        <Pill colors={colors} label={summary.unlocked ? 'unlocked' : 'locked'} />
        <Pill colors={colors} label={summary.authenticated ? 'authenticated' : 'not authenticated'} />
      </View>

      {action.busy ? (
        <ActionProgress
          colors={colors}
          elapsedMs={action.elapsedMs}
          label={action.label}
          late={action.late}
          onCancel={action.cancel}
          onKeepWaiting={action.keepWaiting}
        />
      ) : null}

      {stage === 'setup' ? (
        <VaultSetup
          busy={action.busy}
          colors={colors}
          onCreate={() => run('Creating your Signal identity', () => createSignalIdentity(passphrase, salt))}
          onPassphrase={setPassphrase}
          onRestore={() => run('Restoring your Signal identity', () => importSignalIdentity(restorePhrase, passphrase, salt))}
          onRestorePhrase={setRestorePhrase}
          onSalt={setSalt}
          passphrase={passphrase}
          restorePhrase={restorePhrase}
          salt={salt}
        />
      ) : null}

      {stage === 'locked' ? (
        <VaultUnlock
          busy={action.busy}
          colors={colors}
          onPanic={() => run('Wiping the Signal vault', panicSignal)}
          onPassphrase={setPassphrase}
          onSalt={setSalt}
          onUnlock={() =>
            run('Unlocking your Signal identity', async () => {
              // Same field, same rule as the Forum sign-in: the killswitch is checked first
              // and nothing here advertises that it exists.
              if (await isKillswitchPassphrase(passphrase)) return triggerKillswitch();
              return unlockSignalIdentity(passphrase, salt);
            })
          }
          passphrase={passphrase}
          salt={salt}
        />
      ) : null}

      {recovery ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy Signal recovery phrase"
          onPress={() => {
            Clipboard.setString(recovery);
            setRecoveryCopied(true);
          }}
          style={[
            styles.recovery,
            {
              backgroundColor: colors.surface,
              borderColor: recoveryCopied ? colors.verified : colors.constrained,
            },
          ]}
        >
          <Text style={[typography.label, { color: colors.constrained }]}>Write this down offline</Text>
          <Text selectable style={[typography.mono, { color: colors.text }]}>{recovery}</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.caption, { color: recoveryCopied ? colors.verified : colors.signal }]}
          >
            {recoveryCopied ? 'Copied to clipboard' : 'Tap to copy all 24 words'}
          </Text>
        </Pressable>
      ) : null}

      {/*
        The debt onboarding took on. Creating the Signal identity there but walking two
        24-word grids back to back is how people stop reading either of them, so the Signal
        phrase is owed rather than skipped — and the prompt returns until it is settled,
        because a one-off dismissible card is a card nobody sees twice.
      */}
      {stage === 'unlocked' && backupOwed && !recovery ? (
        <StatusBanner
          action="Show my phrase"
          onAction={() =>
            run('Reading your recovery phrase', async () => ({
              recoveryPhrase: await revealSignalRecoveryPhrase(),
            }))
          }
          body="Your messaging identity has its own 24 words. Without them, losing this device loses this identity — your forum identity is recovered separately."
          colors={colors}
          icon="warning-outline"
          title="Back up your messaging identity"
          tone="warning"
        />
      ) : null}

      {stage === 'unlocked' && summary.identityKeyHex ? (
        <SignalIdentityShare
          colors={colors}
          homeServer={homeNode.baseUrl}
          identityKeyHex={summary.identityKeyHex}
        />
      ) : null}

      {stage === 'unlocked' ? (
        <VaultActions
          authenticated={summary.authenticated}
          busy={action.busy}
          colors={colors}
          onAuthenticate={() => run('Authenticating with your server', () => authenticateSignalIdentity(homeNode.baseUrl))}
          onPanic={() => run('Wiping the Signal vault', panicSignal)}
          onPrekeys={() => run('Publishing offline prekeys', () => publishSignalPrekeys(homeNode.baseUrl, audits))}
          onRegister={() => run('Registering your certificate', () => registerSignalIdentity(homeNode.baseUrl, audits))}
          onRevoke={() => run('Publishing a key revocation', () => revokeSignalKey(homeNode.baseUrl, audits))}
          onRevokeConfirm={setRevokeConfirm}
          revokeConfirm={revokeConfirm}
          killswitchArmed={killswitchArmed}
          killswitch={killswitch}
          onKillswitch={setKillswitch}
          onArmKillswitch={() =>
            run('Arming the killswitch', async () => {
              // Refused rather than silently shadowed: a killswitch that is also a vault
              // passphrase would wipe on an ordinary sign-in.
              if (await isKillswitchPassphrase(killswitch)) return;
              await setKillswitchPassphrase(killswitch.trim());
              setKillswitch('');
            })
          }
          onDisarmKillswitch={() => run('Removing the killswitch', clearKillswitchPassphrase)}
        />
      ) : null}

      {action.error ? (
        <StatusBanner body={action.error} colors={colors} icon="warning-outline" title="Action failed" tone="danger" />
      ) : null}
      {done && !action.error ? (
        <StatusBanner body={done} colors={colors} icon="shield-checkmark-outline" title="Done" tone="verified" />
      ) : null}
      </Page>
    </View>
  );
}

export function SignalMessagesScreen({ colors, mode: themeMode, homeNode, reach, onNetwork, onBack }: SignalScreenProps) {
  const [mode, setMode] = useState<'sessions' | 'groups'>('sessions');
  const [recipient, setRecipient] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [contacts, setContacts] = useState<readonly SignalContact[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sessions, setSessions] = useState<readonly DecryptedSignalSession[]>([]);
  const [messages, setMessages] = useState<readonly DecryptedSignalMessage[]>([]);
  const [identityKey, setIdentityKey] = useState('');
  /*
    A conversation is a PERSON, not a session.

    Every "Start encrypted session" mints a new session ID, and the list was keyed on it — so
    talking to the same person twice produced two rows with the same name and no way to tell
    them apart. Sessions are a ratchet detail; nobody has two conversations with one contact.
    Grouping by counterpart key is what removes the duplicates, and it also means a reply on
    a fresh session lands in the thread you were already reading.
  */
  const [activeContact, setActiveContact] = useState('');
  const [deletedChats, setDeletedChats] = useState<Readonly<Record<string, number>>>({});
  /** The chat awaiting confirmation. Deleting local plaintext is not undoable. */
  const [confirmDelete, setConfirmDelete] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const [groups, setGroups] = useState<readonly SignalGroupDocument[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [addMembers, setAddMembers] = useState('');
  const [removeMembers, setRemoveMembers] = useState('');
  /** Kept apart from `notice`: a background poll must never speak for a send. */
  const [readError, setReadError] = useState('');
  const [outgoing, setOutgoing] = useState<readonly OutgoingSignalMessage[]>([]);
  /** Content IDs the outbox still owes the node — everything else has a receipt. */
  const [undelivered, setUndelivered] = useState<ReadonlySet<string>>(new Set());
  const memberKeys = (value: string) =>
    value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  const refresh = async () => {
    try {
      const summary = await signalSessionSummary();
      const nextSessions = await loadSignalInbox(homeNode.baseUrl);
      setSessions(nextSessions);
      setIdentityKey(summary.identityKeyHex ?? '');
      if (summary.identityKeyHex) {
        setMessages(await loadSignalMessages(homeNode.baseUrl, summary.identityKeyHex));
      }
      const groupResponse = await signalSessionRequest<{
        readonly items: readonly SignalGroupDocument[];
      }>(homeNode.baseUrl, '/v1/signal/me/groups');
      setGroups(groupResponse.items);
      setReadError('');
    } catch (error) {
      /*
        A failed READ is not a failed SEND, and it must not be reported as one.

        `send()` ends with `await refresh()`, and `refresh()` also runs every ten seconds.
        Both used to write into `notice` — the same state the send outcome uses, rendered
        under the heading "Could not send". So a message that was signed, queued and
        receipted announced itself for a fraction of a second and was then overwritten by
        whatever the inbox poll happened to hit. "Start encrypted session" reporting
        "access token is invalid" was exactly that: the session had gone out, and the poll
        behind it was what failed.
      */
      setReadError(error instanceof Error ? error.message : 'Could not read Signal inbox');
    }
  };
  /**
   * Local state that needs no network: what we said, and what has not gone out yet.
   *
   * The outbox holds opaque signed bytes and cannot know an envelope was a message — the join
   * is by content ID, which both sides have. Polled on the same cadence as the inbox so a
   * queued message flips to sent on its own when connectivity returns.
   */
  const refreshLocal = useCallback(async () => {
    const [sent, queued, deleted] = await Promise.all([
      loadOutgoingSignalMessages(),
      listOutbox(),
      loadDeletedSignalChats(),
    ]);
    setOutgoing(sent);
    setUndelivered(new Set(queued.map((record) => record.contentId)));
    setDeletedChats(deleted);
  }, []);

  useEffect(() => {
    void refresh();
    void refreshLocal();
    void loadSignalContacts().then(setContacts);
    /*
      Replies used to appear only when someone remembered to tap "Refresh encrypted inbox",
      which makes a messaging app look like it silently drops messages. The Signal home
      screen already polls broadcasts on this cadence; matching it keeps the two surfaces
      consistent and does not add a second timing to reason about.
    */
    const timer = setInterval(() => {
      void refresh();
      void refreshLocal();
    }, 10_000);
    return () => clearInterval(timer);
  }, [homeNode.baseUrl, refreshLocal]);

  /** The other participant's key in a session, whichever side of it this device is on. */
  const counterpartKey = (session: DecryptedSignalSession): string =>
    session.senderKey.toLowerCase() === identityKey.toLowerCase()
      ? session.recipientKey
      : session.senderKey;

  /**
   * A person's name, falling back to a short key.
   *
   * Threads were labelled `session.id.slice(0, 10)` — a content-ID prefix, which tells a
   * person nothing about who they are talking to.
   */
  const nameFor = (key: string): string => {
    const contact = contacts.find(
      (item) => item.identityKey.toLowerCase() === key.toLowerCase(),
    );
    return contact?.displayName || `${key.slice(0, 8)}…`;
  };

  /**
   * One conversation, in order, from three sources that each hold part of it.
   *
   * ── Why a merge is unavoidable ─────────────────────────────────────────────────────
   *   · the node holds every envelope, but everything WE sent comes back `plaintext: null`,
   *     because it was sealed to the other person's keys and we cannot open it again;
   *   · `outgoing.ts` holds our plaintext, and nothing else knows it;
   *   · the outbox holds what has not reached the node at all, as opaque signed bytes.
   *
   * Joined on content ID, ordered by counter — the session opener is counter 0, which is what
   * the node assigns it too. The screen used to render the node's sessions and the node's
   * messages as two separate flat lists of hairline rows, each labelled "Message 3 ·
   * 7/31/2026, 8:12:04 AM", with no ordering between them and no indication of who said what.
   * That is the "random logs" reading, and no styling fixes it — the data had to be joined
   * first.
   */
  const thread = useMemo((): readonly ThreadEntry[] => {
    if (!activeContact) return [];
    const contact = activeContact.toLowerCase();
    const clearedBefore = deletedChats[contact] ?? 0;
    // Every session this device has with that person. Sessions are a ratchet detail; the
    // person is the conversation, so all of them render as one thread.
    const ids = new Set(
      sessions.filter((item) => counterpartKey(item).toLowerCase() === contact).map((item) => item.id),
    );
    /*
      A message belongs to a person because of who is on it, not because a session row exists.

      Sessions come from the node. A message delivered phone-to-phone over the mesh is
      projected locally and has no session row here at all, so selecting by session id alone
      hid exactly the messages that arrived with no node — the case this transport exists for.
      Every message already carries both keys, which is all the grouping needs.
    */
    const mineOrTheirs = (item: DecryptedSignalMessage): boolean =>
      ids.has(item.session) ||
      (item.senderKey.toLowerCase() === contact &&
        item.recipientKey.toLowerCase() === identityKey.toLowerCase()) ||
      (item.recipientKey.toLowerCase() === contact &&
        item.senderKey.toLowerCase() === identityKey.toLowerCase());
    const mine = new Map(
      outgoing
        .filter((item) => item.recipientKey.toLowerCase() === contact || ids.has(item.session))
        .map((item) => [item.contentId, item] as const),
    );
    const entries: ThreadEntry[] = [];

    for (const opener of sessions.filter((item) => ids.has(item.id))) {
      const local = mine.get(opener.id);
      entries.push({
        id: opener.id,
        counter: 0,
        outbound: opener.senderKey.toLowerCase() === identityKey.toLowerCase(),
        text: local?.plaintext ?? opener.plaintext,
        atMs: opener.createdAtMs,
        state: undelivered.has(opener.id) ? 'queued' : 'sent',
      });
    }

    for (const item of messages.filter(mineOrTheirs)) {
      const local = mine.get(item.id);
      entries.push({
        id: item.id,
        counter: Number(item.counter),
        outbound: item.recipientKey.toLowerCase() !== identityKey.toLowerCase(),
        text: local?.plaintext ?? item.plaintext,
        atMs: item.createdAtMs,
        state: undelivered.has(item.id)
          ? 'queued'
          : item.deliveryState >= DeliveryState.DELIVERY_STATE_READ
            ? 'read'
            : 'sent',
        deliveryState: item.deliveryState,
        readable: item.recipientKey.toLowerCase() === identityKey.toLowerCase(),
      });
    }

    // Anything the node has never seen — it exists only here and in the outbox.
    for (const item of mine.values()) {
      if (entries.some((entry) => entry.id === item.contentId)) continue;
      entries.push({
        id: item.contentId,
        counter: item.counter,
        outbound: true,
        text: item.plaintext,
        atMs: item.sentAtMs,
        state: undelivered.has(item.contentId) ? 'queued' : 'sent',
      });
    }

    /*
      Ordered by TIME, not by counter. Counters restart at 0 for each session, so ordering by
      them would interleave two conversations with the same person into nonsense. Anything
      older than a local delete stays hidden; anything newer is a message that arrived after
      it and must not be swallowed.
    */
    return entries
      .filter((entry) => entry.atMs > clearedBefore)
      .sort((left, right) => left.atMs - right.atMs);
  }, [activeContact, deletedChats, messages, sessions, outgoing, undelivered, identityKey]);

  /** One row per PERSON, newest first, with the preview they are recognised by. */
  const threads = useMemo(() => {
    const byContact = new Map<
      string,
      { key: string; sessionIds: Set<string>; lastAtMs: number }
    >();
    for (const session of sessions) {
      const key = counterpartKey(session).toLowerCase();
      const row = byContact.get(key) ?? { key, sessionIds: new Set<string>(), lastAtMs: 0 };
      row.sessionIds.add(session.id);
      row.lastAtMs = Math.max(row.lastAtMs, session.createdAtMs);
      byContact.set(key, row);
    }
    /*
      A chat also exists because WE wrote in it, with no session from the node at all.

      Threads were derived from `sessions` alone, and sessions come from the node — so with
      the network gone the chat list was empty even though this device held the plaintext of
      everything it had sent, and a message queued in the outbox had nowhere to appear. In an
      app whose premise is that the network fails, the conversation list cannot be a view of
      a server's state.
    */
    // And because someone sent US one — the node-free inbound case, which has no session.
    for (const item of messages) {
      const mine = item.senderKey.toLowerCase() === identityKey.toLowerCase();
      const key = (mine ? item.recipientKey : item.senderKey).toLowerCase();
      if (!key || key === identityKey.toLowerCase()) continue;
      const row = byContact.get(key) ?? { key, sessionIds: new Set<string>(), lastAtMs: 0 };
      row.sessionIds.add(item.session);
      row.lastAtMs = Math.max(row.lastAtMs, item.createdAtMs);
      byContact.set(key, row);
    }
    for (const item of outgoing) {
      const key = item.recipientKey.toLowerCase();
      if (!key) continue;
      const row = byContact.get(key) ?? { key, sessionIds: new Set<string>(), lastAtMs: 0 };
      row.sessionIds.add(item.session);
      row.lastAtMs = Math.max(row.lastAtMs, item.sentAtMs);
      byContact.set(key, row);
    }

    const rows = [...byContact.values()].map((row) => {
      const clearedBefore = deletedChats[row.key] ?? 0;
      const own = outgoing.filter(
        (item) => item.recipientKey.toLowerCase() === row.key || row.sessionIds.has(item.session),
      );
      const theirs = messages.filter(
        (item) =>
          row.sessionIds.has(item.session) ||
          item.senderKey.toLowerCase() === row.key ||
          item.recipientKey.toLowerCase() === row.key,
      );
      const lastAtMs = Math.max(
        row.lastAtMs,
        ...own.map((item) => item.sentAtMs),
        ...theirs.map((item) => item.createdAtMs),
      );
      const latestOwn = own.reduce<OutgoingSignalMessage | null>(
        (best, item) => (!best || item.sentAtMs > best.sentAtMs ? item : best),
        null,
      );
      const latestTheirs = theirs
        .filter((item) => item.plaintext)
        .reduce<DecryptedSignalMessage | null>(
          (best, item) => (!best || item.createdAtMs > best.createdAtMs ? item : best),
          null,
        );
      const preview =
        latestOwn && (!latestTheirs || latestOwn.sentAtMs >= latestTheirs.createdAtMs)
          ? `You: ${latestOwn.plaintext}`
          : (latestTheirs?.plaintext ?? 'Encrypted');
      const waiting = own.filter((item) => undelivered.has(item.contentId)).length;
      return { key: row.key, lastAtMs, preview, waiting, clearedBefore };
    });

    // A chat deleted on this device stays gone until something newer than the delete arrives.
    return rows
      .filter((row) => row.lastAtMs > row.clearedBefore)
      .sort((left, right) => right.lastAtMs - left.lastAtMs);
  }, [sessions, messages, outgoing, undelivered, identityKey, deletedChats]);

  const removeChat = async (key: string) => {
    setDeletedChats(await deleteSignalChat(key));
    setOutgoing(await loadOutgoingSignalMessages());
    if (activeContact.toLowerCase() === key.toLowerCase()) setActiveContact('');
  };

  const send = async () => {
    setBusy(true);
    setNotice('');
    try {
      const body = message;
      let id: string;
      let counter = 0;
      let recipientKey = recipient;
      /*
        Continue the person's MOST RECENT session, not "the selected session" — the thread is
        keyed on the person now, and they may have several. The counter belongs to that one
        session, so it is computed from that session's messages rather than from the merged
        thread, whose counters restart per session.
      */
      const current = activeContact
        ? sessions
            .filter((item) => counterpartKey(item).toLowerCase() === activeContact.toLowerCase())
            .reduce<DecryptedSignalSession | null>(
              (best, item) => (!best || item.createdAtMs > best.createdAtMs ? item : best),
              null,
            )
        : null;
      let session = current?.id ?? '';
      if (current) {
        recipientKey =
          current.senderKey.toLowerCase() === identityKey.toLowerCase()
            ? current.recipientKey
            : current.senderKey;
        counter =
          messages
            .filter((item) => item.session === current.id)
            .reduce((value, item) => Math.max(value, Number(item.counter)), 0) + 1;
        id = await continueSignalSession(
          homeNode.baseUrl,
          {
            session: current.id,
            recipientKey,
            counter: BigInt(counter),
            plaintext: body,
          },
          homeNode.discovery.services.auditLogs,
        );
      } else {
        /*
          No session with this person yet — which is NOT only the "new chat" case.

          A thread now exists whenever this device holds a local record for someone, so an
          open chat can have no session at all: the node has never been reached, or its
          sessions have not loaded. Replying there fell through to here and used the people
          picker's value, which is empty when the chat was opened from the list — so sending
          reported "recipient key must be 64 hex characters" about a contact plainly named at
          the top of the screen. The open conversation names the recipient; the picker is only
          the fallback for a chat that does not exist yet.
        */
        recipientKey = activeContact || recipient;
        if (!/^[0-9a-f]{64}$/i.test(recipientKey)) {
          throw new Error('Choose who to send this to first.');
        }
        id = await startSignalSession(
          homeNode.baseUrl,
          recipientKey,
          body,
          homeNode.discovery.services.auditLogs,
        );
        // A session opener names its own session: the node keys the session by this envelope.
        session = id;
      }
      /*
        Keep what we said. A Signal message is sealed to the recipient, so this device can
        never open it again — `loadSignalMessages` returns `plaintext: null` for everything we
        sent, which the thread used to render as "Encrypted message sent from this device".
        Recording it locally is what makes our own half of the conversation readable, and it
        is what lets an undelivered message keep its place in the thread instead of vanishing
        until the network comes back.
      */
      setOutgoing(
        await recordOutgoingSignalMessage({
          contentId: id,
          session,
          recipientKey: recipientKey.toLowerCase(),
          counter,
          plaintext: body,
          sentAtMs: Date.now(),
        }),
      );
      if (!activeContact) setActiveContact(recipientKey.toLowerCase());
      setMessage('');
      setNotice(SEND_OK);
      await refresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const createGroup = async () => {
    setBusy(true); setNotice('');
    try {
      const id = await createSecureSignalGroup(
        homeNode.baseUrl,
        groupName,
        memberKeys(groupMembers),
        homeNode.discovery.services.auditLogs,
      );
      setNotice(`Group created and rekey package queued as ${id}`);
      setGroupName(''); setGroupMembers('');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The group could not be created.');
    } finally { setBusy(false); }
  };
  const updateGroup = async () => {
    const group = groups.find((item) => item.id === selectedGroup);
    if (!group) return;
    setBusy(true); setNotice('');
    try {
      const id = await updateSecureSignalGroup(
        homeNode.baseUrl,
        {
          group: group.id,
          currentMembers: group.memberKeys,
          add: memberKeys(addMembers),
          remove: memberKeys(removeMembers),
        },
        homeNode.discovery.services.auditLogs,
      );
      setNotice(`Membership update and mandatory rekey queued as ${id}`);
      setAddMembers(''); setRemoveMembers('');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The group could not be updated.');
    } finally { setBusy(false); }
  };
  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={themeMode} reach={reach} title="Private Signal" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
      <SegmentedControl
        colors={colors}
        onChange={setMode}
        options={[
          { value: 'sessions', label: 'Messages' },
          { value: 'groups', label: 'Groups' },
        ]}
        value={mode}
      />
      {mode === 'sessions' ? (
        activeContact ? (
          /*
            ── One conversation ────────────────────────────────────────────────────────
            A thread, oldest at the top, ours on the right and theirs on the left, with the
            composer under it — the shape every messaging app has, because it is the shape
            that makes a sequence of messages legible without labelling each line.

            What was here instead: a pill rail of every session, then two independent flat
            lists of hairline rows ("Message 3 · 7/31/2026, 8:12:04 AM"), one for sessions and
            one for messages, with no ordering between them and no indication of who spoke.
          */
          <>
            <Row gap={spacing.xs}>
              <Button
                colors={colors}
                icon="chevron-back"
                label="All chats"
                onPress={() => setActiveContact('')}
                variant="ghost"
              />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[typography.label, { color: colors.text }]}>
                  {nameFor(activeContact)}
                </Text>
              </View>
              <Button
                accessibilityLabel={`Delete the chat with ${nameFor(activeContact)}`}
                colors={colors}
                icon="trash-outline"
                label="Delete"
                onPress={() => setConfirmDelete(activeContact)}
                variant="ghost"
              />
            </Row>
            <View style={styles.thread}>
              {thread.length === 0 ? (
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  No messages in this conversation yet.
                </Text>
              ) : (
                thread.map((entry) => (
                  <MessageBubble
                    colors={colors}
                    entry={entry}
                    key={entry.id}
                    {...(entry.readable &&
                    (entry.deliveryState ?? 0) < DeliveryState.DELIVERY_STATE_READ
                      ? {
                          onMarkRead: () => {
                            void publishSignalDeliveryReceipt(
                              homeNode.baseUrl,
                              { message: entry.id, state: DeliveryState.DELIVERY_STATE_READ },
                              homeNode.discovery.services.auditLogs,
                            )
                              .then(() => refresh())
                              .catch((error: Error) =>
                                setReadError(error.message),
                              );
                          },
                        }
                      : {})}
                  />
                ))
              )}
            </View>
            <Card colors={colors} style={styles.lifecycle}>
              <Field colors={colors} label="Message" multiline onChangeText={setMessage} value={message} />
              <Button
                colors={colors}
                disabled={busy || message.trim().length === 0}
                icon="send-outline"
                label={busy ? 'Encrypting…' : 'Send'}
                onPress={() => void send()}
                system="signal"
              />
            </Card>
          </>
        ) : (
          /* ── The conversation list ──────────────────────────────────────────────── */
          <>
            {threads.length > 0 ? (
              <View style={styles.rowGroup}>
                {threads.map(({ key, lastAtMs, preview, waiting }) => (
                  <View key={key} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Chat with ${nameFor(key)}`}
                    onPress={() => setActiveContact(key)}
                    style={({ pressed }) => [styles.listRowMain, { opacity: pressed ? 0.65 : 1 }]}
                  >
                    <View style={[styles.channelAvatar, { backgroundColor: colors.surface2 }]}>
                      <Ionicons color={colors.signal} name="person-circle-outline" size={24} />
                    </View>
                    <View style={styles.listRowBody}>
                      <Row gap={spacing.xs}>
                        <Text
                          numberOfLines={1}
                          style={[typography.label, styles.flex, { color: colors.text }]}
                        >
                          {nameFor(key)}
                        </Text>
                        <Text style={[typography.caption, { color: colors.text3 }]}>
                          {ago(lastAtMs)}
                        </Text>
                      </Row>
                      <Text numberOfLines={1} style={[typography.caption, { color: colors.text2 }]}>
                        {preview}
                      </Text>
                      {/* Undelivered is a fact about the conversation, so it is on the row. */}
                      {waiting > 0 ? (
                        <Row gap={spacing.xxs}>
                          <Ionicons color={colors.constrained} name="time-outline" size={13} />
                          <Text style={[typography.caption, { color: colors.constrained }]}>
                            {waiting} waiting to send
                          </Text>
                        </Row>
                      ) : null}
                    </View>
                  </Pressable>
                  <Button
                    accessibilityLabel={`Delete the chat with ${nameFor(key)}`}
                    colors={colors}
                    icon="trash-outline"
                    label=""
                    onPress={() => setConfirmDelete(key)}
                    variant="ghost"
                  />
                  </View>
                ))}
              </View>
            ) : null}

            <SectionHeader colors={colors} title="Start a chat" />
            {recipientName ? (
              <Card colors={colors} style={styles.lifecycle}>
                <Row gap={spacing.xs}>
                  <Ionicons color={colors.signal} name="person-circle-outline" size={20} />
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{recipientName}</Text>
                    <Fingerprint colors={colors} value={recipient} />
                  </View>
                  <Button colors={colors} label="Change" onPress={() => { setRecipient(''); setRecipientName(''); }} variant="ghost" />
                </Row>
                <Field colors={colors} label="First message" multiline onChangeText={setMessage} value={message} />
                <Button
                  colors={colors}
                  disabled={busy || recipient.length !== 64 || message.trim().length === 0}
                  icon="send-outline"
                  label={busy ? 'Encrypting…' : 'Send first message'}
                  onPress={() => void send()}
                  system="signal"
                />
              </Card>
            ) : (
              /*
                Was a text field demanding 64 hexadecimal characters obtained out of band —
                the single biggest reason nobody could start a conversation. Search, saved
                contacts and QR all resolve to the same key underneath.
              */
              <PeoplePicker
                baseUrl={homeNode.baseUrl}
                colors={colors}
                onPick={(person) => {
                  setRecipient(person.identityKey);
                  setRecipientName(person.displayName || person.identityId || 'Scanned identity');
                }}
              />
            )}
          </>
        )
      ) : (
        <>
          <SectionHeader colors={colors} title="Create a coordination group" />
          <Card colors={colors} style={styles.formCard}>
            <Field colors={colors} label="Group name" onChangeText={setGroupName} value={groupName} />
            <Field colors={colors} label="Member Signal keys" multiline onChangeText={setGroupMembers} placeholder="Two or more 64-character keys, separated by spaces" value={groupMembers} />
            <Button colors={colors} disabled={busy || !groupName.trim() || memberKeys(groupMembers).length < 2} label={busy ? 'Wrapping sender key…' : 'Create encrypted group'} onPress={() => void createGroup()} system="signal" />
          </Card>
          <SectionHeader colors={colors} title="Groups on this identity" />
          {groups.length === 0 ? (
            <EmptyState body="Groups you create or join will appear here." colors={colors} icon="people-outline" system="signal" title="No Signal groups" />
          ) : (
            <View style={styles.rowGroup}>
              {groups.map((group) => (
                <Pressable
                  accessibilityLabel={`Open Signal group ${group.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedGroup === group.id }}
                  key={group.id}
                  onPress={() => setSelectedGroup(group.id)}
                  style={[styles.listRow, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.listRowBody}>
                    <Text style={[typography.label, { color: colors.text }]}>{group.name}</Text>
                    <Text style={[typography.caption, { color: colors.text2 }]}>{group.memberKeys.length} members · {group.id.slice(0, 18)}…</Text>
                  </View>
                  <Ionicons color={selectedGroup === group.id ? colors.signal : colors.text2} name="chevron-forward" size={18} />
                </Pressable>
              ))}
            </View>
          )}
          {selectedGroup ? (
            <Card colors={colors} style={styles.lifecycle}>
              <StatusBanner body="Every membership change creates a fresh 32-byte sender key and wraps it separately for every remaining member." colors={colors} icon="key-outline" title="Rekey is mandatory" tone="verified" />
              <Field colors={colors} label="Add member keys" multiline onChangeText={setAddMembers} value={addMembers} />
              <Field colors={colors} label="Remove member keys" multiline onChangeText={setRemoveMembers} value={removeMembers} />
              <Button colors={colors} disabled={busy || (!addMembers.trim() && !removeMembers.trim())} label={busy ? 'Rekeying…' : 'Update members and rekey'} onPress={() => void updateGroup()} system="signal" />
            </Card>
          ) : null}
        </>
      )}
      {/*
        Deleting clears plaintext this device is the only holder of, so it asks first — and it
        says exactly what it does and does not reach, because "delete" in a messaging app is
        routinely assumed to reach the other person's phone. It does not.
      */}
      {confirmDelete ? (
        <Card colors={colors} style={styles.lifecycle}>
          <Text style={[typography.label, { color: colors.text }]}>
            Delete your copy of this chat with {nameFor(confirmDelete)}?
          </Text>
          <Text style={[typography.caption, { color: colors.text2 }]}>
            Removes it from this device only. Their copy is untouched, and anything they send
            afterwards will start the chat again.
          </Text>
          <Row gap={spacing.xs} wrap>
            <Button colors={colors} label="Cancel" onPress={() => setConfirmDelete('')} variant="secondary" />
            <Button
              colors={colors}
              icon="trash-outline"
              label="Delete on this device"
              onPress={() => {
                const key = confirmDelete;
                setConfirmDelete('');
                void removeChat(key);
              }}
              variant="destructive"
            />
          </Row>
        </Card>
      ) : null}
      {/*
        Success is stated, not sniffed from the wording. The banner used to decide its own
        tone with `notice.startsWith('Encrypted')`, so rewording a message changed whether it
        rendered as a success or a failure.
      */}
      {notice ? (
        <StatusBanner
          body={notice}
          colors={colors}
          icon={notice === SEND_OK ? 'checkmark-circle-outline' : 'warning-outline'}
          title={notice === SEND_OK ? 'Encrypted and queued' : 'Could not send'}
          tone={notice === SEND_OK ? 'verified' : 'danger'}
        />
      ) : null}
      {/*
        Its own banner, and a warning rather than a failure: the inbox is stale, which is the
        ordinary state offline. Nothing here claims anything about a message you just sent.
      */}
      {readError ? (
        <StatusBanner
          body={readError}
          colors={colors}
          icon="cloud-offline-outline"
          title="Inbox may be out of date"
          tone="warning"
        />
      ) : null}
      <Button colors={colors} icon="refresh-outline" label="Refresh encrypted inbox" onPress={() => void refresh()} variant="ghost" />
      </Page>
    </View>
  );
}

/** The one success value `notice` can hold, so the banner compares rather than guesses. */
const SEND_OK = 'Your message is signed and on its way.';

/** One rendered line of a conversation, whatever source it came from. */
interface ThreadEntry {
  readonly id: string;
  readonly counter: number;
  /** True when this device sent it — decides which side of the thread it sits on. */
  readonly outbound: boolean;
  /** Null when it is genuinely unreadable here: someone else's ciphertext. */
  readonly text: string | null;
  readonly atMs: number;
  readonly state: 'queued' | 'sent' | 'read';
  readonly deliveryState?: number;
  /** True when this device is the recipient, so a read receipt is ours to send. */
  readonly readable?: boolean;
}

/**
 * A message bubble.
 *
 * Ours on the right on the accent surface, theirs on the left on the neutral one — the
 * oldest and most legible convention there is, and it removes the need to label every line
 * with a key prefix. Delivery state is a word plus a glyph, never a tint alone (NFR-A06),
 * and "Queued" is stated plainly because a message waiting for a network is the ordinary
 * case here, not an error.
 */
function MessageBubble({
  colors,
  entry,
  onMarkRead,
}: {
  readonly colors: AppPalette;
  readonly entry: ThreadEntry;
  readonly onMarkRead?: () => void;
}) {
  const surface = entry.outbound ? colors.surface2 : colors.surface;
  return (
    <View style={[styles.bubbleRow, entry.outbound ? styles.bubbleMine : styles.bubbleTheirs]}>
      <View style={[styles.bubble, { backgroundColor: surface, borderColor: colors.border }]}>
        <Text
          maxFontSizeMultiplier={maxFontScale.body}
          style={[typography.body, { color: entry.text ? colors.text : colors.text3 }]}
        >
          {entry.text ?? 'Encrypted for the other participant'}
        </Text>
        <View style={styles.bubbleMeta}>
          <Text
            maxFontSizeMultiplier={maxFontScale.caption}
            style={[typography.caption, { color: colors.text3 }]}
          >
            {new Date(entry.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {entry.outbound ? (
            <>
              <Ionicons
                color={entry.state === 'queued' ? colors.constrained : colors.text3}
                name={
                  entry.state === 'queued'
                    ? 'time-outline'
                    : entry.state === 'read'
                      ? 'checkmark-done-outline'
                      : 'checkmark-outline'
                }
                size={13}
              />
              <Text
                maxFontSizeMultiplier={maxFontScale.caption}
                style={[
                  typography.caption,
                  { color: entry.state === 'queued' ? colors.constrained : colors.text3 },
                ]}
              >
                {entry.state === 'queued' ? 'Queued' : entry.state === 'read' ? 'Read' : 'Sent'}
              </Text>
            </>
          ) : null}
          {onMarkRead ? (
            <Pressable accessibilityRole="button" onPress={onMarkRead} hitSlop={8}>
              <Text
                maxFontSizeMultiplier={maxFontScale.caption}
                style={[typography.caption, { color: colors.signal }]}
              >
                Mark read
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Pick which channel to publish as. Used by both Broadcast and Retract, which had two
 * independent free-text copies of the same 56-character paste.
 *
 * A channel with no row from the node is still offered, labelled by its ID: the vault knows
 * it can sign for it, and that is the fact that decides whether publishing can work. Hiding
 * it while the node is unreachable would take the control away from an operator during
 * exactly the outage it exists for.
 */
function ChannelSelect({
  colors,
  channels,
  value,
  onChange,
}: {
  readonly colors: AppPalette;
  readonly channels: readonly { readonly id: string; readonly row: SignalChannel | null }[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Select
      colors={colors}
      emptyLabel="No channels on this device yet — declare one first."
      hint={
        channels.length > 0
          ? 'Only channels this device holds a signing key for.'
          : undefined
      }
      label="Publish as"
      onChange={onChange}
      options={channels.map(({ id, row }) => ({
        value: id,
        label: row?.name || id,
        detail: row ? `${id.slice(0, 18)}… · last #${row.lastSequence}` : `${id.slice(0, 18)}…`,
      }))}
      placeholder="Choose a channel"
      value={value || null}
    />
  );
}

export function SignalStudioScreen({
  colors,
  mode: themeMode,
  homeNode,
  reach,
  onNetwork,
  onBack,
  initialChannel,
}: SignalScreenProps & {
  /** Arrives from "Publish" on a channel row, so the studio opens on the right one. */
  readonly initialChannel?: string;
}) {
  /*
    Publishing is the repeat job; declaring a channel happens once, years ago.

    The screen opened on "Declare" for everyone for ever, so an operator sending their
    fourth alert of the night landed on a form for creating a channel they already have.
    The landing tab follows what the device can do: publish if it can sign for anything,
    declare if it cannot yet.
  */
  const [mode, setMode] = useState<'channel' | 'broadcast' | 'revoke'>('broadcast');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('');
  const [sequence, setSequence] = useState('1');
  const [headline, setHeadline] = useState('');
  const [detail, setDetail] = useState('');
  const [severityValue, setSeverityValue] = useState(3);
  const [revokeTarget, setRevokeTarget] = useState('');
  const [revokeNote, setRevokeNote] = useState('');
  /*
    An explicit outcome, not a guess from the words.

    The banner used to decide success by `notice.includes('accepted')`, so its tone depended
    on the phrasing of a message rather than on what happened — rewording a success string
    silently turned it red. Same defect as the messages screen mixing a poll failure into the
    send result: state that is read as a status must be stored as one.
  */
  const [notice, setNotice] = useState<{ readonly text: string; readonly ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    The channel to publish as is a CHOICE, not free text.

    It used to be a `Field` you pasted 56 characters into, and every wrong character came back
    as "channel is not known here" or, worse, as "channel signing key is not present in this
    vault" from the signer. The set of valid answers is small, closed, and already on the
    device: the vault's channel map is exactly the channels this key can sign for.

    The node's channel list supplies the human names, and only that. Anything the node knows
    but this vault has no key for is filtered out rather than offered — it would be a choice
    that always fails. When the node is unreachable the owned IDs still populate the list
    (labelled by ID), because a channel operator during a blackout is precisely who must
    still be able to publish.
  */
  const [owned, setOwned] = useState<readonly string[] | null>(null);
  useEffect(() => {
    void ownedSignalChannels().then((ids) => {
      setOwned(ids);
      // Only before the person has touched the control: landing on "Declare" is right for a
      // device with nothing to publish as, and wrong for every visit after that.
      if (ids.length === 0) setMode('channel');
      else if (initialChannel && ids.includes(initialChannel)) setChannel(initialChannel);
      else if (ids.length === 1) setChannel(ids[0]!);
    });
  }, [initialChannel]);
  const channelQuery = useNodeDocument<NodePage<SignalChannel>>(
    homeNode.baseUrl,
    '/v1/signal/channels?limit=200',
  );
  const ownedChannels = useMemo(() => {
    const known = new Map(
      (channelQuery.data?.value.items ?? []).map((item) => [item.id, item] as const),
    );
    return (owned ?? []).map((id) => ({ id, row: known.get(id) ?? null }));
  }, [owned, channelQuery.data]);
  const selectedChannel = ownedChannels.find((item) => item.id === channel)?.row ?? null;

  /*
    Sequence must increase monotonically or the node denies the broadcast, and the previous
    field defaulted to "1" for ever — so the first emit worked and every later one was
    refused. The channel row already carries `lastSequence`; the next one is derivable, and
    the field stays editable for a deliberate gap.
  */
  useEffect(() => {
    if (!selectedChannel) return;
    setSequence((BigInt(selectedChannel.lastSequence) + 1n).toString());
  }, [selectedChannel?.id, selectedChannel?.lastSequence]);

  const publish = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'channel') {
        const result = await declareSignalChannel(
          homeNode.baseUrl,
          { name, description, language: 'bn' },
          homeNode.discovery.services.auditLogs,
        );
        /*
          Follow your own channel, on this device only.

          Broadcasts flood and the client filters locally — there is no server-side
          subscription table, because during a shutdown a list of who follows which channel
          is a list of targets. The consequence is that nothing reaches the Signal inbox
          until a LOCAL follow matches it, and declaring a channel created no such follow.
          So the author emitted a broadcast, went to look for it, and found an empty inbox:
          the one person who must be able to confirm the message went out was the one person
          who could not see it. This is a local record like any other follow and is never
          sent anywhere.
        */
        await saveSignalSubscription(defaultSubscription(result.channelId));
        setChannel(result.channelId);
        // Newly signable, so it has to appear in the picker without a screen reload — and
        // the reason to declare a channel is to publish on it, so land there.
        setOwned(await ownedSignalChannels());
        void channelQuery.refetch();
        setMode('broadcast');
        setNotice({ text: `"${name}" is live. Write its first broadcast below.`, ok: true });
      } else if (mode === 'broadcast') {
        const id = await publishSignalBroadcast(
          homeNode.baseUrl,
          {
            channelId: channel,
            sequence: BigInt(sequence),
            severity: severityValue,
            category: 12,
            headline,
            detail,
            language: 'bn',
            expiresAtMs: BigInt(Date.now() + 24 * 60 * 60 * 1000),
          },
          homeNode.discovery.services.auditLogs,
        );
        setNotice({ text: `Sent to your subscribers. Receipt ${id.slice(0, 14)}…`, ok: true });
      } else {
        const id = await revokeSignalBroadcast(homeNode.baseUrl, { channelId: channel, target: revokeTarget, reason: 3, note: revokeNote }, homeNode.discovery.services.auditLogs);
        setNotice({ text: `Retraction published. Receipt ${id.slice(0, 14)}…`, ok: true });
      }
    } catch (error) {
      setNotice({ text: (error as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={themeMode} reach={reach} title="Signal studio" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
      <SegmentedControl
        colors={colors}
        onChange={setMode}
        options={[
          { value: 'channel', label: 'Declare' },
          { value: 'broadcast', label: 'Broadcast' },
          { value: 'revoke', label: 'Retract' },
        ]}
        value={mode}
      />
      {mode === 'channel' ? (
        <Card colors={colors} style={styles.formCard}>
          <Field colors={colors} label="Channel name" onChangeText={setName} value={name} />
          <Field colors={colors} label="Description" multiline onChangeText={setDescription} value={description} />
        </Card>
      ) : mode === 'broadcast' ? (
        <Card colors={colors} style={styles.formCard}>
          <ChannelSelect
            channels={ownedChannels}
            colors={colors}
            onChange={setChannel}
            value={channel}
          />
          <Field
            colors={colors}
            hint="Set from the channel's last published broadcast. It must increase, and a gap tells subscribers a broadcast is missing."
            keyboardType="number-pad"
            label="Sequence"
            onChangeText={setSequence}
            value={sequence}
          />
          <Text style={[typography.label, { color: colors.text }]}>Severity</Text>
          <Row gap={spacing.xs} wrap>
            {[1, 2, 3, 4].map((value) => (
              <Pill
                colors={colors}
                key={value}
                label={severity[value as keyof typeof severity].label}
                onPress={() => setSeverityValue(value)}
                selected={severityValue === value}
              />
            ))}
          </Row>
          <Field colors={colors} label="Actionable headline" onChangeText={setHeadline} value={headline} />
          <Field colors={colors} label="Optional detail" multiline onChangeText={setDetail} value={detail} />
        </Card>
      ) : (
        <>
          <Card colors={colors} style={styles.formCard}>
            <ChannelSelect
              channels={ownedChannels}
              colors={colors}
              onChange={setChannel}
              value={channel}
            />
            <Field colors={colors} label="Broadcast receipt ID" onChangeText={setRevokeTarget} value={revokeTarget} />
            <Field colors={colors} label="Why is this being retracted?" multiline onChangeText={setRevokeNote} value={revokeNote} />
          </Card>
          <StatusBanner colors={colors} icon="alert-circle-outline" title="Retractions stay visible" body="Subscribers will see that the original broadcast was retracted and why." tone="warning" />
        </>
      )}
      <Button
        colors={colors}
        // Nothing to publish as, so the control says why instead of failing on tap.
        disabled={busy || (mode !== 'channel' && !channel)}
        label={busy ? 'Signing…' : mode === 'channel' ? 'Declare identified channel' : mode === 'broadcast' ? 'Publish broadcast' : 'Retract broadcast'}
        onPress={() => void publish()}
        system="signal"
      />
      {notice ? (
        <StatusBanner
          body={notice.text}
          colors={colors}
          icon={notice.ok ? 'shield-checkmark-outline' : 'warning-outline'}
          title={notice.ok ? 'Published' : 'Could not publish'}
          tone={notice.ok ? 'verified' : 'danger'}
        />
      ) : null}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  /** `PageHeader` is sticky and owns the top inset, so the page below it simply fills. */
  page: { flex: 1 },
  action: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    /*
      Basis-plus-grow, not `flex: 1`. With `flex: 1` in a wrapping row all five tiles fight
      onto one line and each ends up ~60 pt wide; a basis lets three sit per row on a phone,
      more on a tablet, and lets them wrap instead of crush at large font scales.
    */
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    gap: spacing.xs,
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  actionLabel: { textAlign: 'center' },
  /** Wraps rather than dividing by a fixed column count, so it holds at any width. */
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /**
   * The severity edge and the press wrapper. `Card` still supplies surface, border, radius,
   * padding and gap — repeating those is what made these sit unlike every other card.
   */
  alertPress: { borderRadius: radius.lg },
  alertMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  alertNote: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  pulse: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  /**
   * Card supplies surface, border, radius, padding and gap. Only the severity edge is local —
   * repeating the rest is what made these cards sit differently from every other card in the
   * app, and the horizontal margin they used to carry is now `Page`'s gutter.
   */
  alert: { borderLeftWidth: 4 },
  channelAvatar: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  channelAvatarLarge: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  fingerprint: { lineHeight: 24 },
  flex: { flex: 1 },
  /** A group of related controls reads as one surface instead of a loose vertical run. */
  formCard: { gap: spacing.md },
  hero: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  heroText: { flex: 1, gap: spacing.xxs },
  loadingStack: { gap: spacing.sm },
  /** A run of rows reads as one block, so it groups its own hairlines instead of page gaps. */
  rowGroup: { gap: 0 },
  listRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  listRowBody: { flex: 1, minWidth: 0, gap: spacing.xxs },
  /** The tappable part of a row that also carries its own trailing action. */
  listRowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  lifecycle: { gap: spacing.md },
  /** A conversation reads top-down; the bubbles carry the sides. */
  thread: { gap: spacing.xs },
  bubbleRow: { flexDirection: 'row' },
  bubbleMine: { justifyContent: 'flex-end' },
  bubbleTheirs: { justifyContent: 'flex-start' },
  bubble: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xxs,
    /* Never full width: the gap on the other side is what signals which side spoke. */
    maxWidth: '85%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  bubbleMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxs },
  map: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    height: 340,
    overflow: 'hidden',
    position: 'relative',
  },
  mapEmpty: { alignSelf: 'center', marginTop: spacing.xxl },
  mapPoint: {
    borderRadius: radius.pill,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    position: 'absolute',
    width: 16,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  recovery: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  share: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  scanner: { height: 280, borderRadius: radius.lg, overflow: 'hidden' },
  qr: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.sm },
  signalMark: { borderRadius: radius.pill, height: 12, marginTop: spacing.xs, width: 12 },
});
