import { Redirect } from 'expo-router';
import { HomeServerSetupScreen } from '../src/features/connectivity';
import { useApp } from '../src/application/app-provider';
import { AppLoading, AppScene } from '../src/ui/scene';

export default function BootstrapRoute() {
  const { colors, connectHomeNode, homeNode } = useApp();
  if (homeNode === undefined) return <AppLoading colors={colors} />;
  if (homeNode) return <Redirect href="/(tabs)" />;
  return (
    <AppScene colors={colors}>
      <HomeServerSetupScreen colors={colors} onConnect={connectHomeNode} />
    </AppScene>
  );
}
