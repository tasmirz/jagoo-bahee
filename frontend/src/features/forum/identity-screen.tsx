import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNodeDocument } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { blockForumIdentity, followForumIdentity } from '../../signer';
import type { AppPalette } from '../../theme';
import { radius, spacing, type as typography } from '../../theme';
import { Button, EmptyState, IconButton, Screen, StatusBanner } from '../../ui/primitives';

interface PublicIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly bio: string;
  readonly postKarma: number;
  readonly commentKarma: number;
}

function publicKeyBytes(value: string): Uint8Array {
  const hex = value.startsWith('jbk1') ? value.slice(4) : value;
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('This profile does not expose a valid Forum key.');
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

export function PublicIdentityScreen({
  colors,
  homeNode,
  keyId,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly keyId: string;
  readonly onBack: () => void;
}) {
  const identity = useNodeDocument<PublicIdentity>(
    homeNode.baseUrl,
    `/v1/identities/${encodeURIComponent(keyId)}`,
  );
  const profile = identity.data?.value;
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const changeFollow = async () => {
    if (!profile) return;
    setBusy(true); setNotice('');
    try {
      await followForumIdentity(homeNode.baseUrl, {
        subject_key: publicKeyBytes(profile.id),
        follow: !following,
      }, homeNode.discovery.services.auditLogs);
      setFollowing((value) => !value);
      setNotice(`${following ? 'Unfollow' : 'Follow'} action signed and queued.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Follow state could not be changed.');
    } finally { setBusy(false); }
  };
  const changeBlock = async () => {
    if (!profile) return;
    setBusy(true); setNotice('');
    try {
      await blockForumIdentity(homeNode.baseUrl, {
        subject_key: publicKeyBytes(profile.id),
        block: !blocked,
        reason: blocked ? '' : blockReason.trim(),
      }, homeNode.discovery.services.auditLogs);
      setBlocked((value) => !value);
      setBlockingOpen(false);
      setNotice(`${blocked ? 'Unblock' : 'Block'} action signed and queued.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Block state could not be changed.');
    } finally { setBusy(false); }
  };
  return (
    <Screen colors={colors}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          Public identity
        </Text>
      </View>
      <View style={styles.column}>
        {profile ? (
          <>
            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.ember }]}>
                <Text style={[typography.h1, { color: colors.onAccent }]}>
                  {(profile.displayName || 'JB').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={[typography.h1, { color: colors.text }]}>
                {profile.displayName || `user_${profile.id.slice(0, 12)}`}
              </Text>
              <Text style={[typography.body, { color: colors.text2 }]}>
                {profile.bio || 'No public bio has been published.'}
              </Text>
              <Text selectable style={[typography.mono, { color: colors.text3 }]}>{profile.id}</Text>
              <View style={styles.stats}>
                <Stat colors={colors} label="Post karma" value={profile.postKarma} />
                <Stat colors={colors} label="Comment karma" value={profile.commentKarma} />
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.actionCell}>
                <Button colors={colors} disabled={busy || blocked} label={following ? 'Following' : 'Follow'} onPress={() => void changeFollow()} variant={following ? 'secondary' : 'primary'} />
              </View>
              <View style={styles.actionCell}>
                <Button colors={colors} disabled={busy} label={blocked ? 'Unblock' : 'Block'} onPress={() => blocked ? void changeBlock() : setBlockingOpen((value) => !value)} variant="secondary" />
              </View>
            </View>
            {blockingOpen ? (
              <View style={[styles.blockForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[typography.label, { color: colors.text }]}>Block this identity</Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  Blocked senders cannot deliver Forum messages to you.
                </Text>
                <TextInput accessibilityLabel="Block reason" multiline onChangeText={setBlockReason} placeholder="Optional private context" placeholderTextColor={colors.text3} style={[typography.body, styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]} value={blockReason} />
                <Button colors={colors} disabled={busy} label="Confirm block" onPress={() => void changeBlock()} variant="destructive" />
              </View>
            ) : null}
            {notice ? <StatusBanner body={notice} colors={colors} icon={notice.includes('queued') ? 'checkmark-circle-outline' : 'warning-outline'} title={notice.includes('queued') ? 'Preference updated' : 'Could not update'} tone={notice.includes('queued') ? 'verified' : 'danger'} /> : null}
          </>
        ) : identity.isError ? (
          <EmptyState body="This key is not present in the selected node's public identity projection." colors={colors} icon="person-outline" title="Identity not found" />
        ) : null}
      </View>
    </Screen>
  );
}

function Stat({ colors, label, value }: { readonly colors: AppPalette; readonly label: string; readonly value: number }) {
  return <View style={styles.stat}><Text style={[typography.h2, { color: colors.text }]}>{value}</Text><Text style={[typography.caption, { color: colors.text2 }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 68, paddingHorizontal: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.md, gap: spacing.md },
  hero: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  avatar: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stats: { width: '100%', flexDirection: 'row', marginTop: spacing.sm },
  stat: { flex: 1, alignItems: 'center', minHeight: 60, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionCell: { flex: 1 },
  blockForm: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  input: { minHeight: 96, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top' },
});
