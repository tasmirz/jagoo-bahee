import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { CommunityDetailScreen } from '../../src/features/communities';
import { AppScene } from '../../src/ui/scene';

export default function CommunityRoute() {
  const router = useRouter();
  const { communityId } = useLocalSearchParams<{ readonly communityId: string }>();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode || !communityId) return null;
  return (
    <AppScene colors={colors}>
      <CommunityDetailScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        communityId={communityId}
        onBack={() => router.back()}
        onOpenNetwork={() => router.push('/network')}
        onOpenPost={(contentId) =>
          router.push({ pathname: '/post/[contentId]', params: { contentId } })
        }
        reach={reach}
      />
    </AppScene>
  );
}
