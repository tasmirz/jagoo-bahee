import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ModVerb, ReportStatus, TargetKind, Verdict } from '@jagoo/sdk/proto';
import { useNodeDocument, type NodePage } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import {
  archiveForumCommunity,
  assignForumRole,
  defineForumRole,
  emitForumLabel,
  publishForumModeration,
  resolveForumReport,
  revokeForumRole,
  updateForumCommunity,
} from '../../signer';
import type { AppPalette } from '../../theme';
import { radius, spacing, type as typography } from '../../theme';
import { Button, EmptyState, IconButton, Screen, StatusBanner } from '../../ui/primitives';

type Section = 'queue' | 'actions' | 'roles' | 'settings';

interface ReportRow {
  readonly id: string;
  readonly target: string;
  readonly targetKind: number;
  readonly reason: number;
  readonly detail: string;
  readonly status: number;
  readonly createdAtMs: number;
}

interface RoleRow {
  readonly id: string;
  readonly name: string;
  readonly permissionMask: string;
  readonly isDefault: boolean;
}

interface MemberRow {
  readonly id: string;
  readonly memberKey: string;
  readonly flags: string;
  readonly joinedAtMs: number;
  readonly restrictedUntilMs: number | null;
  readonly restrictionReason: string | null;
}

interface CommunityDocument {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly rulesMarkdown?: string;
  readonly private?: boolean;
  readonly nsfw?: boolean;
  readonly archived: boolean;
}

const PERMISSION_PRESETS = [
  { label: 'Member', value: 3n, detail: 'Read and publish posts' },
  { label: 'Content mod', value: 1979n, detail: 'Moderate posts, comments, and reports' },
  { label: 'Community admin', value: 2047n, detail: 'Manage members, roles, content, and reports' },
] as const;

function bytesFromHex(value: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Enter an even-length hexadecimal public key.');
  }
  return Uint8Array.from(normalized.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

export function CommunityManagementScreen({
  colors,
  homeNode,
  communityId,
  initialSection = 'queue',
  onBack,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly communityId: string;
  readonly initialSection?: Section;
  readonly onBack: () => void;
}) {
  const encoded = encodeURIComponent(communityId);
  const [section, setSection] = useState<Section>(initialSection);
  const reports = useNodeDocument<NodePage<ReportRow>>(
    homeNode.baseUrl,
    `/v1/communities/${encoded}/reports?limit=100`,
  );
  const roles = useNodeDocument<NodePage<RoleRow>>(
    homeNode.baseUrl,
    `/v1/communities/${encoded}/roles?limit=100`,
  );
  const members = useNodeDocument<NodePage<MemberRow>>(
    homeNode.baseUrl,
    `/v1/communities/${encoded}/members?limit=100`,
  );
  const community = useNodeDocument<CommunityDocument>(
    homeNode.baseUrl,
    `/v1/communities/${encoded}`,
  );
  const audit = homeNode.discovery.services.auditLogs;
  return (
    <Screen colors={colors}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
            Community controls
          </Text>
          <Text numberOfLines={1} style={[typography.caption, { color: colors.text2 }]}>
            Signed actions for {community.data?.value.title ?? communityId}
          </Text>
        </View>
      </View>
      <View style={styles.column}>
        <StatusBanner
          body="The node enforces your current role. Every accepted action is signed and appears in the public moderation log."
          colors={colors}
          icon="shield-checkmark-outline"
          title="Authority stays verifiable"
          tone="verified"
        />
        <View accessibilityRole="tablist" style={styles.tabs}>
          {([
            ['queue', 'Reports', 'file-tray-full-outline'],
            ['actions', 'Moderate', 'hammer-outline'],
            ['roles', 'Roles', 'people-outline'],
            ['settings', 'Settings', 'settings-outline'],
          ] as const).map(([id, label, icon]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: section === id }}
              key={id}
              onPress={() => setSection(id)}
              style={[
                styles.tab,
                {
                  backgroundColor: section === id ? colors.surface2 : 'transparent',
                  borderColor: section === id ? colors.border : 'transparent',
                },
              ]}
            >
              <Ionicons
                color={section === id ? colors.ember : colors.text2}
                name={icon}
                size={18}
              />
              <Text
                style={[
                  typography.caption,
                  { color: section === id ? colors.text : colors.text2 },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {section === 'queue' ? (
          <ReportQueue
            audit={audit}
            colors={colors}
            communityId={communityId}
            homeNode={homeNode}
            onRefresh={() => void reports.refetch()}
            reports={reports.data?.value.items ?? []}
          />
        ) : null}
        {section === 'actions' ? (
          <ModerationComposer
            audit={audit}
            colors={colors}
            communityId={communityId}
            homeNode={homeNode}
          />
        ) : null}
        {section === 'roles' ? (
          <RoleEditor
            audit={audit}
            colors={colors}
            communityId={communityId}
            homeNode={homeNode}
            onRefresh={() => void roles.refetch()}
            members={members.data?.value.items ?? []}
            roles={roles.data?.value.items ?? []}
          />
        ) : null}
        {section === 'settings' && community.data?.value ? (
          <CommunitySettings
            audit={audit}
            colors={colors}
            community={community.data.value}
            homeNode={homeNode}
            onRefresh={() => void community.refetch()}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function ReportQueue({
  audit,
  colors,
  communityId,
  homeNode,
  onRefresh,
  reports,
}: {
  readonly audit: HomeNode['discovery']['services']['auditLogs'];
  readonly colors: AppPalette;
  readonly communityId: string;
  readonly homeNode: HomeNode;
  readonly onRefresh: () => void;
  readonly reports: readonly ReportRow[];
}) {
  const pending = reports.filter((item) => item.status === ReportStatus.REPORT_STATUS_PENDING);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const resolve = async (report: ReportRow, dismissed: boolean) => {
    setBusyId(report.id);
    setNotice('');
    try {
      await resolveForumReport(
        homeNode.baseUrl,
        communityId,
        {
          target: report.id,
          status: dismissed
            ? ReportStatus.REPORT_STATUS_DISMISSED
            : ReportStatus.REPORT_STATUS_RESOLVED,
          action_taken: dismissed ? ModVerb.MOD_VERB_UNSPECIFIED : ModVerb.MOD_VERB_REMOVE,
          note: dismissed
            ? 'Reviewed; no policy violation found.'
            : 'Reviewed and removed from normal view.',
        },
        audit,
      );
      setNotice('Resolution signed and queued. The server will verify your role before applying it.');
      onRefresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The report could not be resolved.');
    } finally {
      setBusyId('');
    }
  };
  return (
    <SectionCard colors={colors} title="Report queue" detail={`${pending.length} awaiting review`}>
      {notice ? <Notice colors={colors} text={notice} /> : null}
      {pending.length === 0 ? (
        <EmptyState
          body="New community reports will collect here with their reason and target."
          colors={colors}
          icon="checkmark-circle-outline"
          title="Queue is clear"
        />
      ) : (
        pending.map((report) => (
          <View key={report.id} style={[styles.report, { borderColor: colors.border }]}>
            <View style={styles.row}>
              <View style={[styles.reasonIcon, { backgroundColor: colors.surface2 }]}>
                <Ionicons color={colors.ember} name="flag-outline" size={20} />
              </View>
              <View style={styles.flex}>
                <Text style={[typography.label, { color: colors.text }]}>
                  Reason {report.reason} · target type {report.targetKind}
                </Text>
                <Text selectable style={[typography.mono, { color: colors.text2 }]}>
                  {report.target}
                </Text>
              </View>
            </View>
            <Text style={[typography.body, { color: colors.text2 }]}>
              {report.detail || 'No additional detail was supplied.'}
            </Text>
            <Text style={[typography.caption, { color: colors.text3 }]}>
              Submitted {new Date(report.createdAtMs).toLocaleString()}
            </Text>
            <View style={styles.buttonRow}>
              <View style={styles.buttonCell}>
                <Button
                  colors={colors}
                  disabled={busyId === report.id}
                  label="Dismiss"
                  onPress={() => void resolve(report, true)}
                  variant="secondary"
                />
              </View>
              <View style={styles.buttonCell}>
                <Button
                  colors={colors}
                  disabled={busyId === report.id}
                  label={busyId === report.id ? 'Signing…' : 'Remove content'}
                  onPress={() => void resolve(report, false)}
                  variant="destructive"
                />
              </View>
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );
}

function ModerationComposer({
  audit,
  colors,
  communityId,
  homeNode,
}: {
  readonly audit: HomeNode['discovery']['services']['auditLogs'];
  readonly colors: AppPalette;
  readonly communityId: string;
  readonly homeNode: HomeNode;
}) {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState(TargetKind.TARGET_KIND_POST);
  const [verb, setVerb] = useState(ModVerb.MOD_VERB_REMOVE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [labelMode, setLabelMode] = useState(false);
  const publish = async () => {
    setBusy(true);
    setNotice('');
    try {
      if (labelMode) {
        await emitForumLabel(
          homeNode.baseUrl,
          communityId,
          {
            target: target.trim(),
            verdict: Verdict.VERDICT_REVIEW,
            categories: ['community-review'],
            confidence_pct: 100,
            model_id: 'human:mod',
            reasons: [reason.trim()],
            appealable: true,
          },
          audit,
        );
      } else {
        await publishForumModeration(
          homeNode.baseUrl,
          communityId,
          {
            target: target.trim(),
            target_kind: kind,
            verb,
            reason: reason.trim(),
            expires_at_ms: 0n,
          },
          audit,
        );
      }
      setNotice(labelMode ? 'Advisory label signed and queued.' : 'Moderation action signed and queued.');
      setTarget('');
      setReason('');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The action could not be published.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      colors={colors}
      detail="Use exact content IDs or identity public keys"
      title="Moderation action"
    >
      <ToggleRow
        colors={colors}
        label="Publish an appealable advisory label"
        onChange={setLabelMode}
        value={labelMode}
      />
      {!labelMode ? (
        <>
          <ChoiceRow
            colors={colors}
            label="Target type"
            options={[
              ['Post', TargetKind.TARGET_KIND_POST],
              ['Comment', TargetKind.TARGET_KIND_COMMENT],
              ['Identity', TargetKind.TARGET_KIND_IDENTITY],
            ]}
            onChange={setKind}
            value={kind}
          />
          <ChoiceRow
            colors={colors}
            label="Action"
            options={[
              ['Remove', ModVerb.MOD_VERB_REMOVE],
              ['Lock', ModVerb.MOD_VERB_LOCK],
              ['Pin', ModVerb.MOD_VERB_PIN],
              ['Ban', ModVerb.MOD_VERB_BAN],
            ]}
            onChange={setVerb}
            value={verb}
          />
        </>
      ) : null}
      <Field colors={colors} label="Target ID" onChange={setTarget} value={target} />
      <Field
        colors={colors}
        label={labelMode ? 'Public reason for this label' : 'Public moderation reason'}
        multiline
        onChange={setReason}
        value={reason}
      />
      {notice ? <Notice colors={colors} text={notice} /> : null}
      <Button
        colors={colors}
        disabled={busy || !target.trim() || !reason.trim()}
        label={busy ? 'Signing…' : labelMode ? 'Publish label' : 'Publish action'}
        onPress={() => void publish()}
      />
    </SectionCard>
  );
}

function RoleEditor({
  audit,
  colors,
  communityId,
  homeNode,
  onRefresh,
  members,
  roles,
}: {
  readonly audit: HomeNode['discovery']['services']['auditLogs'];
  readonly colors: AppPalette;
  readonly communityId: string;
  readonly homeNode: HomeNode;
  readonly onRefresh: () => void;
  readonly members: readonly MemberRow[];
  readonly roles: readonly RoleRow[];
}) {
  const [name, setName] = useState('');
  const [mask, setMask] = useState<bigint>(PERMISSION_PRESETS[1].value);
  const [defaultRole, setDefaultRole] = useState(false);
  const [subject, setSubject] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const activeRole = selectedRole || roles[0]?.name || '';
  const publishRole = async () => {
    setBusy(true);
    setNotice('');
    try {
      await defineForumRole(
        homeNode.baseUrl,
        {
          community: communityId,
          name: name.trim(),
          permission_mask: mask,
          is_default: defaultRole,
        },
        audit,
      );
      setNotice('Role definition signed and queued.');
      setName('');
      onRefresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The role could not be defined.');
    } finally {
      setBusy(false);
    }
  };
  const changeAssignment = async (revoke: boolean) => {
    setBusy(true);
    setNotice('');
    try {
      const input = {
        community: communityId,
        subject_key: bytesFromHex(subject),
        role: activeRole,
      };
      if (revoke) await revokeForumRole(homeNode.baseUrl, input, audit);
      else await assignForumRole(homeNode.baseUrl, input, audit);
      setNotice(`${revoke ? 'Role removal' : 'Role assignment'} signed and queued.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The membership role could not be changed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionCard
        colors={colors}
        detail="Permission presets prevent accidental over-granting"
        title="Define a role"
      >
        <Field colors={colors} label="Role name" onChange={setName} value={name} />
        <ChoiceRow
          colors={colors}
          label="Permission preset"
          onChange={setMask}
          options={PERMISSION_PRESETS.map((item) => [item.label, item.value] as const)}
          value={mask}
        />
        <Text style={[typography.caption, { color: colors.text2 }]}>
          {PERMISSION_PRESETS.find((item) => item.value === mask)?.detail}
        </Text>
        <ToggleRow
          colors={colors}
          label="Default for new members"
          onChange={setDefaultRole}
          value={defaultRole}
        />
        <Button
          colors={colors}
          disabled={busy || !/^[a-z0-9_-]{2,32}$/.test(name)}
          label={busy ? 'Signing…' : 'Define role'}
          onPress={() => void publishRole()}
        />
      </SectionCard>
      <SectionCard colors={colors} detail={`${roles.length} roles published`} title="Member role">
        <Text style={[typography.label, { color: colors.text }]}>Community members</Text>
        {members.length === 0 ? (
          <Text style={[typography.caption, { color: colors.text2 }]}>No projected members yet.</Text>
        ) : members.map((member) => {
          const flags = BigInt(member.flags);
          const state = (flags & 4n) !== 0n ? 'banned' : (flags & 2n) !== 0n ? 'moderator' : 'member';
          return (
            <Pressable
              accessibilityRole="button"
              key={member.id}
              onPress={() => setSubject(member.memberKey)}
              style={[styles.memberRow, { borderBottomColor: colors.border }]}
            >
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[typography.mono, { color: colors.text }]}>
                  {member.memberKey}
                </Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  Joined {new Date(member.joinedAtMs).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[typography.caption, { color: state === 'banned' ? colors.blackout : colors.text2 }]}>
                {state}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.wrap}>
          {roles.map((role) => (
            <Choice
              colors={colors}
              key={role.id}
              label={role.name}
              onPress={() => setSelectedRole(role.name)}
              selected={activeRole === role.name}
            />
          ))}
        </View>
        <Field
          colors={colors}
          label="Member public key (hex)"
          onChange={setSubject}
          value={subject}
        />
        {notice ? <Notice colors={colors} text={notice} /> : null}
        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <Button
              colors={colors}
              disabled={busy || !activeRole || !subject}
              label="Revoke"
              onPress={() => void changeAssignment(true)}
              variant="secondary"
            />
          </View>
          <View style={styles.buttonCell}>
            <Button
              colors={colors}
              disabled={busy || !activeRole || !subject}
              label="Assign role"
              onPress={() => void changeAssignment(false)}
            />
          </View>
        </View>
      </SectionCard>
    </>
  );
}

function CommunitySettings({
  audit,
  colors,
  community,
  homeNode,
  onRefresh,
}: {
  readonly audit: HomeNode['discovery']['services']['auditLogs'];
  readonly colors: AppPalette;
  readonly community: CommunityDocument;
  readonly homeNode: HomeNode;
  readonly onRefresh: () => void;
}) {
  const [title, setTitle] = useState(community.title);
  const [description, setDescription] = useState(community.description);
  const [rules, setRules] = useState(community.rulesMarkdown ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const save = async () => {
    setBusy(true);
    setNotice('');
    try {
      await updateForumCommunity(
        homeNode.baseUrl,
        {
          target: community.id,
          patch: {
            name: community.name,
            title: title.trim(),
            description: description.trim(),
            rules_markdown: rules.trim(),
            is_private: community.private ?? false,
            is_nsfw: community.nsfw ?? false,
          },
        },
        audit,
      );
      setNotice('Community details signed and queued.');
      onRefresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Community details could not be updated.');
    } finally {
      setBusy(false);
    }
  };
  const toggleArchive = async () => {
    setBusy(true);
    setNotice('');
    try {
      await archiveForumCommunity(
        homeNode.baseUrl,
        { target: community.id, archived: !community.archived },
        audit,
      );
      setNotice(`${community.archived ? 'Restore' : 'Archive'} action signed and queued.`);
      onRefresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Community lifecycle could not be changed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionCard colors={colors} detail={`r/${community.name}`} title="Community identity">
        <Field colors={colors} label="Display title" onChange={setTitle} value={title} />
        <Field
          colors={colors}
          label="Description"
          multiline
          onChange={setDescription}
          value={description}
        />
        <Field colors={colors} label="Rules" multiline onChange={setRules} value={rules} />
        {notice ? <Notice colors={colors} text={notice} /> : null}
        <Button
          colors={colors}
          disabled={busy || !title.trim() || !description.trim()}
          label={busy ? 'Signing…' : 'Save changes'}
          onPress={() => void save()}
        />
      </SectionCard>
      <SectionCard
        colors={colors}
        detail="Archiving preserves signed history and makes the community read-only"
        title="Lifecycle"
      >
        <Button
          colors={colors}
          disabled={busy}
          label={community.archived ? 'Restore community' : 'Archive community'}
          onPress={() => void toggleArchive()}
          variant={community.archived ? 'secondary' : 'destructive'}
        />
      </SectionCard>
    </>
  );
}

function SectionCard({
  children,
  colors,
  detail,
  title,
}: React.PropsWithChildren<{
  readonly colors: AppPalette;
  readonly detail: string;
  readonly title: string;
}>) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[typography.caption, { color: colors.text2 }]}>{detail}</Text>
      {children}
    </View>
  );
}

function Field({
  colors,
  label,
  multiline,
  onChange,
  value,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly multiline?: boolean;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        multiline={multiline}
        onChangeText={onChange}
        placeholderTextColor={colors.text3}
        style={[
          typography.body,
          styles.input,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
            color: colors.text,
            minHeight: multiline ? 96 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
        value={value}
      />
    </View>
  );
}

function ToggleRow({
  colors,
  label,
  onChange,
  value,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly onChange: (value: boolean) => void;
  readonly value: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[typography.label, styles.flex, { color: colors.text }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        trackColor={{ true: colors.ember }}
        value={value}
      />
    </View>
  );
}

function ChoiceRow<T extends number | bigint>({
  colors,
  label,
  onChange,
  options,
  value,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly (readonly [string, T])[];
  readonly value: T;
}) {
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.wrap}>
        {options.map(([optionLabel, option]) => (
          <Choice
            colors={colors}
            key={optionLabel}
            label={optionLabel}
            onPress={() => onChange(option)}
            selected={value === option}
          />
        ))}
      </View>
    </View>
  );
}

function Choice({
  colors,
  label,
  onPress,
  selected,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? colors.surface2 : colors.bg,
          borderColor: selected ? colors.ember : colors.border,
        },
      ]}
    >
      <Text style={[typography.caption, { color: selected ? colors.ember : colors.text2 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Notice({ colors, text }: { readonly colors: AppPalette; readonly text: string }) {
  return (
    <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.text2 }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: {
    minHeight: 68,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  column: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  tabs: { flexDirection: 'row', gap: spacing.xs },
  tab: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  card: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, gap: spacing.md },
  field: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  report: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reasonIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  buttonCell: { flex: 1 },
  memberRow: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
