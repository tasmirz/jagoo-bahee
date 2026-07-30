import { useEffect, useState } from 'react';
import { resolveServices, type HomeNode } from '../data/node-config';
import { loadServiceOverrides, type ServiceOverrides } from '../data/service-overrides';

/**
 * Every auxiliary service address, resolved the way the device will actually dial it.
 *
 * Two screens report these and they disagreed: Network & services resolved through
 * `resolveServices`, while the Operations workspace read `discovery.services.*` raw. A
 * user who had corrected an unreachable address in the first still saw "Not advertised"
 * in the second, which reads as the override having failed to save.
 *
 * Overrides load asynchronously, so the first paint shows discovery's answer and swaps to
 * the user's the moment it arrives. Blocking on AsyncStorage would make the most
 * diagnostic pages in the app the slowest ones to appear.
 */
export function useResolvedServices(homeNode: HomeNode): {
  readonly overrides: ServiceOverrides;
  readonly services: ReturnType<typeof resolveServices>;
  readonly setOverrides: (value: ServiceOverrides) => void;
} {
  const [overrides, setOverrides] = useState<ServiceOverrides>({});
  useEffect(() => {
    let live = true;
    void loadServiceOverrides().then((stored) => {
      if (live) setOverrides(stored);
    });
    return () => {
      live = false;
    };
  }, []);
  return { overrides, services: resolveServices(homeNode, overrides), setOverrides };
}
