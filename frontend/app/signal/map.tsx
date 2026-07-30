import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalMapScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalMapRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalMapScreen
        colors={colors}
        mode={themeMode}
        homeNode={homeNode}
        onBack={() => router.back()}
        onNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
