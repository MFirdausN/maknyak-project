#!/bin/sh
set -eu

psql --set ON_ERROR_STOP=1 \
  --variable="identity_user=$IDENTITY_DB_USER" \
  --variable="identity_password=$IDENTITY_DB_PASSWORD" \
  --variable="workspace_user=$WORKSPACE_DB_USER" \
  --variable="workspace_password=$WORKSPACE_DB_PASSWORD" \
  --variable="keycloak_user=$KEYCLOAK_DB_USER" \
  --variable="keycloak_password=$KEYCLOAK_DB_PASSWORD" <<'SQL'
CREATE SCHEMA IF NOT EXISTS platform;
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'identity_user', :'identity_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'identity_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'identity_user', :'identity_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'workspace_user', :'workspace_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'workspace_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'workspace_user', :'workspace_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'keycloak_user', :'keycloak_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'keycloak_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'keycloak_user', :'keycloak_password') \gexec
SQL

for file in /migrations/*.sql; do
  version="$(basename "$file")"
  checksum="$(sha256sum "$file" | awk '{ print $1 }')"
  applied_checksum="$(psql --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --variable="version=$version" <<'SQL'
SELECT checksum FROM platform.schema_migrations WHERE version = :'version';
SQL
)"

  if [ -n "$applied_checksum" ]; then
    if [ "$applied_checksum" != "$checksum" ]; then
      echo "Migration checksum mismatch: $version" >&2
      exit 1
    fi
    echo "Already applied: $version"
    continue
  fi

  echo "Applying: $version"
  psql --set ON_ERROR_STOP=1 \
    --single-transaction \
    --variable="version=$version" \
    --variable="checksum=$checksum" \
    --file "$file" \
    --file - <<'SQL'
INSERT INTO platform.schema_migrations (version, checksum) VALUES (:'version', :'checksum');
SQL
done

psql --set ON_ERROR_STOP=1 \
  --variable="identity_user=$IDENTITY_DB_USER" \
  --variable="workspace_user=$WORKSPACE_DB_USER" \
  --variable="keycloak_user=$KEYCLOAK_DB_USER" <<'SQL'
SELECT format('GRANT USAGE ON SCHEMA identity TO %I', :'identity_user') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO %I', :'identity_user') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity TO %I', :'identity_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA workspace TO %I', :'workspace_user') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA workspace TO %I', :'workspace_user') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA workspace TO %I', :'workspace_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA audit TO %I', :'workspace_user') \gexec
SELECT format('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO %I', :'workspace_user') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO %I', :'workspace_user') \gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA keycloak TO %I', :'keycloak_user') \gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA keycloak TO %I', :'keycloak_user') \gexec
SELECT format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA keycloak TO %I', :'keycloak_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'identity_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'workspace_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'keycloak_user') \gexec
SQL
