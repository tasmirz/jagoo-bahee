import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
// Keep this native-only surface out of the general connectivity barrel so
// routes that never open mesh do not eagerly load react-native-webrtc.
import { MeshScreen } from '../src/features/connectivity/mesh-screen';
import { AppScene } from '../src/ui/scene';

export default function MeshRoute() {
  const router = useRouter();
  const { colors, reach } = useApp();
  return (
    <AppScene colors={colors}>
      <MeshScreen colors={colors} onBack={() => router.back()} reach={reach} />
    </AppScene>
  );
}
