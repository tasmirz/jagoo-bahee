import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AuxiliaryServiceKind,
  ServiceDirectory,
  type AuxiliaryService,
} from '../../core/ports/service-directory.port.js';
import {
  parseServiceMap,
  publicAddressFor,
  type ServiceMap,
} from '../../core/domain/service-map.js';

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
  [AuxiliaryServiceKind.BLOB]: 'BLOB_SERVICES',
};

const DEFAULT_SERVICE_MAP_PATH = 'ops/service-map.json';

export function normaliseAddress(input: string): URL | null {
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

/**
 * The blob store is declared like any other auxiliary service, but almost no operator will set
 * `BLOB_SERVICES` by hand when `S3_ENDPOINT` already says where MinIO is. Defaulting from it keeps
 * one source of truth: the address the node talks to is the address it describes to clients, and
 * `S3_PUBLIC_ENDPOINT` is what changes when those differ.
 */
function rawConfigFor(kind: AuxiliaryServiceKind): string {
  const explicit = process.env[CONFIG_BY_KIND[kind]] ?? '';
  if (explicit.trim()) return explicit;
  if (kind !== AuxiliaryServiceKind.BLOB) return '';
  return process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? '';
}

function configured(kind: AuxiliaryServiceKind): readonly ConfiguredEndpoint[] {
  return rawConfigFor(kind)
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

/**
 * Reads and caches `ops/service-map.json`.
 *
 * Every failure path returns null. A missing map is the normal case (most nodes are reached
 * directly), and a malformed one must not take the node down — see `parseServiceMap`.
 */
export function loadServiceMap(cwd: string = process.cwd()): ServiceMap | null {
  const configured = process.env.SERVICE_MAP_FILE?.trim();
  const path = configured ? resolve(cwd, configured) : resolve(cwd, DEFAULT_SERVICE_MAP_PATH);
  try {
    return parseServiceMap(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

export class ConfiguredServiceDirectory extends ServiceDirectory {
  constructor(private readonly serviceMap: ServiceMap | null = loadServiceMap()) {
    super();
  }

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
    const published = this.serviceMap ? publicAddressFor(this.serviceMap, port) : null;
    return [...new Set(published ? [published, ...addresses] : addresses)];
  }

  async services(kind?: AuxiliaryServiceKind): Promise<readonly AuxiliaryService[]> {
    const kinds = kind ? [kind] : Object.values(AuxiliaryServiceKind);
    const endpoints = kinds.flatMap(configured);
    return Promise.all(
      endpoints.map(async (endpoint) => ({
        ...endpoint,
        available: await canConnect(endpoint),
        publicAddress: this.serviceMap
          ? publicAddressFor(this.serviceMap, endpoint.port)
          : null,
      })),
    );
  }
}
