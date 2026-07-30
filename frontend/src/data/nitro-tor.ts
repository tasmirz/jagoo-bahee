export interface TorHttpResponse {
  readonly status_code: number;
  readonly body: string;
  readonly error: string;
}

export async function startTorClient(_dataDirectory: string): Promise<void> {
  throw new Error('Embedded Tor requires an Android or iOS native build.');
}

export async function torHttpRequest(
  _method: string,
  _url: string,
  _headers: string,
  _body?: string,
): Promise<TorHttpResponse> {
  throw new Error('Embedded Tor requires an Android or iOS native build.');
}
