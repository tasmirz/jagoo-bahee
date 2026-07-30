import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { PostDetailScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function PostRoute() {
  const router = useRouter();
  const { contentId } = useLocalSearchParams<{ readonly contentId: string }>();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode || !contentId) return null;
  return (
    <AppScene colors={colors}>
      <PostDetailScreen
        colors={colors}
        contentId={contentId}
        homeNode={homeNode}
        onAudit={() => router.push({ pathname: '/audit/[contentId]', params: { contentId } })}
        onEdit={() => router.push(`/post/${contentId}/edit` as never)}
        onOpenIdentity={(keyId) => router.push(`/identity/${keyId}` as never)}
        onBack={() => router.back()}
        onOpenNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
