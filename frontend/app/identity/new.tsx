import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { WelcomeFlow } from '../../src/features/onboarding';
import { AppScene } from '../../src/design-system';

export default function NewIdentityRoute() {
  const router = useRouter();
  const { colors, connectHomeNode } = useApp();
  return (
    <AppScene colors={colors}>
      <WelcomeFlow
        colors={colors}
        onComplete={async (address, options) => {
          await connectHomeNode(address, options);
          router.dismissAll();
          router.replace('/(tabs)');
        }}
      />
    </AppScene>
  );
}
