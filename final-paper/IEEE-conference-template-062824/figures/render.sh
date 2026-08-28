#!/usr/bin/env bash
# Render architecture.mmd through mermaid-cli (which uses Chromium) to both SVG and PDF.
# The PDF retains real text because Chromium renders Mermaid's foreignObject HTML.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PUPPETEER_CONFIG="$DIR/puppeteer.json"

# SVG with embedded text (best for HTML / GitHub preview)
node /tmp/mermaid-render/node_modules/@mermaid-js/mermaid-cli/src/cli.js \
  -i "$DIR/architecture.mmd" \
  -o "$DIR/architecture.svg" \
  -b transparent \
  -t neutral \
  -w 1800 \
  -H 1200 \
  -p "$PUPPETEER_CONFIG"

# PDF with real text (for LaTeX inclusion)
node /tmp/mermaid-render/node_modules/@mermaid-js/mermaid-cli/src/cli.js \
  -i "$DIR/architecture.mmd" \
  -o "$DIR/architecture.pdf" \
  -f \
  -w 1800 \
  -H 1200 \
  -p "$PUPPETEER_CONFIG"

echo "rendered:" "$DIR/architecture.svg" "$DIR/architecture.pdf"
