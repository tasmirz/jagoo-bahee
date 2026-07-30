/**
 * The one place that decides whether a screen may render at all.
 *
 * ── Why this is a hook and not a redirect ──────────────────────────────────────────
 * Signing out used to be three imperative steps in `(tabs)/profile.tsx`: lock the vault,
 * `router.dismissAll()`, `router.replace('/')`. The first step is the only one that is
 * reliable. `dismissAll()` dispatches `POP_TO_TOP` at the root, and from inside `(tabs)` —
 * the root stack's first route — no navigator can handle it, so React Native logs
 * "The action 'POP_TO_TOP' was not handled by any navigator" and the person watching a
 * red error box concludes, correctly, that signing out did not work. Whether the
 * `replace('/')` that follows lands on the bootstrap route or back on the tab feed then
 * depends on how `/` resolves against `app/(tabs)/index.tsx`, which is not a thing a
 * security boundary may depend on.
 *
 * So the gate is declarative and rendered by BOTH the bootstrap route and the tab layout.
 * A locked or signed-out vault cannot be behind the tabs no matter what the navigator did,
 * and signing out needs no navigation at all — it changes `session`, and the tabs stop
 * rendering on the next paint.
 *
 * Returns `null` when the session is usable, meaning "carry on and render your screen".
 */

import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { AppLoading, AppScene } from '../design-system';
import { SignInScreen, WelcomeFlow } from '../features/onboarding';
import { useApp } from './app-provider';

export function useSessionGate(): ReactNode | null {
  const {
    colors,
    connectHomeNode,
    disconnectHomeNode,
    homeNode,
    identityProfiles,
    refreshSession,
    session,
  } = useApp();

  // `session === null` means the launch restore has not answered yet — not signed out.
  if (homeNode === undefined || session === null) return <AppLoading colors={colors} />;

  if (homeNode && session.configured && !session.unlocked) {
    const active = identityProfiles.find(
      (profile) => profile.homeNode.baseUrl === homeNode.baseUrl,
    );
    return (
      <AppScene colors={colors} edges={['top', 'left', 'right']}>
        <SignInScreen
          colors={colors}
          homeNode={homeNode}
          {...(session.identityId ?? active?.identityId
            ? { identityId: session.identityId ?? active?.identityId }
            : {})}
          onSignedIn={refreshSession}
          onChangeServer={() => void disconnectHomeNode()}
        />
      </AppScene>
    );
  }

  if (!homeNode) {
    return (
      <AppScene colors={colors} edges={['top', 'left', 'right']}>
        <WelcomeFlow
          colors={colors}
          identityProfiles={identityProfiles}
          onComplete={connectHomeNode}
        />
      </AppScene>
    );
  }

  return null;
}

/**
 * The bootstrap route's whole body: the gate, or a hand-off to the tabs.
 *
 * Kept beside the gate so the two can never disagree about what "signed in" means.
 */
export function SessionBootstrap(): ReactNode {
  const gate = useSessionGate();
  return gate ?? <Redirect href="/(tabs)" />;
}
