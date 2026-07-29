import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { CommunitiesScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function CommunitiesRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <CommunitiesScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        onOpenCommunity={(communityId) =>
          router.push({ pathname: '/community/[communityId]', params: { communityId } })
        }
        onOpenFeature={(feature) =>
          router.push({ pathname: '/feature/[featureId]', params: { featureId: feature.id } })
        }
        onOpenNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
