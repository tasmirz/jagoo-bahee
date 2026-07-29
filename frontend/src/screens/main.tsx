import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { featureDestinations, type FeatureDestination } from '../features/catalog';
import { nodeBaseUrl, useNodeFeed, type FeedPost } from '../data/node';
import {
  createForumIdentity,
  forumSessionSummary,
  importForumIdentity,
  lockForumIdentity,
  publishForumPost,
  registerForumIdentity,
  unlockForumIdentity,
  type ForumSessionSummary,
} from '../signer';
import type { AppPalette, ThemeMode } from '../theme';
import { radius, spacing, type as typography } from '../theme';
import {
  AppHeader,
  Button,
  Divider,
  EmptyState,
  IconButton,
  Pill,
  PressScale,
  ReachPill,
  Screen,
  Seal,
  SectionHeader,
  StatusBanner,
  type ReachState,
} from '../ui/primitives';

const sampleImage =
  'https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&q=75';

interface CommonProps {
  readonly colors: AppPalette;
  readonly reach: ReachState;
}

function ContentColumn({ children }: { readonly children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  return (
    <View style={[styles.column, width >= 760 ? styles.columnWide : null]}>{children}</View>
  );
}

function VoteControl({ colors, score = 128 }: { readonly colors: AppPalette; readonly score?: number }) {
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  return (
    <View
      accessibilityLabel={`Vote score ${score + vote}`}
      style={[styles.vote, { backgroundColor: colors.surface2 }]}
    >
      <IconButton
        colors={colors}
        icon={vote === 1 ? 'arrow-up-circle' : 'arrow-up-outline'}
        label="Upvote"
        active={vote === 1}
        onPress={() => setVote(vote === 1 ? 0 : 1)}
      />
      <Text style={[typography.label, { color: vote ? colors.ember : colors.text }]}>
        {score + vote}
      </Text>
      <IconButton
        colors={colors}
        icon={vote === -1 ? 'arrow-down-circle' : 'arrow-down-outline'}
        label="Downvote"
        active={vote === -1}
        onPress={() => setVote(vote === -1 ? 0 : -1)}
      />
    </View>
  );
}

function PostCard({
  colors,
  onPress,
  compact = false,
  post,
}: {
  readonly colors: AppPalette;
  readonly onPress: () => void;
  readonly compact?: boolean;
  readonly post?: FeedPost;
}) {
  const title = post?.title ?? 'Community-driven innovation is shaping the future';
  const body =
    post?.bodyMarkdown ??
    'Thoughts on how open source and decentralized communities are solving real-world problems.';
  const community = post?.community || 'technology';
  const author = post?.authorKey ? `${post.authorKey.slice(0, 8)}…` : 'tech_enthusiast';
  const score = post?.score ?? 128;
  const comments = post?.commentCount ?? 32;
  return (
    <PressScale label={`Open post: ${title}`} onPress={onPress}>
      <View style={[styles.post, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.postMeta}>
          <View style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
            <Text style={[typography.caption, { color: colors.ember }]}>r/</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[typography.overline, { color: colors.text }]}>r/{community}</Text>
            <Text style={[typography.caption, { color: colors.text2 }]}>
              u/{author} · {post ? new Date(post.createdAtMs).toLocaleDateString() : '2 hours'}
            </Text>
          </View>
          <Seal colors={colors} />
        </View>
        <Text style={[typography.h1, { color: colors.text }]}>
          {title}
        </Text>
        <Text numberOfLines={compact ? 2 : 3} style={[typography.body, { color: colors.text2 }]}>
          {body}
        </Text>
        {!compact && !post ? (
          <Image
            accessibilityLabel="Modern curved building representing community technology"
            source={{ uri: sampleImage }}
            style={styles.postImage}
          />
        ) : null}
        <View style={styles.postActions}>
          <VoteControl colors={colors} score={score} />
          <View style={styles.inlineActions}>
            <IconButton colors={colors} icon="chatbubble-outline" label={`${comments} comments`} />
            <IconButton colors={colors} icon="share-outline" label="Share post" />
            <IconButton colors={colors} icon="bookmark-outline" label="Save post" />
          </View>
        </View>
        <View style={styles.transport}>
          <Ionicons name="git-network-outline" size={14} color={colors.text2} />
          <Text style={[typography.caption, { color: colors.text2 }]}>via HTTP · proof stored</Text>
        </View>
      </View>
    </PressScale>
  );
}

export function FeedScreen({
  colors,
  reach,
  onOpenPost,
  onSearch,
}: CommonProps & { readonly onOpenPost: () => void; readonly onSearch: () => void }) {
  const [sort, setSort] = useState('For you');
  const querySort =
    sort === 'Popular' ? 'top' : sort === 'Local' || sort === 'Following' ? 'new' : 'hot';
  const feed = useNodeFeed(querySort);
  const posts = feed.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onSearch={onSearch} />
      <ContentColumn>
        {reach !== 'connected' ? (
          <StatusBanner
            colors={colors}
            icon={reach === 'blackout' ? 'cloud-offline-outline' : 'swap-vertical-outline'}
            title={reach === 'blackout' ? 'Reading from this device' : 'Federation is slow'}
            body={
              reach === 'blackout'
                ? 'New posts queue safely and send when any path opens.'
                : 'Posting and reading still work. Live updates may arrive late.'
            }
            tone={reach === 'blackout' ? 'danger' : 'warning'}
          />
        ) : null}
        <ScrollView
          horizontal
          contentContainerStyle={styles.pills}
          showsHorizontalScrollIndicator={false}
        >
          {['For you', 'Following', 'Local', 'Popular'].map((item) => (
            <Pill
              key={item}
              colors={colors}
              label={item}
              selected={sort === item}
              onPress={() => setSort(item)}
            />
          ))}
        </ScrollView>
        {nodeBaseUrl && feed.isError ? (
          <StatusBanner
            colors={colors}
            icon="cloud-offline-outline"
            title="Node is unavailable"
            body="No saved feed is available yet. Start the local node or check the configured address."
            tone="danger"
          />
        ) : null}
        {nodeBaseUrl ? (
          posts.length > 0 ? (
            posts.map((post, index) => (
              <PostCard
                key={post.contentId}
                colors={colors}
                onPress={onOpenPost}
                compact={index > 0}
                post={post}
              />
            ))
          ) : !feed.isLoading && !feed.isError ? (
            <EmptyState
              colors={colors}
              icon="documents-outline"
              title="No posts yet"
              body="This node is ready. Create the first signed post from the Create tab."
            />
          ) : null
        ) : (
          <>
            <PostCard colors={colors} onPress={onOpenPost} />
            <PostCard colors={colors} onPress={onOpenPost} compact />
          </>
        )}
      </ContentColumn>
    </Screen>
  );
}

export function PostDetailScreen({
  colors,
  reach,
  onBack,
  onAudit,
}: CommonProps & { readonly onBack: () => void; readonly onAudit: () => void }) {
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <ReachPill colors={colors} state={reach} compact />
        <IconButton colors={colors} icon="ellipsis-horizontal" label="Post actions" />
      </View>
      <ContentColumn>
        <PostCard colors={colors} onPress={onAudit} />
        <SectionHeader colors={colors} title="Top comments" action="Audit proof" onAction={onAudit} />
        {[
          ['u/code_crafter', 'Open collaboration accelerates innovation faster than any closed system.'],
          ['u/local_builder', 'The most useful systems keep working when the easiest path disappears.'],
        ].map(([author, body], index) => (
          <View
            key={author}
            style={[
              styles.comment,
              { borderLeftColor: index ? colors.border : colors.ember },
            ]}
          >
            <View style={styles.commentMeta}>
              <Text style={[typography.caption, { color: colors.text2 }]}>{author} · 1 hour</Text>
              <Seal colors={colors} state={index ? 'queued' : 'synced'} />
            </View>
            <Text style={[typography.body, { color: colors.text }]}>{body}</Text>
            <View style={styles.inlineActions}>
              <IconButton colors={colors} icon="return-up-back-outline" label="Reply" />
              <IconButton colors={colors} icon="arrow-up-outline" label="Upvote comment" />
              <Text style={[typography.caption, { color: colors.text2 }]}>{24 - index * 7}</Text>
            </View>
          </View>
        ))}
      </ContentColumn>
    </Screen>
  );
}

export function AuditScreen({
  colors,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly onBack: () => void;
}) {
  const rows = [
    ['Author signature', 'Verified', 'a9f3…e21c'],
    ['Node receipt', 'Verified', 'jbs1…4d82'],
    ['Merkle inclusion', 'Verified', 'leaf 284 · tree 12,442'],
    ['Consistency', 'Verified', 'previous head 12,318'],
    ['Stored on device', 'Available offline', '29 July 2026 · 05:41'],
  ] as const;
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          Publication proof
        </Text>
        <IconButton colors={colors} icon="share-outline" label="Export proof" />
      </View>
      <ContentColumn>
        <View style={styles.auditHero}>
          <View style={[styles.auditSeal, { backgroundColor: colors.verified }]}>
            <Ionicons name="shield-checkmark" size={32} color={colors.onAccent} />
          </View>
          <Text style={[typography.h1, { color: colors.text }]}>Verified independently</Text>
          <Text style={[typography.body, styles.center, { color: colors.text2 }]}>
            This device verified the author, node receipt, and transparency proof without trusting
            the rendered page.
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
        <View style={styles.pageActions}>
          <Button colors={colors} label="Export proof" icon="download-outline" />
        </View>
      </ContentColumn>
    </Screen>
  );
}

export function CommunitiesScreen({
  colors,
  reach,
  onOpenFeature,
}: CommonProps & { readonly onOpenFeature: (feature: FeatureDestination) => void }) {
  const communities = [
    ['technology', 'Open tools, federated systems, and resilient networks.', '12.4k', 'AR'],
    ['design', 'Interfaces that remain humane under pressure.', '8.1k', 'DS'],
    ['dhaka', 'Neighbourhood knowledge shared without gatekeepers.', '6.8k', 'ঢা'],
  ] as const;
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Communities" />
      <ContentColumn>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.text2} />
          <Text style={[typography.body, { color: colors.text2 }]}>Search communities</Text>
        </View>
        <SectionHeader
          colors={colors}
          title="Discover"
          action="Manage"
          onAction={() => onOpenFeature(featureDestinations[2]!)}
        />
        {communities.map(([name, body, members, mark]) => (
          <PressScale
            key={name}
            label={`Open r/${name}`}
            onPress={() => onOpenFeature(featureDestinations[2]!)}
          >
            <View style={[styles.communityRow, { borderBottomColor: colors.border }]}>
              <LinearGradient
                colors={[colors.ember, colors.constrained]}
                style={styles.communityAvatar}
              >
                <Text style={[typography.label, { color: colors.onAccent }]}>{mark}</Text>
              </LinearGradient>
              <View style={styles.flex}>
                <Text style={[typography.h2, { color: colors.text }]}>r/{name}</Text>
                <Text numberOfLines={2} style={[typography.body, { color: colors.text2 }]}>
                  {body}
                </Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>{members} members</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text2} />
            </View>
          </PressScale>
        ))}
      </ContentColumn>
    </Screen>
  );
}

export function ComposeScreen({ colors, reach }: CommonProps) {
  const [kind, setKind] = useState('Text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    readonly tone: 'verified' | 'danger';
    readonly title: string;
    readonly body: string;
  } | null>(null);

  const publish = async () => {
    if (!nodeBaseUrl) {
      setPublishResult({
        tone: 'danger',
        title: 'Node address is not configured',
        body: 'Set EXPO_PUBLIC_NODE_URL, restart Expo, then try again.',
      });
      return;
    }
    setPublishing(true);
    setPublishResult(null);
    try {
      const receipt = await publishForumPost(nodeBaseUrl, {
        title: title.trim(),
        bodyMarkdown: body.trim(),
      });
      setTitle('');
      setBody('');
      setPublishResult({
        tone: 'verified',
        title: 'Published with durable proof',
        body: `${receipt.contentId.slice(0, 18)}… · transparency leaf ${receipt.leafIndex}`,
      });
    } catch (error) {
      setPublishResult({
        tone: 'danger',
        title: 'Post was not published',
        body: (error as Error).message,
      });
    } finally {
      setPublishing(false);
    }
  };
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Create" />
      <ContentColumn>
        <View style={styles.compose}>
          <Text style={[typography.overline, { color: colors.text2 }]}>Community</Text>
          <View style={[styles.selector, { backgroundColor: colors.surface2 }]}>
            <Text style={[typography.label, { color: colors.text }]}>r/technology</Text>
            <Ionicons name="chevron-down" size={18} color={colors.text2} />
          </View>
          <ScrollView horizontal contentContainerStyle={styles.composeKinds}>
            {['Text', 'Link', 'Image', 'Video', 'Poll', 'Crosspost'].map((item) => (
              <Pill
                key={item}
                colors={colors}
                label={item}
                selected={kind === item}
                onPress={() => setKind(item)}
              />
            ))}
          </ScrollView>
          <Text style={[typography.label, { color: colors.text }]}>Title</Text>
          <TextInput
            accessibilityLabel="Post title"
            maxLength={300}
            onChangeText={setTitle}
            placeholder="What should people know?"
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              typography.bodyLarge,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            value={title}
          />
          <Text style={[typography.caption, { color: colors.text2, textAlign: 'right' }]}>
            {title.length}/300
          </Text>
          <Text style={[typography.label, { color: colors.text }]}>Body</Text>
          <TextInput
            accessibilityLabel="Post body"
            multiline
            onChangeText={setBody}
            placeholder="Write in Markdown…"
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              styles.textarea,
              typography.body,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            textAlignVertical="top"
            value={body}
          />
          <View style={styles.attachmentRow}>
            {['image-outline', 'attach-outline', 'happy-outline'].map((icon, index) => (
              <IconButton
                key={icon}
                colors={colors}
                icon={icon as 'image-outline'}
                label={['Add image', 'Add attachment', 'Add flair'][index]!}
              />
            ))}
            <View style={styles.flex} />
            <Text style={[typography.caption, { color: colors.text2 }]}>Markdown</Text>
          </View>
          <View style={styles.settingRow}>
            <View style={styles.flex}>
              <Text style={[typography.label, { color: colors.text }]}>Spoiler</Text>
              <Text style={[typography.caption, { color: colors.text2 }]}>
                Blur previews until opened
              </Text>
            </View>
            <Switch
              accessibilityLabel="Mark as spoiler"
              onValueChange={setSpoiler}
              trackColor={{ false: colors.surface2, true: colors.ember }}
              value={spoiler}
            />
          </View>
          {reach !== 'connected' ? (
            <StatusBanner
              colors={colors}
              icon="time-outline"
              title="Publishing is unavailable on this path"
              body="Your draft stays on this screen. Durable background outbox delivery arrives in P5."
              tone="warning"
            />
          ) : null}
          {publishResult ? (
            <StatusBanner
              colors={colors}
              icon={publishResult.tone === 'verified' ? 'shield-checkmark-outline' : 'alert-circle-outline'}
              title={publishResult.title}
              body={publishResult.body}
              tone={publishResult.tone}
            />
          ) : null}
          <Button
            colors={colors}
            disabled={!title.trim() || reach !== 'connected' || publishing}
            label={publishing ? 'Signing and publishing…' : 'Publish signed post'}
            icon="send-outline"
            onPress={() => void publish()}
          />
        </View>
      </ContentColumn>
    </Screen>
  );
}

export function InboxScreen({
  colors,
  reach,
  onOpenFeature,
}: CommonProps & { readonly onOpenFeature: (feature: FeatureDestination) => void }) {
  const conversations = [
    ['u/farah_ahmed', 'Hey! Can we sync later today?', '2 minutes'],
    ['r/technology', 'Your post received 128 upvotes', '15 minutes'],
    ['u/dev_explorer', 'sent you an encrypted message', '1 hour'],
  ] as const;
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Inbox" />
      <ContentColumn>
        <View style={styles.inboxTabs}>
          {['All', 'Messages', 'Mentions'].map((tab, index) => (
            <View key={tab} style={[styles.inboxTab, index === 0 ? { borderBottomColor: colors.signal } : null]}>
              <Text style={[typography.label, { color: index === 0 ? colors.signal : colors.text2 }]}>
                {tab}
              </Text>
            </View>
          ))}
        </View>
        <StatusBanner
          colors={colors}
          icon="lock-closed-outline"
          title="End-to-end encrypted"
          body="Message plaintext and your Forum keys never reach the node."
          tone="verified"
        />
        {conversations.map(([name, body, time]) => (
          <PressScale
            key={name}
            label={`Open conversation with ${name}`}
            onPress={() => onOpenFeature(featureDestinations[10]!)}
          >
            <View style={[styles.messageRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.messageAvatar, { backgroundColor: colors.signal }]}>
                <Ionicons name="lock-closed" size={17} color={colors.onAccent} />
              </View>
              <View style={styles.flex}>
                <Text style={[typography.label, { color: colors.text }]}>{name}</Text>
                <Text numberOfLines={1} style={[typography.body, { color: colors.text2 }]}>
                  {body}
                </Text>
              </View>
              <Text style={[typography.caption, { color: colors.text2 }]}>{time}</Text>
            </View>
          </PressScale>
        ))}
      </ContentColumn>
    </Screen>
  );
}

export function ProfileScreen({
  colors,
  reach,
  themeMode,
  onThemeChange,
  onOpenFeature,
}: CommonProps & {
  readonly themeMode: ThemeMode;
  readonly onThemeChange: () => void;
  readonly onOpenFeature: (feature: FeatureDestination) => void;
}) {
  const grouped = useMemo(
    () =>
      featureDestinations.reduce<Record<string, FeatureDestination[]>>((result, feature) => {
        (result[feature.area] ??= []).push(feature);
        return result;
      }, {}),
    [],
  );
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Profile" />
      <ContentColumn>
        <View style={styles.profileHero}>
          <LinearGradient colors={[colors.ember, colors.constrained]} style={styles.profileAvatar}>
            <Text style={[typography.h1, { color: colors.onAccent }]}>AR</Text>
          </LinearGradient>
          <Text style={[typography.h1, { color: colors.text }]}>Arif Rahman</Text>
          <Text style={[typography.mono, { color: colors.text2 }]}>jbk1a9f3…e21c</Text>
          <Text style={[typography.body, styles.center, { color: colors.text2 }]}>
            Community builder · Pseudonymous by design
          </Text>
          <Seal colors={colors} label="certificate verified" />
          <View style={styles.profileStats}>
            {[
              ['126', 'Posts'],
              ['2.3k', 'Karma'],
              ['12', 'Communities'],
            ].map(([value, label]) => (
              <View key={label} style={styles.profileStat}>
                <Text style={[typography.h2, { color: colors.text }]}>{value}</Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.profileActions}>
            <Button colors={colors} label="Edit profile" variant="secondary" />
            <IconButton
              colors={colors}
              icon={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
              label={`Use ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
              onPress={onThemeChange}
            />
          </View>
        </View>
        {Object.entries(grouped).map(([area, features]) => (
          <View key={area}>
            <SectionHeader colors={colors} title={area} />
            {features.map((feature) => (
              <PressScale
                key={feature.id}
                label={`Open ${feature.title}`}
                onPress={() => onOpenFeature(feature)}
              >
                <View style={[styles.featureRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.featureIcon, { backgroundColor: colors.surface2 }]}>
                    <Ionicons name={feature.icon} size={19} color={colors.ember} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{feature.title}</Text>
                    <Text numberOfLines={2} style={[typography.caption, { color: colors.text2 }]}>
                      {feature.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.text2} />
                </View>
              </PressScale>
            ))}
          </View>
        ))}
      </ContentColumn>
    </Screen>
  );
}

function IdentityPanel({ colors }: { readonly colors: AppPalette }) {
  const registrationUrl = nodeBaseUrl;
  const [passphrase, setPassphrase] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
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
      const result = await createForumIdentity(passphrase);
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
      {!summary?.configured ? (
        <>
          <Button
            colors={colors}
            disabled={busy || passphrase.length < 8}
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
            disabled={busy || passphrase.length < 8 || !importPhrase.trim()}
            label="Import recovery phrase"
            variant="secondary"
            onPress={() =>
              void execute(
                () => importForumIdentity(importPhrase, passphrase),
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
                    () => registerForumIdentity(registrationUrl),
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
        </>
      ) : (
        <Button
          colors={colors}
          disabled={busy || passphrase.length < 8}
          label={busy ? 'Unlocking…' : 'Unlock identity'}
          icon="lock-open-outline"
          onPress={() =>
            void execute(() => unlockForumIdentity(passphrase), 'Identity unlocked')
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
  onBack,
}: {
  readonly colors: AppPalette;
  readonly feature: FeatureDestination;
  readonly onBack: () => void;
}) {
  const signal = feature.id === 'messaging';
  const accent = signal ? colors.signal : colors.ember;
  const actions: Record<string, readonly string[]> = {
    identity: ['Show recovery phrase', 'Import identity', 'Rotate certificate', 'Prepare duress wipe'],
    profile: ['Edit profile', 'Feed preferences', 'Saved content', 'Blocked identities'],
    communities: ['Create community', 'Edit rules & theme', 'Members & bans', 'Community statistics'],
    roles: ['Default roles', 'Create custom role', 'Assignments', 'Permission translation'],
    posts: ['Post types', 'Comment settings', 'Attachments', 'Polls & crossposts'],
    search: ['Search all content', 'Filter by kind', 'Filter by community', 'Browse communities'],
    moderation: ['Review queue', 'Reports', 'Appeals', 'Public moderation log'],
    labels: ['Advisory preflight', 'Trusted labellers', 'Label reasons', 'Remove labeller trust'],
    awards: ['Award catalogue', 'Give anonymously', 'Award messages', 'Received awards'],
    notifications: ['Unread', 'Mentions', 'Moderation', 'Notification settings'],
    messaging: ['New encrypted message', 'Conversations', 'Blocked senders', 'Encryption details'],
    proofs: ['Receipts', 'Inclusion proofs', 'Consistency history', 'Export acknowledgements'],
    admin: ['Instance overview', 'Identities & roles', 'Security & IP blocks', 'Feature bindings'],
    operations: ['Transparency health', 'Ingress metrics', 'Projection recovery', 'Safe diagnostics'],
  };
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          {feature.title}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ContentColumn>
        <View style={styles.featureHero}>
          <View style={[styles.featureHeroIcon, { backgroundColor: accent }]}>
            <Ionicons name={feature.icon} size={28} color={colors.onAccent} />
          </View>
          <Text style={[typography.h1, { color: colors.text }]}>{feature.title}</Text>
          <Text style={[typography.body, styles.center, { color: colors.text2 }]}>
            {feature.description}
          </Text>
        </View>
        {feature.id === 'identity' ? <IdentityPanel colors={colors} /> : null}
        <View style={[styles.featurePanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {(actions[feature.id] ?? []).map((action, index, rows) => (
            <View key={action}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={[styles.actionNumber, { backgroundColor: colors.surface2 }]}>
                  <Text style={[typography.caption, { color: accent }]}>{index + 1}</Text>
                </View>
                <Text style={[typography.label, styles.flex, { color: colors.text }]}>{action}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.text2} />
              </Pressable>
              {index < rows.length - 1 ? <Divider colors={colors} /> : null}
            </View>
          ))}
        </View>
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
  onBack,
  onOpenPost,
}: {
  readonly colors: AppPalette;
  readonly onBack: () => void;
  readonly onOpenPost: () => void;
}) {
  const [query, setQuery] = useState('');
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
        <IconButton colors={colors} icon="options-outline" label="Search filters" />
      </View>
      <ContentColumn>
        <ScrollView horizontal contentContainerStyle={styles.pills}>
          {['All', 'Posts', 'Comments', 'Communities', 'People'].map((item, index) => (
            <Pill key={item} colors={colors} label={item} selected={index === 0} />
          ))}
        </ScrollView>
        {query ? (
          <PostCard colors={colors} onPress={onOpenPost} compact />
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
  postImage: { width: '100%', height: 210, borderRadius: radius.md, marginTop: spacing.xs },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineActions: { flexDirection: 'row', alignItems: 'center' },
  vote: {
    minHeight: 42,
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
  messageRow: {
    minHeight: 76,
    marginHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  messageAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  profileStats: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },
  profileStat: { alignItems: 'center', minWidth: 88 },
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
  featureHero: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  featureHeroIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featurePanel: { marginHorizontal: spacing.md, borderWidth: 1, borderRadius: radius.lg },
  actionRow: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: { flex: 1, minHeight: 48 },
});
