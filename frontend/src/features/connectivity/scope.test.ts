/**
 * TP-20 — the pill describes the client↔node LINK, and an assumed scope says so.
 *
 * Two defects are pinned here. The client used to render the node's own onward reach as
 * though it were the link, so a phone on the far side of the internet read "Same network —
 * nothing you post leaves this building yet". And `measured` was sent by the node on every
 * response and dropped by the parser, so a scope nothing had ever probed was presented with
 * the confidence of one that had.
 */

import { parseScopeStatus, linkTone } from './scope';
import { scopeDisplay } from './scope-indicator';

const wire = (overrides: Record<string, unknown> = {}) => ({
  link: 'GLOBAL',
  linkBasis: 'public-address',
  scope: 'LAN',
  label: 'Local network',
  measured: false,
  uplinksUp: 1,
  uplinksTotal: 1,
  bridging: false,
  refreshAfterMs: 15_000,
  asOfMs: 1_700_000_000_000,
  ...overrides,
});

describe('parseScopeStatus', () => {
  it('keeps the link and the node reach as separate facts', () => {
    const status = parseScopeStatus(wire());
    expect(status).toMatchObject({ link: 'GLOBAL', scope: 'LAN' });
  });

  it('keeps `measured` instead of discarding it', () => {
    expect(parseScopeStatus(wire())?.measured).toBe(false);
    expect(parseScopeStatus(wire({ measured: true }))?.measured).toBe(true);
  });

  it('reads UNKNOWN from a node too old to report a link, never inferring it from scope', () => {
    const legacy = wire();
    delete (legacy as Record<string, unknown>).link;
    const status = parseScopeStatus(legacy);
    // The node's scope here is LAN. Inferring the link from it is the exact defect.
    expect(status?.scope).toBe('LAN');
    expect(status?.link).toBe('UNKNOWN');
  });

  it('rejects a link value it does not recognise', () => {
    expect(parseScopeStatus(wire({ link: 'SAME_BUILDING' }))?.link).toBe('UNKNOWN');
  });
});

describe('scopeDisplay drives the pill from the link', () => {
  it('does not say "same network" to a caller reached over the internet', () => {
    const status = parseScopeStatus(wire());
    const display = scopeDisplay(status, 'en');
    expect(display?.label).toBe('Over the internet');
    expect(display?.label).not.toBe('Same network');
  });

  it('says "same network" only when the node observed a shared subnet', () => {
    const status = parseScopeStatus(wire({ link: 'LAN', linkBasis: 'shared-subnet' }));
    expect(scopeDisplay(status, 'en')?.label).toBe('Same network');
  });

  it('has a Bangla label for every link state', () => {
    for (const link of ['LAN', 'ISP_LOCAL', 'GLOBAL', 'UNKNOWN']) {
      const display = scopeDisplay(parseScopeStatus(wire({ link })), 'bn');
      expect(display?.label).toBeTruthy();
      expect(display?.consequence).toBeTruthy();
    }
  });
});

describe('linkTone', () => {
  it('treats a LAN link as the contained case, matching scopeTone’s reasoning', () => {
    expect(linkTone('LAN')).toBe('critical');
    expect(linkTone('GLOBAL')).toBe('ok');
    expect(linkTone('UNKNOWN')).toBe('limited');
  });
});
