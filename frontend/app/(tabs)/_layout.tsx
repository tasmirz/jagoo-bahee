import { Redirect, Tabs, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { AppLoading, BottomNavigation, TABS } from '../../src/design-system';
import { TabBarInsetProvider } from '../../src/design-system/layout';
import { useUnreadCount } from '../../src/features/notifications/use-unread-count';

// `TABS` (design-system/components.tsx) is the single source of truth for the tab list —
// this file no longer redeclares it (root cause #10). Route names map 1:1 to tab ids except
// the "home" tab, whose file is `index.tsx` per Expo Router convention.
const routeFor = (name: string): string => (name === 'index' ? 'home' : name);
const nameFor = (id: string): string => (id === 'home' ? 'index' : id);

export default function TabLayout() {
  const { colors, homeNode, themeMode } = useApp();
  const unreadCount = useUnreadCount(homeNode?.baseUrl ?? null);
  const router = useRouter();
  if (homeNode === undefined) return <AppLoading colors={colors} />;
  return (
    <TabBarInsetProvider>
      <Tabs
        screenOptions={{ headerShown: false, lazy: true }}
        tabBar={({ state, navigation }) => (
          <BottomNavigation
            active={routeFor(state.routes[state.index]?.name ?? 'index')}
            colors={colors}
            mode={themeMode}
            unreadCount={unreadCount}
            onChange={(id) => {
              // The Create tab is a modal composer, not a persistent tab screen (F3) — Reddit's
              // own bottom bar behaves the same way, and it is what keeps the "no post button"
              // complaint from recurring: it opens from every tab, not only from Home.
              if (id === 'create') router.push('/composer' as never);
              else navigation.navigate(nameFor(id));
            }}
          />
        )}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.id} name={nameFor(tab.id)} options={{ title: tab.label }} />
        ))}
      </Tabs>
    </TabBarInsetProvider>
  );
}
