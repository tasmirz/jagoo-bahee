import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { NetworkScreen } from '../src/features/connectivity';
import { AppScene } from '../src/ui/scene';

export default function NetworkRoute() {
  const router = useRouter();
  const { colors, disconnectHomeNode, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <NetworkScreen
        colors={colors}
        homeNode={homeNode}
        onBack={() => router.back()}
        onMesh={() => router.push('/mesh')}
        onChangeServer={() =>
          void disconnectHomeNode().then(() => {
            router.dismissAll();
            router.replace('/');
          })
        }
        reach={reach}
      />
    </AppScene>
  );
}
