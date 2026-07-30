import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalHomeScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

/** Signal is a primary destination, not an item hidden behind the Forum inbox. */
export default function SignalTabRoute() {
  const router = useRouter();
  const { colors, homeNode, reach } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalHomeScreen
        colors={colors}
        homeNode={homeNode}
        onChannel={(channel) =>
          router.push({ pathname: '/signal/channel/[channelId]', params: { channelId: channel } })
        }
        onChannels={() => router.push('/signal/channels')}
        onCheckIn={() => router.push('/signal/crisis')}
        onIdentity={() => router.push('/signal/identity')}
        onMap={() => router.push('/signal/map')}
        onMessages={() => router.push('/signal/messages')}
        onNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
