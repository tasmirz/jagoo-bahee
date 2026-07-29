/**
 * NAT traversal: UPnP-IGD, NAT-PMP and STUN reflexive discovery (T3.15, T3.16, TP-14, TP-15).
 *
 * ── TP-14: attempt, report clearly, and keep working either way ─────────────────────
 * "The node MUST attempt UPnP-IGD and NAT-PMP port mapping at startup when configured to,
 * report the outcome clearly, and continue functioning outbound-only if mapping fails."
 * Failure here is the COMMON case — most Bangladeshi consumer routers ship with UPnP off,
 * and behind CGNAT no protocol can help. Continuing outbound-only is not degradation: FD-12
 * makes it the default deployment for a home node. What must never happen is a node that
 * failed to map a port and advertises it anyway, because every peer then retries an address
 * that will never answer.
 *
 * ── TP-15: CGNAT must be NAMED, not merely survived ────────────────────────────────
 * A reflexive address inside 100.64.0.0/10 means the ISP is carrier-grade NATing this node.
 * No port forward will ever fix that, and an operator who does not know spends an evening in
 * a router UI. Saying "you are behind CGNAT; use a reverse tunnel through a TRUSTED peer" is
 * the entire value of this check.
 *
 * ── No new dependencies ────────────────────────────────────────────────────────────
 * UPnP-IGD is SSDP discovery plus one SOAP POST; NAT-PMP is a 12-byte UDP datagram; STUN is
 * a 20-byte binding request. Each is small enough to write against the RFC, and a
 * `pnpm install --prod` that drops a hoisted transitive dependency is how the P2 image
 * failed to boot (L-20). Fewer runtime dependencies on the resilience path is the point.
 */

import dgram from 'node:dgram';
import { Buffer } from 'node:buffer';
import {
  NatTraversal,
  type ReachabilityReport,
} from '../../../core/ports/transport.port.js';
import type { Clock } from '../../../core/ports/system.port.js';

export interface NatTraversalDeps {
  readonly clock: Clock;
  readonly upnp: boolean;
  readonly natPmp: boolean;
  /** `host:port`, e.g. `stun.l.google.com:19302`. Empty disables reflexive discovery. */
  readonly stunServers: readonly string[];
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3_000;
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const NAT_PMP_PORT = 5351;

/** RFC 6598 — 100.64.0.0/10, the shared address space carrier-grade NAT uses. */
export function isCgnatAddress(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a = 0, b = 0] = parts;
  return a === 100 && b >= 64 && b <= 127;
}

export class UdpNatTraversal extends NatTraversal {
  private mappedPort: number | null = null;

  constructor(private readonly deps: NatTraversalDeps) {
    super();
  }

  async discover(options: {
    readonly port: number;
    readonly sourceIp?: string;
  }): Promise<ReachabilityReport> {
    const timeoutMs = this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Reflexive discovery first: if we are behind CGNAT, a port mapping cannot help and
    // announcing that fact is more useful than a mapping attempt that will fail confusingly.
    const reflexive = await this.stun(timeoutMs, options.sourceIp);
    const cgnat = reflexive !== null && isCgnatAddress(reflexive.split(':')[0] ?? '');

    let mapping: ReachabilityReport['portMapping'] = {
      mapped: false,
      externalPort: null,
      method: 'none',
      detail: 'no port mapping was attempted',
    };

    if (cgnat) {
      mapping = {
        mapped: false,
        externalPort: null,
        method: 'none',
        detail:
          'behind carrier-grade NAT (100.64.0.0/10): no port mapping is possible. ' +
          'Federate outbound-only (FD-12), or serve clients through a reverse tunnel (TP-16).',
      };
    } else if (this.deps.natPmp) {
      mapping = await this.natPmpMap(options.port, timeoutMs, options.sourceIp);
    }

    if (!mapping.mapped && !cgnat && this.deps.upnp) {
      const upnp = await this.upnpMap(options.port, timeoutMs, options.sourceIp);
      // Keep whichever attempt got further, so the reported detail names the real obstacle
      // rather than whichever protocol happened to run last.
      if (upnp.mapped || mapping.method === 'none') mapping = upnp;
    }

    if (mapping.mapped) this.mappedPort = mapping.externalPort;

    return {
      reflexiveAddress: reflexive,
      localAddress: options.sourceIp ?? null,
      cgnat,
      portMapping: mapping,
      checkedAtMs: this.deps.clock.nowMs(),
    };
  }

  async release(): Promise<void> {
    if (this.mappedPort === null || !this.deps.natPmp) return;
    // Best effort. A lease we cannot delete expires on its own — NAT-PMP mappings carry a
    // lifetime for exactly this reason.
    await this.natPmpMap(this.mappedPort, 1_000, undefined, 0).catch(() => undefined);
    this.mappedPort = null;
  }

  /**
   * RFC 5389 §6 — a 20-byte binding request; the response carries XOR-MAPPED-ADDRESS (0x0020).
   *
   * XOR-mapped rather than the deprecated MAPPED-ADDRESS: some middleboxes rewrite anything
   * that looks like an IP address in a payload, and the XOR is precisely what stops them
   * "helpfully" corrupting the answer we asked for.
   */
  private async stun(timeoutMs: number, sourceIp?: string): Promise<string | null> {
    for (const server of this.deps.stunServers) {
      const [host, portText] = splitHostPort(server, 3478);
      const result = await this.stunOnce(host, portText, timeoutMs, sourceIp).catch(() => null);
      if (result) return result;
    }
    return null;
  }

  private stunOnce(
    host: string,
    port: number,
    timeoutMs: number,
    sourceIp?: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const transactionId = Buffer.alloc(12);
      for (let i = 0; i < 12; i += 1) transactionId[i] = (i * 37 + 11) & 0xff;

      const request = Buffer.alloc(20);
      request.writeUInt16BE(0x0001, 0); // Binding Request
      request.writeUInt16BE(0x0000, 2); // length
      request.writeUInt32BE(0x2112a442, 4); // magic cookie
      transactionId.copy(request, 8);

      const done = (value: string | null): void => {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      timer.unref?.();

      socket.once('error', () => {
        clearTimeout(timer);
        done(null);
      });
      socket.once('message', (message) => {
        clearTimeout(timer);
        done(parseXorMappedAddress(message));
      });

      const send = (): void => {
        socket.send(request, port, host, (error) => {
          if (error) {
            clearTimeout(timer);
            done(null);
          }
        });
      };
      if (sourceIp) socket.bind(0, sourceIp, send);
      else send();
    });
  }

  /**
   * RFC 6886 — NAT-PMP map request to the default gateway.
   *
   * The gateway is derived from the source address rather than read from a routing table:
   * `.1` on the local /24 is right on essentially every consumer router, and reading the
   * host's routing table would need a platform-specific call in a container that does not
   * have one.
   */
  private natPmpMap(
    port: number,
    timeoutMs: number,
    sourceIp?: string,
    lifetimeSeconds = 3_600,
  ): Promise<ReachabilityReport['portMapping']> {
    const gateway = gatewayFor(sourceIp);
    if (!gateway) {
      return Promise.resolve({
        mapped: false,
        externalPort: null,
        method: 'nat-pmp' as const,
        detail: 'no gateway could be derived; set a source IP on the uplink',
      });
    }

    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const request = Buffer.alloc(12);
      request.writeUInt8(0, 0); // version
      request.writeUInt8(2, 1); // opcode 2 = map TCP
      request.writeUInt16BE(0, 2); // reserved
      request.writeUInt16BE(port, 4); // internal port
      request.writeUInt16BE(port, 6); // suggested external port
      request.writeUInt32BE(lifetimeSeconds, 8);

      const done = (value: ReachabilityReport['portMapping']): void => {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
        resolve(value);
      };
      const timer = setTimeout(
        () =>
          done({
            mapped: false,
            externalPort: null,
            method: 'nat-pmp',
            detail: `no NAT-PMP response from ${gateway} within ${timeoutMs} ms — the router likely has it disabled`,
          }),
        timeoutMs,
      );
      timer.unref?.();

      socket.once('error', (error) => {
        clearTimeout(timer);
        done({
          mapped: false,
          externalPort: null,
          method: 'nat-pmp',
          detail: `NAT-PMP failed: ${error.message}`,
        });
      });
      socket.once('message', (message) => {
        clearTimeout(timer);
        if (message.length < 16) {
          done({
            mapped: false,
            externalPort: null,
            method: 'nat-pmp',
            detail: 'NAT-PMP response was truncated',
          });
          return;
        }
        const resultCode = message.readUInt16BE(2);
        if (resultCode !== 0) {
          done({
            mapped: false,
            externalPort: null,
            method: 'nat-pmp',
            detail: `NAT-PMP refused with result code ${resultCode}`,
          });
          return;
        }
        const externalPort = message.readUInt16BE(10);
        done({
          mapped: true,
          externalPort,
          method: 'nat-pmp',
          detail: `mapped external port ${externalPort} for ${lifetimeSeconds} s`,
        });
      });

      socket.send(request, NAT_PMP_PORT, gateway, (error) => {
        if (error) {
          clearTimeout(timer);
          done({
            mapped: false,
            externalPort: null,
            method: 'nat-pmp',
            detail: `NAT-PMP send failed: ${error.message}`,
          });
        }
      });
    });
  }

  /**
   * UPnP-IGD: SSDP `M-SEARCH` to find the gateway, then one `AddPortMapping` SOAP call.
   *
   * Reported failures name what went wrong at each step, because "UPnP failed" is useless to
   * an operator: "no device answered M-SEARCH" and "the device answered and refused the
   * mapping" have completely different fixes.
   */
  private async upnpMap(
    port: number,
    timeoutMs: number,
    sourceIp?: string,
  ): Promise<ReachabilityReport['portMapping']> {
    const location = await this.ssdpSearch(timeoutMs, sourceIp);
    if (!location) {
      return {
        mapped: false,
        externalPort: null,
        method: 'upnp-igd',
        detail: 'no IGD answered SSDP M-SEARCH — UPnP is off, or the router does not support it',
      };
    }

    try {
      const controlUrl = await resolveControlUrl(location, timeoutMs);
      if (!controlUrl) {
        return {
          mapped: false,
          externalPort: null,
          method: 'upnp-igd',
          detail: `IGD at ${location} exposed no WANIPConnection control URL`,
        };
      }
      const body = soapEnvelope(port, sourceIp ?? '');
      const response = await fetch(controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPAction: '"urn:schemas-upnp-org:service:WANIPConnection:1#AddPortMapping"',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        return {
          mapped: false,
          externalPort: null,
          method: 'upnp-igd',
          detail: `IGD refused AddPortMapping with HTTP ${response.status}`,
        };
      }
      return {
        mapped: true,
        externalPort: port,
        method: 'upnp-igd',
        detail: `mapped external port ${port} via ${controlUrl}`,
      };
    } catch (error) {
      return {
        mapped: false,
        externalPort: null,
        method: 'upnp-igd',
        detail: `UPnP-IGD failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  private ssdpSearch(timeoutMs: number, sourceIp?: string): Promise<string | null> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const message = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 2\r\n' +
          'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n',
      );

      const done = (value: string | null): void => {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      timer.unref?.();

      socket.once('error', () => {
        clearTimeout(timer);
        done(null);
      });
      socket.on('message', (payload) => {
        const location = /^location:\s*(\S+)/im.exec(payload.toString('utf8'))?.[1];
        if (location) {
          clearTimeout(timer);
          done(location);
        }
      });
      socket.bind(0, sourceIp ?? '0.0.0.0', () => {
        socket.send(message, SSDP_PORT, SSDP_ADDRESS, (error) => {
          if (error) {
            clearTimeout(timer);
            done(null);
          }
        });
      });
    });
  }
}

function splitHostPort(value: string, fallbackPort: number): [string, number] {
  const colon = value.lastIndexOf(':');
  if (colon < 0) return [value, fallbackPort];
  const port = Number(value.slice(colon + 1));
  return [value.slice(0, colon), Number.isFinite(port) ? port : fallbackPort];
}

/** `192.168.1.42` → `192.168.1.1`. Null when the address is not an IPv4 dotted quad. */
export function gatewayFor(sourceIp: string | undefined): string | null {
  if (!sourceIp) return null;
  const parts = sourceIp.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

/** RFC 5389 §15.2 — XOR-MAPPED-ADDRESS, attribute type 0x0020, IPv4 family only. */
export function parseXorMappedAddress(message: Buffer): string | null {
  if (message.length < 20) return null;
  const magic = 0x2112a442;
  let offset = 20;
  while (offset + 4 <= message.length) {
    const type = message.readUInt16BE(offset);
    const length = message.readUInt16BE(offset + 2);
    const valueStart = offset + 4;
    if (valueStart + length > message.length) return null;
    if (type === 0x0020 && length >= 8 && message.readUInt8(valueStart + 1) === 0x01) {
      const port = message.readUInt16BE(valueStart + 2) ^ (magic >>> 16);
      const address = message.readUInt32BE(valueStart + 4) ^ magic;
      const octets = [
        (address >>> 24) & 0xff,
        (address >>> 16) & 0xff,
        (address >>> 8) & 0xff,
        address & 0xff,
      ];
      return `${octets.join('.')}:${port}`;
    }
    // Attributes are padded to a 4-byte boundary.
    offset = valueStart + length + ((4 - (length % 4)) % 4);
  }
  return null;
}

async function resolveControlUrl(location: string, timeoutMs: number): Promise<string | null> {
  const response = await fetch(location, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) return null;
  const xml = await response.text();
  const match =
    /<serviceType>urn:schemas-upnp-org:service:WANIPConnection:1<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i.exec(
      xml,
    ) ??
    /<serviceType>urn:schemas-upnp-org:service:WANPPPConnection:1<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i.exec(
      xml,
    );
  const path = match?.[1];
  if (!path) return null;
  return new URL(path, location).toString();
}

function soapEnvelope(port: number, internalClient: string): string {
  return (
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    '<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">' +
    '<NewRemoteHost></NewRemoteHost>' +
    `<NewExternalPort>${port}</NewExternalPort>` +
    '<NewProtocol>TCP</NewProtocol>' +
    `<NewInternalPort>${port}</NewInternalPort>` +
    `<NewInternalClient>${internalClient}</NewInternalClient>` +
    '<NewEnabled>1</NewEnabled>' +
    '<NewPortMappingDescription>jagoo-bahee federation</NewPortMappingDescription>' +
    '<NewLeaseDuration>0</NewLeaseDuration>' +
    '</u:AddPortMapping></s:Body></s:Envelope>'
  );
}
