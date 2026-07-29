import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalStudioScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalStudioRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalStudioScreen
        colors={colors}
        homeNode={homeNode}
        onNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
