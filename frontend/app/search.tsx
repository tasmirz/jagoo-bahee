import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { SearchScreen } from '../src/features/forum';
import { AppScene } from '../src/ui/scene';

export default function SearchRoute() {
  const router = useRouter();
  const { colors, homeNode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SearchScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        onBack={() => router.back()}
        onOpenPost={(contentId) =>
          router.push({ pathname: '/post/[contentId]', params: { contentId } })
        }
      />
    </AppScene>
  );
}
