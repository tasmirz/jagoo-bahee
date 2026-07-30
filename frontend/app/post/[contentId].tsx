import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { PostDetailScreen } from '../../src/features/posts/post-detail-screen';

export default function PostRoute() {
  const router = useRouter();
  const { contentId } = useLocalSearchParams<{ readonly contentId: string }>();
  const { colors, homeNode, themeMode } = useApp();
  if (!homeNode || !contentId) return null;
  return (
    <PostDetailScreen
      colors={colors}
      mode={themeMode}
      contentId={contentId}
      homeNode={homeNode}
      onAudit={() => router.push({ pathname: '/audit/[contentId]', params: { contentId } })}
      onEdit={() => router.push(`/post/${contentId}/edit` as never)}
      onOpenCommunity={(communityId) =>
        router.push({ pathname: '/community/[communityId]', params: { communityId } })
      }
      onOpenAuthor={(keyId) => router.push(`/identity/${keyId}` as never)}
      onBack={() => router.back()}
    />
  );
}
