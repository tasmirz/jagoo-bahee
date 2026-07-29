/**
 * mDNS + SSDP discovery on the local segment (T3.18, TP-18).
 *
 * ── Why this is not optional ───────────────────────────────────────────────────────
 * "All six mechanisms MUST be implemented. Discovery is the single point of failure for the
 * whole resilience story, and it must not have one path." This is the mechanism that works
 * with NO prior knowledge and NO internet: a phone that has never seen this node, on a
 * network with no route anywhere, finds the node in the same building. Every other
 * mechanism — the pre-positioned cache, the seed list, peer gossip, manual entry, QR — needs
 * something to have happened first.
 *
 * ── Both protocols, because devices differ ─────────────────────────────────────────
 * Android's NSD and Apple's Bonjour speak mDNS/DNS-SD; a great deal of consumer networking
 * gear answers only SSDP. Running both costs two sockets and removes a class of "it works on
 * my phone" failure that would surface during an outage, which is the worst possible moment
 * to discover a protocol mismatch.
 *
 * ── Opt-in ────────────────────────────────────────────────────────────────────────
 * `LOCAL_DISCOVERY=true`. An unsolicited multicast announcement is a fingerprint, and on a
 * hostile network a fingerprint is a target. A node on a LAN it trusts announces; a node on a
 * monitored network stays quiet and is reached by address.
 */

import dgram from 'node:dgram';
import { Buffer } from 'node:buffer';
import {
  LocalDiscovery,
  type DiscoveredNode,
} from '../../../core/ports/transport.port.js';
import { ReachabilityScope } from '../../../core/ports/network.port.js';
import type { Clock } from '../../../core/ports/system.port.js';

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
export const SERVICE_TYPE = '_jagoo-bahee._tcp.local';
export const SSDP_SEARCH_TARGET = 'urn:jagoo-bahee:service:node:1';

export interface LocalDiscoveryDeps {
  readonly clock: Clock;
  /** The HTTP port a client would use — discovery advertises the CLIENT surface, not gRPC. */
  readonly httpPort: number;
}

interface Announcement {
  readonly serverId: string;
  readonly displayName: string;
  readonly port: number;
}

export class MulticastLocalDiscovery extends LocalDiscovery {
  private mdns: dgram.Socket | null = null;
  private ssdp: dgram.Socket | null = null;
  private announcement: Announcement | null = null;

  constructor(private readonly deps: LocalDiscoveryDeps) {
    super();
  }

  async announce(record: Announcement): Promise<void> {
    this.announcement = record;
    await Promise.all([this.startMdns(), this.startSsdp()]);
  }

  /**
   * One browse round: query, wait, collect.
   *
   * Deliberately a bounded pass rather than a subscription. `browse(3000)` returns what
   * answered in three seconds, which is a shape the client can put behind a pull-to-refresh
   * and a test can assert on — a callback stream would need a stop condition nobody has.
   */
  async browse(timeoutMs: number): Promise<readonly DiscoveredNode[]> {
    const found = new Map<string, DiscoveredNode>();
    const results = await Promise.all([
      this.browseMdns(timeoutMs).catch(() => [] as DiscoveredNode[]),
      this.browseSsdp(timeoutMs).catch(() => [] as DiscoveredNode[]),
    ]);
    for (const node of results.flat()) found.set(node.address, node);
    return [...found.values()];
  }

  async stop(): Promise<void> {
    for (const socket of [this.mdns, this.ssdp]) {
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
    }
    this.mdns = null;
    this.ssdp = null;
    this.announcement = null;
  }

  // ── mDNS ────────────────────────────────────────────────────────────────────────

  private async startMdns(): Promise<void> {
    if (this.mdns) return;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.mdns = socket;
    await new Promise<void>((resolve) => {
      socket.once('error', () => resolve());
      socket.bind(MDNS_PORT, () => {
        try {
          socket.addMembership(MDNS_ADDRESS);
          socket.setMulticastTTL(255);
        } catch {
          // A container without multicast support still runs; discovery simply finds nothing.
        }
        resolve();
      });
    });

    socket.on('message', (message, remote) => {
      const record = this.announcement;
      if (!record) return;
      if (!isQueryFor(message, SERVICE_TYPE)) return;
      const response = encodeResponse(SERVICE_TYPE, record, this.deps.httpPort);
      socket.send(response, remote.port, remote.address, () => undefined);
    });
  }

  private async browseMdns(timeoutMs: number): Promise<DiscoveredNode[]> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const nodes: DiscoveredNode[] = [];
      const done = (): void => {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
        resolve(nodes);
      };
      const timer = setTimeout(done, timeoutMs);
      timer.unref?.();

      socket.once('error', () => {
        clearTimeout(timer);
        done();
      });
      socket.on('message', (message, remote) => {
        const parsed = decodeResponse(message, remote.address);
        if (parsed) nodes.push({ ...parsed, discoveredAtMs: this.deps.clock.nowMs(), via: 'mdns' });
      });
      socket.bind(0, () => {
        try {
          socket.setMulticastTTL(255);
        } catch {
          // Not fatal; the query still goes out on the default interface.
        }
        socket.send(encodeQuery(SERVICE_TYPE), MDNS_PORT, MDNS_ADDRESS, (error) => {
          if (error) {
            clearTimeout(timer);
            done();
          }
        });
      });
    });
  }

  // ── SSDP ────────────────────────────────────────────────────────────────────────

  private async startSsdp(): Promise<void> {
    if (this.ssdp) return;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.ssdp = socket;
    await new Promise<void>((resolve) => {
      socket.once('error', () => resolve());
      socket.bind(SSDP_PORT, () => {
        try {
          socket.addMembership(SSDP_ADDRESS);
        } catch {
          // See the mDNS note.
        }
        resolve();
      });
    });

    socket.on('message', (message, remote) => {
      const record = this.announcement;
      if (!record) return;
      const text = message.toString('utf8');
      if (!text.startsWith('M-SEARCH') || !text.includes(SSDP_SEARCH_TARGET)) return;
      const reply = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
          'CACHE-CONTROL: max-age=1800\r\n' +
          `ST: ${SSDP_SEARCH_TARGET}\r\n` +
          `USN: uuid:${record.serverId}::${SSDP_SEARCH_TARGET}\r\n` +
          `LOCATION: http://${remote.address === '127.0.0.1' ? '127.0.0.1' : localAddressOf(socket)}:${this.deps.httpPort}/\r\n` +
          `X-JAGOO-SERVER-ID: ${record.serverId}\r\n` +
          `X-JAGOO-NAME: ${record.displayName}\r\n\r\n`,
      );
      socket.send(reply, remote.port, remote.address, () => undefined);
    });
  }

  private async browseSsdp(timeoutMs: number): Promise<DiscoveredNode[]> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const nodes: DiscoveredNode[] = [];
      const done = (): void => {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
        resolve(nodes);
      };
      const timer = setTimeout(done, timeoutMs);
      timer.unref?.();

      socket.once('error', () => {
        clearTimeout(timer);
        done();
      });
      socket.on('message', (message) => {
        const text = message.toString('utf8');
        if (!text.includes(SSDP_SEARCH_TARGET)) return;
        const location = /^location:\s*(\S+)/im.exec(text)?.[1];
        if (!location) return;
        const serverId = /^x-jagoo-server-id:\s*(\S+)/im.exec(text)?.[1];
        const displayName = /^x-jagoo-name:\s*(.+)$/im.exec(text)?.[1]?.trim();
        nodes.push({
          address: location.replace(/\/$/, ''),
          scope: ReachabilityScope.LAN,
          ...(serverId ? { serverId } : {}),
          ...(displayName ? { displayName } : {}),
          discoveredAtMs: this.deps.clock.nowMs(),
          via: 'ssdp',
        });
      });

      const search = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 2\r\n' +
          `ST: ${SSDP_SEARCH_TARGET}\r\n\r\n`,
      );
      socket.bind(0, () => {
        socket.send(search, SSDP_PORT, SSDP_ADDRESS, (error) => {
          if (error) {
            clearTimeout(timer);
            done();
          }
        });
      });
    });
  }
}

function localAddressOf(socket: dgram.Socket): string {
  try {
    return socket.address().address;
  } catch {
    return '0.0.0.0';
  }
}

// ── Minimal DNS wire format ─────────────────────────────────────────────────────────
//
// Only what DNS-SD browsing needs: a PTR question, and a response carrying PTR + TXT. The
// TXT record carries the node's server id and HTTP address, which is everything a client
// needs to complete discovery — so no follow-up SRV/A resolution round trip is required, and
// a client on a network with no unicast DNS is not left holding a name it cannot resolve.

function encodeName(name: string): Buffer {
  const parts = name.split('.').filter(Boolean);
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8');
    chunks.push(Buffer.from([bytes.length]), bytes);
  }
  chunks.push(Buffer.from([0]));
  return Buffer.concat(chunks);
}

function decodeName(message: Buffer, offset: number): { name: string; next: number } {
  const labels: string[] = [];
  let cursor = offset;
  let jumped = false;
  let next = offset;
  // A bounded walk: a malformed message with a pointer loop must not hang the browser.
  for (let guard = 0; guard < 128; guard += 1) {
    const length = message.readUInt8(cursor);
    if (length === 0) {
      cursor += 1;
      if (!jumped) next = cursor;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      const pointer = ((length & 0x3f) << 8) | message.readUInt8(cursor + 1);
      if (!jumped) next = cursor + 2;
      jumped = true;
      cursor = pointer;
      continue;
    }
    labels.push(message.subarray(cursor + 1, cursor + 1 + length).toString('utf8'));
    cursor += 1 + length;
    if (!jumped) next = cursor;
  }
  return { name: labels.join('.'), next };
}

export function encodeQuery(serviceType: string): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0); // id — 0 for multicast DNS
  header.writeUInt16BE(0, 2); // flags — standard query
  header.writeUInt16BE(1, 4); // one question
  const name = encodeName(serviceType);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(12, 0); // PTR
  tail.writeUInt16BE(1, 2); // IN
  return Buffer.concat([header, name, tail]);
}

export function isQueryFor(message: Buffer, serviceType: string): boolean {
  if (message.length < 12) return false;
  const flags = message.readUInt16BE(2);
  if ((flags & 0x8000) !== 0) return false; // a response, not a question
  if (message.readUInt16BE(4) === 0) return false;
  try {
    return decodeName(message, 12).name === serviceType;
  } catch {
    return false;
  }
}

export function encodeResponse(
  serviceType: string,
  record: Announcement,
  httpPort: number,
): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0x8400, 2); // authoritative response
  header.writeUInt16BE(2, 6); // two answers: PTR then TXT

  const instance = `${record.serverId}.${serviceType}`;
  const ptrName = encodeName(serviceType);
  const ptrData = encodeName(instance);
  const ptrHead = Buffer.alloc(10);
  ptrHead.writeUInt16BE(12, 0); // PTR
  ptrHead.writeUInt16BE(1, 2); // IN
  ptrHead.writeUInt32BE(120, 4); // TTL
  ptrHead.writeUInt16BE(ptrData.length, 8);

  const txtStrings = [
    `id=${record.serverId}`,
    `name=${record.displayName}`,
    `port=${httpPort}`,
    `grpc=${record.port}`,
  ];
  const txtData = Buffer.concat(
    txtStrings.map((value) => {
      const bytes = Buffer.from(value, 'utf8').subarray(0, 255);
      return Buffer.concat([Buffer.from([bytes.length]), bytes]);
    }),
  );
  const txtName = encodeName(instance);
  const txtHead = Buffer.alloc(10);
  txtHead.writeUInt16BE(16, 0); // TXT
  txtHead.writeUInt16BE(1, 2);
  txtHead.writeUInt32BE(120, 4);
  txtHead.writeUInt16BE(txtData.length, 8);

  return Buffer.concat([header, ptrName, ptrHead, ptrData, txtName, txtHead, txtData]);
}

export function decodeResponse(
  message: Buffer,
  remoteAddress: string,
): Omit<DiscoveredNode, 'discoveredAtMs' | 'via'> | null {
  if (message.length < 12) return null;
  const flags = message.readUInt16BE(2);
  if ((flags & 0x8000) === 0) return null;

  const questions = message.readUInt16BE(4);
  const answers = message.readUInt16BE(6);
  let cursor = 12;
  for (let i = 0; i < questions; i += 1) {
    cursor = decodeName(message, cursor).next + 4;
  }

  let serverId: string | undefined;
  let displayName: string | undefined;
  let httpPort: number | undefined;

  for (let i = 0; i < answers && cursor + 10 <= message.length; i += 1) {
    const named = decodeName(message, cursor);
    cursor = named.next;
    const type = message.readUInt16BE(cursor);
    const dataLength = message.readUInt16BE(cursor + 8);
    const dataStart = cursor + 10;
    if (type === 16) {
      let offset = dataStart;
      while (offset < dataStart + dataLength && offset < message.length) {
        const length = message.readUInt8(offset);
        const value = message.subarray(offset + 1, offset + 1 + length).toString('utf8');
        const [key = '', rest = ''] = splitOnce(value, '=');
        if (key === 'id') serverId = rest;
        if (key === 'name') displayName = rest;
        if (key === 'port') httpPort = Number(rest);
        offset += 1 + length;
      }
    }
    cursor = dataStart + dataLength;
  }

  if (!serverId || !httpPort) return null;
  return {
    address: `http://${remoteAddress}:${httpPort}`,
    scope: ReachabilityScope.LAN,
    serverId,
    ...(displayName ? { displayName } : {}),
  };
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index < 0) return [value, ''];
  return [value.slice(0, index), value.slice(index + 1)];
}
