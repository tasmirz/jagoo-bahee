import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { WelcomeFlow } from '../../src/features/onboarding';
import { AppScene } from '../../src/design-system';

export default function NewIdentityRoute() {
  const router = useRouter();
  const { colors, connectHomeNode, identityProfiles } = useApp();
  return (
    <AppScene colors={colors} edges={['top', 'left', 'right']}>
      <WelcomeFlow
        colors={colors}
        // Without this, restoring a phrase this device already holds writes a SECOND vault
        // for the same identity and leaves a duplicate row in the server list. The launch
        // flow has always passed it; the add-a-server route did not.
        identityProfiles={identityProfiles}
        onComplete={async (address, options) => {
          await connectHomeNode(address, options);
          router.dismissAll();
          router.replace('/(tabs)');
        }}
      />
    </AppScene>
  );
}
