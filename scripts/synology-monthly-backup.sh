#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-395}"
backup_day="${BACKUP_DAY_OF_MONTH:-1}"
check_interval_seconds="${BACKUP_CHECK_INTERVAL_SECONDS:-43200}"

mkdir -p "$backup_dir"

while true; do
  current_day="$(date +%d | sed 's/^0//')"
  current_month="$(date +%Y-%m)"
  marker_file="$backup_dir/.last-monthly-backup"
  last_month=""

  if [ -f "$marker_file" ]; then
    last_month="$(cat "$marker_file" || true)"
  fi

  # Run once for each calendar month, on or after the configured day.
  if [ "$current_day" -ge "$backup_day" ] && [ "$last_month" != "$current_month" ]; then
    timestamp="$(date +%Y%m%d-%H%M%S)"
    safe_database="$(printf "%s" "$PGDATABASE" | tr -c 'A-Za-z0-9_.-' '_')"
    backup_file="$backup_dir/inventory-$safe_database-$timestamp.dump"
    manifest_file="$backup_dir/inventory-$safe_database-$timestamp.json"

    pg_dump \
      --host "$PGHOST" \
      --port "${PGPORT:-5432}" \
      --username "$PGUSER" \
      --format custom \
      --compress 9 \
      --no-owner \
      --no-acl \
      --file "$backup_file" \
      "$PGDATABASE"

    bytes="$(wc -c < "$backup_file" | tr -d ' ')"
    created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    cat > "$manifest_file" <<EOF
{
  "database": "$PGDATABASE",
  "host": "$PGHOST",
  "port": ${PGPORT:-5432},
  "user": "$PGUSER",
  "createdAt": "$created_at",
  "file": "$backup_file",
  "bytes": $bytes,
  "format": "pg_dump custom"
}
EOF

    printf "%s" "$current_month" > "$marker_file"

    if [ "$retention_days" -gt 0 ]; then
      find "$backup_dir" -type f \( -name "inventory-$safe_database-*.dump" -o -name "inventory-$safe_database-*.json" \) -mtime +"$retention_days" -delete
    fi

    echo "Monthly PostgreSQL backup created: $backup_file"
  fi

  sleep "$check_interval_seconds"
done
