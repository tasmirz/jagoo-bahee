import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';
import {
  AuxiliaryServiceKind,
  ServiceDirectory,
  type AuxiliaryService,
} from '../../core/ports/service-directory.port.js';

interface ConfiguredEndpoint {
  readonly id: string;
  readonly kind: AuxiliaryServiceKind;
  readonly address: string;
  readonly host: string;
  readonly port: number;
}

const CONFIG_BY_KIND: Readonly<Record<AuxiliaryServiceKind, string>> = {
  [AuxiliaryServiceKind.AUDIT_LOG]: 'AUDIT_LOG_SERVICES',
  [AuxiliaryServiceKind.MCAPTCHA]: 'MCAPTCHA_SERVICES',
  [AuxiliaryServiceKind.FEDERATION]: 'FEDERATION_SERVICES',
};

function normaliseAddress(input: string): URL | null {
  try {
    const value = input.includes('://') ? input : `http://${input}`;
    const url = new URL(value);
    if (!url.hostname) return null;
    if (!url.port) {
      url.port = url.protocol === 'https:' ? '443' : '80';
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url;
  } catch {
    return null;
  }
}

function configured(kind: AuxiliaryServiceKind): readonly ConfiguredEndpoint[] {
  const raw = process.env[CONFIG_BY_KIND[kind]] ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry, index) => {
      const url = normaliseAddress(entry);
      if (!url) return [];
      return [
        {
          id: `${kind}-${index + 1}`,
          kind,
          address: url.toString().replace(/\/$/, ''),
          host: url.hostname,
          port: Number(url.port),
        },
      ];
    });
}

async function canConnect(endpoint: ConfiguredEndpoint): Promise<boolean> {
  if (process.env.SERVICE_DISCOVERY_PROBE === 'false') return true;
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: endpoint.host, port: endpoint.port });
    const finish = (available: boolean) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(600);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export class ConfiguredServiceDirectory extends ServiceDirectory {
  localAddresses(): readonly string[] {
    const port = Number(process.env.PORT ?? 3000);
    const explicit = (process.env.NODE_LOCAL_URLS ?? '')
      .split(',')
      .map((entry) => normaliseAddress(entry.trim()))
      .filter((entry): entry is URL => entry !== null)
      .map((entry) => entry.toString().replace(/\/$/, ''));
    if (explicit.length > 0) return [...new Set(explicit)];

    const addresses = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => `http://${entry.address}:${port}`);
    return [...new Set(addresses)];
  }

  async services(kind?: AuxiliaryServiceKind): Promise<readonly AuxiliaryService[]> {
    const kinds = kind ? [kind] : Object.values(AuxiliaryServiceKind);
    const endpoints = kinds.flatMap(configured);
    return Promise.all(
      endpoints.map(async (endpoint) => ({
        ...endpoint,
        available: await canConnect(endpoint),
      })),
    );
  }
}
