import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalChannelsScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalChannelsRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalChannelsScreen
        colors={colors}
        mode={themeMode}
        homeNode={homeNode}
        onChannel={(channel) =>
          router.push({ pathname: '/signal/channel/[channelId]', params: { channelId: channel } })
        }
        onBack={() => router.back()}
        onNetwork={() => router.push('/network')}
        onStudio={() => router.push('/signal/studio')}
        reach={reach}
      />
    </AppScene>
  );
}
