import { requireOptionalNativeModule } from 'expo';

export type RnsInterfaceKind = 'tcp' | 'auto' | 'rnode_ble' | 'rnode_usb';

export interface RnsInterfaceConfig {
  readonly kind: RnsInterfaceKind;
  readonly host?: string;
  readonly port?: number;
  readonly device?: string;
  readonly enabled?: boolean;
}

/**
 * Everything but the key. The identity is passed as its own argument to `start` because a
 * `Uint8Array` only survives the bridge when the native signature names `ByteArray` — inside
 * an untyped config map it arrives as something the module cannot read, which is what made
 * `start` reject its own caller with "identityPrivateKey is required".
 */
export interface RnsBootstrapConfig {
  readonly storagePath: string;
  readonly interfaces: readonly RnsInterfaceConfig[];
  readonly propagationDestination?: string | null;
}

export interface RnsStatus {
  readonly state: 'stopped' | 'starting' | 'running' | 'failed';
  readonly destinationHash: string | null;
  readonly interfaces: readonly { readonly kind: RnsInterfaceKind; readonly state: string; readonly detail?: string }[];
  readonly error: string | null;
}

export interface LxmfMessage {
  readonly destinationHash: string;
  readonly content: string;
  readonly fields?: Readonly<Record<string, string>>;
  readonly title?: string;
}

export interface JagooRnsNativeModule {
  /** `identityPrivateKey` is X25519 ‖ Ed25519 seed, 64 bytes. Zeroed natively after use. */
  start(config: RnsBootstrapConfig, identityPrivateKey: Uint8Array): Promise<RnsStatus>;
  stop(): Promise<void>;
  status(): Promise<RnsStatus>;
  sendLxmf(message: LxmfMessage): Promise<{ readonly id: string; readonly state: string }>;
  drainLxmf(): Promise<readonly { readonly id: string; readonly sourceHash: string; readonly content: string; readonly title: string }[]>;
  announce(): Promise<void>;
}

function loadNativeModule(): JagooRnsNativeModule | null {
  try {
    return requireOptionalNativeModule<JagooRnsNativeModule>('JagooRns');
  } catch {
    return null;
  }
}

export default loadNativeModule();
