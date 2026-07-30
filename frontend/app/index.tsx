import { Redirect } from 'expo-router';
import { SignInScreen, WelcomeFlow } from '../src/features/onboarding';
import { useApp } from '../src/application/app-provider';
import { AppLoading, AppScene } from '../src/design-system';

/**
 * The three states a launch can be in, in the order they are tested.
 *
 * A configured home node used to be the whole gate, which is why a signed-out or locked
 * device still landed straight on the tabs with a locked vault behind them: the feed drew,
 * and every signed action failed. The vault's own state decides now, and `session === null`
 * means the launch restore has not answered yet — not that the person is signed out.
 */
export default function BootstrapRoute() {
  const {
    colors,
    connectHomeNode,
    disconnectHomeNode,
    homeNode,
    identityProfiles,
    refreshSession,
    session,
  } = useApp();

  if (homeNode === undefined || session === null) return <AppLoading colors={colors} />;
  if (homeNode && session.configured && !session.unlocked) {
    const active = identityProfiles.find((profile) => profile.homeNode.baseUrl === homeNode.baseUrl);
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
  if (homeNode) return <Redirect href="/(tabs)" />;
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
