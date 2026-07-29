import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { CommunityCreateScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function CommunityCreateRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <CommunityCreateScreen
        colors={colors}
        homeNode={homeNode}
        onOpenNetwork={() => router.push('/network')}
        onCreated={() => router.back()}
        reach={reach}
      />
    </AppScene>
  );
}
