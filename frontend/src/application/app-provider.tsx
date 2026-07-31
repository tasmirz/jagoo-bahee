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
import {
  loadActiveProfileId,
  loadIdentityProfiles,
  removeIdentityProfile,
  saveIdentityProfile,
  setActiveProfileId,
  type IdentityProfile,
} from '../data/identity-profiles';
import { useNodeReach } from '../data/node';
import {
  discoverHomeNode,
  forgetHomeNode,
  loadHomeNode,
  saveHomeNode,
  type HomeNode,
} from '../data/node-config';
import {
  configureClientTransport,
  type ClientTransport,
} from '../data/request';
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
import { clearOutboxNode, drainOutboxOnce } from '../offline/outbox';
import { refreshMeshCertificates } from '../offline/certificate-cache';
import { configureAuditIssueReporting } from '../audit';
import {
  LEGACY_FORUM_VAULT_ID,
  configureAntiAbuseServices,
  deleteForumIdentityVault,
  forumSessionSummary,
  restoreForumSession,
  selectForumIdentityVault,
  signOutForumIdentity,
  type ForumSessionSummary,
} from '../signer';
/*
  ADR-012 keeps the two vaults independent, and this import does not weaken that: it reopens
  the Signal vault on the same triggers as the Forum one and reads nothing from it. Nothing
  here records the two identities together, and neither plane's key material crosses.
*/
import { restoreSignalSession } from '../signer/signal';

const THEME_KEY = 'jb.theme-preference.v1';
const LOCALE_KEY = 'jb.locale.v1';

export type ThemePreference = ThemeMode | 'system';

export interface AppContextValue {
  readonly activeProfileId: string | null;
  readonly colors: AppPalette;
  readonly connectHomeNode: (
    address: string,
    options?: {
      readonly transport?: ClientTransport;
      readonly vaultId?: string;
      readonly identityId?: string;
      readonly label?: string;
    },
  ) => Promise<void>;
  readonly disconnectHomeNode: () => Promise<void>;
  /**
   * Remove a saved server and its identity from this device.
   *
   * `removeIdentityProfile` has existed since profiles did and was reachable from nothing,
   * so the only way to change server was `disconnectHomeNode` — which wipes the active
   * node and drops you back into onboarding whether or not that is what you wanted.
   *
   * Destroying the key vault is a SEPARATE decision from forgetting the server, because
   * they are not the same loss: forgetting an address is reversible by typing it again,
   * and destroying a vault is only reversible with the 24-word phrase.
   */
  readonly forgetIdentityProfile: (
    vaultId: string,
    options?: { readonly destroyVault?: boolean },
  ) => Promise<void>;
  readonly homeNode: HomeNode | null | undefined;
  readonly identityProfiles: readonly IdentityProfile[];
  readonly locale: Locale;
  readonly reach: ReachState;
  readonly refreshHomeNode: () => Promise<void>;
  /**
   * The Forum key vault's state on this device. `null` only while the launch restore is still
   * running, so a route can tell "not signed in" apart from "not known yet" and stop
   * flashing onboarding at someone who is already signed in.
   */
  readonly session: ForumSessionSummary | null;
  /** Re-read the vault state after a screen changes it (unlock, register, revoke). */
  readonly refreshSession: () => Promise<void>;
  /** Locks the vault and remembers the choice. Keeps the identity and the home node. */
  readonly signOut: () => Promise<void>;
  /** TP-20 — the scope this device is currently on. Null until the node has answered once. */
  readonly scope: ScopeStatus | null;
  readonly setLocale: (value: Locale) => Promise<void>;
  readonly setThemePreference: (value: ThemePreference) => Promise<void>;
  readonly switchIdentity: (vaultId: string) => Promise<void>;
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
  const [identityProfiles, setIdentityProfiles] = useState<readonly IdentityProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [session, setSession] = useState<ForumSessionSummary | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const { reach } = useNodeReach(homeNode?.baseUrl ?? null);
  const { status: scope, fromCache: scopeFromCache } = useScopeStatus(homeNode?.baseUrl ?? null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadHomeNode(),
      loadIdentityProfiles(),
      loadActiveProfileId(),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(LOCALE_KEY),
    ])
      .then(async ([storedNode, storedProfiles, storedActiveId, storedTheme, storedLocale]) => {
        if (!active) return;
        let profiles = storedProfiles;
        let selected = profiles.find((profile) => profile.vaultId === storedActiveId) ?? profiles[0];
        if (!selected && storedNode) {
          selected = {
            vaultId: LEGACY_FORUM_VAULT_ID,
            label: storedNode.discovery.node.displayName,
            homeNode: storedNode,
            createdAtMs: storedNode.savedAtMs,
            lastUsedAtMs: Date.now(),
          };
          profiles = [selected];
          await saveIdentityProfile(selected);
          await setActiveProfileId(selected.vaultId);
        }
        const node = selected?.homeNode ?? storedNode;
        if (selected) {
          selectForumIdentityVault(selected.vaultId);
          setActiveProfileIdState(selected.vaultId);
        }
        if (node) configureClientTransport(node.transport);
        setIdentityProfiles(profiles);
        setHomeNode(node);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setThemePreferenceState(storedTheme);
        }
        if (storedLocale && storedLocale in messages) setLocaleState(storedLocale as Locale);
        // The one call that makes a session survive a cold start: the vault is on disk, but
        // the signer and its access token are module state and start every launch empty.
        const restored = await restoreForumSession(
          node?.baseUrl ?? null,
          node?.discovery.services.auditLogs ?? [],
        );
        if (active) setSession(restored);
        // Signal has its own vault and its own module state, and it had no restore at all —
        // so after any process death every Signal action threw "Unlock your Signal identity
        // first" until someone found the identity screen. Awaited separately and never
        // allowed to fail the Forum restore: the two planes stay independent (ADR-012).
        void restoreSignalSession(
          node?.baseUrl ?? null,
          node?.discovery.services.auditLogs ?? [],
        ).catch(() => undefined);
      })
      .catch(async () => {
        if (!active) return;
        setHomeNode(null);
        setSession(await forumSessionSummary());
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!homeNode) return;
    configureAuditIssueReporting(homeNode.discovery.services.auditLogs, homeNode.transport);
    configureAntiAbuseServices(homeNode.discovery.services.mcaptcha);
  }, [homeNode]);

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

  const connectHomeNode = useCallback(async (
    address: string,
    options: {
      readonly transport?: ClientTransport;
      readonly vaultId?: string;
      readonly identityId?: string;
      readonly label?: string;
    } = {},
  ) => {
    const discovered = await discoverHomeNode(address, options.transport);
    const vaultId = options.vaultId ?? activeProfileId ?? LEGACY_FORUM_VAULT_ID;
    const existing = identityProfiles.find((profile) => profile.vaultId === vaultId);
    const now = Date.now();
    const profile: IdentityProfile = {
      vaultId,
      ...(options.identityId || existing?.identityId
        ? { identityId: options.identityId ?? existing?.identityId }
        : {}),
      label: options.label?.trim() || existing?.label || discovered.discovery.node.displayName,
      homeNode: discovered,
      createdAtMs: existing?.createdAtMs ?? now,
      lastUsedAtMs: now,
    };
    await saveIdentityProfile(profile);
    await setActiveProfileId(vaultId);
    await saveHomeNode(discovered);
    selectForumIdentityVault(vaultId);
    configureClientTransport(discovered.transport);
    queryClient.clear();
    setIdentityProfiles(await loadIdentityProfiles());
    setActiveProfileIdState(vaultId);
    setHomeNode(discovered);
    setSession(await forumSessionSummary());
  }, [activeProfileId, identityProfiles]);

  const disconnectHomeNode = useCallback(async () => {
    await forgetHomeNode();
    queryClient.clear();
    setHomeNode(null);
    setSession(await forumSessionSummary());
  }, []);

  /**
   * Forget a saved server, and optionally destroy the key vault behind it.
   *
   * Deleting the ACTIVE row has to land somewhere sensible: the next remaining profile if
   * there is one, and onboarding only when nothing is left. Falling back to onboarding
   * whenever the active row went away would make removing one of three servers look like
   * being signed out of all of them.
   */
  const forgetIdentityProfile = useCallback(
    async (vaultId: string, options: { readonly destroyVault?: boolean } = {}) => {
      const profile = identityProfiles.find((item) => item.vaultId === vaultId);
      if (!profile) return;
      const wasActive = activeProfileId === vaultId;
      await clearOutboxNode(profile.homeNode.baseUrl);
      if (options.destroyVault) await deleteForumIdentityVault(vaultId);
      await removeIdentityProfile(vaultId);
      const remaining = await loadIdentityProfiles();
      setIdentityProfiles(remaining);
      if (!wasActive) return;

      const next = remaining[0];
      if (!next) {
        await forgetHomeNode();
        queryClient.clear();
        setActiveProfileIdState(null);
        setHomeNode(null);
        setSession(await forumSessionSummary());
        return;
      }
      await setActiveProfileId(next.vaultId);
      await saveHomeNode(next.homeNode);
      selectForumIdentityVault(next.vaultId);
      configureClientTransport(next.homeNode.transport);
      queryClient.clear();
      setActiveProfileIdState(next.vaultId);
      setHomeNode(next.homeNode);
      setSession(
        await restoreForumSession(
          next.homeNode.baseUrl,
          next.homeNode.discovery.services.auditLogs,
        ),
      );
    },
    [activeProfileId, identityProfiles],
  );

  const switchIdentity = useCallback(async (vaultId: string) => {
    const profile = identityProfiles.find((item) => item.vaultId === vaultId);
    if (!profile) throw new Error('That identity is no longer stored on this device.');
    await setActiveProfileId(vaultId);
    await saveHomeNode(profile.homeNode);
    selectForumIdentityVault(vaultId);
    configureClientTransport(profile.homeNode.transport);
    queryClient.clear();
    setIdentityProfiles(await loadIdentityProfiles());
    setActiveProfileIdState(vaultId);
    setHomeNode(profile.homeNode);
    setSession(
      await restoreForumSession(profile.homeNode.baseUrl, profile.homeNode.discovery.services.auditLogs),
    );
  }, [identityProfiles]);

  const refreshSession = useCallback(async () => {
    setSession(await forumSessionSummary());
  }, []);

  /**
   * Re-attempt sign-in whenever the vault is open but the token is not.
   *
   * The launch restore gets ONE attempt, and on a phone it usually runs before the radio has
   * settled — so `signInForumIdentity` fails, `authenticated` stays false, and nothing ever
   * tried again. The visible symptom was not an error: authenticated reads simply degrade to
   * their anonymous shape, so a community the person owns renders a "Join" button and an
   * image upload throws "Register and authenticate this Forum identity first". Neither says
   * the word "signed out", which is why this read as three unrelated bugs.
   *
   * Runs on every foreground and whenever connectivity returns, because those are exactly the
   * moments the earlier failure might now succeed. Cheap and idempotent: it returns
   * immediately once a token exists.
   */
  useEffect(() => {
    if (!homeNode) return;
    let active = true;

    const attempt = async () => {
      // The Signal plane gets the same second chance, for the same reason and on the same
      // triggers. It is idempotent and returns immediately once its token exists.
      void restoreSignalSession(
        homeNode.baseUrl,
        homeNode.discovery.services.auditLogs,
      ).catch(() => undefined);

      const current = await forumSessionSummary();
      if (!current.unlocked || current.authenticated || current.signedOut) return;
      try {
        await restoreForumSession(homeNode.baseUrl, homeNode.discovery.services.auditLogs);
      } catch {
        // Still unreachable. The vault stays open and reads come from cache.
      }
      if (!active) return;
      const next = await forumSessionSummary();
      setSession(next);
      // The viewer changed, so the anonymous entries cached before this are now stale. Their
      // keys already carry the viewer, but existing screens hold the old key's data.
      if (next.authenticated) await queryClient.invalidateQueries();
    };

    void attempt();
    const onForeground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt();
    });
    const onNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) void attempt();
    });
    return () => {
      active = false;
      onForeground.remove();
      onNetwork();
    };
  }, [homeNode]);

  const signOut = useCallback(async () => {
    await signOutForumIdentity();
    queryClient.clear();
    setSession(await forumSessionSummary());
  }, []);

  const refreshHomeNode = useCallback(async () => {
    if (!homeNode) return;
    const discovered = await discoverHomeNode(homeNode.baseUrl, homeNode.transport);
    await saveHomeNode(discovered);
    if (activeProfileId) {
      const existing = identityProfiles.find((profile) => profile.vaultId === activeProfileId);
      if (existing) {
        await saveIdentityProfile({ ...existing, homeNode: discovered, lastUsedAtMs: Date.now() });
        setIdentityProfiles(await loadIdentityProfiles());
      }
    }
    queryClient.invalidateQueries();
    setHomeNode(discovered);
  }, [activeProfileId, homeNode, identityProfiles]);

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
      activeProfileId,
      colors,
      connectHomeNode,
      disconnectHomeNode,
      forgetIdentityProfile,
      homeNode,
      identityProfiles,
      locale,
      reach,
      refreshHomeNode,
      refreshSession,
      session,
      signOut,
      scope,
      setLocale,
      setThemePreference,
      switchIdentity,
      themeMode,
      themePreference,
    }),
    [
      colors,
      activeProfileId,
      connectHomeNode,
      disconnectHomeNode,
      forgetIdentityProfile,
      homeNode,
      identityProfiles,
      locale,
      reach,
      refreshHomeNode,
      refreshSession,
      session,
      signOut,
      scope,
      setLocale,
      setThemePreference,
      switchIdentity,
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
