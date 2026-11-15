#!/bin/bash
# Deploy prebuilt images from GHCR. No build happens on this server.
set -euo pipefail
cd /home/ubuntu/legoplay

echo "[deploy] pulling latest code (compose/env only)"
git fetch origin main --quiet && git reset --hard origin/main

echo "[deploy] pulling images"
docker compose pull app websocket

echo "[deploy] recreating containers"
docker compose up -d app websocket

echo "[deploy] waiting for health"
for i in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' legoplay-app-1 2>/dev/null || echo unknown)
  if [ "$status" = "healthy" ]; then break; fi
  sleep 5
done
docker ps --format '{{.Names}} {{.Status}}'

echo "[deploy] cleaning old images"
docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true

echo "[deploy] site check"
curl -s -o /dev/null -w "local:%{http_code} time:%{time_total}\n" http://127.0.0.1:5906/
