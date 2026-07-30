import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostKind } from '@jagoo/sdk/proto';
import {
  BottomSheet,
  Button,
  ChipGroup,
  CostRing,
  Disclosure,
  IconButton,
  Page,
  PageHeader,
  SegmentedControl,
  StatusBanner,
  TextAreaField,
  TextField,
  ToggleRow,
  maxFontScale,
  radius,
  spacing,
  useGutter,
  type as typography,
  type AppPalette,
  type ThemeMode,
} from '../../design-system';
import { useNodeCommunities, useNodeDocument, type NodeCommunity } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { publishForumPost, uploadAndClaimForumAttachment } from '../../signer';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

type Kind = 'text' | 'link' | 'image' | 'video' | 'poll' | 'crosspost';

const KIND_TO_PROTO: Record<Kind, PostKind> = {
  text: PostKind.POST_KIND_TEXT,
  link: PostKind.POST_KIND_LINK,
  image: PostKind.POST_KIND_IMAGE,
  video: PostKind.POST_KIND_VIDEO,
  poll: PostKind.POST_KIND_POLL,
  crosspost: PostKind.POST_KIND_CROSSPOST,
};

const ALL_KINDS: readonly { readonly value: Kind; readonly label: string; readonly allow?: keyof NonNullable<NodeCommunity['settings']> }[] = [
  { value: 'text', label: 'Text' },
  { value: 'link', label: 'Link', allow: 'allowLinkPosts' },
  { value: 'image', label: 'Image', allow: 'allowImagePosts' },
  { value: 'video', label: 'Video', allow: 'allowVideoPosts' },
  { value: 'poll', label: 'Poll' },
  { value: 'crosspost', label: 'Crosspost', allow: 'allowCrossposts' },
];

const DRAFT_KEY = 'jb.composer.draft.v1';

interface Draft {
  readonly communityId: string;
  readonly kind: Kind;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly flair: string;
}

interface Attachment {
  readonly localUri: string;
  readonly contentId: string | null;
  readonly uploading: boolean;
  readonly error: string | null;
}

/**
 * The composer rewrite (F3) — root cause #4's highest-value fix. The previous screen stacked
 * every community and every post-kind pill one-per-line (a missing `flexDirection: 'row'`),
 * asked people to paste raw `jb1…` attachment IDs into a textarea, and had no navigation away
 * from itself on success. This version: a searchable community-picker sheet, a real image
 * picker with thumbnails and per-item progress, and a queue-aware sticky submit bar.
 */
export function ComposerScreen({
  colors,
  mode,
  homeNode,
  reach,
  initialCommunityId,
  onCancel,
  onPublished,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly homeNode: HomeNode;
  readonly reach: 'connected' | 'constrained' | 'blackout';
  readonly initialCommunityId?: string;
  readonly onCancel: () => void;
  readonly onPublished: (contentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const gutter = useGutter();
  const [communityId, setCommunityId] = useState(initialCommunityId ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [communityQuery, setCommunityQuery] = useState('');
  const debouncedQuery = useDebouncedValue(communityQuery, 250);
  const [kind, setKind] = useState<Kind>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [flair, setFlair] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [nsfw, setNsfw] = useState(false);
  const [oc, setOriginalContent] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<readonly string[]>(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [crosspostOf, setCrosspostOf] = useState('');
  const [attachments, setAttachments] = useState<readonly Attachment[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const draftLoaded = useRef(false);

  const communities = useNodeCommunities(homeNode.baseUrl, debouncedQuery);
  const communityItems = communities.data?.value.items ?? [];
  const community = useNodeDocument<NodeCommunity>(
    homeNode.baseUrl,
    communityId ? `/v1/communities/${encodeURIComponent(communityId)}` : null,
  );
  const selectedCommunity = community.data?.value ?? communityItems.find((item) => item.id === communityId) ?? null;

  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    void AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw) as Draft;
        if (!initialCommunityId) setCommunityId(draft.communityId);
        setKind(draft.kind);
        setTitle(draft.title);
        setBody(draft.body);
        setUrl(draft.url);
        setFlair(draft.flair);
      } catch {
        // Corrupt draft — start clean rather than surface an error for a background restore.
      }
    });
  }, [initialCommunityId]);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const draft: Draft = { communityId, kind, title, body, url, flair };
    void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [communityId, kind, title, body, url, flair]);

  const availableKinds = useMemo(
    () =>
      ALL_KINDS.filter((option) => {
        if (!option.allow) return true;
        if (!selectedCommunity?.settings) return true;
        return selectedCommunity.settings[option.allow];
      }),
    [selectedCommunity],
  );

  useEffect(() => {
    if (!availableKinds.some((option) => option.value === kind)) {
      setKind(availableKinds[0]?.value ?? 'text');
    }
  }, [availableKinds, kind]);

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access was not granted.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const localUri = asset.uri;
    setAttachments((current) => [...current, { localUri, contentId: null, uploading: true, error: null }]);
    try {
      const claim = await uploadAndClaimForumAttachment(
        homeNode.baseUrl,
        {
          uri: localUri,
          mime: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          size: asset.fileSize ?? 0,
          altText: '',
        },
        homeNode.discovery.services.auditLogs,
      );
      setAttachments((current) =>
        current.map((item) =>
          item.localUri === localUri ? { ...item, contentId: claim.contentId, uploading: false } : item,
        ),
      );
    } catch (attachError) {
      setAttachments((current) =>
        current.map((item) =>
          item.localUri === localUri
            ? { ...item, uploading: false, error: attachError instanceof Error ? attachError.message : 'Upload failed' }
            : item,
        ),
      );
    }
  };

  const removeAttachment = (localUri: string) =>
    setAttachments((current) => current.filter((item) => item.localUri !== localUri));

  const updatePollOption = (index: number, value: string) =>
    setPollOptions((current) => current.map((option, i) => (i === index ? value : option)));
  const addPollOption = () => setPollOptions((current) => (current.length < 10 ? [...current, ''] : current));
  const removePollOption = (index: number) =>
    setPollOptions((current) => current.filter((_, i) => i !== index));

  const canPublish =
    Boolean(selectedCommunity) &&
    title.trim().length > 0 &&
    (kind !== 'link' || url.trim().length > 0) &&
    (kind !== 'crosspost' || crosspostOf.trim().startsWith('jb1')) &&
    (kind !== 'poll' || (pollQuestion.trim().length > 0 && pollOptions.filter((o) => o.trim()).length >= 2)) &&
    ((kind !== 'image' && kind !== 'video') || attachments.some((a) => a.contentId)) &&
    !attachments.some((a) => a.uploading) &&
    !publishing;

  const publish = async () => {
    if (!selectedCommunity) return;
    setPublishing(true);
    setError('');
    try {
      const receipt = await publishForumPost(
        homeNode.baseUrl,
        {
          title: title.trim(),
          bodyMarkdown: body.trim(),
          communityId: selectedCommunity.id,
          kind: KIND_TO_PROTO[kind],
          url: kind === 'link' ? url.trim() : '',
          attachments: attachments.map((a) => a.contentId).filter((id): id is string => Boolean(id)),
          poll:
            kind === 'poll'
              ? {
                  question: pollQuestion.trim(),
                  options: pollOptions.map((o) => o.trim()).filter(Boolean),
                  multiple: pollMultiple,
                  closesAtMs: BigInt(Date.now() + 7 * 24 * 60 * 60 * 1000),
                }
              : undefined,
          crosspostOf: kind === 'crosspost' ? crosspostOf.trim() : '',
          flair: flair.trim(),
          flags: { nsfw, spoiler, oc },
        },
        homeNode.discovery.services.auditLogs,
      );
      await AsyncStorage.removeItem(DRAFT_KEY);
      await queryClient.invalidateQueries({ queryKey: ['node', homeNode.baseUrl, 'feed-pages'] });
      await queryClient.invalidateQueries({ queryKey: ['node', homeNode.baseUrl, 'feed'] });
      onPublished(receipt.contentId);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'The post was not published.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        colors={colors}
        mode={mode}
        title="New post"
        onBack={onCancel}
        variant="flat"
        actions={[]}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Page colors={colors} gap={spacing.md}>
          <View style={styles.column}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a community"
              onPress={() => setPickerOpen(true)}
              style={[styles.select, { backgroundColor: colors.surface2, borderColor: colors.border }]}
            >
              <View style={[styles.communityAvatar, { backgroundColor: colors.ember }]} />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={maxFontScale.bodyLarge}
                style={[typography.bodyLarge, styles.flexShrink, { color: selectedCommunity ? colors.text : colors.text3 }]}
              >
                {selectedCommunity ? `r/${selectedCommunity.name}` : 'Choose a community'}
              </Text>
            </Pressable>

            <SegmentedControl
              colors={colors}
              options={availableKinds.map((option) => ({ value: option.value, label: option.label }))}
              value={kind}
              onChange={setKind}
            />

            <TextField colors={colors} label="Title" value={title} onChangeText={setTitle} maxLength={300} placeholder="What should people know?" />

            {kind === 'link' ? (
              <TextField colors={colors} label="Link URL" value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
            ) : null}

            {kind === 'crosspost' ? (
              <TextField colors={colors} label="Original post ID" value={crosspostOf} onChangeText={setCrosspostOf} placeholder="jb1…" mono autoCapitalize="none" />
            ) : null}

            {kind === 'poll' ? (
              <View style={styles.pollBlock}>
                <TextField colors={colors} label="Poll question" value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask one clear question" />
                {pollOptions.map((option, index) => (
                  <View key={index} style={styles.pollOptionRow}>
                    <View style={styles.flex}>
                      <TextField colors={colors} value={option} onChangeText={(value) => updatePollOption(index, value)} placeholder={`Option ${index + 1}`} />
                    </View>
                    {pollOptions.length > 2 ? (
                      <IconButton colors={colors} icon="close-circle-outline" label="Remove option" onPress={() => removePollOption(index)} />
                    ) : null}
                  </View>
                ))}
                {pollOptions.length < 10 ? (
                  <Button colors={colors} variant="ghost" icon="add-circle-outline" label="Add option" onPress={addPollOption} />
                ) : null}
                <ToggleRow colors={colors} label="Allow multiple choices" value={pollMultiple} onChange={setPollMultiple} />
              </View>
            ) : null}

            {kind === 'image' || kind === 'video' ? (
              <View style={styles.mediaBlock}>
                <ChipGroup>
                  {attachments.map((attachment) => (
                    <View key={attachment.localUri} style={[styles.thumb, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                      {attachment.uploading ? (
                        <CostRing colors={colors} progress={0.5} size={20} />
                      ) : attachment.error ? (
                        <IconButton colors={colors} icon="alert-circle" label="Upload failed" onPress={() => removeAttachment(attachment.localUri)} />
                      ) : (
                        <IconButton colors={colors} icon="checkmark-circle" label="Uploaded" active onPress={() => removeAttachment(attachment.localUri)} />
                      )}
                    </View>
                  ))}
                </ChipGroup>
                <Button colors={colors} variant="secondary" icon="images-outline" label={`Choose ${kind}`} onPress={() => void pickMedia()} />
              </View>
            ) : null}

            {kind === 'text' || kind === 'image' || kind === 'video' ? (
              <TextAreaField colors={colors} label={kind === 'text' ? 'Body' : 'Caption (optional)'} value={body} onChangeText={setBody} placeholder="Write in Markdown…" minHeight={160} />
            ) : null}

            <Disclosure colors={colors} title="Flair & content tags">
              <TextField colors={colors} label="Flair" value={flair} onChangeText={setFlair} placeholder="Optional" />
              <ToggleRow colors={colors} label="Spoiler" hint="Blur previews until opened" value={spoiler} onChange={setSpoiler} />
              <ToggleRow colors={colors} label="Mature content" hint="Respect each reader's blur preference" value={nsfw} onChange={setNsfw} />
              <ToggleRow colors={colors} label="Original content" value={oc} onChange={setOriginalContent} />
            </Disclosure>

            {reach !== 'connected' ? (
              <StatusBanner
                colors={colors}
                icon="time-outline"
                title="This post will enter the outbox"
                body="A final content ID is assigned immediately. Jagoo retries the signed envelope when a path opens."
                tone="neutral"
              />
            ) : null}
            {error ? <StatusBanner colors={colors} icon="alert-circle-outline" title="Post was not published" body={error} tone="danger" /> : null}
          </View>
        </Page>
        {/* Sticky submit bar — same inline inset and reading measure as the form above it. */}
        <View style={[styles.footer, { paddingHorizontal: gutter, borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          <Button
            colors={colors}
            disabled={!canPublish}
            label={publishing ? 'Signing and publishing…' : reach !== 'connected' ? 'Queue' : 'Post'}
            icon="send-outline"
            onPress={() => void publish()}
          />
        </View>
      </KeyboardAvoidingView>

      <BottomSheet colors={colors} mode={mode} visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a community">
        <TextField colors={colors} value={communityQuery} onChangeText={setCommunityQuery} placeholder="Search communities" />
        <ScrollView style={styles.pickerList}>
          {communityItems.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => {
                setCommunityId(item.id);
                setPickerOpen(false);
              }}
              style={styles.pickerRow}
            >
              <View style={[styles.communityAvatar, { backgroundColor: colors.ember }]} />
              <Text maxFontSizeMultiplier={maxFontScale.bodyLarge} style={[typography.bodyLarge, { color: colors.text }]}>
                r/{item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  // Gutter-free by contract — `Page` owns the screen's inline inset.
  column: { gap: spacing.md },
  select: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  communityAvatar: { width: 28, height: 28, borderRadius: radius.pill },
  pollBlock: { gap: spacing.sm },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mediaBlock: { gap: spacing.sm },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  pickerList: { maxHeight: 320 },
  pickerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
