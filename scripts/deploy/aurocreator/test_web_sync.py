import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


class WebSyncTests(unittest.TestCase):
    def test_typecheck_failure_stops_deploy_before_touching_production(self):
        entrypoint = Path(__file__).resolve().parents[2] / "deploy-aurocreator.sh"
        for phase in ("phase_deploy", "phase_web"):
            with self.subTest(phase=phase):
                definition = re.search(rf"{phase}\(\) \{{.*?\n\}}", entrypoint.read_text(), re.S)
                self.assertIsNotNone(definition)
                script = r'''
set -Eeuo pipefail
source "$WEB_MODULE"
LOCAL_DIR=/tmp WEB_REUSE_BUILD=0
require_cmd() { :; }
log() { :; }
ok() { echo unexpected_typecheck_success; }
pnpm() { return 42; }
phase_preflight() { echo unexpected_production_access; exit 99; }
eval "$PHASE_FUNCTION"
"$PHASE"
'''
                result = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=5,
                                        env=dict(os.environ, WEB_MODULE=str(Path(__file__).with_name("web.sh")),
                                                 PHASE_FUNCTION=definition.group(0), PHASE=phase))
                self.assertEqual(result.returncode, 42, result.stderr)
                self.assertEqual(result.stdout, "")

    def test_custom_next_outputs_are_not_uploaded_and_production_cache_is_preserved(self):
        # Use the real platform rsync, including macOS openrsync. The fixture
        # changes only the transport/destination; production filters run intact.
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            source, remote = base / "source", base / "remote"

            def write(root, name, content="fixture\n"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
                return path

            source_files = ["package.json", "pnpm-lock.yaml", ".gitignore",
                            ".github/workflows/ci.yml", "apps/web/app/page.tsx",
                            "packages/views/chat/member-chat-page.tsx"]
            for name in source_files:
                write(source, name)
            custom_outputs = [".next-applications", ".next-applications-build",
                              ".next-contract-dev", ".next-contract-build",
                              ".next-members-check", ".next-invite-check",
                              ".next-performance-check", ".next-future-name"]
            for directory in custom_outputs:
                write(source, f"apps/web/{directory}/cache/webpack/pack.gz")
            excluded = ["apps/web/.next/cache/pack", "node_modules/dependency/index.js",
                        "apps/web/node_modules/next/index.js", ".turbo/local-cache",
                        "packages/views/.next-check/cache/pack", "apps/web/.env.production",
                        "server/main.go", "apps/desktop/main.ts"]
            for name in excluded:
                write(source, name)
            preserved = ["apps/web/.next/cache/webpack/pack", ".turbo/server-cache",
                         "node_modules/dependency/index.js", "server/main.go",
                         "apps/web/.next-performance-existing/cache/pack"]
            for name in preserved:
                write(remote, name, "server cache\n")
            write(remote, "apps/web/.next-applications/obsolete-cache/pack")
            modules = remote / "apps/web/node_modules"
            modules.parent.mkdir(parents=True, exist_ok=True)
            modules.symlink_to("../../node_modules")
            script = r'''
set -Eeuo pipefail
source "$WEB_MODULE"
log() { :; }
ok() { :; }
ssh_exec_env() { cat >/dev/null; }
phase_sync_web_helper() { :; }
rsync() {
  local -a arguments=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -e) shift 2 ;;
      "$SSH_HOST:$REMOTE_DIR/build/src/") arguments+=("$FIXTURE_REMOTE/"); shift ;;
      *) arguments+=("$1"); shift ;;
    esac
  done
  "$RSYNC_BIN" "${arguments[@]}"
}
phase_sync_web
'''
            result = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=15,
                                    env=dict(os.environ, WEB_MODULE=str(Path(__file__).with_name("web.sh")),
                                             LOCAL_DIR=str(source), REMOTE_DIR="/fixture",
                                             SSH_HOST="fixture-host", SSH_KEY="", SSH_CONTROL_PATH="unused",
                                             DEPLOY_USER="fixture", FIXTURE_REMOTE=str(remote),
                                             RSYNC_BIN=shutil.which("rsync") or "rsync"))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            for name in source_files:
                self.assertEqual((remote / name).read_text(), (source / name).read_text())
            for directory in custom_outputs:
                self.assertFalse((remote / "apps/web" / directory).exists(), directory)
            self.assertFalse((remote / "packages/views/.next-check").exists())
            for name in preserved:
                self.assertEqual((remote / name).read_text(), "server cache\n")
            self.assertTrue(modules.is_symlink())
            self.assertFalse((remote / "apps/web/.env.production").exists())
            self.assertFalse((remote / "apps/desktop").exists())

    def test_sync_failure_stops_before_helper_upload(self):
        script = r'''
set -Eeuo pipefail
source "$1"
LOCAL_DIR=/fixture REMOTE_DIR=/fixture SSH_HOST=fixture SSH_KEY="" SSH_CONTROL_PATH=unused DEPLOY_USER=fixture
log() { :; }
ok() { echo unexpected_sync_success; }
ssh_exec_env() { cat >/dev/null; }
rsync() { return 30; }
phase_sync_web_helper() { echo unexpected_helper_upload; }
phase_sync_web
'''
        result = subprocess.run(["bash", "-c", script, "fixture", str(Path(__file__).with_name("web.sh"))],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 30, result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
