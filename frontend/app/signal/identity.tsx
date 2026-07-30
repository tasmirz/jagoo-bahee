import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalIdentityScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalIdentityRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalIdentityScreen
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
