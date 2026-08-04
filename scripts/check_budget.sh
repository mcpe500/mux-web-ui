#!/usr/bin/env bash
set -e

echo "=== Mux Web UI Budget & Metric Verification ==="

BINARY="target/release/mux-web"
if [ ! -f "$BINARY" ]; then
  echo "Error: Binary $BINARY not found. Build release first."
  exit 1
fi

# 1. Raw & Compressed Binary Size (PERF-001)
SIZE_BYTES=$(stat -c%s "$BINARY" 2>/dev/null || stat -f%z "$BINARY")
SIZE_MIB=$(python3 -c "print(f'{$SIZE_BYTES / 1024 / 1024:.2f}')")

GZIP_BYTES=$(gzip -c "$BINARY" | wc -c)
GZIP_MIB=$(python3 -c "print(f'{$GZIP_BYTES / 1024 / 1024:.2f}')")

echo "Binary Raw Size: ${SIZE_MIB} MiB (${SIZE_BYTES} bytes)"
echo "Binary Compressed (gzip) Size: ${GZIP_MIB} MiB (${GZIP_BYTES} bytes)"

# Target check: <= 10 MiB target, <= 50 MiB hard limit
if (( $(echo "$GZIP_MIB <= 50.0" | bc -l) )); then
  echo "✅ Binary compressed size PASSES hard limit <= 50 MiB"
else
  echo "❌ Binary compressed size EXCEEDS hard limit <= 50 MiB"
  exit 1
fi

# 2. Frontend Assets Size (PERF-002)
JS_GZIP=$(gzip -c web/dist/assets/*.js 2>/dev/null | wc -c || echo 0)
CSS_GZIP=$(gzip -c web/dist/assets/*.css 2>/dev/null | wc -c || echo 0)
HTML_GZIP=$(gzip -c web/dist/index.html 2>/dev/null | wc -c || echo 0)

FRONTEND_GZIP=$((JS_GZIP + CSS_GZIP + HTML_GZIP))
FRONTEND_KIB=$(python3 -c "print(f'{$FRONTEND_GZIP / 1024:.2f}')")

echo "Frontend Gzip Size: ${FRONTEND_KIB} KiB (${FRONTEND_GZIP} bytes)"

if (( $(echo "$FRONTEND_KIB <= 750.0" | bc -l) )); then
  echo "✅ Frontend gzip size PASSES budget <= 750 KiB"
else
  echo "❌ Frontend gzip size EXCEEDS budget <= 750 KiB"
  exit 1
fi

echo "=== All Budget Verification Checks PASSED ==="
