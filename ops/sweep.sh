#!/usr/bin/env bash
# Parameter sweeps for the propagation experiment.
#
#   ./ops/sweep.sh
#
# Two sweeps, because they answer different questions and one cannot substitute for the other.
#
#   A. NODE COUNT at a fixed drain interval. Does latency grow linearly in hop count, and does
#      delivery stay lossless as the chain gets longer? This is the sweep the venue's own
#      networking papers all run, and n=2 is below every one of them.
#
#   B. DRAIN INTERVAL at a fixed node count. The per-hop cost was predicted as `drain/2 + fixed`
#      and previously confirmed at only TWO operating points, which is a line through two dots,
#      not a model. Four points let the residual be fitted and reported with its spread.
#
# Every run tears the stack down with `-v` first, so no run inherits another's database. The
# results are appended as CSV to ops/results/sweep.csv.

set -uo pipefail
cd "$(dirname "$0")/.."

OUT=ops/results/sweep.csv
mkdir -p ops/results
[ -f "$OUT" ] || echo "sweep,nodes,drain_ms,samples,hop,n,p50_ms,p95_ms,p99_ms,min_ms,max_ms,marginal_ms" > "$OUT"

SAMPLES=${SAMPLES:-100}

run_one() {
  local sweep=$1 nodes=$2 drain=$3
  echo
  echo "=============================================================="
  echo " $sweep — nodes=$nodes drain=${drain}ms samples=$SAMPLES"
  echo "=============================================================="

  docker compose -f ops/scale-compose.generated.yml down -v >/dev/null 2>&1

  if ! JB_DRAIN_MS="$drain" pnpm scale:gen "$nodes" >/dev/null 2>&1; then
    echo "  gen FAILED"; return 1
  fi
  if ! docker compose -f ops/scale-compose.generated.yml up -d --build --wait >/dev/null 2>&1; then
    echo "  up FAILED"; return 1
  fi

  # Let peering and directory exchange settle before publishing, or the first samples
  # measure handshake rather than propagation.
  sleep 25

  if ! pnpm scale:measure -- --nodes="$nodes" --samples="$SAMPLES" 2>&1 | tail -25; then
    echo "  measure FAILED"; return 1
  fi

  # scale-measure writes the per-hop summary; fold it into the sweep file with its parameters.
  if [ -f ops/results/scale-latency-summary.csv ]; then
    tail -n +2 ops/results/scale-latency-summary.csv \
      | awk -v s="$sweep" -v n="$nodes" -v d="$drain" -v m="$SAMPLES" \
            -F, '{print s","n","d","m","$0}' >> "$OUT"
    echo "  -> folded into $OUT"
  fi
}

echo "### Sweep A — node count (drain fixed at 500 ms)"
for n in 2 4 8 12; do run_one nodecount "$n" 500; done

echo
echo "### Sweep B — drain interval (nodes fixed at 4)"
for d in 250 500 1000 2000; do run_one drain 4 "$d"; done

docker compose -f ops/scale-compose.generated.yml down -v >/dev/null 2>&1

echo
echo "=============================================================="
echo " sweep complete -> $OUT ($(( $(wc -l < "$OUT") - 1 )) rows)"
echo "=============================================================="
