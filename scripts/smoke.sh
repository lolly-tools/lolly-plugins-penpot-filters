#!/usr/bin/env bash
# Bundle and run the headless mount smoke test. Needs `npm run build` first —
# it reads the tools out of dist/tools/, which is where the panel finds them too.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
LOLLY="${LOLLY_DIR:-$ROOT/../lolly}"
OUT="$ROOT/node_modules/.cache/smoke.mjs"

mkdir -p "$(dirname "$OUT")"

npx esbuild "$HERE/smoke-entry.ts" \
  --bundle --format=esm --platform=node --target=node20 \
  --outfile="$OUT" \
  --alias:@engine="$LOLLY/engine/src" \
  --alias:@lolly-tools/core/host-v1="$LOLLY/packages/core/src/host-v1.ts" \
  --alias:@lolly-tools/core="$LOLLY/packages/core/src/index.ts" \
  --loader:.json=json \
  --log-level=warning

TOOLS_DIR="$ROOT/dist/tools" node "$OUT"
