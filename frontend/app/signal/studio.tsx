import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { SignalStudioScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

export default function SignalStudioRoute() {
  const router = useRouter();
  const { colors, homeNode, reach, themeMode } = useApp();
  // "Publish" on a channel row names the channel, so the studio opens on it rather than
  // asking again for something the previous screen already knew.
  const { channel } = useLocalSearchParams<{ channel?: string }>();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <SignalStudioScreen
        colors={colors}
        mode={themeMode}
        homeNode={homeNode}
        {...(channel ? { initialChannel: channel } : {})}
        onBack={() => router.back()}
        onNetwork={() => router.push('/network')}
        reach={reach}
      />
    </AppScene>
  );
}
