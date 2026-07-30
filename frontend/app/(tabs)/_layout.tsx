import { Redirect, Tabs } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { BottomNavigation } from '../../src/ui/primitives';
import { AppLoading } from '../../src/ui/scene';

const routeFor = (name: string): string => (name === 'index' ? 'home' : name);
const nameFor = (id: string): string => (id === 'home' ? 'index' : id);

export default function TabLayout() {
  const { colors, homeNode } = useApp();
  if (homeNode === undefined) return <AppLoading colors={colors} />;
  if (!homeNode) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={({ state, navigation }) => (
        <BottomNavigation
          active={routeFor(state.routes[state.index]?.name ?? 'index')}
          colors={colors}
          onChange={(id) => navigation.navigate(nameFor(id))}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="communities" options={{ title: 'Communities' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="signal" options={{ title: 'Signal' }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
