#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/api
npx drizzle-kit migrate

echo "Starting API server (via tsx)..."
HOST=0.0.0.0 npx tsx src/index.ts &
API_PID=$!

echo "Starting web server..."
cd /app/packages/web
HOST=0.0.0.0 node ./dist/server/entry.mjs &
WEB_PID=$!

# Wait for both servers to be ready
echo "Waiting for servers..."
for i in $(seq 1 30); do
  if node -e "fetch('http://localhost:3001/api/health').then(r => { if(r.ok) process.exit(0); process.exit(1); }).catch(() => process.exit(1))" 2>/dev/null; then
    echo "API server ready"
    break
  fi
  sleep 1
done

for i in $(seq 1 30); do
  if node -e "fetch('http://localhost:4321').then(r => process.exit(0)).catch(() => process.exit(1))" 2>/dev/null; then
    echo "Web server ready"
    break
  fi
  sleep 1
done

echo "All servers running"

# Keep container alive — wait for either process to exit
wait $API_PID $WEB_PID
