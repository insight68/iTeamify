#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.aurocreator.local}"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
# A measured baseline must never seed a shared or remote database.
case "$DATABASE_URL" in
  postgres*://*@localhost:*/aurocreator_local_*|postgres*://*@127.0.0.1:*/aurocreator_local_*) ;;
  *) echo "Performance baseline requires the isolated local Aurocreator database." >&2; exit 1 ;;
esac
output_dir=".iteamify/performance/$(date +%Y%m%d)/baseline-$(date +%H%M%S)"
mkdir -p "$output_dir"
git rev-parse HEAD > "$output_dir/commit.txt"
git diff --binary | shasum -a 256 > "$output_dir/worktree-diff-sha256.txt"
git status --short > "$output_dir/worktree-status.txt"
uname -sm > "$output_dir/platform.txt"
node --version > "$output_dir/node.txt"
go version > "$output_dir/go.txt"
bash scripts/local-service.test.sh
bash scripts/ensure-postgres.sh "$ENV_FILE"
(cd server && go run ./cmd/migrate up)
(cd packages/core && node ../../node_modules/vitest/vitest.mjs run api/request-context.test.ts issues/cached-issue.test.ts logger.test.ts)
(cd packages/views && node ../../node_modules/vitest/vitest.mjs run issues/components/issue-chip-query.test.tsx)
(cd packages/core && node ../../node_modules/vitest/vitest.mjs bench --run issues/cached-issue.bench.ts --outputJson "../../$output_dir/cache.json")
ITEAMIFY_RUN_PERFORMANCE_BASELINE=1 bash scripts/go-test-with-agent-cli-guard.sh -- bash -c \
 'cd server && go test ./cmd/server -run "^$" -bench BenchmarkIssueReadWork -benchtime=1s -count=3' > "$output_dir/api.txt" 2>&1
echo "Baseline saved in $output_dir (local router + PostgreSQL; excludes real model/provider and browser paint)."
