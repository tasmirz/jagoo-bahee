import { RnTor } from 'react-native-nitro-tor';
import type { TorHttpResponse } from './nitro-tor';

const TOR_SOCKS_PORT = 39050;
const TOR_TIMEOUT_MS = 60_000;

export async function startTorClient(dataDirectory: string): Promise<void> {
  const status = await RnTor.getServiceStatus();
  if (status === 1) return;
  const started = await RnTor.initTorService({
    data_dir: dataDirectory,
    socks_port: TOR_SOCKS_PORT,
    timeout_ms: TOR_TIMEOUT_MS,
  });
  if (!started) throw new Error('The embedded Tor client could not start.');
}

export async function torHttpRequest(
  method: string,
  url: string,
  headers: string,
  body?: string,
): Promise<TorHttpResponse> {
  const common = {
    url,
    headers,
    timeout_ms: TOR_TIMEOUT_MS,
    trust_invalid_certs: false,
  };
  if (method === 'GET') return RnTor.httpGet(common);
  if (method === 'DELETE') return RnTor.httpDelete(common);
  if (method === 'POST' && body !== undefined) return RnTor.httpPost({ ...common, body });
  if (method === 'PUT' && body !== undefined) return RnTor.httpPut({ ...common, body });
  throw new Error(`Tor transport does not support ${method} requests.`);
}
