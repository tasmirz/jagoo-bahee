import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalMapScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalMapRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalMapScreen
        colors={colors}
        homeNode={homeNode}
        onNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
