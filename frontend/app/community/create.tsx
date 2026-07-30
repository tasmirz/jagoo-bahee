import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { CommunityCreateScreen } from '../../src/features/communities';
import { AppScene } from '../../src/design-system';

export default function CommunityCreateRoute() {
  const router = useRouter();
  const { colors, homeNode } = useApp();
  if (!homeNode) return null;
  return <AppScene colors={colors}><CommunityCreateScreen colors={colors} homeNode={homeNode} onBack={() => router.back()} onCreated={(communityId) => router.replace({ pathname: '/community/[communityId]', params: { communityId } })} /></AppScene>;
}
