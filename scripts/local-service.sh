#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
action="${1:-verify}"
port="${2:?port required}"
case "$action" in verify|require-free|stop) ;; *) echo "Unknown action: $action" >&2; exit 2 ;; esac
[[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { echo "Invalid port." >&2; exit 2; }
command -v lsof >/dev/null 2>&1 || { echo "lsof is required to verify process ownership." >&2; exit 1; }
pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
for pid in $pids; do
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  case "$cwd/" in
    "$repo_root/"*) ;;
    *) echo "Refusing $action on :$port: PID $pid belongs to another checkout ($cwd)." >&2; exit 1 ;;
  esac
  if [ "$action" = "require-free" ]; then
    echo "Port :$port is already used by this checkout (PID $pid). Stop it before starting another instance." >&2
    exit 1
  fi
  if [ "$action" = "stop" ]; then
    kill "$pid"
    for _ in {1..50}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    # Recheck ownership before escalating a still-live listener.
    if kill -0 "$pid" 2>/dev/null; then
      current_cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
      [ "$current_cwd" = "$cwd" ] && kill -KILL "$pid"
    fi
  fi
done
