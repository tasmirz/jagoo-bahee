import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import {
  Divider,
  EmptyState,
  ErrorState,
  Page,
  PageHeader,
  Skeleton,
  maxFontScale,
  spacing,
  type as typography,
  type AppPalette,
  type ThemeMode,
} from '../../design-system';
import { OfflineApi } from '../../data';
import { useNodeDocument, type NodePage } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { PostCard } from '../posts/post-card';

interface SavedRow {
  readonly id: string;
  readonly target: string;
  readonly targetKind: number;
  readonly updatedAtMs: number;
}

/**
 * F5 — a real Saved screen, backed by `GET /v1/me/saved`. Each saved row only carries the
 * target content ID, so posts are hydrated individually via `useQueries` (there is no bulk
 * fetch route for arbitrary content IDs); comments render as a lighter row since there is no
 * canonical comment card yet.
 */
export function SavedScreen({
  colors,
  mode,
  homeNode,
  onBack,
  onOpenPost,
  onOpenAudit,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
  readonly onOpenPost: (contentId: string) => void;
  readonly onOpenAudit: (contentId: string) => void;
}) {
  const saved = useNodeDocument<NodePage<SavedRow>>(homeNode.baseUrl, '/v1/me/saved');
  const rows = saved.data?.value.items ?? [];
  const postRows = rows.filter((row) => row.targetKind === 1);
  const commentRows = rows.filter((row) => row.targetKind === 2);

  const postQueries = useQueries({
    queries: postRows.map((row) => ({
      queryKey: ['node', homeNode.baseUrl, 'post', row.target],
      queryFn: () =>
        new OfflineApi(`${homeNode.baseUrl.replace(/\/+$/, '')}/`).get(`/v1/posts/${encodeURIComponent(row.target)}`),
    })),
  });
  const commentQueries = useQueries({
    queries: commentRows.map((row) => ({
      queryKey: ['node', homeNode.baseUrl, 'comment', row.target],
      queryFn: () =>
        new OfflineApi(`${homeNode.baseUrl.replace(/\/+$/, '')}/`).get(`/v1/comments/${encodeURIComponent(row.target)}`),
    })),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader colors={colors} mode={mode} title="Saved" onBack={onBack} />
      <Page colors={colors}>
        {saved.isError ? (
          <ErrorState colors={colors} title="Saved items unavailable" body="Reconnect and try again." onRetry={() => void saved.refetch()} />
        ) : rows.length === 0 && !saved.isLoading ? (
          <EmptyState colors={colors} icon="bookmark-outline" title="Nothing saved yet" body="Save a post or comment to find it here later." />
        ) : (
          <View style={styles.stack}>
            {postQueries.map((query, index) => {
              const row = postRows[index]!;
              if (query.isLoading) return <Skeleton key={row.id} colors={colors} height={120} />;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const post = (query.data as any)?.value;
              if (!post) return null;
              return (
                <PostCard
                  key={row.id}
                  colors={colors}
                  homeNode={homeNode}
                  post={post}
                  onPress={() => onOpenPost(row.target)}
                  onOpenProof={() => onOpenAudit(row.target)}
                />
              );
            })}
            {commentRows.length > 0 ? (
              <View style={styles.commentSection}>
                <Text maxFontSizeMultiplier={maxFontScale.overline} style={[typography.overline, { color: colors.text2 }]}>
                  Saved comments
                </Text>
                {commentRows.map((row, index) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const comment = (commentQueries[index]?.data as any)?.value;
                  return (
                    <View key={row.id}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={!comment?.post}
                        onPress={() => comment?.post && onOpenPost(comment.post)}
                        style={styles.commentRow}
                      >
                        <Text numberOfLines={2} maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text }]}>
                          {comment?.bodyMarkdown ?? 'Loading…'}
                        </Text>
                      </Pressable>
                      <Divider colors={colors} />
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  // Gutter-free by contract — `Page` owns the screen's inline inset.
  stack: { gap: spacing.sm },
  commentSection: { paddingTop: spacing.md, gap: spacing.xs },
  commentRow: { minHeight: 44, justifyContent: 'center' },
});
