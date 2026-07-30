import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { startTorClient, torHttpRequest } from './nitro-tor';

export type ClientTransport = 'direct' | 'tor';

let activeTransport: ClientTransport = 'direct';
let torStartup: Promise<void> | null = null;

export function configureClientTransport(transport: ClientTransport): void {
  activeTransport = transport;
}

export function currentClientTransport(): ClientTransport {
  return activeTransport;
}

export function isOnionAddress(address: string): boolean {
  try {
    return new URL(address).hostname.toLowerCase().endsWith('.onion');
  } catch {
    return false;
  }
}

async function startTor(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Embedded Tor requires an Android or iOS native build.');
  }
  if (torStartup) return torStartup;
  torStartup = (async () => {
    const dataDirectory = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}tor`;
    await FileSystem.makeDirectoryAsync(dataDirectory, { intermediates: true });
    await startTorClient(dataDirectory);
  })().catch((error) => {
    torStartup = null;
    throw error;
  });
  return torStartup;
}

function serialiseHeaders(value: HeadersInit | undefined): string {
  const result: Record<string, string> = {};
  new Headers(value).forEach((headerValue: string, headerName: string) => {
    result[headerName] = headerValue;
  });
  return JSON.stringify(result);
}

async function torRequest(url: string, init: RequestInit): Promise<Response> {
  await startTor();
  if (init.signal?.aborted) throw new Error('The request was cancelled.');
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'DELETE' && typeof init.body !== 'string') {
    throw new Error(`Tor ${method} requests currently require a string body.`);
  }
  const result = await torHttpRequest(
    method,
    url,
    serialiseHeaders(init.headers),
    typeof init.body === 'string' ? init.body : undefined,
  );
  if (result.error) throw new Error(result.error);
  return new Response(result.body, { status: result.status_code });
}

/**
 * One request boundary for direct and onion traffic.
 *
 * A `.onion` destination always uses Tor even if a stale profile says "direct". Conversely, a
 * selected Tor profile sends its auxiliary audit and anti-abuse requests through Tor as well.
 * There is intentionally no direct retry after a Tor failure because that would leak the request.
 */
export async function networkRequest(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  transport: ClientTransport = activeTransport,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (transport === 'tor' || isOnionAddress(url)) return torRequest(url, init);
  return fetch(input, init);
}

export async function warmClientTransport(transport: ClientTransport): Promise<void> {
  if (transport === 'tor') await startTor();
}
