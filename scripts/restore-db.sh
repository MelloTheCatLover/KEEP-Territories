#!/usr/bin/env sh
# Restore DB from a gzipped pg_dump. DESTRUCTIVE — drops and recreates the DB.
# Usage: ./scripts/restore-db.sh backups/db-YYYYMMDD-HHMM.sql.gz
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <path/to/db-XXX.sql.gz>" >&2
  exit 1
fi

dump="$1"
if [ ! -f "$dump" ]; then
  echo "no such file: $dump" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Load DB_NAME / DB_USER from .env
set -a
. ./.env
set +a

echo "Stopping server (DB stays up for restore)..."
docker compose stop server

echo "Dropping and recreating database '$DB_NAME'..."
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

echo "Restoring from $dump..."
gunzip -c "$dump" | docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME"

echo "Starting server..."
docker compose up -d server

echo "Done."
