#!/bin/sh
set -e

echo "[frag-arc] ======================================="
echo "[frag-arc] FragArc Production Container Starting"
echo "[frag-arc] ======================================="

# If an explicit command was passed (e.g., migrate container running node migrate.mjs)
if [ "$#" -gt 0 ]; then
  echo "[frag-arc] Running custom command: $@"
  exec "$@"
fi

# Default server startup flow: ensure migrations run before launching Next.js
if [ -n "$DATABASE_URL" ]; then
  echo "[frag-arc] DATABASE_URL detected. Running migration checks..."
  if [ -f "/app/apps/web/migrate.mjs" ]; then
    node /app/apps/web/migrate.mjs
  elif [ -f "./migrate.mjs" ]; then
    node ./migrate.mjs
  elif [ -f "/app/migrate.mjs" ]; then
    node /app/migrate.mjs
  else
    echo "[frag-arc] WARNING: migrate.mjs not found in expected paths, skipping."
  fi
else
  echo "[frag-arc] WARNING: DATABASE_URL not set. Skipping migration."
fi

echo "[frag-arc] Launching Next.js server on port ${PORT:-3001}..."
exec node --import varlock/auto-load server.js
