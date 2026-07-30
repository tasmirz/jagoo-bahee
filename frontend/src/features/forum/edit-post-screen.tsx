import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNodePost } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { deleteForumPost, updateForumPost } from '../../signer';
import type { AppPalette, ThemeMode } from '../../design-system';
import { spacing } from '../../design-system';
import {
  Button,
  Card,
  Page,
  PageHeader,
  SectionHeader,
  StatusBanner,
  TextAreaField,
  TextField,
} from '../../design-system';

/**
 * Rebuilt onto the shared shell and form primitives, like `CommunityCreateScreen`. The delete
 * control also moved into its own bordered block: "Save changes" and "Delete post" used to sit
 * in one undifferentiated column, one tap apart.
 */
export function EditPostScreen({
  colors,
  mode,
  contentId,
  homeNode,
  onBack,
  onDone,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly contentId: string;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const post = useNodePost(homeNode.baseUrl, contentId);
  const item = post.data?.value;
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // The body arrives with the query, not with the first render. `defaultValue` on an
  // uncontrolled input captured whatever was there at mount — usually nothing — so a slow
  // fetch left the editor blank and "Save changes" would have published that blank.
  useEffect(() => {
    if (item?.bodyMarkdown !== undefined) setBody(item.bodyMarkdown ?? '');
  }, [item?.bodyMarkdown]);

  const update = async () => {
    if (!item) return;
    setBusy(true);
    setNotice('');
    try {
      await updateForumPost(
        homeNode.baseUrl,
        { communityId: item.community, target: item.contentId, bodyMarkdown: body },
        homeNode.discovery.services.auditLogs,
      );
      onDone();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Post could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item || !reason.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      await deleteForumPost(
        homeNode.baseUrl,
        { communityId: item.community, target: item.contentId, reason },
        homeNode.discovery.services.auditLogs,
      );
      onDone();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Post could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <PageHeader colors={colors} mode={mode} title="Edit post" subtitle={item?.title} onBack={onBack} />
      <Page colors={colors}>
        {notice ? (
          <StatusBanner colors={colors} icon="alert-circle-outline" title="Action not completed" body={notice} tone="danger" />
        ) : null}
        {item ? (
          <>
            <Card colors={colors} style={styles.formCard}>
              <TextAreaField
                colors={colors}
                label="Body"
                minHeight={180}
                onChangeText={setBody}
                placeholder="Write in Markdown…"
                value={body}
              />
              <Button
                colors={colors}
                disabled={busy}
                icon="save-outline"
                label={busy ? 'Signing update…' : 'Save changes'}
                loading={busy}
                onPress={() => void update()}
              />
            </Card>

            <SectionHeader colors={colors} title="Delete with a public tombstone" />
            <Card colors={colors} style={{ ...styles.formCard, borderColor: colors.blackout }}>
              <TextField
                colors={colors}
                hint="Deletion withholds the body only. The content ID, author, time and this reason stay visible."
                label="Reason"
                onChangeText={setReason}
                placeholder="Shown publicly with the tombstone"
                value={reason}
              />
              <Button
                colors={colors}
                disabled={busy || !reason.trim()}
                label="Delete post"
                variant="destructive"
                onPress={() => void remove()}
              />
            </Card>
          </>
        ) : (
          <StatusBanner
            colors={colors}
            icon="cloud-offline-outline"
            title="Post unavailable"
            body="Reconnect or return to the post later."
            tone="warning"
          />
        )}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  /** `PageHeader` is sticky and owns the top inset, so the page below it simply fills. */
  page: { flex: 1 },
  /** A group of related controls reads as one surface instead of a loose vertical run. */
  formCard: { gap: spacing.md },
});
