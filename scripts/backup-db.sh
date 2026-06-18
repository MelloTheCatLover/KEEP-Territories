#!/usr/bin/env sh
# Manual one-shot DB dump (the db-backup container does this nightly).
# Usage: ./scripts/backup-db.sh
set -eu

cd "$(dirname "$0")/.."

mkdir -p backups
ts=$(date +%Y%m%d-%H%M)
out="backups/db-${ts}.sql.gz"

docker compose exec -T db-backup sh -c 'pg_dump --no-owner --no-privileges | gzip -9' > "$out"
echo "wrote $out ($(du -h "$out" | cut -f1))"
