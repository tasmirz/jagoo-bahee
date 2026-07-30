import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { SavedScreen } from '../src/features/profile/saved-screen';

export default function SavedRoute() {
  const router = useRouter();
  const { colors, homeNode, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <SavedScreen
      colors={colors}
      mode={themeMode}
      homeNode={homeNode}
      onBack={() => router.back()}
      onOpenPost={(contentId) => router.push({ pathname: '/post/[contentId]', params: { contentId } })}
      onOpenAudit={(contentId) => router.push({ pathname: '/audit/[contentId]', params: { contentId } })}
    />
  );
}
