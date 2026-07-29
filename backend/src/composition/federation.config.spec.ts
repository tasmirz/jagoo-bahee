/**
 * Federation configuration parsing — AR-12 and FD-12.
 *
 * The two properties that matter most are both about what a node does NOT do:
 * an unconfigured node federates with nobody, and an outbound-only node advertises
 * nothing. Both are easy to break with a well-meaning default, and neither would be
 * noticed by any other test.
 */

import { describe, expect, it } from 'vitest';
import { serverId as serverIdOf } from '@jagoo/sdk/core';
import { Plane, Priority } from '../core/domain/envelope.js';
import { PeerTrust } from '../core/ports/network.port.js';
import { loadFederationConfig } from './federation.config.js';

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
const load = (env: NodeJS.ProcessEnv) => loadFederationConfig(env, serverIdOf);

describe('AR-12 — federation is off unless configured', () => {
  it('a node with no peers and no listen address federates with nobody', () => {
    const config = load({});
    expect(config.enabled).toBe(false);
    expect(config.peers).toHaveLength(0);
    expect(config.endpoints).toHaveLength(0);
  });

  it('listing a peer is enough to enable it — opening a port is not required', () => {
    const config = load({ FEDERATION_PEERS: `${KEY}@GLOBAL=grpc://node-b:8444` });
    expect(config.enabled).toBe(true);
    expect(config.peers).toHaveLength(1);
  });
});

describe('FD-12 — outbound-only is the default for a home or community node', () => {
  it('no listen address means outbound-only, and outbound-only advertises NOTHING', () => {
    const config = load({ FEDERATION_ENDPOINTS: 'GLOBAL=grpc://me:8444' });
    expect(config.outboundOnly).toBe(true);
    // Not "advertises its address with inbound_capable false": it has no reachable address,
    // and publishing one would send peers into a retry loop against a port that never answers.
    expect(config.endpoints).toHaveLength(0);
  });

  it('an explicit opt-out beats a configured listen address', () => {
    const config = load({
      FEDERATION_GRPC_LISTEN: '0.0.0.0:8444',
      FEDERATION_ENDPOINTS: 'GLOBAL=grpc://me:8444',
      FEDERATION_OUTBOUND_ONLY: 'true',
    });
    expect(config.outboundOnly).toBe(true);
    expect(config.endpoints).toHaveLength(0);
  });

  it('a listening node keeps its endpoints', () => {
    const config = load({
      FEDERATION_GRPC_LISTEN: '0.0.0.0:8444',
      FEDERATION_ENDPOINTS: 'GLOBAL=grpc://me:8444,ISP_LOCAL=grpc://10.0.0.1:8444',
    });
    expect(config.outboundOnly).toBe(false);
    expect(config.endpoints.map((endpoint) => endpoint.scope)).toEqual(['GLOBAL', 'ISP_LOCAL']);
  });
});

describe('FD-17 — scope is declared, never inferred', () => {
  it('parses each scope=uri pair', () => {
    const config = load({
      FEDERATION_GRPC_LISTEN: '0.0.0.0:8444',
      FEDERATION_ENDPOINTS:
        'GLOBAL=grpc://node1.example.org:8444, NATIONAL=grpc://203.0.113.10:8444 ,ISP_LOCAL=grpc://10.20.30.40:8444',
    });
    expect(config.endpoints).toHaveLength(3);
    expect(config.endpoints[2]).toMatchObject({
      scope: 'ISP_LOCAL',
      address: 'grpc://10.20.30.40:8444',
    });
  });

  it('drops an entry with no scope rather than guessing one', () => {
    // Guessing from an IP range would be wrong for exactly the CGNAT and multi-homed cases
    // P3 exists to serve.
    const config = load({
      FEDERATION_GRPC_LISTEN: '0.0.0.0:8444',
      FEDERATION_ENDPOINTS: 'grpc://no-scope:8444,MADE_UP=grpc://x:1,GLOBAL=grpc://ok:8444',
    });
    expect(config.endpoints.map((endpoint) => endpoint.address)).toEqual(['grpc://ok:8444']);
  });
});

describe('FD-02 — a peer is identified by its key', () => {
  it('parses key, endpoints and an operator trust override', () => {
    const config = load({ FEDERATION_PEERS: `${KEY}@GLOBAL=grpc://b:8444;LAN=grpc://10.0.0.2:8444#TRUSTED` });
    const peer = config.peers[0]!;
    expect(peer.serverId).toBe(serverIdOf(new Uint8Array(32).fill(7)));
    expect(peer.trust).toBe(PeerTrust.TRUSTED);
    expect(peer.endpoints.map((endpoint) => endpoint.scope)).toEqual(['GLOBAL', 'LAN']);
  });

  it('leaves trust unset when no override is given, so TOFU decides', () => {
    const config = load({ FEDERATION_PEERS: `${KEY}@GLOBAL=grpc://b:8444` });
    expect(config.peers[0]!.trust).toBeUndefined();
  });

  it('drops a peer whose key is not a 32-byte Ed25519 key', () => {
    const short = Buffer.from(new Uint8Array(16)).toString('base64');
    expect(load({ FEDERATION_PEERS: `${short}@GLOBAL=grpc://b:8444` }).peers).toHaveLength(0);
  });

  it('drops a peer with no dialable endpoint rather than queueing for it forever', () => {
    expect(load({ FEDERATION_PEERS: `${KEY}@` }).peers).toHaveLength(0);
  });
});

describe('FD-07 — a node advertises only planes it can actually serve', () => {


  it('advertises both planes by default, because this build serves both', () => {
    const config = load({ FEDERATION_GRPC_LISTEN: '0.0.0.0:8444' });
    expect(config.planes).toEqual([Plane.FORUM, Plane.SIGNAL]);
    expect(config.acceptedClasses).toContain(Priority.BROADCAST);
    expect(config.acceptedClasses).toContain(Priority.BULK);
  });


  it('advertises only the explicitly enabled plane', () => {
    expect(
      load({ FEDERATION_GRPC_LISTEN: '0.0.0.0:8444', NODE_PLANES: 'SIGNAL' }).planes,
    ).toEqual([Plane.SIGNAL]);

  // FD-07/ADR-012: a Signal-only relay and a Forum-only instance are both legitimate
  // deployments, and the handshake must say which this node is. Asserted per plane rather
  // than only on the default, because the default is the one case that is right by accident.
  it('advertises SIGNAL only when NODE_PLANES says so', () => {
    expect(load({ NODE_PLANES: 'SIGNAL' }).planes).toEqual([Plane.SIGNAL]);
  });

  it('advertises FORUM only when NODE_PLANES says so', () => {
    expect(load({ NODE_PLANES: 'FORUM' }).planes).toEqual([Plane.FORUM]);
  });

  it('refuses a node that serves neither plane', () => {
    expect(() => load({ NODE_PLANES: 'NEITHER' })).toThrow(/NODE_PLANES/);

  });
});})