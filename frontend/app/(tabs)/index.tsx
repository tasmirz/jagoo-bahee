import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { FeedScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function FeedRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <FeedScreen
        colors={colors}
        homeNode={homeNode}
        onOpenNetwork={() => router.push('/network')}
        onOpenPost={(contentId) =>
          router.push({ pathname: '/post/[contentId]', params: { contentId } })
        }
        onSearch={() => router.push('/search')}
        reach={reach}
      />
    </AppScene>
  );
}
