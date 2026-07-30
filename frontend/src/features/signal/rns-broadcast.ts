import { loadSignalSubscriptions, subscriptionAllows, type FilterableBroadcast } from './storage';

export interface RnsBroadcast extends FilterableBroadcast {
  readonly id: string;
  readonly headline: string;
  readonly detail: string;
}

/**
 * The relay may carry a public mesh broadcast, but this is the sole admission point into
 * the device's Signal inbox. Non-followers neither store it nor raise an alert.
 */
export async function admitRnsBroadcast(broadcast: RnsBroadcast, nowMs = Date.now()): Promise<boolean> {
  return subscriptionAllows(broadcast, await loadSignalSubscriptions(), nowMs);
}
