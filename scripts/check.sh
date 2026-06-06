#!/usr/bin/env bash
set -euo pipefail

# ==========================================================================
# Frontend verification pipeline: typecheck → unit tests → lint
# Usage: bash scripts/check.sh
# ==========================================================================

EXIT_CODE=0

cleanup() {
  echo ""
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "✓ All checks passed."
  else
    echo "✗ Checks FAILED."
  fi
  exit "$EXIT_CODE"
}
trap cleanup EXIT

# --------------------------------------------------------------------------
# Step 1: TypeScript typecheck
# --------------------------------------------------------------------------
echo "==> [1/3] TypeScript typecheck..."
pnpm typecheck || { EXIT_CODE=1; exit 1; }

# --------------------------------------------------------------------------
# Step 2: TypeScript unit tests (Vitest)
# --------------------------------------------------------------------------
echo ""
echo "==> [2/3] TypeScript unit tests..."
pnpm test || { EXIT_CODE=1; exit 1; }

# --------------------------------------------------------------------------
# Step 3: Lint
# --------------------------------------------------------------------------
echo ""
echo "==> [3/3] Lint..."
pnpm lint || { EXIT_CODE=1; exit 1; }
