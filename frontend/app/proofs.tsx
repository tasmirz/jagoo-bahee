import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { ProofVaultScreen } from '../src/features/connectivity';
import { AppScene } from '../src/design-system';

export default function ProofsRoute() {
  const router = useRouter();
  const { colors, homeNode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <ProofVaultScreen colors={colors} homeNode={homeNode} onBack={() => router.back()} />
    </AppScene>
  );
}
