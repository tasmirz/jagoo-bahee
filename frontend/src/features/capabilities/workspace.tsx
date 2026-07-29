import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import {
  useFederations,
  useNodeCommunities,
  useNodeDocument,
  useNodeFeed,
  useNodeSearch,
  type NodePage,
} from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { listAuditCertificates } from '../../audit';
import {
  forumSessionRequest,
  forumSessionSummary,
  type ForumSessionSummary,
} from '../../signer';
import {
  cryptoBackendDiagnostics,
} from '../../crypto/backend';
import {
  runOnDeviceCryptoParity,
  type CryptoParityReport,
} from '../../crypto/parity';
import type { AppPalette } from '../../theme';
import { radius, spacing, type as typography } from '../../theme';
import { Button, EmptyState, StatusBanner } from '../../ui/primitives';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

interface WorkspaceProps {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
}

interface RoleRow {
  readonly id: string;
  readonly name: string;
  readonly permissionMask: string;
  readonly isDefault: boolean;
}

interface ModRow {
  readonly id: string;
  readonly sequence: number;
  readonly verbName: string;
  readonly target: string;
  readonly reason: string;
  readonly createdAtMs: number;
}

interface ModLogPage extends NodePage<ModRow> {
  readonly chain: { readonly ok: boolean; readonly brokenAt?: number };
}

interface AwardType {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly icon: string;
  readonly cost: number;
  readonly active: boolean;
}

interface LabelRow {
  readonly id: string;
  readonly verdict: number;
  readonly modelId: string;
  readonly confidencePct: number;
  readonly reasons: readonly string[];
}

interface IdentityProfile {
  readonly id: string;
  readonly displayName: string;
  readonly bio: string;
  readonly postKarma: number;
  readonly commentKarma: number;
}

interface NotificationRow {
  readonly id: string;
  readonly kind: string;
  readonly contentId: string;
  readonly createdAtMs: number;
  readonly read: boolean;
}

interface MessageRow {
  readonly id: string;
  readonly thread: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  readonly ratchetIndex: number;
  readonly createdAtMs: number;
}

interface NodeIdentity {
  readonly serverId: string;
  readonly publicKey: string;
  readonly keyAlg: string;
}

interface ReadyDocument {
  readonly status?: string;
  readonly checks?: Readonly<Record<string, string | boolean>>;
}

interface AdminSummary {
  readonly identities: number;
  readonly communities: number;
  readonly posts: number;
  readonly reports: number;
  readonly ipBlocks: number;
  readonly transparency: { readonly treeSize: number; readonly timestampMs: number };
}

interface ReticulumAdminStatus {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly detail?: string;
  readonly queueDepth?: number;
  readonly interfaces?: readonly {
    readonly name: string;
    readonly kind: string;
    readonly up: boolean;
    readonly rssi: number;
    readonly snr: number;
    readonly txBytes: string;
    readonly rxBytes: string;
  }[];
  readonly paths?: readonly {
    readonly destinationHash: string;
    readonly hops: number;
    readonly lastSeenMs: string;
  }[];
}

function shortened(value: string, length = 16): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function Panel({
  children,
  colors,
  title,
  eyebrow,
}: {
  readonly children?: React.ReactNode;
  readonly colors: AppPalette;
  readonly title: string;
  readonly eyebrow?: string;
}) {
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {eyebrow ? (
        <Text style={[typography.overline, { color: colors.ember }]}>{eyebrow}</Text>
      ) : null}
      <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function DataRow({
  colors,
  icon,
  label,
  value,
  detail,
  signal = false,
}: {
  readonly colors: AppPalette;
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly signal?: boolean;
}) {
  return (
    <View style={[styles.dataRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.dataIcon, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={18} color={signal ? colors.signal : colors.ember} />
      </View>
      <View style={styles.flex}>
        <Text style={[typography.label, { color: colors.text }]}>{label}</Text>
        {detail ? (
          <Text numberOfLines={2} style={[typography.caption, { color: colors.text2 }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[typography.mono, styles.rowValue, { color: colors.text2 }]}
      >
        {value}
      </Text>
    </View>
  );
}

function LoadingOrError({
  colors,
  error,
  loading,
  noun,
}: {
  readonly colors: AppPalette;
  readonly error: boolean;
  readonly loading: boolean;
  readonly noun: string;
}) {
  if (loading) {
    return (
      <StatusBanner
        colors={colors}
        icon="sync-outline"
        title={`Loading ${noun}`}
        body="Reading the projection from your home node."
      />
    );
  }
  if (error) {
    return (
      <StatusBanner
        colors={colors}
        icon="cloud-offline-outline"
        title={`${noun} unavailable`}
        body="The node has no cached copy and could not answer this request."
        tone="warning"
      />
    );
  }
  return null;
}

function useSessionSummary() {
  const [summary, setSummary] = useState<ForumSessionSummary | null>(null);
  useEffect(() => {
    void forumSessionSummary().then(setSummary);
  }, []);
  return summary;
}

function useSessionDocument<T>(baseUrl: string, path: string, enabled: boolean) {
  return useQuery<T>({
    queryKey: ['forum-session', baseUrl, path],
    queryFn: () => forumSessionRequest<T>(baseUrl, path),
    enabled,
    retry: 0,
  });
}

function SessionGate({
  children,
  colors,
  summary,
}: {
  readonly children?: React.ReactNode;
  readonly colors: AppPalette;
  readonly summary: ForumSessionSummary | null;
}) {
  if (summary?.authenticated) return <>{children}</>;
  return (
    <EmptyState
      colors={colors}
      icon="key-outline"
      title="Authentication stays local"
      body="Open Identity & recovery, unlock your key vault, then register with this node. The app never exposes the bearer token to a screen."
    />
  );
}

export function ProfileWorkspace({ colors, homeNode }: WorkspaceProps) {
  const summary = useSessionSummary();
  const profile = useSessionDocument<IdentityProfile>(
    homeNode.baseUrl,
    '/v1/me/profile',
    Boolean(summary?.authenticated),
  );
  return (
    <>
      <Panel colors={colors} eyebrow="Local key vault" title="Forum identity">
        <DataRow
          colors={colors}
          icon="finger-print-outline"
          label={profile.data?.displayName || 'Device identity'}
          detail={summary?.identityId ? shortened(summary.identityId, 28) : 'No key is unlocked'}
          value={summary?.authenticated ? 'signed in' : summary?.unlocked ? 'unlocked' : 'locked'}
        />
        <DataRow
          colors={colors}
          icon="trending-up-outline"
          label="Reputation"
          detail="Derived from this node’s public projections."
          value={
            profile.data
              ? `${profile.data.postKarma + profile.data.commentKarma} karma`
              : 'private'
          }
        />
      </Panel>
      <SessionGate colors={colors} summary={summary}>
        {profile.isError ? (
          <LoadingOrError colors={colors} error loading={false} noun="Profile" />
        ) : (
          <StatusBanner
            colors={colors}
            icon="shield-checkmark-outline"
            title="Profile linked without network identity"
            body="The server profile contains a Forum key, never an IP address or device fingerprint."
            tone="verified"
          />
        )}
      </SessionGate>
    </>
  );
}

export function CommunitiesWorkspace({ colors, homeNode }: WorkspaceProps) {
  const communities = useNodeCommunities(homeNode.baseUrl, '');
  const items = communities.data?.value.items ?? [];
  return (
    <Panel colors={colors} eyebrow="Live directory" title="Communities on this node">
      <LoadingOrError
        colors={colors}
        error={communities.isError}
        loading={communities.isLoading}
        noun="communities"
      />
      {items.length === 0 && !communities.isLoading && !communities.isError ? (
        <EmptyState
          colors={colors}
          icon="people-outline"
          title="No communities yet"
          body="This is a real empty node. Community creation is accepted only as a signed envelope."
        />
      ) : (
        items.slice(0, 8).map((community) => (
          <DataRow
            key={community.id}
            colors={colors}
            icon="people-outline"
            label={`r/${community.name}`}
            detail={community.description || community.title}
            value={`${community.memberCount} members`}
          />
        ))
      )}
    </Panel>
  );
}

function useFirstCommunity(baseUrl: string) {
  const communities = useNodeCommunities(baseUrl, '');
  return {
    communities,
    community: communities.data?.value.items[0] ?? null,
  };
}

export function RolesWorkspace({ colors, homeNode }: WorkspaceProps) {
  const { communities, community } = useFirstCommunity(homeNode.baseUrl);
  const roles = useNodeDocument<NodePage<RoleRow>>(
    homeNode.baseUrl,
    community ? `/v1/communities/${encodeURIComponent(community.id)}/roles?limit=100` : null,
  );
  const items = roles.data?.value.items ?? [];
  return (
    <Panel
      colors={colors}
      eyebrow={community ? `r/${community.name}` : 'Community context'}
      title="Permission roles"
    >
      <LoadingOrError
        colors={colors}
        error={communities.isError || roles.isError}
        loading={communities.isLoading || (Boolean(community) && roles.isLoading)}
        noun="roles"
      />
      {!community && !communities.isLoading ? (
        <EmptyState
          colors={colors}
          icon="people-outline"
          title="A community comes first"
          body="Roles are scoped to communities so authority cannot silently leak across them."
        />
      ) : items.length === 0 && !roles.isLoading ? (
        <EmptyState
          colors={colors}
          icon="shield-outline"
          title="No custom roles"
          body="This community currently relies on its default permission model."
        />
      ) : (
        items.map((role) => (
          <DataRow
            key={role.id}
            colors={colors}
            icon="shield-outline"
            label={role.name}
            detail={role.isDefault ? 'Default role' : 'Custom role'}
            value={`mask ${role.permissionMask}`}
          />
        ))
      )}
    </Panel>
  );
}

export function PostsWorkspace({ colors, homeNode }: WorkspaceProps) {
  const feed = useNodeFeed(homeNode.baseUrl, 'new');
  const items = feed.data?.value.items ?? [];
  const comments = items.reduce((total, post) => total + post.commentCount, 0);
  const proved = items.filter((post) => post.provenance?.receipt).length;
  return (
    <>
      <View style={[styles.metrics, { borderColor: colors.border }]}>
        <Metric colors={colors} label="Visible posts" value={String(items.length)} />
        <Metric colors={colors} label="Comments" value={String(comments)} />
        <Metric colors={colors} label="Receipted" value={`${proved}/${items.length}`} />
      </View>
      <Panel colors={colors} eyebrow="Newest first" title="Signed content">
        <LoadingOrError
          colors={colors}
          error={feed.isError}
          loading={feed.isLoading}
          noun="posts"
        />
        {items.length === 0 && !feed.isLoading && !feed.isError ? (
          <EmptyState
            colors={colors}
            icon="document-text-outline"
            title="Nothing published yet"
            body="Use Create to publish the first signed, receipted post."
          />
        ) : (
          items.slice(0, 8).map((post) => (
            <DataRow
              key={post.contentId}
              colors={colors}
              icon={post.removed ? 'eye-off-outline' : 'document-text-outline'}
              label={post.title}
              detail={`r/${post.community} · ${post.commentCount} comments`}
              value={post.provenance?.receipt ? 'proved' : 'pending'}
            />
          ))
        )}
      </Panel>
    </>
  );
}

export function SearchWorkspace({ colors, homeNode }: WorkspaceProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const search = useNodeSearch(homeNode.baseUrl, debouncedQuery);
  const items = search.data?.value.items ?? [];
  return (
    <Panel colors={colors} eyebrow="Node-wide" title="Search live projections">
      <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
        <Ionicons name="search-outline" size={19} color={colors.text2} />
        <TextInput
          accessibilityLabel="Feature search"
          onChangeText={setQuery}
          placeholder="Posts, comments, communities, identities"
          placeholderTextColor={colors.text3}
          style={[typography.body, styles.flex, { color: colors.text }]}
          value={query}
        />
      </View>
      {query.trim() && search.isLoading ? (
        <LoadingOrError colors={colors} error={false} loading noun="results" />
      ) : null}
      {query.trim() && items.length === 0 && !search.isLoading ? (
        <EmptyState
          colors={colors}
          icon="search-outline"
          title="No matching projection"
          body="Search never invents local examples; only records returned by this node appear here."
        />
      ) : (
        items.slice(0, 10).map((item, index) => (
          <DataRow
            key={item.contentId ?? item.id ?? `${index}`}
            colors={colors}
            icon={item.title ? 'document-text-outline' : 'people-outline'}
            label={item.title ?? item.name ?? item.displayName ?? 'Search result'}
            detail={item.bodyMarkdown ?? item.description ?? item.community}
            value={item.contentId ? shortened(item.contentId, 12) : 'directory'}
          />
        ))
      )}
    </Panel>
  );
}

export function ModerationWorkspace({ colors, homeNode }: WorkspaceProps) {
  const { communities, community } = useFirstCommunity(homeNode.baseUrl);
  const log = useNodeDocument<ModLogPage>(
    homeNode.baseUrl,
    community ? `/v1/communities/${encodeURIComponent(community.id)}/modlog?limit=100` : null,
  );
  const items = log.data?.value.items ?? [];
  const chain = log.data?.value.chain;
  return (
    <>
      {chain ? (
        <StatusBanner
          colors={colors}
          icon={chain.ok ? 'link-outline' : 'warning-outline'}
          title={chain.ok ? 'Public log chain verified' : 'Moderation chain is broken'}
          body={
            chain.ok
              ? `${items.length} actions are ordered and hash-linked.`
              : `The first invalid link is at position ${chain.brokenAt ?? 'unknown'}.`
          }
          tone={chain.ok ? 'verified' : 'danger'}
        />
      ) : null}
      <Panel
        colors={colors}
        eyebrow={community ? `r/${community.name}` : 'Public accountability'}
        title="Moderation history"
      >
        <LoadingOrError
          colors={colors}
          error={communities.isError || log.isError}
          loading={communities.isLoading || (Boolean(community) && log.isLoading)}
          noun="moderation log"
        />
        {items.length === 0 && !log.isLoading ? (
          <EmptyState
            colors={colors}
            icon="shield-checkmark-outline"
            title="No moderation actions"
            body="When a moderator hides content, the reason and hash-chain entry appear here."
          />
        ) : (
          items.map((event) => (
            <DataRow
              key={event.id}
              colors={colors}
              icon="shield-checkmark-outline"
              label={`#${event.sequence} ${event.verbName}`}
              detail={event.reason || `Target ${shortened(event.target)}`}
              value={new Date(event.createdAtMs).toLocaleDateString()}
            />
          ))
        )}
      </Panel>
    </>
  );
}

export function LabelsWorkspace({ colors, homeNode }: WorkspaceProps) {
  const [contentId, setContentId] = useState('');
  const validId = contentId.trim().startsWith('jb1') ? contentId.trim() : null;
  const labels = useNodeDocument<NodePage<LabelRow>>(
    homeNode.baseUrl,
    validId ? `/v1/labels/${encodeURIComponent(validId)}?limit=100` : null,
  );
  const items = labels.data?.value.items ?? [];
  return (
    <Panel colors={colors} eyebrow="Advisory, not authority" title="Inspect content labels">
      <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
        <Ionicons name="pricetag-outline" size={19} color={colors.ember} />
        <TextInput
          accessibilityLabel="Content ID for labels"
          autoCapitalize="none"
          onChangeText={setContentId}
          placeholder="Paste a jb1… content ID"
          placeholderTextColor={colors.text3}
          style={[typography.mono, styles.flex, { color: colors.text }]}
          value={contentId}
        />
      </View>
      {contentId && !validId ? (
        <Text style={[typography.caption, { color: colors.constrained }]}>
          A content identifier starts with jb1.
        </Text>
      ) : null}
      {validId && items.length === 0 && !labels.isLoading ? (
        <EmptyState
          colors={colors}
          icon="checkmark-circle-outline"
          title="No labels returned"
          body="This node has no advisory claims for that content."
        />
      ) : (
        items.map((label) => (
          <DataRow
            key={label.id}
            colors={colors}
            icon="pricetag-outline"
            label={`Verdict ${label.verdict} · ${label.confidencePct}%`}
            detail={label.reasons.join(' · ') || 'No reason attached'}
            value={shortened(label.modelId)}
          />
        ))
      )}
    </Panel>
  );
}

export function AwardsWorkspace({ colors, homeNode }: WorkspaceProps) {
  const awards = useNodeDocument<NodePage<AwardType>>(
    homeNode.baseUrl,
    '/v1/awards/types?limit=100',
  );
  const items = awards.data?.value.items ?? [];
  return (
    <Panel colors={colors} eyebrow="Instance catalogue" title="Available awards">
      <LoadingOrError
        colors={colors}
        error={awards.isError}
        loading={awards.isLoading}
        noun="award catalogue"
      />
      {items.length === 0 && !awards.isLoading && !awards.isError ? (
        <EmptyState
          colors={colors}
          icon="sparkles-outline"
          title="No award types configured"
          body="The operator has not published an award catalogue on this node."
        />
      ) : (
        items.map((award) => (
          <DataRow
            key={award.id}
            colors={colors}
            icon="sparkles-outline"
            label={`${award.icon || '✦'} ${award.name}`}
            detail={award.active ? award.slug : `${award.slug} · inactive`}
            value={`${award.cost} credits`}
          />
        ))
      )}
    </Panel>
  );
}

export function NotificationsWorkspace({ colors, homeNode }: WorkspaceProps) {
  const summary = useSessionSummary();
  const notifications = useSessionDocument<NodePage<NotificationRow>>(
    homeNode.baseUrl,
    '/v1/me/notifications?limit=100',
    Boolean(summary?.authenticated),
  );
  const items = notifications.data?.items ?? [];
  return (
    <SessionGate colors={colors} summary={summary}>
      <Panel colors={colors} eyebrow="Private projection" title="Notifications">
        <LoadingOrError
          colors={colors}
          error={notifications.isError}
          loading={notifications.isLoading}
          noun="notifications"
        />
        {items.length === 0 && !notifications.isLoading ? (
          <EmptyState
            colors={colors}
            icon="notifications-outline"
            title="You’re caught up"
            body="Replies, mentions, awards, moderation, and follows will appear here."
          />
        ) : (
          items.map((notification) => (
            <DataRow
              key={notification.id}
              colors={colors}
              icon={notification.read ? 'mail-open-outline' : 'notifications-outline'}
              label={notification.kind.replace('_', ' ')}
              detail={shortened(notification.contentId, 28)}
              value={notification.read ? 'read' : 'new'}
            />
          ))
        )}
      </Panel>
    </SessionGate>
  );
}

export function MessagingWorkspace({ colors, homeNode }: WorkspaceProps) {
  const summary = useSessionSummary();
  const messages = useSessionDocument<NodePage<MessageRow>>(
    homeNode.baseUrl,
    '/v1/me/messages?limit=100',
    Boolean(summary?.authenticated),
  );
  const threads = useMemo(() => {
    const latest = new Map<string, MessageRow>();
    for (const message of messages.data?.items ?? []) {
      const current = latest.get(message.thread);
      if (!current || current.createdAtMs < message.createdAtMs) latest.set(message.thread, message);
    }
    return [...latest.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [messages.data]);
  return (
    <SessionGate colors={colors} summary={summary}>
      <Panel colors={colors} eyebrow="Signal space" title="Encrypted conversations">
        <LoadingOrError
          colors={colors}
          error={messages.isError}
          loading={messages.isLoading}
          noun="conversations"
        />
        {threads.length === 0 && !messages.isLoading ? (
          <EmptyState
            colors={colors}
            icon="lock-closed-outline"
            title="No private conversations"
            body="The node stores opaque ciphertext only. Your device holds the keys that can read it."
            system="signal"
          />
        ) : (
          threads.map((message) => (
            <DataRow
              key={message.thread}
              colors={colors}
              icon="lock-closed-outline"
              label={`Thread ${shortened(message.thread, 14)}`}
              detail={`Ratchet message ${message.ratchetIndex}`}
              value={new Date(message.createdAtMs).toLocaleDateString()}
              signal
            />
          ))
        )}
      </Panel>
    </SessionGate>
  );
}

export function OperationsWorkspace({ colors, homeNode }: WorkspaceProps) {
  const ready = useNodeDocument<ReadyDocument>(homeNode.baseUrl, '/health/ready', {
    retry: 0,
    refetchInterval: 15_000,
  });
  const identity = useNodeDocument<NodeIdentity>(homeNode.baseUrl, '/v1/server/identity', {
    retry: 0,
  });
  const federations = useFederations(homeNode.baseUrl);
  const auditServices = homeNode.discovery.services.auditLogs;
  const captchaServices = homeNode.discovery.services.mcaptcha;
  return (
    <>
      <View style={[styles.metrics, { borderColor: colors.border }]}>
        <Metric
          colors={colors}
          label="Node"
          value={ready.data?.source === 'network' ? 'ready' : 'offline'}
        />
        <Metric
          colors={colors}
          label="Federations"
          value={String(federations.data?.value.connected ?? 0)}
        />
        <Metric colors={colors} label="ALS copies" value={String(auditServices.length)} />
      </View>
      <Panel colors={colors} eyebrow="Live discovery" title={homeNode.discovery.node.displayName}>
        <DataRow
          colors={colors}
          icon="server-outline"
          label="Home node"
          detail={homeNode.baseUrl}
          value={ready.data?.source ?? 'unreachable'}
        />
        <DataRow
          colors={colors}
          icon="finger-print-outline"
          label="Server identity"
          detail={identity.data?.value.serverId ?? homeNode.discovery.node.serverId}
          value={identity.data?.value.keyAlg ?? 'ED25519'}
        />
        <DataRow
          colors={colors}
          icon="archive-outline"
          label="Independent audit logs"
          detail={auditServices.map((service) => service.address).join(', ') || 'Not advertised'}
          value={`${auditServices.filter((service) => service.available).length} online`}
        />
        <DataRow
          colors={colors}
          icon="shield-outline"
          label="mCaptcha"
          detail={captchaServices.map((service) => service.address).join(', ') || 'Not advertised'}
          value={`${captchaServices.filter((service) => service.available).length} online`}
        />
        <DataRow
          colors={colors}
          icon="git-network-outline"
          label="Federated services"
          detail={
            federations.data?.value.items.map((service) => service.address).join(', ') ||
            'No connected peers'
          }
          value={`${federations.data?.value.connected ?? 0} connected`}
        />
      </Panel>
      <CryptoParityPanel colors={colors} />
    </>
  );
}

function CryptoParityPanel({ colors }: { readonly colors: AppPalette }) {
  const [report, setReport] = useState<CryptoParityReport | null>(null);
  const [running, setRunning] = useState(false);
  const diagnostics = cryptoBackendDiagnostics();
  const run = () => {
    setRunning(true);
    // Let React paint the progress state before the deliberately synchronous JSI checks.
    setTimeout(() => {
      setReport(runOnDeviceCryptoParity());
      setRunning(false);
    }, 0);
  };

  return (
    <Panel colors={colors} eyebrow="ADR-017 · local diagnostic" title="Crypto backend parity">
      <DataRow
        colors={colors}
        icon="hardware-chip-outline"
        label="Active primitive backend"
        detail={
          diagnostics.nativeAvailable
            ? 'Android synchronous native module is installed.'
            : 'Portable JS is expected on iOS, Expo Go, and Jest.'
        }
        value={diagnostics.active}
      />
      {report ? (
        <StatusBanner
          colors={colors}
          icon={report.passed ? 'shield-checkmark-outline' : 'warning-outline'}
          title={
            report.available
              ? report.passed
                ? `${report.checks.length} parity checks passed`
                : 'Native crypto parity failed'
              : 'Native Android module is not present'
          }
          body={
            report.available
              ? `${report.candidate} compared byte-for-byte with ${report.reference}.`
              : 'Build an Android development client; Expo Go cannot load local native modules.'
          }
          tone={report.passed ? 'verified' : 'warning'}
        />
      ) : null}
      {report?.checks.map((item) => (
        <DataRow
          colors={colors}
          detail={item.detail}
          icon={item.ok ? 'checkmark-circle-outline' : 'close-circle-outline'}
          key={item.name}
          label={item.name}
          value={item.ok ? `${item.durationMs} ms` : 'failed'}
        />
      ))}
      <Button
        colors={colors}
        disabled={running}
        icon="hardware-chip-outline"
        label={running ? 'Running native checks…' : 'Run on-device parity'}
        onPress={run}
        variant="secondary"
      />
    </Panel>
  );
}

export function AdminWorkspace({ colors, homeNode }: WorkspaceProps) {
  const summary = useSessionSummary();
  const admin = useSessionDocument<AdminSummary>(
    homeNode.baseUrl,
    '/v1/admin/summary',
    Boolean(summary?.authenticated),
  );
  const reticulum = useSessionDocument<ReticulumAdminStatus>(
    homeNode.baseUrl,
    '/v1/admin/reticulum',
    Boolean(summary?.authenticated),
  );
  if (!summary?.authenticated) {
    return <SessionGate colors={colors} summary={summary} />;
  }
  if (admin.isError) {
    return (
      <EmptyState
        colors={colors}
        icon="lock-closed-outline"
        title="Operator role required"
        body="This identity is authenticated but is not listed in the node’s ADMIN_KEYS. Administration remains server-enforced."
      />
    );
  }
  return (
    <>
      <View style={[styles.metrics, { borderColor: colors.border }]}>
        <Metric colors={colors} label="Identities" value={String(admin.data?.identities ?? 0)} />
        <Metric colors={colors} label="Communities" value={String(admin.data?.communities ?? 0)} />
        <Metric colors={colors} label="Posts" value={String(admin.data?.posts ?? 0)} />
      </View>
      <Panel colors={colors} eyebrow="Authorized operator" title="Instance accountability">
        <DataRow
          colors={colors}
          icon="warning-outline"
          label="Open reports"
          value={String(admin.data?.reports ?? 0)}
        />
        <DataRow
          colors={colors}
          icon="ban-outline"
          label="IP blocks"
          value={String(admin.data?.ipBlocks ?? 0)}
        />
        <DataRow
          colors={colors}
          icon="git-commit-outline"
          label="Transparency tree"
          detail="Every acknowledged envelope occupies an append-only leaf."
          value={String(admin.data?.transparency.treeSize ?? 0)}
        />
      </Panel>
      <Panel colors={colors} eyebrow="Optional transport" title="Reticulum relay">
        <DataRow
          colors={colors}
          icon="radio-outline"
          label="Bridge sidecar"
          detail={
            reticulum.data?.detail ??
            (reticulum.data?.enabled
              ? 'The node is configured to forward eligible signed envelopes.'
              : 'Disabled by default. Ordinary IP, federation, and mesh remain available.')
          }
          signal
          value={
            reticulum.isLoading
              ? 'checking'
              : reticulum.data?.available
                ? 'online'
                : reticulum.data?.enabled
                  ? 'unavailable'
                  : 'disabled'
          }
        />
        {reticulum.data?.enabled ? (
          <DataRow
            colors={colors}
            icon="albums-outline"
            label="Store-and-forward queue"
            detail={`${reticulum.data.paths?.length ?? 0} known paths`}
            value={`${reticulum.data.queueDepth ?? 0} frames`}
          />
        ) : null}
        {reticulum.data?.interfaces?.map((item) => (
          <DataRow
            colors={colors}
            detail={`${item.kind} · ${item.up ? 'link up' : 'link down'} · ${item.txBytes} B sent / ${item.rxBytes} B received`}
            icon="hardware-chip-outline"
            key={`${item.kind}:${item.name}`}
            label={item.name}
            signal
            value={`RSSI ${item.rssi} · SNR ${item.snr}`}
          />
        ))}
        {reticulum.data?.paths?.map((path) => (
          <DataRow
            colors={colors}
            detail={path.destinationHash}
            icon="navigate-outline"
            key={path.destinationHash}
            label="Known destination"
            value={`${path.hops} hop${path.hops === 1 ? '' : 's'}`}
          />
        ))}
      </Panel>
    </>
  );
}

export function ProofsWorkspace({ colors }: { readonly colors: AppPalette }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    void listAuditCertificates().then((items) => setCount(items.length));
  }, []);
  return (
    <StatusBanner
      colors={colors}
      icon="shield-checkmark-outline"
      title={`${count} portable acknowledgements on this device`}
      body="Use the Proof vault to inspect ALS delivery and ask the home server for current status."
      tone="verified"
    />
  );
}

function Metric({
  colors,
  label,
  value,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[typography.h2, { color: colors.text }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.text2 }]}>{label}</Text>
    </View>
  );
}

export function FeatureWorkspace({
  colors,
  featureId,
  homeNode,
}: WorkspaceProps & { readonly featureId: string }) {
  if (featureId === 'profile') return <ProfileWorkspace colors={colors} homeNode={homeNode} />;
  if (featureId === 'communities') {
    return <CommunitiesWorkspace colors={colors} homeNode={homeNode} />;
  }
  if (featureId === 'roles') return <RolesWorkspace colors={colors} homeNode={homeNode} />;
  if (featureId === 'posts') return <PostsWorkspace colors={colors} homeNode={homeNode} />;
  if (featureId === 'search') return <SearchWorkspace colors={colors} homeNode={homeNode} />;
  if (featureId === 'moderation') {
    return <ModerationWorkspace colors={colors} homeNode={homeNode} />;
  }
  if (featureId === 'labels') return <LabelsWorkspace colors={colors} homeNode={homeNode} />;
  if (featureId === 'awards') return <AwardsWorkspace colors={colors} homeNode={homeNode} />;
  if (featureId === 'notifications') {
    return <NotificationsWorkspace colors={colors} homeNode={homeNode} />;
  }
  if (featureId === 'messaging') {
    return <MessagingWorkspace colors={colors} homeNode={homeNode} />;
  }
  if (featureId === 'proofs') return <ProofsWorkspace colors={colors} />;
  if (featureId === 'admin') return <AdminWorkspace colors={colors} homeNode={homeNode} />;
  return <OperationsWorkspace colors={colors} homeNode={homeNode} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  dataRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
  },
  dataIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowValue: { maxWidth: '32%', textAlign: 'right' },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metric: {
    minWidth: 100,
    minHeight: 76,
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  search: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
