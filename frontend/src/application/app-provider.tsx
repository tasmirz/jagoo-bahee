import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useColorScheme } from 'react-native';
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
import { palettes, type AppPalette, type ReachState, type ThemeMode } from '../design-system';

const THEME_KEY = 'jb.theme-preference.v1';

export type ThemePreference = ThemeMode | 'system';

export interface AppContextValue {
  readonly colors: AppPalette;
  readonly connectHomeNode: (address: string) => Promise<void>;
  readonly disconnectHomeNode: () => Promise<void>;
  readonly homeNode: HomeNode | null | undefined;
  readonly reach: ReachState;
  readonly refreshHomeNode: () => Promise<void>;
  readonly setThemePreference: (value: ThemePreference) => Promise<void>;
  readonly themeMode: ThemeMode;
  readonly themePreference: ThemePreference;
}

const AppContext = createContext<AppContextValue | null>(null);

function AppStateProvider({ children }: PropsWithChildren) {
  const systemMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [homeNode, setHomeNode] = useState<HomeNode | null | undefined>(undefined);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const { reach } = useNodeReach(homeNode?.baseUrl ?? null);

  useEffect(() => {
    let active = true;
    void Promise.all([loadHomeNode(), AsyncStorage.getItem(THEME_KEY)])
      .then(([node, storedTheme]) => {
        if (!active) return;
        setHomeNode(node);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setThemePreferenceState(storedTheme);
        }
      })
      .catch(() => {
        if (active) setHomeNode(null);
      });
    return () => {
      active = false;
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

  const themeMode = themePreference === 'system' ? systemMode : themePreference;
  const value = useMemo<AppContextValue>(
    () => ({
      colors: palettes[themeMode],
      connectHomeNode,
      disconnectHomeNode,
      homeNode,
      reach,
      refreshHomeNode,
      setThemePreference,
      themeMode,
      themePreference,
    }),
    [
      connectHomeNode,
      disconnectHomeNode,
      homeNode,
      reach,
      refreshHomeNode,
      setThemePreference,
      themeMode,
      themePreference,
    ],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
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
