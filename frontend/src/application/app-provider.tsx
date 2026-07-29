import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../data';
import { useNodeReach } from '../data/node';
import {
  discoverHomeNode,
  forgetHomeNode,
  loadHomeNode,
  saveHomeNode,
  type HomeNode,
} from '../data/node-config';
import { loadDirectory, needsRefresh, refreshFrom } from '../data/peer-directory';
import {
  ReachScopeProvider,
  palettes,
  type AppPalette,
  type ReachState,
  type ThemeMode,
} from '../design-system';
// Imported by module rather than through the feature barrel: `features/connectivity/index.ts`
// re-exports `screens.tsx`, and pulling that into the application root would drag the whole
// connectivity surface into every launch.
import { scopeDisplay, ScopeSheet } from '../features/connectivity/scope-indicator';
import { useScopeStatus } from '../features/connectivity/use-scope';
import type { ScopeStatus } from '../features/connectivity/scope';
import { messages, type Locale } from '../i18n';
import { drainOutboxOnce } from '../offline/outbox';
import { refreshMeshCertificates } from '../offline/certificate-cache';

const THEME_KEY = 'jb.theme-preference.v1';
const LOCALE_KEY = 'jb.locale.v1';

export type ThemePreference = ThemeMode | 'system';

export interface AppContextValue {
  readonly colors: AppPalette;
  readonly connectHomeNode: (address: string) => Promise<void>;
  readonly disconnectHomeNode: () => Promise<void>;
  readonly homeNode: HomeNode | null | undefined;
  readonly locale: Locale;
  readonly reach: ReachState;
  readonly refreshHomeNode: () => Promise<void>;
  /** TP-20 — the scope this device is currently on. Null until the node has answered once. */
  readonly scope: ScopeStatus | null;
  readonly setLocale: (value: Locale) => Promise<void>;
  readonly setThemePreference: (value: ThemePreference) => Promise<void>;
  readonly themeMode: ThemeMode;
  readonly themePreference: ThemePreference;
}

/**
 * The device's language, with no new dependency.
 *
 * Bangla is a first-class language here, not a translation layer bolted on at the end
 * (`CLAUDE.md` §6) — and until now the entire `bn` catalogue was unreachable, because the
 * only way to select it was passing a `locale` prop by hand and nothing did. Hermes ships
 * `Intl` on both platforms in RN 0.76; if it is ever absent the app falls back to English
 * rather than throwing during startup.
 */
function deviceLocale(): Locale {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    return tag.toLowerCase().startsWith('bn') ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

const AppContext = createContext<AppContextValue | null>(null);

function AppStateProvider({ children }: PropsWithChildren) {
  const systemMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [homeNode, setHomeNode] = useState<HomeNode | null | undefined>(undefined);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [inspecting, setInspecting] = useState(false);
  const { reach } = useNodeReach(homeNode?.baseUrl ?? null);
  const { status: scope, fromCache: scopeFromCache } = useScopeStatus(homeNode?.baseUrl ?? null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadHomeNode(),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(LOCALE_KEY),
    ])
      .then(([node, storedTheme, storedLocale]) => {
        if (!active) return;
        setHomeNode(node);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setThemePreferenceState(storedTheme);
        }
        if (storedLocale && storedLocale in messages) setLocaleState(storedLocale as Locale);
      })
      .catch(() => {
        if (active) setHomeNode(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!homeNode) return;
    const refresh = () => void refreshMeshCertificates(homeNode.baseUrl).catch(() => undefined);
    refresh();
    const interval = setInterval(refresh, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [homeNode]);

  /**
   * TP-05 / TP-06 — pre-position the peer directory.
   *
   * "Peer records MUST be cached continuously during normal operation. When the gateway
   * drops, the ISP-local addresses must already be known." So this runs while everything
   * works, precisely so that nothing has to run when nothing works. Hourly, plus once on
   * every reconnect, and every failure is swallowed: a refresh that cannot reach the node is
   * the ordinary case during an outage and must never surface as an error to the person.
   */
  useEffect(() => {
    if (!homeNode) return;
    let active = true;
    const refresh = (force = false) => {
      void (async () => {
        try {
          const snapshot = await loadDirectory();
          if (!active || (!force && !needsRefresh(snapshot, Date.now()))) return;
          await refreshFrom(homeNode.baseUrl, snapshot, Date.now());
        } catch {
          // Nothing to report: the cache we already hold is the answer.
        }
      })();
    };
    refresh(true);
    const interval = setInterval(() => refresh(), 60 * 60 * 1000);
    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) refresh();
    });
    return () => {
      active = false;
      clearInterval(interval);
      network();
    };
  }, [homeNode]);

  useEffect(() => {
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainOutboxOnce();
    });
    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void drainOutboxOnce();
    });
    void drainOutboxOnce();
    return () => {
      foreground.remove();
      network();
    };
  }, []);

  const connectHomeNode = useCallback(async (address: string) => {
    const discovered = await discoverHomeNode(address);
    await saveHomeNode(discovered);
    queryClient.clear();
    setHomeNode(discovered);
  }, []);

  const disconnectHomeNode = useCallback(async () => {
    await forgetHomeNode();
    queryClient.clear();
    setHomeNode(null);
  }, []);

  const refreshHomeNode = useCallback(async () => {
    if (!homeNode) return;
    const discovered = await discoverHomeNode(homeNode.baseUrl);
    await saveHomeNode(discovered);
    queryClient.invalidateQueries();
    setHomeNode(discovered);
  }, [homeNode]);

  const setThemePreference = useCallback(async (value: ThemePreference) => {
    setThemePreferenceState(value);
    await AsyncStorage.setItem(THEME_KEY, value);
  }, []);

  const setLocale = useCallback(async (value: Locale) => {
    setLocaleState(value);
    await AsyncStorage.setItem(LOCALE_KEY, value);
  }, []);

  const themeMode = themePreference === 'system' ? systemMode : themePreference;
  const colors = palettes[themeMode];
  const value = useMemo<AppContextValue>(
    () => ({
      colors,
      connectHomeNode,
      disconnectHomeNode,
      homeNode,
      locale,
      reach,
      refreshHomeNode,
      scope,
      setLocale,
      setThemePreference,
      themeMode,
      themePreference,
    }),
    [
      colors,
      connectHomeNode,
      disconnectHomeNode,
      homeNode,
      locale,
      reach,
      refreshHomeNode,
      scope,
      setLocale,
      setThemePreference,
      themeMode,
      themePreference,
    ],
  );

  // TP-20 — the scope reaches every `ReachPill` in the app from here, so "always visible,
  // never buried in settings" holds without any screen having to opt in.
  const reachScope = useMemo(
    () => ({ display: scopeDisplay(scope, locale), onInspect: () => setInspecting(true) }),
    [scope, locale],
  );

  return (
    <AppContext.Provider value={value}>
      <ReachScopeProvider value={reachScope}>
        {children}
        {inspecting ? (
          <ScopeSheet
            colors={colors}
            status={scope}
            fromCache={scopeFromCache}
            locale={locale}
            onClose={() => setInspecting(false)}
          />
        ) : null}
      </ReachScopeProvider>
    </AppContext.Provider>
  );
}

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppStateProvider>{children}</AppStateProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
