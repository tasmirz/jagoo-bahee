/**
 * `ScopeProbe` over a plain TCP connect (T3.2, TP-09).
 *
 * ── Why TCP connect and not ICMP ────────────────────────────────────────────────────
 * ICMP needs a raw socket, which needs root, which would make "run the node as an
 * unprivileged user on a Raspberry Pi" false. It is also the first thing a filtering ISP
 * drops, so a ping-based probe reports an outage that is not there and, worse, keeps
 * reporting one after the block is lifted. A completed TCP handshake to a real port is the
 * strongest liveness statement obtainable without privileges, and it is the same operation
 * federation itself performs — the probe fails when and only when the thing it predicts
 * would fail.
 *
 * ── The source address is the whole point ───────────────────────────────────────────
 * TP-09 probes each uplink INDEPENDENTLY. Without `localAddress` the OS routing table picks
 * the interface, every uplink probes over whichever one the kernel prefers, and a multi-homed
 * node reports two identical results that describe one link (TP-08).
 */

import net from 'node:net';
import { ScopeProbe, type ProbeOutcome } from '../../../core/ports/transport.port.js';

interface ProbeTarget {
  readonly host: string;
  readonly port: number;
}

/**
 * `host:port`, `scheme://host[:port]`, or a bare host.
 *
 * Defaults follow the scheme, and a bare host defaults to 443 rather than to the node's own
 * port: the sample config's `GLOBAL` targets are `https://1.1.1.1` and `https://8.8.8.8`,
 * and a probe that silently used the wrong port would report a permanent outage on a
 * perfectly healthy link.
 */
export function parseProbeTarget(target: string): ProbeTarget | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(trimmed);
  const scheme = schemeMatch?.[1]?.toLowerCase();
  const rest = schemeMatch?.[2] ?? trimmed;
  const authority = (rest.split('/')[0] ?? '').trim();
  if (!authority) return null;

  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close < 0) return null;
    const host = authority.slice(1, close);
    const portText = authority.slice(close + 1).replace(/^:/, '');
    return { host, port: portText ? Number(portText) : defaultPort(scheme) };
  }

  const colon = authority.lastIndexOf(':');
  if (colon > 0) {
    const port = Number(authority.slice(colon + 1));
    if (Number.isFinite(port) && port > 0) {
      return { host: authority.slice(0, colon), port };
    }
  }
  return { host: authority, port: defaultPort(scheme) };
}

function defaultPort(scheme: string | undefined): number {
  if (scheme === 'http') return 80;
  if (scheme === 'grpc') return 8444;
  return 443;
}

export class TcpScopeProbe extends ScopeProbe {
  async probe(
    target: string,
    options: { readonly sourceIp?: string; readonly timeoutMs: number },
  ): Promise<ProbeOutcome> {
    const parsed = parseProbeTarget(target);
    if (!parsed) return { reachable: false };

    const startedAt = Date.now();
    return new Promise<ProbeOutcome>((resolve) => {
      let settled = false;
      const finish = (outcome: ProbeOutcome): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(outcome);
      };

      const socket = net.connect({
        host: parsed.host,
        port: parsed.port,
        // Empty string means "let the OS decide" — the single-uplink default, where binding
        // would be a lie about a choice nobody made.
        ...(options.sourceIp ? { localAddress: options.sourceIp } : {}),
      });
      socket.setTimeout(options.timeoutMs);
      socket.once('connect', () => finish({ reachable: true, rttMs: Date.now() - startedAt }));
      socket.once('timeout', () => finish({ reachable: false }));
      // Any error is an unreachable answer, including EADDRNOTAVAIL from a source address
      // that no longer exists — an uplink whose IP has gone is exactly an uplink that is down.
      socket.once('error', () => finish({ reachable: false }));
    });
  }
}
