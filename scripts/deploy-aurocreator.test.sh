#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_SCRIPT="$ROOT_DIR/scripts/deploy-aurocreator.sh"
DEPLOY_MODULE_DIR="$ROOT_DIR/scripts/deploy/aurocreator"
GENERIC_DEPLOY_SCRIPT="$ROOT_DIR/scripts/deploy.sh"
BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/bootstrap-auro.sh"
PACKAGE_JSON="$ROOT_DIR/package.json"
WORKSPACE_CONFIG="$ROOT_DIR/pnpm-workspace.yaml"

DEPLOY_MODULES=(
  "$DEPLOY_MODULE_DIR/common.sh"
  "$DEPLOY_MODULE_DIR/server.sh"
  "$DEPLOY_MODULE_DIR/web.sh"
  "$DEPLOY_MODULE_DIR/daemon.sh"
  "$DEPLOY_MODULE_DIR/maintenance.sh"
)
DEPLOY_SOURCE_FILES=("$DEPLOY_SCRIPT" "${DEPLOY_MODULES[@]}")

python3 -B -m unittest discover -s "$DEPLOY_MODULE_DIR" -p 'test_web*.py'
bash -n "$DEPLOY_MODULE_DIR/web-job-runner.sh"

for script in "${DEPLOY_SOURCE_FILES[@]}"; do
  bash -n "$script"
done
bash -n "$GENERIC_DEPLOY_SCRIPT"
bash -n "$BOOTSTRAP_SCRIPT"

for module in "${DEPLOY_MODULES[@]}"; do
  source_line="source \"\$SCRIPT_DIR/deploy/aurocreator/$(basename "$module")\""
  if [ "$(grep -Fxc "$source_line" "$DEPLOY_SCRIPT")" -ne 1 ]; then
    echo "deploy entrypoint must source exactly once: $source_line" >&2
    exit 1
  fi
done

if grep -Eq '^PHASE=|^case "\$PHASE"' "${DEPLOY_MODULES[@]}"; then
  echo "deployment modules must define functions only; dispatch belongs in the entrypoint" >&2
  exit 1
fi

set +e
invalid_phase_output="$("$DEPLOY_SCRIPT" __module_load_smoke__ 2>&1)"
invalid_phase_status=$?
set -e
if [ "$invalid_phase_status" -ne 1 ] ||
   ! grep -Fq '未知阶段: __module_load_smoke__' <<<"$invalid_phase_output"; then
  echo "deploy entrypoint did not load its modules and reach command dispatch" >&2
  printf '%s\n' "$invalid_phase_output" >&2
  exit 1
fi

# EnvironmentFile values may contain '=' padding. Verification must split only
# on the first separator or it will truncate standard Base64 credentials.
key=ITEAMIFY_OPENAGENT_SECRET_KEY
expected='a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s='
actual="$(
  printf '%s=%s\n' "$key" "$expected" |
    awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }'
)"
if [ "$actual" != "$expected" ]; then
  echo "deploy env parser truncated '=' padding" >&2
  exit 1
fi

if grep -E '(TOKEN|SECRET|BASE_URL|MODEL).*print \$2' "${DEPLOY_SOURCE_FILES[@]}" >/dev/null; then
  echo "deploy verification still contains a lossy secret env parser" >&2
  exit 1
fi

if [ "$(grep -Fhc 'if "$@" 2>&1 | tee "$stage_log"; then' "${DEPLOY_SOURCE_FILES[@]}" | awk '{ total += $1 } END { print total + 0 }')" -ne 1 ]; then
  echo "web build must stream exactly one release-scoped stage logger" >&2
  exit 1
fi

# The web artifact identity must come from the sources, not from the per-run
# release ID: a unique identity per deployment invalidates every Turbo task
# hash and forces a cold Next compile on the deployment host.
for identity_anchor in \
  'DEPLOYMENT_ID="$(python3 "$WEB_HELPER" fingerprint "$BUILD_ROOT"' \
  'NEXT_DEPLOYMENT_ID="$DEPLOYMENT_ID"'; do
  if ! grep -Fq "$identity_anchor" "${DEPLOY_SOURCE_FILES[@]}"; then
    echo "web deployment must derive the artifact identity from source content: $identity_anchor" >&2
    exit 1
  fi
done

# turbo.json is JSONC, so drop whole-line comments before parsing.
if ! python3 - "$ROOT_DIR/turbo.json" <<'PY'
import json
import sys

lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
turbo = json.loads("\n".join(line for line in lines if not line.lstrip().startswith("//")))
build = turbo["tasks"]["build"]
global_env = turbo.get("globalEnv", [])
build_env = build.get("env", [])
# NEXT_DEPLOYMENT_ID is derived per artifact, so a global entry would miss
# every other task's cache on every deployment. NEXT_DIST_DIR and STANDALONE
# only ever shape the build output.
leaked = [name for name in ("NEXT_DEPLOYMENT_ID", "NEXT_DIST_DIR", "STANDALONE")
          if name in global_env or name not in build_env]
if leaked:
    raise SystemExit(f"web-only build inputs must be scoped to the build task: {leaked}")
if "NEXT_PUBLIC_APP_VERSION" not in global_env + build_env:
    raise SystemExit("the app version must be part of the web build hash")
if "^cache-inputs" not in (build.get("dependsOn") or []):
    raise SystemExit("the web build must hash its workspace dependency sources")
PY
then
  echo "turbo.json must scope web build inputs to the build task" >&2
  exit 1
fi

# OpenAgent verification has no dependency on template/release tables.
if grep -Eq 'managed_asset_release|workspace_provisioning_operation|managed_state' "${DEPLOY_SOURCE_FILES[@]}"; then
  echo "deployment still queries removed template state" >&2
  exit 1
fi
for source in "$DEPLOY_SCRIPT" "$DEPLOY_MODULE_DIR/daemon.sh"; do
  if ! grep -Fq 'expected_by_workspace.setdefault(workspace_id, set()).add(expected_provider)' "$source"; then
    echo "OpenAgent verification omits workspace registration" >&2
    exit 1
  fi
done
if ! grep -Fq 'DEFAULT_CORS_ALLOWED_ORIGINS="https://aurocreator.com,https://www.aurocreator.com,https://aurosignal.com,https://www.aurosignal.com"' "$DEPLOY_SCRIPT"; then
  echo "official apex and www browser origins of every official domain must be allowed by default" >&2
  exit 1
fi

for setting in \
  'upsert_backend_env ITEAMIFY_APP_URL "$ITEAMIFY_APP_URL"' \
  'upsert_backend_env FRONTEND_ORIGIN "$ITEAMIFY_APP_URL"' \
  'upsert_backend_env CORS_ALLOWED_ORIGINS "$ITEAMIFY_CORS_ALLOWED_ORIGINS"'; do
  if ! grep -Fq "$setting" "${DEPLOY_SOURCE_FILES[@]}"; then
    echo "server deployment must persist public origin setting: $setting" >&2
    exit 1
  fi
done

for script in "$DEPLOY_SCRIPT" "$GENERIC_DEPLOY_SCRIPT" "$BOOTSTRAP_SCRIPT"; do
  if ! grep -Fq '"packageManager":' "$script"; then
    echo "deployment must read the repository pnpm pin: $script" >&2
    exit 1
  fi
  if grep -Fq 'PNPM_MIN_MAJOR' "$script"; then
    echo "deployment must not accept an arbitrary pnpm major: $script" >&2
    exit 1
  fi
done

# Server-only deployments and infrastructure bootstrap must not require local
# Node.js merely to read the repository pnpm version.
pnpm_probe_dir="$(mktemp -d)"
trap 'rm -rf -- "$pnpm_probe_dir"' EXIT
cat >"$pnpm_probe_dir/node" <<'PROBE'
#!/usr/bin/env sh
echo "Unexpected local Node.js invocation" >&2
exit 1
PROBE
chmod +x "$pnpm_probe_dir/node"
for script in "$DEPLOY_SCRIPT" "$GENERIC_DEPLOY_SCRIPT"; do
  set +e
  probe_output="$(PATH="$pnpm_probe_dir:$PATH" "$script" __module_load_smoke__ 2>&1)"
  probe_status=$?
  set -e
  if [ "$probe_status" -ne 1 ] || ! grep -Fq '未知阶段: __module_load_smoke__' <<<"$probe_output"; then
    echo "deployment must load without local Node.js: $script" >&2
    printf '%s\n' "$probe_output" >&2
    exit 1
  fi
done
PATH="$pnpm_probe_dir:$PATH" "$BOOTSTRAP_SCRIPT" --help >/dev/null

if ! grep -Fq 'export PNPM_CONFIG_UPDATE_NOTIFIER=false' "${DEPLOY_SOURCE_FILES[@]}"; then
  echo "web deployment must suppress pnpm update notifications" >&2
  exit 1
fi

node -e '
  const pkg = require(process.argv[1]);
  const version = pkg.packageManager?.match(/^pnpm@(12\.\d+\.\d+)$/)?.[1];
  if (!version || pkg.engines?.pnpm !== `>=${version} <13`) {
    throw new Error("package.json must pin pnpm 12 and declare the matching engine range");
  }
  if (pkg.engines?.node !== ">=22.13.0") {
    throw new Error("package.json must declare the pnpm installer Node.js requirement");
  }
' "$PACKAGE_JSON"

if grep -Eq '^(onlyBuiltDependencies|ignoredBuiltDependencies):' "$WORKSPACE_CONFIG"; then
  echo "legacy pnpm build policy must not be used" >&2
  exit 1
fi

for policy in \
  'electron: true' \
  'electron-winstaller: false' \
  'esbuild: true' \
  'core-js: false' \
  'msw: false' \
  'protobufjs: false' \
  'sharp: false' \
  'unicode-animations: false' \
  'unrs-resolver: false'; do
  if ! grep -Fq "  $policy" "$WORKSPACE_CONFIG"; then
    echo "missing explicit pnpm build policy: $policy" >&2
    exit 1
  fi
done

if ! grep -Fxq 'updateNotifier: false' "$WORKSPACE_CONFIG"; then
  echo "pnpm update notifier must be disabled for deployments" >&2
  exit 1
fi

for setting in 'shamefullyHoist: true' 'pmOnFail: error' 'verifyDepsBeforeRun: error' 'strictDepBuilds: true'; do
  if ! grep -Fxq "$setting" "$WORKSPACE_CONFIG"; then
    echo "missing pnpm workspace setting: $setting" >&2
    exit 1
  fi
done

echo "aurocreator deployment script checks ok"
