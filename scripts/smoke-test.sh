#!/usr/bin/env bash
set -euo pipefail

compose_port() {
  docker compose port "$1" "$2" | awk -F: 'END { print $NF }'
}

assert_health() {
  local service="$1"
  local port="$2"
  local body
  body="$(curl --fail --silent --show-error "http://localhost:${port}/api/v1/health/ready")"
  if [[ "$body" != *'"status":"ok"'* ]]; then
    echo "${service} health response is not ok: ${body}" >&2
    exit 1
  fi
  echo "ok: ${service} health"
}

gateway_port="$(compose_port gateway 3000)"
identity_port="$(compose_port identity 3001)"
workspace_port="$(compose_port workspace 3002)"
ai_port="$(compose_port ai 3004)"
dashboard_port="$(compose_port dashboard 3003)"
keycloak_port="$(compose_port keycloak 8080)"

assert_health gateway "$gateway_port"
assert_health identity "$identity_port"
assert_health workspace "$workspace_port"
assert_health ai "$ai_port"

dashboard_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:${dashboard_port}")"
[[ "$dashboard_status" == "200" ]] || { echo "dashboard returned ${dashboard_status}" >&2; exit 1; }
echo "ok: dashboard"

unauthenticated_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:${gateway_port}/api/v1/workspaces")"
[[ "$unauthenticated_status" == "401" ]] || { echo "unauthenticated workspace request returned ${unauthenticated_status}" >&2; exit 1; }
echo "ok: gateway rejects unauthenticated workspace access"

internal_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:${workspace_port}/api/v1/workspaces")"
[[ "$internal_status" == "401" ]] || { echo "direct workspace request returned ${internal_status}" >&2; exit 1; }
echo "ok: workspace rejects requests without service credentials"

ai_internal_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:${ai_port}/api/v1/models")"
[[ "$ai_internal_status" == "401" ]] || { echo "direct AI request returned ${ai_internal_status}" >&2; exit 1; }
echo "ok: AI rejects requests without service credentials"

access_token="$(
  curl --fail --silent --show-error \
    --request POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" \
    --header "content-type: application/x-www-form-urlencoded" \
    --data-urlencode "client_id=maknyak-cli" \
    --data-urlencode "username=${SMOKE_USERNAME:-developer}" \
    --data-urlencode "password=${SMOKE_PASSWORD:-maknyak-dev}" \
    --data-urlencode "grant_type=password" \
  | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(input).access_token ?? ""));'
)"
[[ -n "$access_token" ]] || { echo "OIDC did not return an access token" >&2; exit 1; }

headers=""
authenticated_status="000"
for attempt in {1..10}; do
  if headers="$(curl --silent --show-error --dump-header - --output /dev/null \
    --write-out $'\n%{http_code}' \
    --header "authorization: Bearer ${access_token}" \
    --header "x-request-id: smoke-authenticated" \
    "http://localhost:${gateway_port}/api/v1/workspaces")"; then
    authenticated_status="$(tail -n 1 <<<"$headers")"
    headers="$(sed '$d' <<<"$headers")"
    [[ "$authenticated_status" == "200" ]] && break
  fi
  sleep 2
done
[[ "$authenticated_status" == "200" ]] || {
  echo "authenticated workspace request returned ${authenticated_status}" >&2
  exit 1
}
if ! grep -qi '^x-request-id: smoke-authenticated' <<<"$headers"; then
  echo "gateway did not preserve the correlation id" >&2
  exit 1
fi
echo "ok: OIDC-authenticated workspace request and correlation id"
