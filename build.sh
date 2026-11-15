#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building LegoPlay images..."
docker compose build

echo "==> Starting services..."
docker compose up -d --remove-orphans

echo "==> Container status:"
docker compose ps

echo "==> Done. Run deploy/init-db.sh once on a fresh database."
