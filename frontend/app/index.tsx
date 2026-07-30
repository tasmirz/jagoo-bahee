import { Redirect } from 'expo-router';
import { WelcomeFlow } from '../src/features/onboarding';
import { useApp } from '../src/application/app-provider';
import { AppLoading, AppScene } from '../src/ui/scene';

export default function BootstrapRoute() {
  const { colors, connectHomeNode, homeNode } = useApp();
  if (homeNode === undefined) return <AppLoading colors={colors} />;
  if (homeNode) return <Redirect href="/(tabs)" />;
  return (
    <AppScene colors={colors}>
      <WelcomeFlow colors={colors} onComplete={connectHomeNode} />
    </AppScene>
  );
}
