import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { ProofVaultScreen } from '../src/features/connectivity';
import { AppScene } from '../src/design-system';

export default function ProofsRoute() {
  const router = useRouter();
  const { colors, homeNode, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <ProofVaultScreen colors={colors} mode={themeMode} homeNode={homeNode} onBack={() => router.back()} />
    </AppScene>
  );
}
