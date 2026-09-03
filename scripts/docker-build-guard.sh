#!/usr/bin/env bash
set -euo pipefail

minimum_free_kb=$((3 * 1024 * 1024))
available_kb=$(df --output=avail / | tail -n 1 | tr -d ' ')

if (( available_kb < minimum_free_kb )); then
  echo "Root has less than 3 GiB free; pruning inactive Docker build cache."
  docker builder prune --force
  available_kb=$(df --output=avail / | tail -n 1 | tr -d ' ')
fi

if (( available_kb < 1024 * 1024 )); then
  echo "Refusing Docker build: root has less than 1 GiB free." >&2
  echo "Run 'sudo make disk-clean' and inspect 'make disk-audit'." >&2
  exit 1
fi
