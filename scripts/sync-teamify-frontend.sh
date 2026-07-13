#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REMOTE_NAME="upstream"
DEFAULT_REMOTE_URL="git@github.com-insight68:Insight86/Teamify.git"
DEFAULT_UPSTREAM_REF="main"
DEFAULT_SYNC_BRANCH="upstream/frontend"

REMOTE_NAME="${TEAMIFY_UPSTREAM_REMOTE:-$DEFAULT_REMOTE_NAME}"
REMOTE_URL="${TEAMIFY_UPSTREAM_URL:-$DEFAULT_REMOTE_URL}"
UPSTREAM_REF="${TEAMIFY_UPSTREAM_REF:-$DEFAULT_UPSTREAM_REF}"
SYNC_BRANCH="${TEAMIFY_SYNC_BRANCH:-$DEFAULT_SYNC_BRANCH}"
DRY_RUN=0
URL_WAS_SET=0

if [ -n "${TEAMIFY_UPSTREAM_URL:-}" ]; then
  URL_WAS_SET=1
fi

usage() {
  cat <<'EOF'
Sync the committed Teamify frontend snapshot from GitHub.

This command must run on the dedicated upstream/frontend branch. It replaces
apps/web, apps/desktop, packages, and the root frontend build manifests while
preserving downstream-only paths such as apps/mobile, scripts, and vercel.json.
It never stages or commits changes.

Usage:
  bash scripts/sync-teamify-frontend.sh [options]

Options:
  --remote <name>   Git remote name (default: upstream)
  --url <url>       GitHub repository URL used when adding the remote
  --ref <branch>    Upstream branch to fetch (default: main)
  --branch <name>   Required local snapshot branch (default: upstream/frontend)
  --dry-run         Fetch and print changes without modifying the worktree
  -h, --help        Show this help

Environment variables:
  TEAMIFY_UPSTREAM_REMOTE
  TEAMIFY_UPSTREAM_URL
  TEAMIFY_UPSTREAM_REF
  TEAMIFY_SYNC_BRANCH

First migration (do not merge the snapshot into the old main directly):
  git branch archive/pre-upstream main
  git switch -c upstream/frontend
  make sync-upstream
  git add apps/web apps/desktop packages package.json pnpm-lock.yaml \
    pnpm-workspace.yaml turbo.json playwright.config.ts .teamify-upstream
  git commit -m "chore(upstream): import Teamify frontend"
  git switch -c migration/upstream-main upstream/frontend
  # Reapply only the downstream auth and frontend-only adapter changes here.

Recurring workflow after migration/upstream-main becomes main:
  git switch upstream/frontend
  make sync-upstream
  git add apps/web apps/desktop packages package.json pnpm-lock.yaml \
    pnpm-workspace.yaml turbo.json playwright.config.ts .teamify-upstream
  git commit -m "chore(upstream): sync Teamify@<sha>"
  git switch main
  git merge --no-ff upstream/frontend
  make check
EOF
}

die() {
  echo "sync-teamify-frontend: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --remote)
      [ "$#" -ge 2 ] || die "--remote requires a value"
      REMOTE_NAME="$2"
      shift 2
      ;;
    --url)
      [ "$#" -ge 2 ] || die "--url requires a value"
      REMOTE_URL="$2"
      URL_WAS_SET=1
      shift 2
      ;;
    --ref)
      [ "$#" -ge 2 ] || die "--ref requires a value"
      UPSTREAM_REF="$2"
      shift 2
      ;;
    --branch)
      [ "$#" -ge 2 ] || die "--branch requires a value"
      SYNC_BRANCH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

case "$REMOTE_NAME" in
  ""|-*|*[!A-Za-z0-9._-]*)
    die "invalid remote name: $REMOTE_NAME"
    ;;
esac

git check-ref-format --branch "$UPSTREAM_REF" >/dev/null 2>&1 ||
  die "invalid upstream branch: $UPSTREAM_REF"
git check-ref-format --branch "$SYNC_BRANCH" >/dev/null 2>&1 ||
  die "invalid local snapshot branch: $SYNC_BRANCH"

for command_name in git rsync tar mktemp cmp; do
  command -v "$command_name" >/dev/null 2>&1 ||
    die "required command not found: $command_name"
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  die "run this command inside the iTeamify Git repository"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" ||
  die "detached HEAD is not supported"
[ "$CURRENT_BRANCH" = "$SYNC_BRANCH" ] ||
  die "refusing to sync on '$CURRENT_BRANCH'; switch to '$SYNC_BRANCH' first"

WORKTREE_STATUS="$(git status --porcelain --untracked-files=all)"
[ -z "$WORKTREE_STATUS" ] ||
  die "the worktree is not clean; commit or stash changes before syncing"

if EXISTING_REMOTE_URL="$(git remote get-url "$REMOTE_NAME" 2>/dev/null)"; then
  if [ "$URL_WAS_SET" -eq 1 ] && [ "$EXISTING_REMOTE_URL" != "$REMOTE_URL" ]; then
    die "remote '$REMOTE_NAME' already points to '$EXISTING_REMOTE_URL'"
  fi
  info "Using $REMOTE_NAME ($EXISTING_REMOTE_URL)"
else
  info "Adding $REMOTE_NAME ($REMOTE_URL)"
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

info "Fetching $REMOTE_NAME/$UPSTREAM_REF"
git fetch --no-tags --prune "$REMOTE_NAME" "$UPSTREAM_REF"
UPSTREAM_COMMIT="$(git rev-parse --verify 'FETCH_HEAD^{commit}')"
SHORT_COMMIT="$(git rev-parse --short "$UPSTREAM_COMMIT")"

SYNC_DIRECTORIES=(
  "apps/web"
  "apps/desktop"
  "packages"
)

SYNC_FILES=(
  "package.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "turbo.json"
  "playwright.config.ts"
)

ARCHIVE_PATHS=("${SYNC_DIRECTORIES[@]}" "${SYNC_FILES[@]}")
for path in "${ARCHIVE_PATHS[@]}"; do
  git cat-file -e "$UPSTREAM_COMMIT:$path" 2>/dev/null ||
    die "upstream commit $SHORT_COMMIT does not contain required path: $path"
done

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/teamify-frontend.XXXXXX")"
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

git archive --format=tar "$UPSTREAM_COMMIT" -- "${ARCHIVE_PATHS[@]}" |
  tar -xf - -C "$TEMP_DIR"

RSYNC_ARGS=(
  -a
  --delete
  --exclude=.next
  --exclude=.turbo
  --exclude=node_modules
  --exclude=out
  --exclude=dist
)

if [ "$DRY_RUN" -eq 1 ]; then
  RSYNC_ARGS+=(-n -i)
  info "Dry run for Teamify@$SHORT_COMMIT"
else
  info "Syncing Teamify@$SHORT_COMMIT"
fi

for path in "${SYNC_DIRECTORIES[@]}"; do
  if [ -L "$REPO_ROOT/$path" ]; then
    die "refusing to replace symlinked directory: $path"
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$REPO_ROOT/$path"
  fi
  rsync "${RSYNC_ARGS[@]}" "$TEMP_DIR/$path/" "$REPO_ROOT/$path/"
done

for path in "${SYNC_FILES[@]}"; do
  if cmp -s "$TEMP_DIR/$path" "$REPO_ROOT/$path"; then
    continue
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "would update $path"
  else
    cp "$TEMP_DIR/$path" "$REPO_ROOT/$path"
  fi
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo "would write .teamify-upstream (commit=$UPSTREAM_COMMIT)"
  info "Dry run complete; the worktree was not changed"
  exit 0
fi

printf '%s\n' \
  "remote=$REMOTE_NAME" \
  "ref=$UPSTREAM_REF" \
  "commit=$UPSTREAM_COMMIT" > "$REPO_ROOT/.teamify-upstream"

info "Sync complete; review and commit these changes"
git status --short -- \
  apps/web \
  apps/desktop \
  packages \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  turbo.json \
  playwright.config.ts \
  .teamify-upstream
