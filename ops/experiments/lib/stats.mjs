/**
 * Deterministic descriptive statistics and bootstrap confidence intervals
 * for reviewer experiment outputs.
 */

export function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function makeRng(seed = 20260831) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMedianCi95(values, resamples = 10_000, seed = 20260831) {
  if (values.length === 0) return [null, null];
  if (values.length === 1) return [values[0], values[0]];
  const rng = makeRng(seed);
  const n = values.length;
  const medians = new Array(resamples);
  const sample = new Array(n);
  for (let r = 0; r < resamples; r += 1) {
    for (let i = 0; i < n; i += 1) {
      sample[i] = values[Math.floor(rng() * n)];
    }
    sample.sort((a, b) => a - b);
    medians[r] = quantile(sample, 0.5);
  }
  medians.sort((a, b) => a - b);
  return [
    round3(quantile(medians, 0.025)),
    round3(quantile(medians, 0.975)),
  ];
}

export function round3(v) {
  return v === null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000;
}

export function summarize(values, attempted = values.length) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return {
      attempted,
      delivered: 0,
      deliveryRate: attempted > 0 ? 0 : null,
      min: null,
      p25: null,
      median: null,
      mean: null,
      sd: null,
      iqr: null,
      p75: null,
      p95: null,
      p99: null,
      max: null,
      medianCi95: [null, null],
    };
  }
  const mean = sorted.reduce((acc, x) => acc + x, 0) / n;
  const variance =
    n > 1 ? sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1) : 0;
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  return {
    attempted,
    delivered: n,
    deliveryRate: round3(n / attempted),
    min: round3(sorted[0]),
    p25: round3(p25),
    median: round3(quantile(sorted, 0.5)),
    mean: round3(mean),
    sd: round3(Math.sqrt(variance)),
    iqr: round3(p75 - p25),
    p75: round3(p75),
    p95: round3(quantile(sorted, 0.95)),
    p99: round3(quantile(sorted, 0.99)),
    max: round3(sorted[n - 1]),
    medianCi95: bootstrapMedianCi95(sorted),
  };
}
