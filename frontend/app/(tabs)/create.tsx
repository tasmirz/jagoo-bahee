import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { ComposeScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function CreateRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <ComposeScreen
        colors={colors}
        homeNode={homeNode}
        onOpenNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
