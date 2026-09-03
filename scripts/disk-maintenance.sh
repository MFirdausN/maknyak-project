#!/usr/bin/env bash
set -euo pipefail

mode="${1:-audit}"

audit() {
  echo "Filesystem usage"
  df -hT / /home /tmp
  echo
  echo "Docker storage"
  docker info --format 'Docker root: {{.DockerRootDir}} ({{.Driver}})'
  docker system df
  echo
  echo "System journal"
  journalctl --disk-usage || true
}

if [[ "$mode" == "audit" ]]; then
  audit
  exit 0
fi

if [[ "$mode" != "clean" ]]; then
  echo "Usage: $0 [audit|clean]" >&2
  exit 2
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Cleanup requires root privileges. Run: sudo $0 clean" >&2
  exit 1
fi

docker builder prune --force
journalctl --vacuum-size=100M
apt-get clean
systemd-tmpfiles --clean

while read -r snap_name snap_revision; do
  snap remove "$snap_name" --revision="$snap_revision"
done < <(snap list --all | awk '$NF == "disabled" { print $1, $3 }')

audit
