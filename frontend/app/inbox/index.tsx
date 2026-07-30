import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { InboxScreen } from '../../src/features/forum';
import { AppScene } from '../../src/design-system';

export default function InboxRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <InboxScreen
        colors={colors}
        mode={themeMode}
        homeNode={homeNode}
        onBack={() => router.back()}
        onOpenNetwork={() => router.push('/network')}
        onOpenSignal={() => router.push('/signal')}
        reach={reach}
      />
    </AppScene>
  );
}
