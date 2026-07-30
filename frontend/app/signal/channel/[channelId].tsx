import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../src/application/app-provider';
import { SignalChannelScreen } from '../../../src/features/signal';
import { AppScene } from '../../../src/design-system';

export default function SignalChannelRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId?: string }>();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode || !params.channelId) return null;
  return (
    <AppScene colors={colors}>
      <SignalChannelScreen
        channelId={params.channelId}
        colors={colors}
        mode={themeMode}
        homeNode={homeNode}
        onBack={() => router.back()}
        onNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
