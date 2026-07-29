import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import type { FeatureDestination } from '../src/features/catalog';
import {
  AuditScreen,
  CommunitiesScreen,
  ComposeScreen,
  FeatureScreen,
  FeedScreen,
  InboxScreen,
  PostDetailScreen,
  ProfileScreen,
  SearchScreen,
} from '../src/screens/main';
import { palettes, type ThemeMode } from '../src/theme';
import { BottomNavigation } from '../src/ui/primitives';
import { queryClient } from '../src/data';
import { useNodeReach } from '../src/data/node';

type Tab = 'home' | 'communities' | 'create' | 'inbox' | 'profile';
type Overlay =
  | { readonly kind: 'post' }
  | { readonly kind: 'audit' }
  | { readonly kind: 'search' }
  | { readonly kind: 'feature'; readonly feature: FeatureDestination }
  | null;

function HomeShell() {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const { reach } = useNodeReach();
  const colors = palettes[themeMode];

  const back = () => setOverlay(null);
  const openFeature = (feature: FeatureDestination) => setOverlay({ kind: 'feature', feature });
  let content;
  if (overlay?.kind === 'post') {
    content = (
      <PostDetailScreen
        colors={colors}
        onAudit={() => setOverlay({ kind: 'audit' })}
        onBack={back}
        reach={reach}
      />
    );
  } else if (overlay?.kind === 'audit') {
    content = <AuditScreen colors={colors} onBack={() => setOverlay({ kind: 'post' })} />;
  } else if (overlay?.kind === 'search') {
    content = (
      <SearchScreen
        colors={colors}
        onBack={back}
        onOpenPost={() => setOverlay({ kind: 'post' })}
      />
    );
  } else if (overlay?.kind === 'feature') {
    content = <FeatureScreen colors={colors} feature={overlay.feature} onBack={back} />;
  } else if (tab === 'communities') {
    content = (
      <CommunitiesScreen colors={colors} onOpenFeature={openFeature} reach={reach} />
    );
  } else if (tab === 'create') {
    content = <ComposeScreen colors={colors} reach={reach} />;
  } else if (tab === 'inbox') {
    content = <InboxScreen colors={colors} onOpenFeature={openFeature} reach={reach} />;
  } else if (tab === 'profile') {
    content = (
      <ProfileScreen
        colors={colors}
        onOpenFeature={openFeature}
        onThemeChange={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
        reach={reach}
        themeMode={themeMode}
      />
    );
  } else {
    content = (
      <FeedScreen
        colors={colors}
        onOpenPost={() => setOverlay({ kind: 'post' })}
        onSearch={() => setOverlay({ kind: 'search' })}
        reach={reach}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar
        backgroundColor={colors.bg}
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={styles.app}>{content}</View>
      {!overlay ? (
        <BottomNavigation
          active={tab}
          colors={colors}
          onChange={(next) => setTab(next as Tab)}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomeShell />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  app: { flex: 1 },
});
