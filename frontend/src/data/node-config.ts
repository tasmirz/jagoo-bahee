import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isOnionAddress,
  networkRequest,
  type ClientTransport,
} from './request';
import {
  resolveServiceAddress,
  type ResolvedService,
  type ServiceKind,
} from './service-address';
import { loadServiceOverrides, type ServiceOverrides } from './service-overrides';

const HOME_NODE_KEY = 'jb.home-node.v1';

export interface DiscoveredService {
  readonly id: string;
  readonly kind: ServiceKind;
  readonly address: string;
  readonly host: string;
  readonly port: number;
  readonly available: boolean;
}

export interface NodeDiscovery {
  readonly status: 'ok';
  readonly node: {
    readonly serverId: string;
    readonly serverKey: string;
    readonly displayName: string;
    readonly requestedAddress: string;
    readonly localAddresses: readonly string[];
  };
  readonly services: {
    readonly auditLogs: readonly DiscoveredService[];
    readonly mcaptcha: readonly DiscoveredService[];
    /**
     * Absent from nodes older than service advertisement, hence optional rather than defaulted at
     * the type level — a client that assumed it was always present would crash against the very
     * nodes most likely to be running during a shutdown.
     */
    readonly blobs?: readonly DiscoveredService[];
  };
  readonly endpoints: {
    readonly federations: string;
    readonly verify: string;
    readonly status: string;
  };
}

export interface HomeNode {
  readonly baseUrl: string;
  readonly transport: ClientTransport;
  readonly discovery: NodeDiscovery;
  readonly savedAtMs: number;
}

export function normaliseNodeAddress(input: string, transport: ClientTransport = 'direct'): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter the home server address.');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Use an address like 192.168.1.20:3000.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The home server must use HTTP or HTTPS.');
  }
  if (!url.hostname) throw new Error('The home server address has no host.');
  if (url.hostname.toLowerCase().endsWith('.onion') && transport !== 'tor') {
    throw new Error('Choose Tor to connect to an .onion home server.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function validateDiscovery(value: unknown): NodeDiscovery {
  if (!value || typeof value !== 'object') {
    throw new Error('The server returned an invalid discovery document.');
  }
  const discovery = value as Partial<NodeDiscovery>;
  if (
    discovery.status !== 'ok' ||
    !discovery.node ||
    typeof discovery.node.serverId !== 'string' ||
    !discovery.node.serverId.startsWith('jbs1') ||
    !discovery.services ||
    !Array.isArray(discovery.services.auditLogs) ||
    !Array.isArray(discovery.services.mcaptcha)
  ) {
    throw new Error('This address is online, but it is not a compatible Jagoo Bahee node.');
  }
  return discovery as NodeDiscovery;
}

export async function discoverHomeNode(
  input: string,
  requestedTransport: ClientTransport = 'direct',
): Promise<HomeNode> {
  const transport = isOnionAddress(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `http://${input.trim()}`,
  )
    ? 'tor'
    : requestedTransport;
  const baseUrl = normaliseNodeAddress(input, transport);
  let response: Response;
  try {
    response = await networkRequest(
      new URL('/health', `${baseUrl}/`).toString(),
      { headers: { Accept: 'application/json' } },
      transport,
    );
  } catch {
    throw new Error(
      transport === 'tor'
        ? 'Could not reach that server through Tor. Check the address and Tor connection.'
        : 'Could not reach that server. Check the address and local network.',
    );
  }
  if (!response.ok) {
    throw new Error(`The server health check returned HTTP ${response.status}.`);
  }
  const discovery = validateDiscovery(await response.json());
  return { baseUrl, transport, discovery, savedAtMs: Date.now() };
}

export async function saveHomeNode(node: HomeNode): Promise<void> {
  await AsyncStorage.setItem(HOME_NODE_KEY, JSON.stringify(node));
}

export async function loadHomeNode(): Promise<HomeNode | null> {
  const stored = await AsyncStorage.getItem(HOME_NODE_KEY);
  if (stored) {
    try {
      const value = JSON.parse(stored) as HomeNode;
      return {
        baseUrl: normaliseNodeAddress(value.baseUrl, value.transport ?? 'direct'),
        transport: value.transport ?? (isOnionAddress(value.baseUrl) ? 'tor' : 'direct'),
        discovery: validateDiscovery(value.discovery),
        savedAtMs: value.savedAtMs,
      };
    } catch {
      await AsyncStorage.removeItem(HOME_NODE_KEY);
    }
  }
  const configured = process.env.EXPO_PUBLIC_NODE_URL?.trim();
  if (!configured) return null;
  return discoverHomeNode(
    configured,
    process.env.EXPO_PUBLIC_NODE_TRANSPORT?.trim().toLowerCase() === 'tor' ? 'tor' : 'direct',
  );
}

export async function forgetHomeNode(): Promise<void> {
  await AsyncStorage.removeItem(HOME_NODE_KEY);
}

export interface ServiceEndpoint extends ResolvedService {
  readonly kind: ServiceKind;
  readonly id: string;
  /** What the node claimed, kept so settings can show the user what it is overriding. */
  readonly advertisedAddress: string;
  readonly available: boolean;
}

function endpointsFor(
  node: HomeNode,
  kind: ServiceKind,
  services: readonly DiscoveredService[] | undefined,
  overrides: ServiceOverrides,
): readonly ServiceEndpoint[] {
  return (services ?? []).map((service) => ({
    ...resolveServiceAddress(node.baseUrl, service, overrides[kind]),
    kind,
    id: service.id,
    advertisedAddress: service.address,
    available: service.available,
  }));
}

/**
 * Every auxiliary service, resolved to an address this device can dial.
 *
 * Callers must use this rather than reading `discovery.services.*.address` directly: the raw
 * advertisement is what the NODE sees, and on any deployment where those differ — a tunnel, a
 * phone off the LAN — using it produces a connection error that names the wrong cause.
 */
export function resolveServices(
  node: HomeNode,
  overrides: ServiceOverrides = {},
): Record<'auditLogs' | 'mcaptcha' | 'blobs', readonly ServiceEndpoint[]> {
  return {
    auditLogs: endpointsFor(node, 'audit-log', node.discovery.services.auditLogs, overrides),
    mcaptcha: endpointsFor(node, 'mcaptcha', node.discovery.services.mcaptcha, overrides),
    blobs: endpointsFor(node, 'blob', node.discovery.services.blobs, overrides),
  };
}

export async function resolveServicesWithOverrides(
  node: HomeNode,
): Promise<Record<'auditLogs' | 'mcaptcha' | 'blobs', readonly ServiceEndpoint[]>> {
  return resolveServices(node, await loadServiceOverrides());
}
