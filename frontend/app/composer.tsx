import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { ComposerScreen } from '../src/features/composer/composer-screen';

export default function ComposerRoute() {
  const router = useRouter();
  const { community } = useLocalSearchParams<{ community?: string }>();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <ComposerScreen
      colors={colors}
      mode={themeMode}
      homeNode={homeNode}
      reach={reach}
      initialCommunityId={community}
      onCancel={() => router.back()}
      onPublished={(contentId) => {
        router.dismissAll();
        router.replace({ pathname: '/post/[contentId]', params: { contentId } });
      }}
    />
  );
}
