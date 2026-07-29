import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
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
import { HomeServerSetupScreen, NetworkScreen, ProofVaultScreen } from '../src/screens/connection';
import { palettes, type ThemeMode } from '../src/theme';
import { BottomNavigation } from '../src/ui/primitives';
import { queryClient } from '../src/data';
import { useNodeReach } from '../src/data/node';
import {
  discoverHomeNode,
  forgetHomeNode,
  loadHomeNode,
  saveHomeNode,
  type HomeNode,
} from '../src/data/node-config';

type Tab = 'home' | 'communities' | 'create' | 'inbox' | 'profile';
type Overlay =
  | { readonly kind: 'post'; readonly contentId: string }
  | { readonly kind: 'audit'; readonly contentId: string }
  | { readonly kind: 'search' }
  | { readonly kind: 'network' }
  | { readonly kind: 'proofs' }
  | { readonly kind: 'feature'; readonly feature: FeatureDestination }
  | null;

function HomeShell() {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [homeNode, setHomeNode] = useState<HomeNode | null | undefined>(undefined);
  const { reach } = useNodeReach(homeNode?.baseUrl ?? null);
  const colors = palettes[themeMode];
  useEffect(() => {
    void loadHomeNode()
      .then(setHomeNode)
      .catch(() => setHomeNode(null));
  }, []);

  const connect = async (address: string) => {
    const discovered = await discoverHomeNode(address);
    await saveHomeNode(discovered);
    queryClient.clear();
    setHomeNode(discovered);
  };

  const changeServer = async () => {
    await forgetHomeNode();
    queryClient.clear();
    setOverlay(null);
    setHomeNode(null);
  };

  if (homeNode === undefined) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <ActivityIndicator
          accessibilityLabel="Loading saved home server"
          color={colors.ember}
          size="large"
          style={styles.loading}
        />
      </SafeAreaView>
    );
  }

  if (homeNode === null) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <StatusBar backgroundColor={colors.ember} barStyle="light-content" />
        <HomeServerSetupScreen colors={colors} onConnect={connect} />
      </SafeAreaView>
    );
  }

  const back = () => setOverlay(null);
  const openFeature = (feature: FeatureDestination) => setOverlay({ kind: 'feature', feature });
  const openNetwork = () => setOverlay({ kind: 'network' });
  let content;
  if (overlay?.kind === 'post') {
    content = (
      <PostDetailScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        contentId={overlay.contentId}
        onAudit={() => setOverlay({ kind: 'audit', contentId: overlay.contentId })}
        onBack={back}
        onOpenNetwork={openNetwork}
        reach={reach}
      />
    );
  } else if (overlay?.kind === 'audit') {
    content = (
      <AuditScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        contentId={overlay.contentId}
        onBack={() => setOverlay({ kind: 'post', contentId: overlay.contentId })}
      />
    );
  } else if (overlay?.kind === 'search') {
    content = (
      <SearchScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        onBack={back}
        onOpenPost={(contentId) => setOverlay({ kind: 'post', contentId })}
      />
    );
  } else if (overlay?.kind === 'network') {
    content = (
      <NetworkScreen
        colors={colors}
        homeNode={homeNode}
        onBack={back}
        onChangeServer={() => void changeServer()}
        reach={reach}
      />
    );
  } else if (overlay?.kind === 'proofs') {
    content = <ProofVaultScreen colors={colors} homeNode={homeNode} onBack={back} />;
  } else if (overlay?.kind === 'feature') {
    content = (
      <FeatureScreen colors={colors} feature={overlay.feature} homeNode={homeNode} onBack={back} />
    );
  } else if (tab === 'communities') {
    content = (
      <CommunitiesScreen
        baseUrl={homeNode.baseUrl}
        colors={colors}
        onOpenFeature={openFeature}
        onOpenNetwork={openNetwork}
        reach={reach}
      />
    );
  } else if (tab === 'create') {
    content = (
      <ComposeScreen
        colors={colors}
        homeNode={homeNode}
        onOpenNetwork={openNetwork}
        reach={reach}
      />
    );
  } else if (tab === 'inbox') {
    content = (
      <InboxScreen
        colors={colors}
        onOpenFeature={openFeature}
        onOpenNetwork={openNetwork}
        reach={reach}
      />
    );
  } else if (tab === 'profile') {
    content = (
      <ProfileScreen
        colors={colors}
        onOpenFeature={(feature) =>
          feature.id === 'proofs' ? setOverlay({ kind: 'proofs' }) : openFeature(feature)
        }
        onOpenNetwork={openNetwork}
        onThemeChange={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
        reach={reach}
        themeMode={themeMode}
      />
    );
  } else {
    content = (
      <FeedScreen
        colors={colors}
        baseUrl={homeNode.baseUrl}
        onOpenNetwork={openNetwork}
        onOpenPost={(contentId) => setOverlay({ kind: 'post', contentId })}
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
        <BottomNavigation active={tab} colors={colors} onChange={(next) => setTab(next as Tab)} />
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
  loading: { flex: 1 },
});
