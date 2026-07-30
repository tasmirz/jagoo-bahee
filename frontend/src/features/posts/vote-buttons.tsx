import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconButton, maxFontScale, radius, spacing, type as typography, type AppPalette } from '../../design-system';
import type { HomeNode } from '../../data/node-config';
import { publishForumVote } from '../../signer';

export type VoteTargetKind = 'post' | 'comment';

/**
 * The canonical vote control for posts AND comments (Category I of the SRS: "a single reusable
 * component drives voting on both"). Fixes root cause #6: the previous `VoteControl` defaulted
 * `score` to a hardcoded `128`, held vote state in a `useState` that reset on every remount, and
 * rendered `score + vote` — double-counting once the server score already included the vote.
 *
 * "Fetches the current user's existing vote on mount" (SRS Category I) — `myVote` seeds local
 * state once; after that this component owns optimistic state until the next full remount,
 * exactly like Reddit's own vote control.
 */
export function VoteButtons({
  colors,
  homeNode,
  communityId,
  target,
  targetKind,
  score,
  myVote,
  vertical = false,
  onRequireJoin,
  onError,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly communityId: string;
  readonly target: string;
  readonly targetKind: VoteTargetKind;
  readonly score: number;
  readonly myVote?: -1 | 0 | 1;
  readonly vertical?: boolean;
  /** Called instead of voting when the backend would 403 for a non-member (fixes a silent failure). */
  readonly onRequireJoin?: () => void;
  readonly onError?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [vote, setVote] = useState<-1 | 0 | 1>(myVote ?? 0);
  const baseScore = useRef(score - (myVote ?? 0)).current;

  const mutation = useMutation({
    mutationFn: (value: -1 | 0 | 1) =>
      publishForumVote(
        homeNode.baseUrl,
        { communityId, target, targetKind, value },
        homeNode.discovery.services.auditLogs,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['node', homeNode.baseUrl, 'feed-pages'] });
      void queryClient.invalidateQueries({ queryKey: ['node', homeNode.baseUrl, 'feed'] });
      void queryClient.invalidateQueries({ queryKey: ['node', homeNode.baseUrl, 'post', target] });
    },
  });

  const cast = (next: -1 | 0 | 1) => {
    const previous = vote;
    setVote(next);
    mutation.mutate(next, {
      onError: (error) => {
        setVote(previous);
        const message = error instanceof Error ? error.message : 'That vote was not accepted.';
        if (message.toLowerCase().includes('member') && onRequireJoin) {
          onRequireJoin();
        } else {
          onError?.(message);
        }
      },
    });
  };

  const displayScore = baseScore + vote;

  return (
    <View
      accessibilityLabel={`Score ${displayScore}`}
      style={[
        styles.vote,
        vertical ? styles.vertical : styles.horizontal,
        { backgroundColor: colors.surface2 },
      ]}
    >
      <IconButton
        colors={colors}
        icon={vote === 1 ? 'arrow-up-circle' : 'arrow-up-outline'}
        label="Upvote"
        active={vote === 1}
        disabled={mutation.isPending}
        onPress={() => cast(vote === 1 ? 0 : 1)}
      />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontScale.label}
        style={[typography.label, { color: vote ? colors.ember : colors.text, minWidth: 24, textAlign: 'center' }]}
      >
        {displayScore}
      </Text>
      <IconButton
        colors={colors}
        icon={vote === -1 ? 'arrow-down-circle' : 'arrow-down-outline'}
        label="Downvote"
        active={vote === -1}
        disabled={mutation.isPending}
        onPress={() => cast(vote === -1 ? 0 : -1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  vote: { borderRadius: radius.pill, alignItems: 'center' },
  horizontal: { flexDirection: 'row' },
  vertical: { flexDirection: 'column', paddingVertical: spacing.xxs },
});
