#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

backup_dir="${1:-}"
[[ -n "$backup_dir" ]] || { echo "Usage: $0 <backup-directory>" >&2; exit 2; }
backup_dir="$(realpath "$backup_dir")"
[[ -f "$backup_dir/METADATA" && -f "$backup_dir/SHA256SUMS" && -f "$backup_dir/postgres/maknyak.dump" ]] || {
  echo "Backup is incomplete: $backup_dir" >&2
  exit 1
}

artifact_bucket="$(sed -n 's/^artifact_bucket=//p' "$backup_dir/METADATA")"
[[ "$artifact_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || {
  echo "Invalid artifact bucket in backup metadata" >&2
  exit 1
}

echo "Verifying backup checksums..."
(cd "$backup_dir" && sha256sum --check --strict SHA256SUMS)

suffix="$(date -u +%Y%m%d%H%M%S)-${RANDOM}"
restore_db="maknyak_restore_${suffix//-/_}"
restore_bucket="maknyak-restore-${suffix,,}"
db_created=false
bucket_created=false

cleanup() {
  if [[ "$bucket_created" == true ]]; then
    docker compose run --rm --no-deps --entrypoint sh \
      -e "RESTORE_BUCKET=${restore_bucket}" minio -ceu '
        mc alias set target http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
        mc rb --force "target/$RESTORE_BUCKET" >/dev/null
      ' || true
  fi
  if [[ "$db_created" == true ]]; then
    docker compose exec -T -e "RESTORE_DB=${restore_db}" postgres sh -ceu \
      'dropdb -U "$POSTGRES_USER" --if-exists "$RESTORE_DB"' || true
  fi
}
trap cleanup EXIT

echo "Restoring PostgreSQL into isolated database ${restore_db}..."
db_created=true
docker compose exec -T -e "RESTORE_DB=${restore_db}" postgres sh -ceu \
  'createdb -U "$POSTGRES_USER" "$RESTORE_DB"'
docker compose exec -T -e "RESTORE_DB=${restore_db}" postgres sh -ceu \
  'exec pg_restore -U "$POSTGRES_USER" -d "$RESTORE_DB" --no-owner --no-privileges --exit-on-error' \
  <"$backup_dir/postgres/maknyak.dump"
migration_count="$(docker compose exec -T -e "RESTORE_DB=${restore_db}" postgres sh -ceu \
  'psql -U "$POSTGRES_USER" -d "$RESTORE_DB" --tuples-only --no-align -c "SELECT count(*) FROM platform.schema_migrations"')"
[[ "$migration_count" =~ ^[1-9][0-9]*$ ]] || { echo "Restored migration ledger is empty" >&2; exit 1; }

echo "Restoring MinIO into isolated bucket ${restore_bucket}..."
bucket_created=true
docker compose run --rm --no-deps --entrypoint sh \
  -e "SOURCE_BUCKET=${artifact_bucket}" -e "RESTORE_BUCKET=${restore_bucket}" \
  -v "${backup_dir}:/backup:ro" minio -ceu '
    mc alias set target http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mb "target/$RESTORE_BUCKET" >/dev/null
    mc mirror --overwrite "/backup/minio/$SOURCE_BUCKET" "target/$RESTORE_BUCKET"
    mc diff "/backup/minio/$SOURCE_BUCKET" "target/$RESTORE_BUCKET"
  '

echo "Restore drill passed: ${migration_count} migrations and MinIO objects verified."
