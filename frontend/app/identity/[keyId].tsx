import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { PublicIdentityScreen } from '../../src/features/forum';
import { AppScene } from '../../src/design-system';

export default function PublicIdentityRoute() {
  const router = useRouter();
  const { keyId } = useLocalSearchParams<{ readonly keyId: string }>();
  const { colors, homeNode } = useApp();
  if (!homeNode || !keyId) return null;
  return (
    <AppScene colors={colors}>
      <PublicIdentityScreen
        colors={colors}
        homeNode={homeNode}
        keyId={keyId}
        onBack={() => router.back()}
      />
    </AppScene>
  );
}
