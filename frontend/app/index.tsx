import { SessionBootstrap } from '../src/application/session-gate';

/**
 * The three states a launch can be in, all of them decided by `useSessionGate` — which the
 * tab layout renders too, so a locked or signed-out vault can never end up behind the tabs
 * whatever the navigator did with the last `replace`.
 *
 * A configured home node used to be the whole gate, which is why a signed-out or locked
 * device still landed straight on the tabs with a locked vault behind them: the feed drew,
 * and every signed action failed.
 */
export default function BootstrapRoute() {
  return <SessionBootstrap />;
}
