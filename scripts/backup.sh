#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

backup_root="${BACKUP_DIR:-${repo_root}/.backups}"
artifact_bucket="${AGENT_ARTIFACT_BUCKET:-maknyak-agent-artifacts}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${timestamp}"
partial_dir="${backup_dir}.partial"

[[ ! -e "$backup_dir" && ! -e "$partial_dir" ]] || {
  echo "Backup target already exists: $backup_dir" >&2
  exit 1
}

umask 077
mkdir -p "$partial_dir/postgres" "$partial_dir/minio"
cleanup() { rm -rf -- "$partial_dir"; }
trap cleanup EXIT

echo "Backing up PostgreSQL..."
docker compose exec -T postgres sh -ceu \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-privileges' \
  >"$partial_dir/postgres/maknyak.dump"

echo "Backing up MinIO bucket ${artifact_bucket}..."
docker compose run --rm --no-deps --entrypoint sh \
  -e "BACKUP_BUCKET=${artifact_bucket}" \
  -v "${partial_dir}:/backup" minio -ceu '
    mc alias set source http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mkdir -p "/backup/minio/$BACKUP_BUCKET"
    mc mirror --overwrite "source/$BACKUP_BUCKET" "/backup/minio/$BACKUP_BUCKET"
  '

(
  cd "$partial_dir"
  while IFS= read -r -d '' file; do sha256sum "$file"; done \
    < <(find postgres minio -type f -print0 | sort -z) >SHA256SUMS
)

cat >"$partial_dir/METADATA" <<EOF
format_version=1
created_at=${timestamp}
artifact_bucket=${artifact_bucket}
EOF

mv "$partial_dir" "$backup_dir"
trap - EXIT
echo "Backup completed: $backup_dir"
