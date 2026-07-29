import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppPalette, ReachState } from '../../design-system';
import {
  AppHeader,
  Button,
  EmptyState,
  Pill,
  Screen,
  SectionHeader,
  StatusBanner,
} from '../../design-system';
import { radius, spacing, type as typography } from '../../design-system';
import { useNodeDocument, type NodePage } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import {
  authenticateSignalIdentity,
  createSignalIdentity,
  declareSignalChannel,
  panicSignal,
  loadSignalInbox,
  publishMissingPerson,
  publishSignalBroadcast,
  publishSignalCheckIn,
  publishSignalPrekeys,
  publishSignalPushSubscription,
  publishSignalResource,
  registerSignalIdentity,
  signalSessionSummary,
  startSignalSession,
  unlockSignalIdentity,
  verifySignalQrFingerprint,
  type SignalSessionSummary,
  type DecryptedSignalSession,
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
  readonly homeNode: HomeNode;
  readonly reach: ReachState;
  readonly onNetwork: () => void;
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

function Field({
  colors,
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly secureTextEntry?: boolean;
  readonly keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={[typography.caption, { color: colors.text2 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        secureTextEntry={secureTextEntry}
        style={[
          typography.body,
          styles.input,
          multiline ? styles.multiline : null,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
        value={value}
      />
    </View>
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
          <Text style={[typography.label, { color: colors.text }]}>{label as string}</Text>
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
    <View
      accessibilityLabel={`${setting.label}: ${broadcast.headline}`}
      style={[styles.alert, { backgroundColor: colors.surface, borderColor: accent }]}
    >
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
      <View style={styles.row}>
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
      </View>
    </View>
  );
}

export function SignalHomeScreen({
  colors,
  homeNode,
  reach,
  onNetwork,
  onChannels,
  onCheckIn,
  onMap,
  onIdentity,
  onMessages,
  onChannel,
}: SignalScreenProps & {
  readonly onChannels: () => void;
  readonly onCheckIn: () => void;
  readonly onMap: () => void;
  readonly onIdentity: () => void;
  readonly onMessages: () => void;
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
      rows.filter((row) =>
        subscriptions.length === 0
          ? row.severity < 4 || row.verification !== 'unverified'
          : subscriptionAllows(row, subscriptions, Date.now()),
      ),
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
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Signal" onReach={onNetwork} />
      <View style={styles.hero}>
        <View style={[styles.signalMark, { backgroundColor: colors.signal }]} />
        <View style={styles.flex}>
          <Text style={[typography.h1, { color: colors.text }]}>Know who is speaking.</Text>
          <Text style={[typography.body, { color: colors.text2 }]}>
            Identified crisis broadcasts and private coordination, isolated from your Forum identity.
          </Text>
        </View>
      </View>
      <SignalActions colors={colors} onChannels={onChannels} onCheckIn={onCheckIn} onMap={onMap} />
      <View style={styles.row}>
        <Button colors={colors} label="Signal identity" onPress={onIdentity} variant="secondary" system="signal" />
        <Button colors={colors} label="Private messages" onPress={onMessages} variant="secondary" system="signal" />
      </View>
      {subscriptions.length === 0 ? (
        <StatusBanner
          action="Choose channels"
          body="Until you subscribe, this screen shows received non-critical traffic for discovery. Unverified critical alerts stay blocked."
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
      {ordered.length === 0 ? (
        <EmptyState
          body="No alert matching your local filters has arrived yet."
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
    </Screen>
  );
}

export function SignalChannelsScreen({
  colors,
  homeNode,
  reach,
  onNetwork,
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
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Channels" onReach={onNetwork} />
      <Field colors={colors} label="Find a broadcaster" onChangeText={setQueryText} value={queryText} />
      <Button colors={colors} label="Create or publish" onPress={onStudio} system="signal" />
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
          <View style={styles.flex}>
            <View style={styles.rowCompact}>
              <Text style={[typography.h2, { color: colors.text }]}>{channel.name}</Text>
              <Pill colors={colors} label={channel.verification} />
            </View>
            <Text numberOfLines={2} style={[typography.body, { color: colors.text2 }]}>
              {channel.description}
            </Text>
            {channel.confusableWith.length > 0 ? (
              <Text style={[typography.caption, { color: colors.constrained }]}>
                Similar-looking name — verify the fingerprint
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          body="Connected nodes have not announced a matching identified channel."
          colors={colors}
          icon="search-outline"
          system="signal"
          title="No channel found"
        />
      ) : null}
    </Screen>
  );
}

function hexToBase64(value: string): string {
  const bytes = value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  return globalThis.btoa(String.fromCharCode(...bytes));
}

export function SignalChannelScreen({
  channelId,
  colors,
  homeNode,
  reach,
  onNetwork,
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
  const [notice, setNotice] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
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

  const verify = async () => {
    if (!channel) return;
    if (!verifySignalQrFingerprint(Uint8Array.from(channel.currentSigningKey.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []), scannedFingerprint)) {
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
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title={channel?.name ?? 'Channel'} onReach={onNetwork} />
      {channel ? (
        <>
          <View style={styles.hero}>
            <View style={[styles.channelAvatarLarge, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="radio-outline" color={colors.signal} size={30} />
            </View>
            <View style={styles.flex}>
              <Text style={[typography.h1, { color: colors.text }]}>{channel.name}</Text>
              <Text style={[typography.body, { color: colors.text2 }]}>{channel.description}</Text>
            </View>
          </View>
          <View style={styles.rowCompact}>
            <Pill colors={colors} label={personallyVerified ? 'personally verified' : channel.verification} />
            <Pill colors={colors} label={channel.language.toUpperCase()} />
          </View>
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
          <Text style={[typography.mono, styles.fingerprint, { color: colors.text2 }]}>
            {channel.currentSigningKey.match(/.{1,4}/g)?.join(' ')}
          </Text>
          <Field
            colors={colors}
            label="Scanned QR fingerprint (base64)"
            onChangeText={setScannedFingerprint}
            placeholder={hexToBase64(channel.currentSigningKey)}
            value={scannedFingerprint}
          />
          <Button colors={colors} label="Verify locally" onPress={() => void verify()} variant="secondary" system="signal" />
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
    </Screen>
  );
}

export function SignalCrisisScreen(props: SignalScreenProps) {
  const { colors, homeNode, reach, onNetwork } = props;
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
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Crisis desk" onReach={onNetwork} />
      <View style={styles.rowCompact}>
        {(['checkin', 'missing', 'resource'] as const).map((value) => (
          <Pill
            colors={colors}
            key={value}
            label={value === 'checkin' ? 'Check in' : value === 'missing' ? 'Missing person' : 'Resource'}
            onPress={() => setMode(value)}
            selected={mode === value}
          />
        ))}
      </View>
      {mode === 'checkin' ? (
        <>
          <Text style={[typography.h1, { color: colors.text }]}>How are you?</Text>
          <View style={styles.rowCompact}>
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
          </View>
          <Field colors={colors} label="Short note (80 characters)" onChangeText={setNote} value={note} />
          <StatusBanner
            body="Check-ins cost zero credits and require no anti-abuse credential."
            colors={colors}
            icon="hand-left-outline"
            title="Safety is never rate-limited"
            tone="verified"
          />
        </>
      ) : mode === 'missing' ? (
        <>
          <Field colors={colors} label="Person's name" onChangeText={setName} value={name} />
          <Field colors={colors} keyboardType="number-pad" label="Age" onChangeText={setAge} value={age} />
          <Field colors={colors} label="Last seen place" onChangeText={setPlace} value={place} />
          <Field colors={colors} label="Description" multiline onChangeText={setDetail} value={detail} />
        </>
      ) : (
        <>
          <View style={styles.rowCompact}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
              <Pill
                colors={colors}
                key={value}
                label={['', 'Shelter', 'Water', 'Food', 'Medical', 'Fuel', 'Power', 'Internet', 'Road'][value]!}
                onPress={() => setResourceKind(value)}
                selected={resourceKind === value}
              />
            ))}
          </View>
          <View style={styles.rowCompact}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pill
                colors={colors}
                key={value}
                label={['', 'Available', 'Limited', 'Exhausted', 'Blocked', 'Damaged'][value]!}
                onPress={() => setResourceState(value)}
                selected={resourceState === value}
              />
            ))}
          </View>
          <Field colors={colors} label="Area or landmark" onChangeText={setPlace} value={place} />
          <Field colors={colors} label="What did you observe?" multiline onChangeText={setDetail} value={detail} />
        </>
      )}
      <Button
        colors={colors}
        disabled={busy}
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
    </Screen>
  );
}

export function SignalMapScreen({ colors, homeNode, reach, onNetwork }: SignalScreenProps) {
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
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Offline area map" onReach={onNetwork} />
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
      {points.map((point) => (
        <View key={`legend:${point.id}`} style={[styles.listRow, { borderBottomColor: colors.border }]}>
          <Ionicons
            name={point.kind === 'check-in' ? 'hand-left-outline' : 'location-outline'}
            color={point.kind === 'check-in' ? colors.verified : colors.signal}
            size={20}
          />
          <View style={styles.flex}>
            <Text style={[typography.label, { color: colors.text }]}>{point.label}</Text>
            <Text style={[typography.caption, { color: colors.text2 }]}>{point.area.placeName}</Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

export function SignalIdentityScreen({ colors, homeNode, reach, onNetwork }: SignalScreenProps) {
  const [summary, setSummary] = useState<SignalSessionSummary>({
    configured: false,
    unlocked: false,
    authenticated: false,
  });
  const [passphrase, setPassphrase] = useState('');
  const [recovery, setRecovery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => setSummary(await signalSessionSummary());
  useEffect(() => {
    void refresh();
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice('');
    try {
      const result = await action();
      if (typeof result === 'object' && result && 'recoveryPhrase' in result) {
        setRecovery(String((result as { recoveryPhrase: string }).recoveryPhrase));
      }
      setNotice('Signal vault updated.');
      await refresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Signal identity" onReach={onNetwork} />
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
      <Field
        colors={colors}
        label="Signal vault passphrase"
        onChangeText={setPassphrase}
        secureTextEntry
        value={passphrase}
      />
      <View style={styles.row}>
        <Button
          colors={colors}
          disabled={busy || passphrase.length < 8}
          label="Create Signal identity"
          onPress={() => void run(() => createSignalIdentity(passphrase))}
          system="signal"
        />
        <Button
          colors={colors}
          disabled={busy || passphrase.length < 8}
          label="Unlock"
          onPress={() => void run(() => unlockSignalIdentity(passphrase))}
          variant="secondary"
          system="signal"
        />
      </View>
      {recovery ? (
        <View style={[styles.recovery, { backgroundColor: colors.surface, borderColor: colors.constrained }]}>
          <Text style={[typography.label, { color: colors.constrained }]}>Write this down offline</Text>
          <Text selectable style={[typography.mono, { color: colors.text }]}>{recovery}</Text>
        </View>
      ) : null}
      {summary.unlocked ? (
        <>
          <Button
            colors={colors}
            disabled={busy}
            label="Register certificate"
            onPress={() =>
              void run(() =>
                registerSignalIdentity(
                  homeNode.baseUrl,
                  homeNode.discovery.services.auditLogs,
                ),
              )
            }
            system="signal"
          />
          <Button
            colors={colors}
            disabled={busy}
            label="Authenticate"
            onPress={() => void run(() => authenticateSignalIdentity(homeNode.baseUrl))}
            variant="secondary"
            system="signal"
          />
          <Button
            colors={colors}
            disabled={busy}
            label="Publish offline prekeys"
            onPress={() =>
              void run(() =>
                publishSignalPrekeys(
                  homeNode.baseUrl,
                  homeNode.discovery.services.auditLogs,
                ),
              )
            }
            variant="secondary"
            system="signal"
          />
          <Button
            colors={colors}
            disabled={busy}
            label="Panic wipe Signal only"
            onPress={() => void run(panicSignal)}
            variant="destructive"
          />
        </>
      ) : null}
      {notice ? (
        <StatusBanner
          body={notice}
          colors={colors}
          icon={notice === 'Signal vault updated.' ? 'shield-checkmark-outline' : 'warning-outline'}
          title={notice === 'Signal vault updated.' ? 'Done' : 'Action failed'}
          tone={notice === 'Signal vault updated.' ? 'verified' : 'danger'}
        />
      ) : null}
    </Screen>
  );
}

export function SignalMessagesScreen({ colors, homeNode, reach, onNetwork }: SignalScreenProps) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sessions, setSessions] = useState<readonly DecryptedSignalSession[]>([]);
  const refresh = async () => {
    try {
      setSessions(await loadSignalInbox(homeNode.baseUrl));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read Signal inbox');
    }
  };
  useEffect(() => {
    void refresh();
  }, [homeNode.baseUrl]);
  const send = async () => {
    setBusy(true);
    setNotice('');
    try {
      const id = await startSignalSession(
        homeNode.baseUrl,
        recipient,
        message,
        homeNode.discovery.services.auditLogs,
      );
      setNotice(`Encrypted session queued as ${id}`);
      setMessage('');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Private Signal" onReach={onNetwork} />
      <StatusBanner
        body="The node receives the recipient key and authenticated ciphertext only. Session initiation combines X25519 and ML-KEM-768."
        colors={colors}
        icon="lock-closed-outline"
        title="End-to-end encrypted"
        tone="verified"
      />
      <Field
        colors={colors}
        label="Recipient Signal key (hex)"
        onChangeText={setRecipient}
        placeholder="64 hexadecimal characters"
        value={recipient}
      />
      <Field colors={colors} label="First message" multiline onChangeText={setMessage} value={message} />
      <Button
        colors={colors}
        disabled={busy || recipient.length !== 64 || message.trim().length === 0}
        label={busy ? 'Encrypting…' : 'Start encrypted session'}
        onPress={() => void send()}
        system="signal"
      />
      {notice ? (
        <StatusBanner
          body={notice}
          colors={colors}
          icon={notice.startsWith('Encrypted') ? 'checkmark-circle-outline' : 'warning-outline'}
          title={notice.startsWith('Encrypted') ? 'Message stored for delivery' : 'Could not send'}
          tone={notice.startsWith('Encrypted') ? 'verified' : 'danger'}
        />
      ) : null}
      <Button colors={colors} label="Refresh encrypted inbox" onPress={() => void refresh()} variant="ghost" />
      {sessions.map((session) => (
        <View
          key={session.id}
          style={[styles.listRow, { borderBottomColor: colors.border }]}
        >
          <View style={styles.flex}>
            <Text style={[typography.caption, { color: colors.text2 }]}>
              {session.senderKey.slice(0, 16)}… · {new Date(session.createdAtMs).toLocaleString()}
            </Text>
            <Text style={[typography.body, { color: colors.text }]}>
              {session.plaintext ?? 'Ciphertext for the other participant'}
            </Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

export function SignalStudioScreen({ colors, homeNode, reach, onNetwork }: SignalScreenProps) {
  const [mode, setMode] = useState<'channel' | 'broadcast'>('channel');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('');
  const [sequence, setSequence] = useState('1');
  const [headline, setHeadline] = useState('');
  const [detail, setDetail] = useState('');
  const [severityValue, setSeverityValue] = useState(3);
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
      } else {
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
      }
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Signal studio" onReach={onNetwork} />
      <View style={styles.rowCompact}>
        <Pill colors={colors} label="Declare channel" onPress={() => setMode('channel')} selected={mode === 'channel'} />
        <Pill colors={colors} label="Emit broadcast" onPress={() => setMode('broadcast')} selected={mode === 'broadcast'} />
      </View>
      {mode === 'channel' ? (
        <>
          <Field colors={colors} label="Channel name" onChangeText={setName} value={name} />
          <Field colors={colors} label="Description" multiline onChangeText={setDescription} value={description} />
        </>
      ) : (
        <>
          <Field colors={colors} label="Channel ID" onChangeText={setChannel} value={channel} />
          <Field colors={colors} keyboardType="number-pad" label="Sequence" onChangeText={setSequence} value={sequence} />
          <View style={styles.rowCompact}>
            {[1, 2, 3, 4].map((value) => (
              <Pill
                colors={colors}
                key={value}
                label={severity[value as keyof typeof severity].label}
                onPress={() => setSeverityValue(value)}
                selected={severityValue === value}
              />
            ))}
          </View>
          <Field colors={colors} label="Actionable headline" onChangeText={setHeadline} value={headline} />
          <Field colors={colors} label="Optional detail" multiline onChangeText={setDetail} value={detail} />
        </>
      )}
      <Button
        colors={colors}
        disabled={busy}
        label={busy ? 'Signing…' : mode === 'channel' ? 'Declare identified channel' : 'Emit broadcast'}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: spacing.xs,
    minHeight: 72,
    justifyContent: 'center',
    padding: spacing.sm,
  },
  actionRail: { flexDirection: 'row', gap: spacing.sm },
  alert: {
    borderLeftWidth: 4,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
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
  field: { gap: spacing.xs },
  fingerprint: { lineHeight: 24 },
  flex: { flex: 1 },
  hero: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
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
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  recovery: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowCompact: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  signalMark: { borderRadius: radius.pill, height: 12, marginTop: spacing.xs, width: 12 },
});
