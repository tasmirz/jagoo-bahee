import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { NotificationsScreen } from '../src/features/notifications/notifications-screen';

export default function NotificationsRoute() {
  const router = useRouter();
  const { colors, homeNode, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <NotificationsScreen
      colors={colors}
      mode={themeMode}
      homeNode={homeNode}
      onBack={() => router.back()}
      onOpenContent={(contentId) => router.push({ pathname: '/post/[contentId]', params: { contentId } })}
    />
  );
}
