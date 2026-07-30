import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { AuditScreen } from '../../src/features/forum';
import { AppScene } from '../../src/design-system';

export default function AuditRoute() {
  const router = useRouter();
  const { contentId } = useLocalSearchParams<{ readonly contentId: string }>();
  const { colors, homeNode } = useApp();
  if (!homeNode || !contentId) return null;
  return (
    <AppScene colors={colors}>
      <AuditScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        contentId={contentId}
        onBack={() => router.back()}
      />
    </AppScene>
  );
}
