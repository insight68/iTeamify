#!/usr/bin/env bash
set -euo pipefail

# ==========================================================================
# Frontend verification pipeline: tooling tests → typecheck → unit tests → lint
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
# Step 1: Repository tooling tests
# --------------------------------------------------------------------------
echo "==> [1/4] Repository tooling tests..."
bash scripts/sync-teamify-frontend.test.sh || { EXIT_CODE=1; exit 1; }

# --------------------------------------------------------------------------
# Step 2: TypeScript typecheck
# --------------------------------------------------------------------------
echo ""
echo "==> [2/4] TypeScript typecheck..."
pnpm typecheck || { EXIT_CODE=1; exit 1; }

# --------------------------------------------------------------------------
# Step 3: TypeScript unit tests (Vitest)
# --------------------------------------------------------------------------
echo ""
echo "==> [3/4] TypeScript unit tests..."
pnpm test || { EXIT_CODE=1; exit 1; }

# --------------------------------------------------------------------------
# Step 4: Lint
# --------------------------------------------------------------------------
echo ""
echo "==> [4/4] Lint..."
pnpm lint || { EXIT_CODE=1; exit 1; }
