#!/usr/bin/env bash
set -euo pipefail

missing=0
for command_name in node pnpm docker curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "missing: ${command_name}" >&2
    missing=1
  fi
done
[[ "$missing" == "0" ]] || exit 1

node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required; found $(node --version)" >&2
  exit 1
fi

docker compose version >/dev/null
docker info >/dev/null

root_free_kib="$(df -Pk / | awk 'NR == 2 { print $4 }')"
if (( root_free_kib < 3145728 )); then
  echo "warning: root has less than 3 GiB free; run 'sudo make disk-clean' before a Docker build" >&2
fi

echo "ok: Node.js $(node --version)"
echo "ok: pnpm $(pnpm --version)"
echo "ok: $(docker --version)"
echo "ok: $(docker compose version)"
echo "ok: prerequisites"
