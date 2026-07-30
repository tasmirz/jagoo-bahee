export interface SignalDirectoryProfile {
  readonly id: string;
  readonly codename: string;
  readonly displayName: string;
  readonly bio: string;
  readonly rnsPublicKey: string;
  readonly lxmfDestinationHash: string;
  readonly languages: readonly string[];
  readonly revision: string;
}

export async function searchSignalDirectory(baseUrl: string, query = ''): Promise<readonly SignalDirectoryProfile[]> {
  const url = new URL('/v1/signal/directory', baseUrl);
  if (query.trim()) url.searchParams.set('q', query.trim());
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Signal directory failed with HTTP ${response.status}`);
  const result = (await response.json()) as { readonly items?: readonly SignalDirectoryProfile[] };
  return result.items ?? [];
}
