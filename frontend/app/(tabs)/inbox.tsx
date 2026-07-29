import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { InboxScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function InboxRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <InboxScreen
        colors={colors}
        homeNode={homeNode}
        onOpenNetwork={() => router.push('/network')}
        onOpenSignal={() => router.push('/signal')}
        reach={reach}
      />
    </AppScene>
  );
}
