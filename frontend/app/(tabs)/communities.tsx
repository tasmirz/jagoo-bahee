import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { CommunitiesScreen } from '../../src/features/communities/communities-screen';

export default function CommunitiesRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <CommunitiesScreen
      colors={colors}
      mode={themeMode}
      reach={reach}
      homeNode={homeNode}
      onOpenCommunity={(communityId) =>
        router.push({ pathname: '/community/[communityId]', params: { communityId } })
      }
      onOpenCreate={() => router.push('/community/create')}
      onOpenNetwork={() => router.push('/network')}
    />
  );
}
