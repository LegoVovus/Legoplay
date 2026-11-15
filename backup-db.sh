#!/bin/bash
# Nightly database backup with local rotation + optional offsite git push.
set -euo pipefail

BACKUP_DIR=/home/ubuntu/backups
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# Read credentials straight from the app env file (no duplication of secrets).
# The env file is not shell-safe (some values contain spaces), so parse only
# the keys we need instead of sourcing the whole file.
envval() {
  sed -n "s/^$1=//p" /home/ubuntu/legoplay/website/.env | tail -1 | sed 's/^"\(.*\)"$/\1/'
}

POSTGRES_USER=$(envval POSTGRES_USER)
POSTGRES_PASSWORD=$(envval POSTGRES_PASSWORD)
POSTGRES_DB=$(envval POSTGRES_DB)
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-postgres}

FILE="$BACKUP_DIR/legoplay-$STAMP.sql.gz"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" legoplay-postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists \
  | gzip -9 > "$FILE"

# Keep file readable only by owner (contains user data)
chmod 600 "$FILE"
echo "[backup] wrote $FILE ($(du -h "$FILE" | cut -f1))"

# Rotate local copies
find "$BACKUP_DIR" -name 'legoplay-*.sql.gz' -type f -mtime +$KEEP_DAYS -delete

# Optional offsite copy: set BACKUP_GIT_REMOTE in /home/ubuntu/.backup-env, e.g.
#   BACKUP_GIT_REMOTE=https://<token>@github.com/<user>/<private-repo>.git
if [ -f /home/ubuntu/.backup-env ]; then
  . /home/ubuntu/.backup-env
fi

if [ -n "${BACKUP_GIT_REMOTE:-}" ]; then
  GIT_DIR_LOCAL=/home/ubuntu/backups-repo
  if [ ! -d "$GIT_DIR_LOCAL/.git" ]; then
    git clone --depth 1 "$BACKUP_GIT_REMOTE" "$GIT_DIR_LOCAL"
  fi
  cp "$FILE" "$GIT_DIR_LOCAL/"
  # Keep the offsite repo small too: drop copies older than KEEP_DAYS
  find "$GIT_DIR_LOCAL" -maxdepth 1 -name 'legoplay-*.sql.gz' -mtime +$KEEP_DAYS -delete
  cd "$GIT_DIR_LOCAL"
  git add -A
  if ! git diff --cached --quiet; then
    git -c user.name="Legoplay Backup" -c user.email="backup@legoplay.local" \
      commit -m "backup $STAMP" >/dev/null
    git push origin HEAD >/dev/null 2>&1 && echo "[backup] pushed to offsite repo"
  fi
fi
