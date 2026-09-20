#!/usr/bin/env bash
set -euo pipefail

samples="${SLO_SAMPLES:-10}"
interval_seconds="${SLO_INTERVAL_SECONDS:-1}"
minimum_availability="${SLO_MIN_AVAILABILITY_PERCENT:-99}"
maximum_p95_ms="${SLO_MAX_P95_MS:-1000}"

[[ "$samples" =~ ^[1-9][0-9]*$ && "$samples" -le 1000 ]] || {
  echo "SLO_SAMPLES must be between 1 and 1000" >&2
  exit 2
}
[[ "$interval_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] || {
  echo "SLO_INTERVAL_SECONDS must be a non-negative number" >&2
  exit 2
}
[[ "$minimum_availability" =~ ^[0-9]+([.][0-9]+)?$ ]] || {
  echo "SLO_MIN_AVAILABILITY_PERCENT must be numeric" >&2
  exit 2
}
[[ "$maximum_p95_ms" =~ ^[1-9][0-9]*$ ]] || {
  echo "SLO_MAX_P95_MS must be a positive integer" >&2
  exit 2
}

compose_port() { docker compose port "$1" "$2" | awk -F: 'END { print $NF }'; }

gateway_port="$(compose_port gateway 3000)"
identity_port="$(compose_port identity 3001)"
workspace_port="$(compose_port workspace 3002)"
ai_port="$(compose_port ai 3004)"
dashboard_port="$(compose_port dashboard 3003)"
keycloak_port="$(compose_port keycloak 8080)"
minio_port="$(compose_port minio 9000)"
nats_port="$(compose_port nats 8222)"

targets=(
  "gateway|http://localhost:${gateway_port}/api/v1/health/ready"
  "identity|http://localhost:${identity_port}/api/v1/health/ready"
  "workspace|http://localhost:${workspace_port}/api/v1/health/ready"
  "ai|http://localhost:${ai_port}/api/v1/health/ready"
  "dashboard|http://localhost:${dashboard_port}/"
  "keycloak|http://localhost:${keycloak_port}/realms/maknyak/.well-known/openid-configuration"
  "minio|http://localhost:${minio_port}/minio/health/live"
  "nats|http://localhost:${nats_port}/healthz"
)

sample_dir="$(mktemp -d)"
trap 'rm -rf -- "$sample_dir"' EXIT

echo "Sampling ${#targets[@]} targets ${samples} time(s)..."
for ((sample = 1; sample <= samples; sample++)); do
  for target in "${targets[@]}"; do
    IFS='|' read -r name url <<<"$target"
    result="$(curl --max-time 5 --silent --output /dev/null --write-out '%{http_code} %{time_total}' "$url" || true)"
    [[ -n "$result" ]] || result="000 5"
    read -r status elapsed <<<"$result"
    latency_ms="$(awk -v seconds="$elapsed" 'BEGIN { printf "%d", (seconds * 1000) + 0.5 }')"
    printf '%s %s\n' "$status" "$latency_ms" >>"$sample_dir/$name"
  done
  if (( sample < samples )); then sleep "$interval_seconds"; fi
done

failed=0
for target in "${targets[@]}"; do
  IFS='|' read -r name _ <<<"$target"
  success_count="$(awk '$1 >= 200 && $1 < 300 { count++ } END { print count + 0 }' "$sample_dir/$name")"
  availability="$(awk -v success="$success_count" -v total="$samples" 'BEGIN { printf "%.2f", success * 100 / total }')"
  p95_index="$(( (samples * 95 + 99) / 100 ))"
  p95_ms="$(awk '{ print $2 }' "$sample_dir/$name" | sort -n | sed -n "${p95_index}p")"
  printf '%-10s availability=%6s%% p95=%4sms samples=%s\n' "$name" "$availability" "$p95_ms" "$samples"
  if ! awk -v actual="$availability" -v minimum="$minimum_availability" 'BEGIN { exit !(actual >= minimum) }'; then
    echo "  availability is below ${minimum_availability}%" >&2
    failed=1
  fi
  if (( p95_ms > maximum_p95_ms )); then
    echo "  p95 latency exceeds ${maximum_p95_ms}ms" >&2
    failed=1
  fi
done

(( failed == 0 )) || exit 1
echo "SLO probe passed."
