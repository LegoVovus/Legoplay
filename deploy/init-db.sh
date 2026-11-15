#!/usr/bin/env bash
# Initializes the LegoPlay database exactly once. Safe to run repeatedly.
set -euo pipefail
cd "$(dirname "$0")/.."

USER_NAME="legoplay"
DB_NAME="legoplay"

echo "==> Waiting for PostgreSQL..."
for i in $(seq 1 60); do
	if docker compose exec -T postgres pg_isready -U "$USER_NAME" -d "$DB_NAME" >/dev/null 2>&1; then
		break
	fi
	sleep 2
done

if docker compose exec -T postgres psql -U "$USER_NAME" -d "$DB_NAME" -tAc \
	"SELECT to_regclass('public.user')" | grep -q user; then
	echo "==> Database already initialized."
	exit 0
fi

echo "==> Applying schema migrations..."
cat website/drizzle/*.sql | docker compose exec -T postgres \
	psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d "$DB_NAME"

echo "==> Database initialized."
