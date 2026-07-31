import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

/** A device advertising `_jagoo._tcp` on this network segment. */
export interface LanPeer {
  /** The mDNS service name. Human-chosen, broadcast in the clear, never an identity. */
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly port: number;
}

export interface LanFrameEvent {
  readonly from: string;
  /** One `MeshFrame`, still encoded. This module never parses it. */
  readonly payload: string;
}

export interface JagooLanNativeModule {
  start(displayName: string): Promise<{ readonly port: number; readonly name: string }>;
  stop(): Promise<void>;
  peers(): Promise<readonly LanPeer[]>;
  send(host: string, port: number, payload: string): Promise<boolean>;
  addListener(
    event: 'onPeers',
    listener: (payload: { readonly peers: readonly LanPeer[] }) => void,
  ): EventSubscription;
  addListener(event: 'onFrame', listener: (payload: LanFrameEvent) => void): EventSubscription;
}

function loadNativeModule(): JagooLanNativeModule | null {
  try {
    return requireOptionalNativeModule<JagooLanNativeModule>('JagooLan');
  } catch {
    return null;
  }
}

export default loadNativeModule();
