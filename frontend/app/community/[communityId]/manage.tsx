import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../src/application/app-provider';
import { CommunityManagementScreen } from '../../../src/features/communities';
import { AppScene } from '../../../src/design-system';

export default function CommunityManagementRoute() {
  const router = useRouter();
  const { communityId, section } = useLocalSearchParams<{
    readonly communityId: string;
    readonly section?: 'queue' | 'actions' | 'roles' | 'settings';
  }>();
  const { colors, homeNode } = useApp();
  if (!homeNode || !communityId) return null;
  return (
    <AppScene colors={colors}>
      <CommunityManagementScreen
        colors={colors}
        communityId={communityId}
        homeNode={homeNode}
        initialSection={section}
        onBack={() => router.back()}
      />
    </AppScene>
  );
}
