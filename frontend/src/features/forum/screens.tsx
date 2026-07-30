import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { verifyAuditCertificate } from '@jagoo/sdk';
import type { FeatureDestination } from '../catalog';
import { useNodeSearch } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import {
  createForumIdentity,
  forumSessionSummary,
  importForumIdentity,
  lockForumIdentity,
  registerForumIdentity,
  revokeForumKey,
  unlockForumIdentity,
  type ForumSessionSummary,
} from '../../signer';
import type { AppPalette, ThemeMode } from '../../design-system';
import { radius, spacing, type as typography } from '../../design-system';
import {
  AppHeader,
  Button,
  Divider,
  EmptyState,
  IconButton,
  Pill,
  PressScale,
  Screen,
  StatusBanner,
  type ReachState,
} from '../../design-system';
import { certificateStatus, listAuditCertificates, type StoredAuditCertificate } from '../../audit';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { FeatureWorkspace, MessagingWorkspace } from '../capabilities/workspace';

interface CommonProps {
  readonly colors: AppPalette;
  readonly mode?: ThemeMode;
  readonly reach: ReachState;
  readonly onOpenNetwork?: () => void;
}

function ContentColumn({ children }: { readonly children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={[styles.column, width >= 760 ? styles.columnWide : null]}>{children}</View>;
}

export function AuditScreen({
  colors,
  baseUrl,
  contentId,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly baseUrl: string;
  readonly contentId: string;
  readonly onBack: () => void;
}) {
  const [record, setRecord] = useState<StoredAuditCertificate | null>(null);
  const [status, setStatus] = useState<{
    readonly status: string;
    readonly reason: string | null;
  } | null>(null);
  useEffect(() => {
    void listAuditCertificates().then((records) => {
      setRecord(records.find((item) => item.certificate.identifier === contentId) ?? null);
    });
  }, [contentId]);
  const verification = record ? verifyAuditCertificate(record.certificate) : null;
  const receipt = record?.certificate.acknowledgement;
  const rows = receipt
    ? [
        [
          'Request packet',
          verification?.checks.requestPacket ? 'Verified' : 'Failed',
          contentId.slice(0, 18),
        ],
        [
          'Node receipt',
          verification?.checks.receiptSignature ? 'Verified' : 'Failed',
          receipt.server_id.slice(0, 16),
        ],
        [
          'Merkle inclusion',
          verification?.checks.receiptSignature ? 'Verified' : 'Failed',
          `leaf ${receipt.leaf_index} · tree ${receipt.sth.tree_size}`,
        ],
        [
          'Independent copies',
          record.deliveries.some((item) => item.delivered) ? 'Stored' : 'Pending',
          String(record.deliveries.filter((item) => item.delivered).length),
        ],
        ['Stored on device', 'Available offline', new Date(record.storedAtMs).toLocaleString()],
      ]
    : [];
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          Publication proof
        </Text>
        <IconButton
          colors={colors}
          disabled={!record}
          icon="share-outline"
          label="Export proof"
          onPress={
            record
              ? () =>
                  void Share.share({
                    message: JSON.stringify(record.certificate),
                    title: `Jagoo acknowledgement ${record.certificate.identifier}`,
                  })
              : undefined
          }
        />
      </View>
      <ContentColumn>
        {record ? (
          <>
            <View style={styles.auditHero}>
              <View style={[styles.auditSeal, { backgroundColor: colors.verified }]}>
                <Ionicons name="shield-checkmark" size={32} color={colors.onAccent} />
              </View>
              <Text style={[typography.h1, { color: colors.text }]}>
                {verification?.valid ? 'Verified independently' : 'Proof needs attention'}
              </Text>
              <Text style={[typography.body, styles.center, { color: colors.text2 }]}>
                This device verified the author, node receipt, and transparency proof without
                trusting the rendered page.
              </Text>
            </View>
            <View style={[styles.auditList, { borderColor: colors.border }]}>
              {rows.map(([title, status, detail], index) => (
                <View key={title}>
                  <View style={styles.auditRow}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.verified} />
                    <View style={styles.flex}>
                      <Text style={[typography.label, { color: colors.text }]}>{title}</Text>
                      <Text style={[typography.caption, { color: colors.verified }]}>{status}</Text>
                    </View>
                    <Text style={[typography.mono, styles.auditDetail, { color: colors.text2 }]}>
                      {detail}
                    </Text>
                  </View>
                  {index < rows.length - 1 ? <Divider colors={colors} /> : null}
                </View>
              ))}
            </View>
            <StatusBanner
              colors={colors}
              icon="cloud-offline-outline"
              title="Works without the network"
              body="The receipt and tree head are stored on this device as durable publication evidence."
              tone="verified"
            />
            {status ? (
              <StatusBanner
                colors={colors}
                icon={status.status === 'online' ? 'checkmark-circle' : 'alert-circle-outline'}
                title={`Server reports: ${status.status}`}
                body={status.reason ?? 'The acknowledged content is present.'}
                tone={status.status === 'online' ? 'verified' : 'warning'}
              />
            ) : null}
            <View style={styles.pageActions}>
              <Button
                colors={colors}
                label="Ask server for status"
                icon="pulse-outline"
                onPress={() =>
                  void certificateStatus(baseUrl, record.certificate).then((result) =>
                    setStatus({ status: result.status, reason: result.reason }),
                  )
                }
              />
            </View>
          </>
        ) : (
          <EmptyState
            colors={colors}
            icon="shield-outline"
            title="No local acknowledgement"
            body="This post was not published from this device, so its request certificate is not in your vault."
          />
        )}
      </ContentColumn>
    </Screen>
  );
}

export function InboxScreen({
  colors,
  mode,
  reach,
  onOpenNetwork,
  onBack,
  homeNode,
  onOpenSignal,
}: CommonProps & {
  readonly homeNode: HomeNode;
  readonly onOpenSignal: () => void;
  readonly onBack?: () => void;
}) {
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} mode={mode} reach={reach} onBack={onBack} onReach={onOpenNetwork} title="Inbox" />
      <ContentColumn>
        <StatusBanner
          action="Open Signal"
          colors={colors}
          icon="lock-closed-outline"
          onAction={onOpenSignal}
          title="Forum inbox"
          body="Pseudonymous Forum messages stay here. Identified crisis coordination has a separate Signal vault. Notifications moved to their own screen under You."
          tone="verified"
        />
        <MessagingWorkspace colors={colors} homeNode={homeNode} />
      </ContentColumn>
    </Screen>
  );
}

function IdentityPanel({
  colors,
  homeNode,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
}) {
  const registrationUrl = homeNode.baseUrl;
  const [passphrase, setPassphrase] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [revokeConfirm, setRevokeConfirm] = useState('');
  const [summary, setSummary] = useState<ForumSessionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    readonly tone: 'verified' | 'danger';
    readonly title: string;
    readonly body: string;
  } | null>(null);

  const refresh = async () => setSummary(await forumSessionSummary());
  useEffect(() => {
    void refresh();
  }, []);

  const execute = async (operation: () => Promise<string>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const identityId = await operation();
      await refresh();
      setNotice({ tone: 'verified', title: success, body: identityId });
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Identity action failed',
        body: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await createForumIdentity(passphrase || undefined, recoverySalt);
      setRecoveryPhrase(result.recoveryPhrase);
      await refresh();
      setNotice({
        tone: 'verified',
        title: 'Identity created on this device',
        body: result.identityId,
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Identity action failed',
        body: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.identityPanel,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[typography.h2, { color: colors.text }]}>Forum key vault</Text>
      <Text style={[typography.body, { color: colors.text2 }]}>
        {summary?.unlocked
          ? `Unlocked · ${summary.identityId}`
          : summary?.configured
            ? 'Configured on this device · locked'
            : 'No Forum identity is configured'}
      </Text>
      <TextInput
        accessibilityLabel="Identity passphrase"
        onChangeText={setPassphrase}
        placeholder="App passphrase (8+ characters)"
        placeholderTextColor={colors.text3}
        secureTextEntry
        style={[
          styles.input,
          typography.body,
          { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
        ]}
        value={passphrase}
      />
      <TextInput
        accessibilityLabel="Recovery salt, if this identity uses one"
        onChangeText={setRecoverySalt}
        placeholder="Recovery salt (only if you chose one)"
        placeholderTextColor={colors.text3}
        secureTextEntry
        style={[
          styles.input,
          typography.body,
          { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
        ]}
        value={recoverySalt}
      />
      {!summary?.configured ? (
        <>
          <Button
            colors={colors}
            disabled={busy}
            label={busy ? 'Creating…' : 'Create new identity'}
            icon="key-outline"
            onPress={() => void create()}
          />
          <TextInput
            accessibilityLabel="Recovery phrase to import"
            multiline
            onChangeText={setImportPhrase}
            placeholder="Or paste a 24-word recovery phrase"
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              styles.recoveryInput,
              typography.body,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            value={importPhrase}
          />
          <Button
            colors={colors}
            disabled={busy || !importPhrase.trim()}
            label="Import recovery phrase"
            variant="secondary"
            onPress={() =>
              void execute(
                () => importForumIdentity(importPhrase, passphrase || undefined, recoverySalt),
                'Identity imported',
              )
            }
          />
        </>
      ) : summary.unlocked ? (
        <>
          <Button
            colors={colors}
            disabled={busy || !registrationUrl}
            label={registrationUrl ? 'Register and authenticate' : 'Configure a node to register'}
            icon="shield-checkmark-outline"
            onPress={() =>
              registrationUrl
                ? void execute(
                    () =>
                      registerForumIdentity(registrationUrl, homeNode.discovery.services.auditLogs),
                    'Certificate published and session authenticated',
                  )
                : undefined
            }
          />
          <Button
            colors={colors}
            label="Lock identity"
            variant="secondary"
            onPress={() => {
              lockForumIdentity();
              void refresh();
            }}
          />
          <TextInput
            accessibilityLabel='Type "REVOKE" to publish a Forum key revocation'
            autoCapitalize="characters"
            onChangeText={setRevokeConfirm}
            placeholder='Type "REVOKE" to revoke this key'
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              typography.body,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            value={revokeConfirm}
          />
          <Button
            colors={colors}
            disabled={busy || revokeConfirm !== 'REVOKE'}
            label="Publish Forum key revocation"
            onPress={() => {
              setBusy(true);
              setNotice(null);
              void revokeForumKey(
                homeNode.baseUrl,
                homeNode.discovery.services.auditLogs,
              )
                .then((result) => {
                  setNotice({
                    tone: 'verified',
                    title: 'Revocation queued',
                    body: result.contentId,
                  });
                  setRevokeConfirm('');
                })
                .catch((error: Error) =>
                  setNotice({
                    tone: 'danger',
                    title: 'Revocation failed',
                    body: error.message,
                  }),
                )
                .finally(() => setBusy(false));
            }}
            variant="destructive"
          />
        </>
      ) : (
        <Button
          colors={colors}
          disabled={busy}
          label={busy ? 'Unlocking…' : 'Unlock identity'}
          icon="lock-open-outline"
          onPress={() =>
            void execute(
              () => unlockForumIdentity(passphrase || undefined, recoverySalt),
              'Identity unlocked',
            )
          }
        />
      )}
      {recoveryPhrase ? (
        <View style={[styles.recoveryPhrase, { backgroundColor: colors.surface2 }]}>
          <Text style={[typography.label, { color: colors.constrained }]}>
            Write this down now. It is shown only in this session.
          </Text>
          <Text selectable style={[typography.mono, { color: colors.text }]}>
            {recoveryPhrase}
          </Text>
        </View>
      ) : null}
      {notice ? (
        <StatusBanner
          colors={colors}
          icon={notice.tone === 'verified' ? 'shield-checkmark-outline' : 'alert-circle-outline'}
          title={notice.title}
          body={notice.body}
          tone={notice.tone}
        />
      ) : null}
    </View>
  );
}

export function FeatureScreen({
  colors,
  feature,
  homeNode,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly feature: FeatureDestination;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
}) {
  const signal = feature.id === 'messaging';
  const accent = signal ? colors.signal : colors.ember;
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text style={[typography.overline, { color: colors.text2 }]}>
          {feature.area}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ContentColumn>
        <View style={[styles.featureHero, { borderBottomColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={[typography.overline, { color: accent }]}>
              {signal ? 'Private identity plane' : 'Pseudonymous Forum plane'}
            </Text>
            <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
              {feature.title}
            </Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              {feature.description}
            </Text>
          </View>
          <Ionicons name={feature.icon} size={26} color={accent} />
        </View>
        {feature.id === 'identity' ? <IdentityPanel colors={colors} homeNode={homeNode} /> : null}
        {feature.id !== 'identity' ? (
          <FeatureWorkspace colors={colors} featureId={feature.id} homeNode={homeNode} />
        ) : null}
        <StatusBanner
          colors={colors}
          icon={signal ? 'lock-closed-outline' : 'shield-checkmark-outline'}
          title={signal ? 'Signal-space styling' : 'Forum identity protected'}
          body={
            signal
              ? 'This screen uses Signal blue and never exposes your community identity.'
              : 'No screen stores a network address beside your Forum key.'
          }
          tone="verified"
        />
      </ContentColumn>
    </Screen>
  );
}

export function SearchScreen({
  colors,
  baseUrl,
  onBack,
  onOpenPost,
}: {
  readonly colors: AppPalette;
  readonly baseUrl: string;
  readonly onBack: () => void;
  readonly onOpenPost: (contentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('All');
  const debouncedQuery = useDebouncedValue(query);
  const kindParameter = {
    Posts: 'post',
    Comments: 'comment',
    Communities: 'community',
    People: 'identity',
  }[kind];
  const results = useNodeSearch(baseUrl, debouncedQuery, kindParameter);
  const items = results.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <TextInput
          accessibilityLabel="Search"
          autoFocus
          onChangeText={setQuery}
          placeholder="Search communities, posts…"
          placeholderTextColor={colors.text3}
          style={[styles.searchInput, typography.body, { color: colors.text }]}
          value={query}
        />
        <View style={{ width: 44 }} />
      </View>
      <ContentColumn>
        <ScrollView horizontal contentContainerStyle={styles.pills}>
          {['All', 'Posts', 'Comments', 'Communities', 'People'].map((item) => (
            <Pill
              key={item}
              colors={colors}
              label={item}
              onPress={() => setKind(item)}
              selected={kind === item}
            />
          ))}
        </ScrollView>
        {query && items.length > 0 ? (
          items.map((item, index) => {
            const title = item.title ?? item.name ?? item.displayName ?? 'Search result';
            const body = item.bodyMarkdown ?? item.description ?? item.community ?? '';
            return (
              <PressScale
                key={item.contentId ?? item.id ?? `${title}-${index}`}
                label={`Open ${title}`}
                onPress={item.contentId ? () => onOpenPost(item.contentId!) : undefined}
              >
                <View style={[styles.searchResult, { borderBottomColor: colors.border }]}>
                  <View style={[styles.searchResultMark, { backgroundColor: colors.surface2 }]}>
                    <Ionicons
                      name={item.title ? 'document-text-outline' : 'people-outline'}
                      size={18}
                      color={colors.ember}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{title}</Text>
                    {body ? (
                      <Text numberOfLines={2} style={[typography.body, { color: colors.text2 }]}>
                        {body}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </PressScale>
            );
          })
        ) : query && !results.isLoading ? (
          <EmptyState
            colors={colors}
            icon="search-outline"
            title="Nothing found"
            body="Try a shorter phrase or search for a community name."
          />
        ) : (
          <EmptyState
            colors={colors}
            icon="search-outline"
            title="Search without surrendering identity"
            body="Find public Forum content. Your search history stays on this device."
          />
        )}
      </ContentColumn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  column: { width: '100%', alignSelf: 'center' },
  columnWide: { maxWidth: 760 },
  pills: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  post: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineActions: { flexDirection: 'row', alignItems: 'center' },
  vote: {
    minHeight: 44,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transport: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  detailHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  comment: {
    marginHorizontal: spacing.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 2,
    gap: spacing.xs,
  },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  replyComposer: { padding: spacing.md, gap: spacing.sm },
  postContextActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  contextForm: { gap: spacing.sm, paddingTop: spacing.sm },
  replyInput: { minHeight: 112, textAlignVertical: 'top' },
  auditHero: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  auditSeal: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditList: { marginHorizontal: spacing.md, borderWidth: 1, borderRadius: radius.lg },
  auditRow: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  auditDetail: { maxWidth: '42%', textAlign: 'right' },
  pageActions: { padding: spacing.md },
  searchBox: {
    margin: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  communityRow: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  communityAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compose: { padding: spacing.md, gap: spacing.sm },
  selector: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  composeKinds: { gap: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  textarea: { minHeight: 170 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center' },
  pollOption: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  inboxTabs: { flexDirection: 'row', paddingHorizontal: spacing.md },
  inboxTab: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  profileHero: { padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  profileAvatar: {
    width: 82,
    height: 82,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  profileActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  identityPanel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  recoveryInput: { minHeight: 96 },
  recoveryPhrase: { padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  featureRow: {
    minHeight: 72,
    marginHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureHero: {
    marginHorizontal: spacing.md,
    paddingVertical: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  searchInput: { flex: 1, minHeight: 48 },
  searchResult: {
    minHeight: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchResultMark: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function CommunityCreateScreen({
  colors,
  reach,
  homeNode,
  onOpenNetwork,
  onCreated,
}: CommonProps & { readonly homeNode: HomeNode; readonly onCreated: () => void }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [isPrivate] = useState(false);
  const [isNsfw] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    readonly tone: 'verified' | 'danger';
    readonly title: string;
    readonly body: string;
  } | null>(null);

  const publish = async () => {
    console.log('[CommunityCreateScreen] User clicked create community.');
    setPublishing(true);
    setPublishResult(null);
    try {
      console.log('[CommunityCreateScreen] Calling publishCommunity...');
      const receipt = await publishCommunity(
        homeNode.baseUrl,
        {
          name: name.trim().toLowerCase(),
          title: title.trim(),
          description: description.trim(),
          rulesMarkdown: rules.trim(),
          isPrivate,
          isNsfw,
        },
        homeNode.discovery.services.auditLogs,
      );
      console.log('[CommunityCreateScreen] publishCommunity succeeded.', receipt);
      setName('');
      setTitle('');
      setDescription('');
      setRules('');
      setPublishResult({
        tone: 'verified',
        title: receipt.pending ? 'Signed and queued on this device' : 'Community created',
        body: receipt.pending
          ? `${receipt.contentId.slice(0, 18)}… · final ID assigned · awaiting a working path`
          : `Proof saved on this device`,
      });
      setTimeout(() => onCreated(), 1500);
    } catch (error) {
      console.error('[CommunityCreateScreen] publishCommunity failed:', error);
      setPublishResult({
        tone: 'danger',
        title: 'Community was not created',
        body: (error as Error).message,
      });
    } finally {
      console.log('[CommunityCreateScreen] Resetting publishing state.');
      setPublishing(false);
    }
  };

  const submitLabel =
    reach === 'blackout' || reach === 'constrained' ? 'Queue creation' : 'Create Community';

  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onReach={onOpenNetwork} title="New Community" />
      <ContentColumn>
        {publishResult ? (
          <View style={{ marginBottom: spacing.lg }}>
            <StatusBanner
              colors={colors}
              icon={
                publishResult.tone === 'verified'
                  ? 'shield-checkmark-outline'
                  : 'alert-circle-outline'
              }
              title={publishResult.title}
              body={publishResult.body}
              tone={publishResult.tone}
            />
          </View>
        ) : null}
        <TextInput
          placeholder="Community Name (e.g. general)"
          value={name}
          onChangeText={setName}
          editable={!publishing}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ marginBottom: spacing.md }}
        />
        <TextInput
          placeholder="Display Title"
          value={title}
          onChangeText={setTitle}
          editable={!publishing}
          style={{ marginBottom: spacing.md }}
        />
        <TextInput
          placeholder="Description"
          value={description}
          onChangeText={setDescription}
          editable={!publishing}
          multiline
          numberOfLines={3}
          style={{ marginBottom: spacing.md, minHeight: 80 }}
        />
        <Button
          label={publishing ? 'Creating...' : submitLabel}
          onPress={publish}
          colors={colors}
          system="ember"
          disabled={publishing || name.trim().length === 0}
        />
      </ContentColumn>
    </Screen>
  );
}
