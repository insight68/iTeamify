#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source_file="${1:-.env}"
target_file="${2:-.env.aurocreator.local}"
if [ ! -f "$source_file" ]; then
  echo "Missing $source_file; create it from .env.example first." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$source_file"
set +a
node scripts/init-local-env.mjs "$source_file" "$target_file"
