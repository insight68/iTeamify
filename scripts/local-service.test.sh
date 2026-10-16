#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture_dir="$(mktemp -d)"
trap 'rm -rf "$fixture_dir"' EXIT
mkdir "$fixture_dir/bin"
cat > "$fixture_dir/bin/lsof" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *-tiTCP:* ]]; then
  [ "${MOCK_FREE:-0}" = 1 ] || echo 123456
else
  printf 'n%s\n' "$MOCK_CWD"
fi
EOF
chmod +x "$fixture_dir/bin/lsof"
# Replace the shell builtin inside the child shell, never signal a real PID.
cat > "$fixture_dir/kill.sh" <<'EOF'
kill() {
  [ "${1:-}" != -0 ] || return 1
  printf '%s\n' "$*" >> "$MOCK_KILL_LOG"
}
EOF
export PATH="$fixture_dir/bin:$PATH" BASH_ENV="$fixture_dir/kill.sh"
export MOCK_KILL_LOG="$fixture_dir/kill.log" MOCK_CWD="$repo_root"
bash "$repo_root/scripts/local-service.sh" verify 18080
if bash "$repo_root/scripts/local-service.sh" require-free 18080 > "$fixture_dir/output" 2>&1; then
  echo 'Occupied port was accepted.' >&2; exit 1
fi
export MOCK_CWD="/another/project"
for action in verify require-free stop; do
  if bash "$repo_root/scripts/local-service.sh" "$action" 18080 > "$fixture_dir/output" 2>&1; then
    echo "Foreign process accepted for $action." >&2; exit 1
  fi
done
[ ! -e "$MOCK_KILL_LOG" ]
export MOCK_CWD="$repo_root/server"
bash "$repo_root/scripts/local-service.sh" stop 18080
[ "$(cat "$MOCK_KILL_LOG")" = 123456 ]
export MOCK_FREE=1
bash "$repo_root/scripts/local-service.sh" require-free 18080
if bash "$repo_root/scripts/local-service.sh" stop not-a-port > "$fixture_dir/output" 2>&1; then
  echo 'Invalid port was accepted.' >&2; exit 1
fi
echo 'Local service ownership checks passed (no real processes signalled).'
