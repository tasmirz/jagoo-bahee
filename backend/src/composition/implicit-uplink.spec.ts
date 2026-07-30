/**
 * TP-20 — a node must not claim a narrow scope it never measured.
 *
 * The reported defect: a stock node told every client "Same network — Only this local
 * network. Nothing you post leaves this building yet." while publishing to the internet.
 *
 * The chain was: `IMPLICIT_UPLINK` declared every scope including `LAN`; the default probe
 * config has no targets; `probeUplink` marks an unmeasurable scope reachable (correctly — a
 * scope with no target must not decay to false); `currentScope()` returns the NARROWEST live
 * scope; `LAN` is the narrowest, so it won by default and by assumption.
 *
 * Every link in that chain is individually defensible, which is why it survived review. The
 * fix is at the only point where the asymmetry matters: an over-claimed WIDE scope is
 * corrected by the next failed send, while an under-claimed narrow scope silently misinforms
 * the person deciding whether it is safe to post, and nothing ever corrects it.
 */

import { describe, expect, it } from 'vitest';
import { ReachabilityScope } from '../core/ports/network.port.js';
import { IMPLICIT_UPLINK, parseUplinks } from './transport.config.js';

describe('the implicit uplink (TP-20)', () => {
  it('does not claim LAN without evidence', () => {
    expect(IMPLICIT_UPLINK.declaredScopes).not.toContain(ReachabilityScope.LAN);
  });

  /**
   * The other half of the gate. Asserting only the absence of LAN would also pass for an
   * uplink that declares nothing at all, which would leave a default node with no path.
   */
  it('still assumes the wide scopes, so a default node is not left unreachable', () => {
    expect(IMPLICIT_UPLINK.declaredScopes).toEqual(
      expect.arrayContaining([
        ReachabilityScope.ISP_LOCAL,
        ReachabilityScope.NATIONAL,
        ReachabilityScope.GLOBAL,
      ]),
    );
  });

  it('leaves LAN available to an operator who declares it explicitly', () => {
    const parsed = parseUplinks('lan-only|192.168.1.10|0||LAN|8444|1');
    expect(parsed[0]?.declaredScopes).toContain(ReachabilityScope.LAN);
  });
});
