import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { FeedScreen } from '../../src/features/feed/feed-screen';

export default function FeedRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <FeedScreen
      colors={colors}
      mode={themeMode}
      homeNode={homeNode}
      reach={reach}
      onOpenNetwork={() => router.push('/network')}
      onOpenSearch={() => router.push('/search')}
      onOpenNotifications={() => router.push('/notifications' as never)}
      onOpenInbox={() => router.push('/inbox' as never)}
      onOpenPost={(contentId) => router.push({ pathname: '/post/[contentId]', params: { contentId } })}
      onOpenCommunity={(communityId) =>
        router.push({ pathname: '/community/[communityId]', params: { communityId } })
      }
      onOpenAuthor={(keyId) => router.push(`/identity/${keyId}` as never)}
    />
  );
}
