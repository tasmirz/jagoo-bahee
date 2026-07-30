import * as FileSystem from 'expo-file-system';
import RnsNative, {
  type LxmfMessage,
  type RnsBootstrapConfig,
  type RnsInterfaceConfig,
  type RnsStatus,
} from '../../../modules/jagoo-rns';
import { signalRnsTransportIdentity } from '../../signer/signal';

const unavailable: RnsStatus = {
  state: 'stopped',
  destinationHash: null,
  interfaces: [],
  error: null,
};

export interface SignalRnsBootstrap {
  readonly tcpEndpoints: readonly string[];
  readonly lxmfPropagationDestination: string | null;
}

export function parseRnsTcpEndpoints(endpoints: readonly string[]): readonly RnsInterfaceConfig[] {
  return endpoints.flatMap((endpoint) => {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'tcp:' || !url.hostname || !url.port) return [];
      const port = Number(url.port);
      return Number.isInteger(port) && port > 0 && port <= 65535
        ? [{ kind: 'tcp', host: url.hostname, port, enabled: true }]
        : [];
    } catch {
      return [];
    }
  });
}

export async function fetchSignalRnsBootstrap(baseUrl: string): Promise<SignalRnsBootstrap> {
  const response = await fetch(new URL('/v1/signal/rns-bootstrap', baseUrl).toString());
  if (!response.ok) throw new Error(`Signal bootstrap failed with HTTP ${response.status}`);
  const body = (await response.json()) as SignalRnsBootstrap;
  return {
    tcpEndpoints: Array.isArray(body.tcpEndpoints) ? body.tcpEndpoints : [],
    lxmfPropagationDestination: body.lxmfPropagationDestination ?? null,
  };
}

/** Starts only the Signal transport. It never reads the Forum node, signer, or outbox. */
export async function startSignalRns(
  baseUrl: string,
  options: { readonly includeAutoInterface: boolean; readonly rnode?: RnsInterfaceConfig } = {
    includeAutoInterface: true,
  },
): Promise<RnsStatus> {
  if (!RnsNative) {
    return { ...unavailable, error: 'RNS is available in the Android development build only.' };
  }
  const [bootstrap, identity] = await Promise.all([
    fetchSignalRnsBootstrap(baseUrl),
    signalRnsTransportIdentity(),
  ]);
  try {
    const interfaces: RnsInterfaceConfig[] = [
      ...parseRnsTcpEndpoints(bootstrap.tcpEndpoints),
      ...(options.includeAutoInterface ? [{ kind: 'auto', enabled: true } as const] : []),
      ...(options.rnode ? [options.rnode] : []),
    ];
    const config: RnsBootstrapConfig = {
      storagePath: `${FileSystem.documentDirectory ?? ''}jagoo-signal-rns`,
      identityPrivateKey: identity.privateKey,
      interfaces,
      propagationDestination: bootstrap.lxmfPropagationDestination,
    };
    return await RnsNative.start(config);
  } finally {
    identity.privateKey.fill(0);
    identity.publicKey.fill(0);
  }
}

export async function signalRnsStatus(): Promise<RnsStatus> {
  return RnsNative ? RnsNative.status() : unavailable;
}

export async function stopSignalRns(): Promise<void> {
  if (RnsNative) await RnsNative.stop();
}

export async function sendSignalLxmf(message: LxmfMessage): Promise<{ readonly id: string; readonly state: string }> {
  if (!RnsNative) throw new Error('LXMF requires the Android RNS development build.');
  return RnsNative.sendLxmf(message);
}

export async function drainSignalLxmf(): Promise<
  readonly { readonly id: string; readonly sourceHash: string; readonly content: string; readonly title: string }[]
> {
  return RnsNative ? RnsNative.drainLxmf() : [];
}
