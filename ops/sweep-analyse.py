# -*- coding: utf-8 -*-
"""
Turn ops/results/sweep.csv into the two claims the paper makes about propagation.

  python ops/sweep-analyse.py

A. NODE COUNT. If per-hop cost is constant, total latency is linear in hop count. Fit
   p50 = slope * hop + intercept per configuration and report R^2. A high R^2 across
   several chain lengths is the evidence that the chain is not hiding a super-linear term.

B. DRAIN INTERVAL. The per-hop cost was predicted as drain/2 + fixed. Two operating points
   cannot distinguish that from any other line, so this fits per-hop against drain over four
   settings and reports the slope (predicted 0.5), the intercept (the protocol's own cost)
   and R^2.

No dependencies beyond the standard library, deliberately: this has to run wherever the
measurements were taken.
"""
import csv
import io
import os
from collections import defaultdict


def linfit(xs, ys):
    """Least squares y = a*x + b, plus R^2. Returns (a, b, r2)."""
    n = len(xs)
    if n < 2:
        return (float('nan'),) * 3
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx == 0:
        return (float('nan'),) * 3
    a = sxy / sxx
    b = my - a * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a * x + b)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot else float('nan')
    return a, b, r2


def main():
    path = os.path.join('ops', 'results', 'sweep.csv')
    rows = list(csv.DictReader(io.open(path, encoding='utf-8')))
    if not rows:
        print('no rows')
        return

    # (sweep, nodes, drain) -> {hop: p50}
    cfg = defaultdict(dict)
    for r in rows:
        key = (r['sweep'], int(r['nodes']), int(r['drain_ms']))
        cfg[key][int(r['hop'])] = float(r['p50_ms'])

    print('=' * 74)
    print('A. NODE COUNT — is latency linear in hop count?')
    print('=' * 74)
    print('%-8s %-9s %10s %12s %11s %8s' % ('nodes', 'drain', 'hops', 'ms/hop', 'intercept', 'R^2'))
    per_hop_at_500 = []
    for (sweep, nodes, drain), hops in sorted(cfg.items()):
        if sweep != 'nodecount':
            continue
        xs = sorted(hops)
        ys = [hops[h] for h in xs]
        a, b, r2 = linfit(xs, ys)
        print('%-8d %-9d %10d %12.1f %11.1f %8.4f' % (nodes, drain, len(xs), a, b, r2))
        if len(xs) >= 2:
            per_hop_at_500.append((nodes, a))
    if len(per_hop_at_500) >= 2:
        vals = [a for _, a in per_hop_at_500]
        print('\n  per-hop slope across chain lengths: min %.1f  max %.1f  spread %.1f ms'
              % (min(vals), max(vals), max(vals) - min(vals)))
        print('  -> a flat slope across chain length means hop cost does not grow with chain length.')

    print()
    print('=' * 74)
    print('B. DRAIN INTERVAL — does per-hop cost follow drain/2 + fixed?')
    print('=' * 74)
    print('%-10s %10s %12s %14s' % ('drain ms', 'hops', 'total p50', 'per hop ms'))
    xs, ys = [], []
    for (sweep, nodes, drain), hops in sorted(cfg.items(), key=lambda kv: kv[0][2]):
        if sweep != 'drain':
            continue
        top = max(hops)
        per = hops[top] / top
        print('%-10d %10d %12.0f %14.1f' % (drain, top, hops[top], per))
        xs.append(drain)
        ys.append(per)
    if len(xs) >= 2:
        a, b, r2 = linfit(xs, ys)
        print('\n  fit: per_hop = %.4f * drain + %.1f ms   (R^2 = %.4f)' % (a, b, r2))
        print('  predicted slope 0.5 (a uniformly distributed wait for the next drain tick)')
        print('  intercept = the protocol cost itself: verify, project, witness-append, re-enqueue')


if __name__ == '__main__':
    main()
