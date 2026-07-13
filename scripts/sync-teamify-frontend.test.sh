#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-teamify-frontend.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/teamify-sync-test.XXXXXX")"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file_contains() {
  local path="$1"
  local expected="$2"
  grep -Fq "$expected" "$path" || fail "$path does not contain: $expected"
}

assert_clean() {
  local repo="$1"
  local status
  status="$(git -C "$repo" status --porcelain)"
  [ -z "$status" ] || fail "expected clean worktree, got: $status"
}

configure_git() {
  local repo="$1"
  git -C "$repo" config user.name "Teamify Sync Test"
  git -C "$repo" config user.email "sync-test@example.com"
}

UPSTREAM_REPO="$TEST_ROOT/upstream"
TARGET_REPO="$TEST_ROOT/target"

git init --quiet --initial-branch=main "$UPSTREAM_REPO"
configure_git "$UPSTREAM_REPO"
mkdir -p \
  "$UPSTREAM_REPO/apps/web" \
  "$UPSTREAM_REPO/apps/desktop" \
  "$UPSTREAM_REPO/packages/core"
printf '%s\n' "upstream web" > "$UPSTREAM_REPO/apps/web/source.txt"
printf '%s\n' "upstream desktop" > "$UPSTREAM_REPO/apps/desktop/source.txt"
printf '%s\n' "upstream core" > "$UPSTREAM_REPO/packages/core/source.txt"
printf '%s\n' '{"name":"upstream"}' > "$UPSTREAM_REPO/package.json"
printf '%s\n' "lockfileVersion: '9.0'" > "$UPSTREAM_REPO/pnpm-lock.yaml"
printf '%s\n' "packages:" "  - apps/*" "  - packages/*" > "$UPSTREAM_REPO/pnpm-workspace.yaml"
printf '%s\n' '{}' > "$UPSTREAM_REPO/turbo.json"
printf '%s\n' "export default {};" > "$UPSTREAM_REPO/playwright.config.ts"
git -C "$UPSTREAM_REPO" add .
git -C "$UPSTREAM_REPO" commit --quiet -m "upstream fixture"
UPSTREAM_COMMIT="$(git -C "$UPSTREAM_REPO" rev-parse HEAD)"

git init --quiet --initial-branch=upstream/frontend "$TARGET_REPO"
configure_git "$TARGET_REPO"
mkdir -p \
  "$TARGET_REPO/apps/web" \
  "$TARGET_REPO/apps/mobile" \
  "$TARGET_REPO/packages/core" \
  "$TARGET_REPO/scripts"
printf '%s\n' "stale web" > "$TARGET_REPO/apps/web/stale.txt"
printf '%s\n' "keep mobile" > "$TARGET_REPO/apps/mobile/keep.txt"
printf '%s\n' "stale package" > "$TARGET_REPO/packages/core/stale.txt"
printf '%s\n' "keep script" > "$TARGET_REPO/scripts/keep.txt"
printf '%s\n' "keep deployment" > "$TARGET_REPO/vercel.json"
printf '%s\n' '{"name":"target"}' > "$TARGET_REPO/package.json"
printf '%s\n' "old lock" > "$TARGET_REPO/pnpm-lock.yaml"
printf '%s\n' "old workspace" > "$TARGET_REPO/pnpm-workspace.yaml"
printf '%s\n' '{"old":true}' > "$TARGET_REPO/turbo.json"
printf '%s\n' "export default { old: true };" > "$TARGET_REPO/playwright.config.ts"
git -C "$TARGET_REPO" add .
git -C "$TARGET_REPO" commit --quiet -m "target fixture"

(
  cd "$TARGET_REPO"
  "$SYNC_SCRIPT" \
    --remote fixture-upstream \
    --url "$UPSTREAM_REPO" \
    --ref main \
    --branch upstream/frontend \
    --dry-run >/dev/null
)

assert_clean "$TARGET_REPO"
[ -f "$TARGET_REPO/apps/web/stale.txt" ] || fail "dry run changed the worktree"
[ ! -f "$TARGET_REPO/.teamify-upstream" ] || fail "dry run wrote the marker"

(
  cd "$TARGET_REPO"
  "$SYNC_SCRIPT" \
    --remote fixture-upstream \
    --url "$UPSTREAM_REPO" \
    --ref main \
    --branch upstream/frontend >/dev/null
)

[ ! -e "$TARGET_REPO/apps/web/stale.txt" ] || fail "stale web file was not deleted"
[ ! -e "$TARGET_REPO/packages/core/stale.txt" ] || fail "stale package file was not deleted"
assert_file_contains "$TARGET_REPO/apps/web/source.txt" "upstream web"
assert_file_contains "$TARGET_REPO/apps/desktop/source.txt" "upstream desktop"
assert_file_contains "$TARGET_REPO/packages/core/source.txt" "upstream core"
assert_file_contains "$TARGET_REPO/package.json" '"name":"upstream"'
assert_file_contains "$TARGET_REPO/.teamify-upstream" "commit=$UPSTREAM_COMMIT"
[ -f "$TARGET_REPO/apps/mobile/keep.txt" ] || fail "mobile customization was deleted"
[ -f "$TARGET_REPO/scripts/keep.txt" ] || fail "downstream scripts were deleted"
[ -f "$TARGET_REPO/vercel.json" ] || fail "deployment configuration was deleted"

git -C "$TARGET_REPO" switch --quiet -c wrong-branch
if (
  cd "$TARGET_REPO"
  "$SYNC_SCRIPT" \
    --remote fixture-upstream \
    --url "$UPSTREAM_REPO" \
    --ref main \
    --branch upstream/frontend >/dev/null 2>&1
); then
  fail "sync succeeded on the wrong branch"
fi

echo "sync-teamify-frontend: PASS"
