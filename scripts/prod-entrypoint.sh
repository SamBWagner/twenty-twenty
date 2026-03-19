#!/bin/sh
set -e

echo "Running database migrations..."
cd /app
node packages/api/dist/migrate.js

echo "Starting API server..."
node packages/api/dist/index.js &
API_PID=$!

echo "Starting web server..."
HOST=0.0.0.0 PORT=4321 node packages/web/dist/server/entry.mjs &
WEB_PID=$!

echo "Starting Caddy reverse proxy..."
caddy run --config /etc/caddy/Caddyfile &
CADDY_PID=$!

echo "All services started"

cleanup() {
  kill $API_PID $WEB_PID $CADDY_PID 2>/dev/null || true
}

trap cleanup INT TERM EXIT

# Debian slim uses /bin/sh without `wait -n`, so poll until one child exits.
while :; do
  for pid in "$API_PID" "$WEB_PID" "$CADDY_PID"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      if wait "$pid"; then
        EXIT_CODE=0
      else
        EXIT_CODE=$?
      fi
      exit "$EXIT_CODE"
    fi
  done
  sleep 1
done
