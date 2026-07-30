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
  Skeleton,
  StatusBanner,
  TextAreaField,
  TextField,
} from '../../design-system';
import { radius, spacing, type as typography } from '../../design-system';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PeoplePicker } from './people-picker';
import { loadSignalContacts, type SignalContact } from './contacts';
import { encodeSignalIdentityCard } from './identity-card';
import { clearSignalBackupOwed, isSignalBackupOwed } from './storage';
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

function SignalActions({
  colors,
  onChannels,
  onCheckIn,
  onMap,
}: {
  readonly colors: AppPalette;
  readonly onChannels: () => void;
  readonly onCheckIn: () => void;
  readonly onMap: () => void;
}) {
  return (
    <View style={styles.actionRail}>
      {[
        ['people-outline', 'Channels', onChannels],
        ['hand-left-outline', 'Check in', onCheckIn],
        ['map-outline', 'Area map', onMap],
      ].map(([icon, label, action]) => (
        <Pressable
          accessibilityLabel={label as string}
          accessibilityRole="button"
          key={label as string}
          onPress={action as () => void}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name={icon as 'people-outline'} color={colors.signal} size={22} />
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.15}
            minimumFontScale={0.85}
            numberOfLines={2}
            style={[typography.label, styles.actionLabel, { color: colors.text }]}
          >
            {label as string}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function AlertCard({
  broadcast,
  colors,
  acknowledged,
  onAcknowledge,
  onChannel,
}: {
  readonly broadcast: SignalBroadcast;
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
  return (
    <Card colors={colors} style={{ ...styles.alert, borderColor: accent }}>
      <View style={styles.alertHeading}>
        <View style={styles.alertTitle}>
          <Ionicons name={setting.icon} size={22} color={accent} />
          <Text style={[typography.label, { color: accent }]}>{setting.label.toUpperCase()}</Text>
          <Text style={[typography.mono, { color: colors.text3 }]}>#{broadcast.sequence}</Text>
        </View>
        <Text style={[typography.caption, { color: colors.text3 }]}>
          {new Date(broadcast.createdAtMs).toLocaleTimeString()}
        </Text>
      </View>
      <Text style={[typography.h2, { color: colors.text }]}>{broadcast.headline}</Text>
      {broadcast.detail ? (
        <Text style={[typography.body, { color: colors.text2 }]}>{broadcast.detail}</Text>
      ) : null}
      {broadcast.gap ? (
        <StatusBanner
          colors={colors}
          icon="cut-outline"
          title={`Broadcasts ${broadcast.gap.from}–${broadcast.gap.to} did not reach you`}
          body="The sequence gap is visible evidence of missing delivery."
          tone="warning"
        />
      ) : null}
      {broadcast.revokedAtMs ? (
        <StatusBanner
          colors={colors}
          icon="return-down-back-outline"
          title="Retracted — retained for safety"
          body={broadcast.revokeNote || 'The broadcaster revoked this alert.'}
          tone="danger"
        />
      ) : null}
      <Row gap={spacing.sm} wrap>
        <Button colors={colors} label="View channel" onPress={onChannel} variant="ghost" system="signal" />
        {broadcast.severity === 4 && !acknowledged ? (
          <Button
            colors={colors}
            icon="checkmark-circle-outline"
            label="Acknowledge"
            onPress={onAcknowledge}
            system="signal"
          />
        ) : null}
      </Row>
    </Card>
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

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title="Signal" onReach={onNetwork} />
      <Page colors={colors}>
        <View style={styles.hero}>
          <View style={[styles.signalMark, { backgroundColor: colors.signal }]} />
          <View style={styles.heroText}>
            <Text style={[typography.h1, { color: colors.text }]}>Know who is speaking.</Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              Identified crisis broadcasts and private coordination, isolated from your Forum identity.
            </Text>
          </View>
        </View>
      </View>
      {/*
        Messaging is the primary action, not the third secondary button.
        People arrive at this tab wanting to talk to someone; it used to be an equal-weight
        chip beside "LXMF mesh", and reaching a first message meant eleven steps that began
        with finding "Signal identity" and ended with pasting 64 hex characters.
      */}
      <Button colors={colors} label="Messages" icon="chatbubbles-outline" onPress={onMessages} system="signal" />
      <SignalActions colors={colors} onChannels={onChannels} onCheckIn={onCheckIn} onMap={onMap} />
      <Row gap={spacing.sm} wrap>
        <Button colors={colors} label="Your identity and code" onPress={onIdentity} variant="secondary" system="signal" icon="qr-code-outline" />
        <Button colors={colors} label="Radio (LXMF)" onPress={onMesh} variant="ghost" system="signal" icon="radio-outline" />
      </Row>
      {subscriptions.length === 0 ? (
        <StatusBanner
          action="Choose channels"
          body="No broadcast enters this inbox until you follow its channel. Discovery remains available without exposing your follow list."
          colors={colors}
          icon="options-outline"
          onAction={onChannels}
          title="Filters stay on this device"
        />
      ) : null}
      <SectionHeader colors={colors} title="Received alerts" />
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
        <EmptyState
          body={subscriptions.length === 0 ? 'Follow a channel to receive its signed broadcasts.' : 'No alert matching your local subscription filters has arrived yet.'}
          colors={colors}
          icon="radio-outline"
          system="signal"
          title="Listening quietly"
        />
      ) : (
        ordered.map((broadcast) => (
          <AlertCard
            acknowledged={acknowledged.has(broadcast.id)}
            broadcast={broadcast}
            colors={colors}
            icon="options-outline"
            onAction={onChannels}
            title="Filters stay on this device"
          />
        ) : null}
        <SectionHeader colors={colors} title="Received alerts" />
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
          <EmptyState
            body={subscriptions.length === 0 ? 'Follow a channel to receive its signed broadcasts.' : 'No alert matching your local subscription filters has arrived yet.'}
            colors={colors}
            icon="radio-outline"
            system="signal"
            title="Listening quietly"
          />
        ) : (
          ordered.map((broadcast) => (
            <AlertCard
              acknowledged={acknowledged.has(broadcast.id)}
              broadcast={broadcast}
              colors={colors}
              key={broadcast.id}
              onAcknowledge={() => void acknowledge(broadcast.id)}
              onChannel={() => onChannel(broadcast.channel)}
            />
          ))
        )}
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
  readonly onStudio: () => void;
}) {
  const [queryText, setQueryText] = useState('');
  const query = useNodeDocument<NodePage<SignalChannel>>(
    homeNode.baseUrl,
    `/v1/signal/channels?q=${encodeURIComponent(queryText)}&limit=100`,
  );
  const rows = query.data?.value.items ?? [];
  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} reach={reach} title="Channels" onBack={onBack} onReach={onNetwork} />
      <Page colors={colors}>
        <Field colors={colors} label="Find a broadcaster" onChangeText={setQueryText} value={queryText} />
        <Button colors={colors} icon="add-circle-outline" label="Create or publish" onPress={onStudio} system="signal" />
        {rows.length > 0 ? (
          <View style={styles.rowGroup}>
            {rows.map((channel) => (
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
                    <Text style={[typography.h2, { color: colors.text }]}>{channel.name}</Text>
                    <Pill colors={colors} label={channel.verification} />
                  </Row>
                  <Text numberOfLines={2} style={[typography.body, { color: colors.text2 }]}>
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
        {!query.isLoading && rows.length === 0 ? (
          <EmptyState
            body="Connected nodes have not announced a matching identified channel."
            colors={colors}
            icon="search-outline"
            system="signal"
            title="No channel found"
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
  const [done, setDone] = useState('');
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [backupOwed, setBackupOwed] = useState(false);
  const action = useAsyncAction();

  const refresh = useCallback(async () => {
    setSummary(await signalSessionSummary());
    setBackupOwed(await isSignalBackupOwed());
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
          onUnlock={() => run('Unlocking your Signal identity', () => unlockSignalIdentity(passphrase, salt))}
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
  const [activeSession, setActiveSession] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const [groups, setGroups] = useState<readonly SignalGroupDocument[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [addMembers, setAddMembers] = useState('');
  const [removeMembers, setRemoveMembers] = useState('');
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
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read Signal inbox');
    }
  };
  useEffect(() => {
    void refresh();
    void loadSignalContacts().then(setContacts);
    /*
      Replies used to appear only when someone remembered to tap "Refresh encrypted inbox",
      which makes a messaging app look like it silently drops messages. The Signal home
      screen already polls broadcasts on this cadence; matching it keeps the two surfaces
      consistent and does not add a second timing to reason about.
    */
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [homeNode.baseUrl]);

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

  const send = async () => {
    setBusy(true);
    setNotice('');
    try {
      let id: string;
      if (activeSession) {
        const session = sessions.find((item) => item.id === activeSession);
        if (!session) throw new Error('Choose a valid session.');
        const recipientKey =
          session.senderKey.toLowerCase() === identityKey.toLowerCase()
            ? session.recipientKey
            : session.senderKey;
        const latest = messages
          .filter((item) => item.session === activeSession)
          .reduce((value, item) => Math.max(value, Number(item.counter)), 0);
        id = await continueSignalSession(
          homeNode.baseUrl,
          {
            session: activeSession,
            recipientKey,
            counter: BigInt(latest + 1),
            plaintext: message,
          },
          homeNode.discovery.services.auditLogs,
        );
      } else {
        id = await startSignalSession(
          homeNode.baseUrl,
          recipient,
          message,
          homeNode.discovery.services.auditLogs,
        );
      }
      setNotice(`Encrypted message queued as ${id}`);
      setMessage('');
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
      <StatusBanner
        body="The node receives the recipient key and authenticated ciphertext only. Session initiation combines X25519 and ML-KEM-768."
        colors={colors}
        icon="lock-closed-outline"
        title="End-to-end encrypted"
        tone="verified"
      />
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
        <Card colors={colors} style={styles.lifecycle}>
          <Text style={[typography.label, { color: colors.text }]}>Continue a conversation</Text>
          <Row gap={spacing.xs} wrap>
            <Pill colors={colors} label="New session" onPress={() => setActiveSession('')} selected={!activeSession} />
            {sessions.map((session) => (
              <Pill colors={colors} key={session.id} label={nameFor(counterpartKey(session))} onPress={() => setActiveSession(session.id)} selected={activeSession === session.id} />
            ))}
          </Row>
          {!activeSession ? (
            recipientName ? (
              <Card colors={colors} style={styles.lifecycle}>
                <Row gap={spacing.xs}>
                  <Ionicons color={colors.signal} name="person-circle-outline" size={20} />
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{recipientName}</Text>
                    <Fingerprint colors={colors} value={recipient} />
                  </View>
                  <Button colors={colors} label="Change" onPress={() => { setRecipient(''); setRecipientName(''); }} variant="ghost" />
                </Row>
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
            )
          ) : null}
          <Field colors={colors} label={activeSession ? 'Message' : 'First message'} multiline onChangeText={setMessage} value={message} />
          <Button colors={colors} disabled={busy || (!activeSession && recipient.length !== 64) || message.trim().length === 0} label={busy ? 'Encrypting…' : activeSession ? 'Send encrypted message' : 'Start encrypted session'} onPress={() => void send()} system="signal" />
        </Card>
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
      {notice ? (
        <StatusBanner
          body={notice}
          colors={colors}
          icon={notice.startsWith('Encrypted') ? 'checkmark-circle-outline' : 'warning-outline'}
          title={notice.startsWith('Encrypted') ? 'Message stored for delivery' : 'Could not send'}
          tone={notice.startsWith('Encrypted') ? 'verified' : 'danger'}
        />
      ) : null}
      <Button colors={colors} icon="refresh-outline" label="Refresh encrypted inbox" onPress={() => void refresh()} variant="ghost" />
      {mode === 'sessions' && (sessions.length > 0 || messages.length > 0) ? (
        <>
          <SectionHeader colors={colors} title="Decrypted on this device" />
          <View style={styles.rowGroup}>
            {sessions.map((session) => (
              <View key={session.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <View style={styles.listRowBody}>
                  <Text style={[typography.caption, { color: colors.text2 }]}>
                    {session.senderKey.slice(0, 16)}… · {new Date(session.createdAtMs).toLocaleString()}
                  </Text>
                  <Text style={[typography.body, { color: colors.text }]}>
                    {session.plaintext ?? 'Ciphertext for the other participant'}
                  </Text>
                </View>
              </View>
            ))}
            {messages.map((item) => (
              <View key={item.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <View style={styles.listRowBody}>
                  <Text style={[typography.caption, { color: colors.text2 }]}>
                    Message {item.counter} · {new Date(item.createdAtMs).toLocaleString()}
                  </Text>
                  <Text style={[typography.body, { color: colors.text }]}>
                    {item.plaintext ?? 'Encrypted message sent from this device'}
                  </Text>
                </View>
                {item.recipientKey.toLowerCase() === identityKey.toLowerCase() ? (
                  <Button
                    colors={colors}
                    label={item.deliveryState >= DeliveryState.DELIVERY_STATE_READ ? 'Read' : 'Mark read'}
                    onPress={() => {
                      void publishSignalDeliveryReceipt(homeNode.baseUrl, { message: item.id, state: DeliveryState.DELIVERY_STATE_READ }, homeNode.discovery.services.auditLogs)
                        .then(() => setNotice('Signed read receipt queued.'))
                        .catch((error: Error) => setNotice(error.message));
                    }}
                    system="signal"
                    variant="ghost"
                  />
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
      </Page>
    </View>
  );
}

export function SignalStudioScreen({ colors, mode: themeMode, homeNode, reach, onNetwork, onBack }: SignalScreenProps) {
  const [mode, setMode] = useState<'channel' | 'broadcast' | 'revoke'>('channel');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('');
  const [sequence, setSequence] = useState('1');
  const [headline, setHeadline] = useState('');
  const [detail, setDetail] = useState('');
  const [severityValue, setSeverityValue] = useState(3);
  const [revokeTarget, setRevokeTarget] = useState('');
  const [revokeNote, setRevokeNote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'channel') {
        const result = await declareSignalChannel(
          homeNode.baseUrl,
          { name, description, language: 'bn' },
          homeNode.discovery.services.auditLogs,
        );
        setChannel(result.channelId);
        setNotice(`Channel declared: ${result.channelId}`);
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
        setNotice(`Broadcast accepted: ${id}`);
      } else {
        const id = await revokeSignalBroadcast(homeNode.baseUrl, { channelId: channel, target: revokeTarget, reason: 3, note: revokeNote }, homeNode.discovery.services.auditLogs);
        setNotice(`Broadcast retraction accepted: ${id}`);
      }
    } catch (error) {
      setNotice((error as Error).message);
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
          <Field colors={colors} label="Channel ID" onChangeText={setChannel} value={channel} />
          <Field colors={colors} keyboardType="number-pad" label="Sequence" onChangeText={setSequence} value={sequence} />
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
            <Field colors={colors} label="Channel ID" onChangeText={setChannel} value={channel} />
            <Field colors={colors} label="Broadcast receipt ID" onChangeText={setRevokeTarget} value={revokeTarget} />
            <Field colors={colors} label="Why is this being retracted?" multiline onChangeText={setRevokeNote} value={revokeNote} />
          </Card>
          <StatusBanner colors={colors} icon="alert-circle-outline" title="Retractions stay visible" body="Subscribers will see that the original broadcast was retracted and why." tone="warning" />
        </>
      )}
      <Button
        colors={colors}
        disabled={busy}
        label={busy ? 'Signing…' : mode === 'channel' ? 'Declare identified channel' : mode === 'broadcast' ? 'Emit broadcast' : 'Retract broadcast'}
        onPress={() => void publish()}
        system="signal"
      />
      {notice ? (
        <StatusBanner
          body={notice}
          colors={colors}
          icon={notice.includes('accepted') || notice.includes('declared') ? 'shield-checkmark-outline' : 'warning-outline'}
          title={notice.includes('accepted') || notice.includes('declared') ? 'Published' : 'Could not publish'}
          tone={notice.includes('accepted') || notice.includes('declared') ? 'verified' : 'danger'}
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
    flex: 1,
    gap: spacing.xs,
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  actionLabel: { textAlign: 'center' },
  actionRail: { flexDirection: 'row', gap: spacing.sm },
  /**
   * Card supplies surface, border, radius, padding and gap. Only the severity edge is local —
   * repeating the rest is what made these cards sit differently from every other card in the
   * app, and the horizontal margin they used to carry is now `Page`'s gutter.
   */
  alert: { borderLeftWidth: 4 },
  alertHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  alertTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
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
  lifecycle: { gap: spacing.md },
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
