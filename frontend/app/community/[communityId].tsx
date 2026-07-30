import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { CommunityScreen } from '../../src/features/communities/community-screen';

export default function CommunityRoute() {
  const router = useRouter();
  const { communityId } = useLocalSearchParams<{ readonly communityId: string }>();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode || !communityId) return null;
  return (
    <CommunityScreen
      colors={colors}
      mode={themeMode}
      reach={reach}
      homeNode={homeNode}
      communityId={communityId}
      onBack={() => router.back()}
      onOpenNetwork={() => router.push('/network')}
      onOpenPost={(contentId) => router.push({ pathname: '/post/[contentId]', params: { contentId } })}
      onOpenAuthor={(keyId) => router.push(`/identity/${keyId}` as never)}
      onOpenAudit={(contentId) =>
        router.push({ pathname: '/audit/[contentId]', params: { contentId } })
      }
      onOpenManagement={() => router.push(`/community/${communityId}/manage` as never)}
      onCreatePost={() => router.push(`/composer?community=${communityId}` as never)}
    />
  );
}
