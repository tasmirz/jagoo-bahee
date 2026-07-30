import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNodePost } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { deleteForumPost, updateForumPost } from '../../signer';
import type { AppPalette } from '../../design-system';
import { spacing, type as typography } from '../../design-system';
import { Button, IconButton, Screen, StatusBanner } from '../../design-system';

export function EditPostScreen({ colors, contentId, homeNode, onBack, onDone }: { readonly colors: AppPalette; readonly contentId: string; readonly homeNode: HomeNode; readonly onBack: () => void; readonly onDone: () => void }) {
  const post = useNodePost(homeNode.baseUrl, contentId);
  const item = post.data?.value;
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const update = async () => { if (!item) return; setBusy(true); setNotice(''); try { await updateForumPost(homeNode.baseUrl, { communityId: item.community, target: item.contentId, bodyMarkdown: body || item.bodyMarkdown || '' }, homeNode.discovery.services.auditLogs); onDone(); } catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Post could not be updated.'); } finally { setBusy(false); } };
  const remove = async () => { if (!item || !reason.trim()) return; setBusy(true); setNotice(''); try { await deleteForumPost(homeNode.baseUrl, { communityId: item.community, target: item.contentId, reason }, homeNode.discovery.services.auditLogs); onDone(); } catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Post could not be deleted.'); } finally { setBusy(false); } };
  return <Screen colors={colors}><View style={{ minHeight: 64, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} /><Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>Edit post</Text></View><View style={{ padding: spacing.md, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' }}>{notice ? <StatusBanner colors={colors} icon="alert-circle-outline" title="Action not completed" body={notice} tone="danger" /> : null}{item ? <><Text style={[typography.h1, { color: colors.text }]}>{item.title}</Text><TextInput accessibilityLabel="Post body" defaultValue={item.bodyMarkdown ?? ''} multiline onChangeText={setBody} style={[typography.body, { minHeight: 180, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, textAlignVertical: 'top' }]} /><Button colors={colors} disabled={busy} label={busy ? 'Signing update…' : 'Save changes'} onPress={() => void update()} /><Text style={[typography.label, { color: colors.blackout }]}>Delete with a public tombstone</Text><TextInput accessibilityLabel="Deletion reason" placeholder="Reason shown with the tombstone" placeholderTextColor={colors.text3} onChangeText={setReason} style={[typography.body, { minHeight: 52, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} /><Button colors={colors} disabled={busy || !reason.trim()} label="Delete post" variant="destructive" onPress={() => void remove()} /></> : <StatusBanner colors={colors} icon="cloud-offline-outline" title="Post unavailable" body="Reconnect or return to the post later." tone="warning" />}</View></Screen>;
}
