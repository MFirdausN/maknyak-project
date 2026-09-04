#!/usr/bin/env bash
set -euo pipefail

compose_port() {
  docker compose port "$1" "$2" | awk -F: 'END { print $NF }'
}

json_field() {
  local field="$1"
  node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const value = JSON.parse(input)[process.argv[1]]; if (value !== undefined && value !== null) process.stdout.write(String(value)); });' "$field"
}

oidc_token() {
  local username="$1"
  local password="$2"
  curl --fail --silent --show-error \
    --request POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" \
    --header "content-type: application/x-www-form-urlencoded" \
    --data-urlencode "client_id=maknyak-cli" \
    --data-urlencode "username=${username}" \
    --data-urlencode "password=${password}" \
    --data-urlencode "grant_type=password" | json_field access_token
}

jwt_subject() {
  node -e 'const payload = process.argv[1].split(".")[1]; if (!payload) process.exit(1); process.stdout.write(JSON.parse(Buffer.from(payload, "base64url").toString()).sub);' "$1"
}

request() {
  local token="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local args=(--silent --show-error --request "$method" --header "authorization: Bearer ${token}" --header "x-request-id: phase1-tenancy-test")
  if [[ -n "$body" ]]; then
    args+=(--header "content-type: application/json" --data "$body")
  fi
  curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"
}

status() {
  local token="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local args=(--silent --output /dev/null --write-out '%{http_code}' --request "$method" --header "authorization: Bearer ${token}")
  if [[ -n "$body" ]]; then
    args+=(--header "content-type: application/json" --data "$body")
  fi
  curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"
}

gateway_port="$(compose_port gateway 3000)"
keycloak_port="$(compose_port keycloak 8080)"

owner_token="$(oidc_token "${SMOKE_USERNAME:-developer}" "${SMOKE_PASSWORD:-maknyak-dev}")"
collaborator_token="$(oidc_token "${PHASE1_USERNAME:-collaborator}" "${PHASE1_PASSWORD:-maknyak-collaborator}")"
[[ -n "$owner_token" && -n "$collaborator_token" ]] || { echo "OIDC token setup failed" >&2; exit 1; }

suffix="$(date +%s)-${RANDOM}"
workspace="$(request "$owner_token" POST /workspaces "{\"slug\":\"phase1-${suffix}\",\"name\":\"Phase 1 Tenant Test\"}")"
workspace_id="$(json_field id <<<"$workspace")"
[[ -n "$workspace_id" ]] || { echo "workspace creation failed: ${workspace}" >&2; exit 1; }

[[ "$(status "$collaborator_token" GET "/workspaces/${workspace_id}")" == "404" ]] || {
  echo "tenant isolation failed before membership" >&2
  exit 1
}
echo "ok: unrelated principal cannot read another tenant"

invitation="$(request "$owner_token" POST "/workspaces/${workspace_id}/invitations" '{"email":"collaborator@maknyak.local","role":"viewer"}')"
invitation_token="$(json_field token <<<"$invitation")"
[[ -n "$invitation_token" ]] || { echo "invitation creation failed: ${invitation}" >&2; exit 1; }

accepted="$(request "$collaborator_token" POST /workspaces/invitations/accept "{\"token\":\"${invitation_token}\"}")"
[[ "$(json_field role <<<"$accepted")" == "viewer" ]] || { echo "invitation acceptance failed: ${accepted}" >&2; exit 1; }
echo "ok: email-bound invitation creates viewer membership"

[[ "$(status "$collaborator_token" GET "/workspaces/${workspace_id}/audit")" == "403" ]] || {
  echo "viewer unexpectedly read the audit log" >&2
  exit 1
}

[[ "$(status "$collaborator_token" GET "/workspaces/${workspace_id}")" == "200" ]] || {
  echo "viewer cannot read its workspace" >&2
  exit 1
}
[[ "$(status "$collaborator_token" POST "/workspaces/${workspace_id}/projects" '{"name":"Forbidden project"}')" == "403" ]] || {
  echo "viewer unexpectedly created a project" >&2
  exit 1
}
echo "ok: viewer can read but cannot create projects"

collaborator_id="$(jwt_subject "$collaborator_token")"
owner_id="$(jwt_subject "$owner_token")"
updated="$(request "$owner_token" PATCH "/workspaces/${workspace_id}/members/${collaborator_id}" '{"role":"member"}')"
[[ "$(json_field role <<<"$updated")" == "member" ]] || { echo "member role update failed: ${updated}" >&2; exit 1; }
[[ "$(status "$collaborator_token" POST "/workspaces/${workspace_id}/projects" '{"name":"Allowed project"}')" == "201" ]] || {
  echo "member could not create a project" >&2
  exit 1
}
echo "ok: member role permits project creation"

[[ "$(status "$owner_token" PATCH "/workspaces/${workspace_id}/members/${owner_id}" '{"role":"admin"}')" == "409" ]] || {
  echo "last owner protection failed" >&2
  exit 1
}
request "$owner_token" PATCH "/workspaces/${workspace_id}/members/${collaborator_id}" '{"role":"owner"}' >/dev/null
[[ "$(status "$owner_token" PATCH "/workspaces/${workspace_id}/members/${owner_id}" '{"role":"admin"}')" == "200" ]] || {
  echo "owner handover failed" >&2
  exit 1
}
echo "ok: last owner is protected and explicit ownership handover works"

audit_payload="$(request "$owner_token" GET "/workspaces/${workspace_id}/audit")"
audit_api_count="$(node -e 'const value = JSON.parse(process.argv[1]); process.stdout.write(String(value.length));' "$audit_payload")"
[[ "$audit_api_count" -ge 4 ]] || {
  echo "admin audit endpoint returned insufficient evidence: ${audit_api_count}" >&2
  exit 1
}
echo "ok: audit log is restricted to admins and readable through the Gateway"

audit_count="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" --command "SELECT count(*) FROM audit.events WHERE workspace_id = '${workspace_id}';")"
outbox_count="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" --command "SELECT count(*) FROM workspace.outbox WHERE aggregate_id = '${workspace_id}';")"
[[ "$audit_count" -ge 4 && "$outbox_count" -ge 4 ]] || {
  echo "audit/outbox evidence missing: audit=${audit_count}, outbox=${outbox_count}" >&2
  exit 1
}
echo "ok: security-sensitive changes produce audit and outbox records"

for _ in {1..10}; do
  unpublished_count="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" --command "SELECT count(*) FROM workspace.outbox WHERE aggregate_id = '${workspace_id}' AND published_at IS NULL;")"
  [[ "$unpublished_count" == "0" ]] && break
  sleep 1
done
[[ "$unpublished_count" == "0" ]] || {
  echo "outbox publisher did not drain tenant events: unpublished=${unpublished_count}" >&2
  exit 1
}
echo "ok: outbox publisher delivers pending events to NATS"
