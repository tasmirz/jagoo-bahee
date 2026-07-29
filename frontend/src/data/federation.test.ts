/**
 * The client's view of federation.
 *
 * ── TP-01 / G-04: the order the list is read in is not cosmetic ────────────────────
 * The narrowest working scope is preferred continuously, during NORMAL operation, so the
 * ISP-local path is warm and known-good at the moment it becomes the only path. Showing
 * `GLOBAL` first would train a person to reach for the address that disappears.
 */

import { SCOPE_ORDER, sortByScope, type FederationPeerEndpoint } from './node';
import { messages, translate } from '../i18n';

const endpoint = (scope: string): FederationPeerEndpoint => ({
  uri: `grpc://${scope.toLowerCase()}:8444`,
  scope,
  asn: null,
  ispName: null,
  inboundCapable: true,
});

describe('sortByScope', () => {
  it('puts the narrowest working scope first', () => {
    const sorted = sortByScope([
      endpoint('GLOBAL'),
      endpoint('RETICULUM'),
      endpoint('ISP_LOCAL'),
      endpoint('LAN'),
      endpoint('NATIONAL'),
    ]);
    expect(sorted.map((item) => item.scope)).toEqual([
      'LAN',
      'ISP_LOCAL',
      'NATIONAL',
      'GLOBAL',
      'RETICULUM',
    ]);
  });

  it('agrees with the scope preference the node itself uses', () => {
    expect(SCOPE_ORDER).toEqual(['LAN', 'ISP_LOCAL', 'NATIONAL', 'GLOBAL', 'MESH', 'RETICULUM']);
  });

  it('keeps an unrecognised scope rather than dropping it', () => {
    // A scope this build predates is still an address a later build can dial. Silently
    // discarding it would make the client lose reach as the network gains it.
    const sorted = sortByScope([endpoint('SATELLITE'), endpoint('LAN')]);
    expect(sorted.map((item) => item.scope)).toEqual(['LAN', 'SATELLITE']);
  });

  it('does not mutate its input', () => {
    const input = [endpoint('GLOBAL'), endpoint('LAN')];
    sortByScope(input);
    expect(input.map((item) => item.scope)).toEqual(['GLOBAL', 'LAN']);
  });
});

describe('federation strings', () => {
  it('ships every trust and reach label in Bangla as well as English', () => {
    const keys = [
      'federatedNodes',
      'noPeers',
      'noPeersBody',
      'trustProbation',
      'trustNormal',
      'trustTrusted',
      'trustUnknown',
      'vouches',
      'logSize',
      'peerAlerts',
      'reachLan',
      'reachIspLocal',
      'reachNational',
      'reachGlobal',
      'reachMesh',
      'reachReticulum',
    ] as const;

    // Bangla is not a translation layer added at the end. A missing string here would
    // render as a raw key to the people this system is primarily for, and an English
    // fallback would read as a bug rather than as a translation.
    //
    // `String(...)` widens the literal types on purpose: TypeScript can already prove
    // these two unions are disjoint, which is a stronger guarantee than the assertion —
    // but it makes the comparison a compile error rather than a test. The runtime check
    // stays so that a string added later, before it is translated, still fails here.
    const missing = keys.filter((key) => !messages.bn[key]);
    const untranslated = keys.filter(
      (key) => String(messages.bn[key]) === String(messages.en[key]),
    );
    expect({ missing, untranslated }).toEqual({ missing: [], untranslated: [] });
  });

  it('interpolates counts in both locales', () => {
    expect(translate('en', 'vouches', { count: '3' })).toContain('3');
    expect(translate('bn', 'vouches', { count: '3' })).toContain('3');
    expect(translate('bn', 'logSize', { count: '42' })).toContain('42');
  });
});
