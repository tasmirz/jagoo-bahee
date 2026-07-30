import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { RnsSignalScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalMeshRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <RnsSignalScreen
        colors={colors}
        indexUrl={homeNode.baseUrl}
        mode={themeMode}
        onBack={() => router.back()}
        reach={reach}
      />
    </AppScene>
  );
}
