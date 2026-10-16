import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


MODULE = Path(__file__).with_name('web.sh')
BASHES = list(dict.fromkeys(p for p in ['/bin/bash', shutil.which('bash')] if p))


class WebObserverTests(unittest.TestCase):
    def observe(self, bash, outcome):
        with tempfile.TemporaryDirectory() as temporary:
            script = r'''
set -Eeuo pipefail
source "$1"
REMOTE_DIR=/unused RELEASE_ID=release-A
log() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }
ssh_run() { :; }
# If observation tries to dispatch or touch a lock the test must fail.
upload_release_artifacts() { return 97; }
acquire_deploy_lock() { return 97; }
release_deploy_lock() { return 97; }
sleep() { SECONDS=$((SECONDS + 15)); }
fixture="$2" outcome="$3"
ssh_exec_env() {
  cat >/dev/null
  local count=0
  [ ! -f "$fixture/calls" ] || count="$(cat "$fixture/calls")"
  printf '%s\n' "$((count + 1))" >"$fixture/calls"
  if [ "$count" = 0 ]; then
    printf -- '--- Next standalone build --- [08:41:43 UTC, started]\n'
  elif [ "$outcome" = disconnect ]; then
    return 255
  elif [ "$count" -ge 4 ]; then
    printf 'web_job_exit=%s\n' "$outcome"
  fi
  printf 'web_job_log_lines=1\n'
}
phase_web_wait
'''
            return subprocess.run([bash, '-c', script, 'test', str(MODULE), temporary, str(outcome)],
                                  env=dict(os.environ, LC_ALL='C.UTF-8', LANG='C.UTF-8'),
                                  capture_output=True, text=True, timeout=5)

    def test_utf8_quiet_heartbeat_and_reconnect_success(self):
        for bash in BASHES:
            with self.subTest(bash=bash):
                result = self.observe(bash, 0)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('阶段: Next standalone build｜', result.stdout)
                self.assertIn('距上次新输出 30s', result.stdout)
                self.assertNotIn('unbound variable', result.stderr)

    def test_observer_preserves_remote_failure(self):
        result = self.observe('/bin/bash', 42)
        self.assertEqual(result.returncode, 42, result.stderr)

    def test_disconnect_exits_without_mutating_server_job(self):
        result = self.observe('/bin/bash', 'disconnect')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('服务器任务可能仍在运行', result.stderr)

    def status(self, daemon_release='release-A', exit_code=0, scope='deploy', service_active=True):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for component in ['server', 'web', 'daemon']:
                release = daemon_release if component == 'daemon' else 'release-A'
                candidate = root / (component + '-releases') / release
                candidate.mkdir(parents=True)
                (candidate / 'manifest').write_text('release=' + release + '\n')
                (candidate / '.activated').touch()
                (root / (component + '-current')).symlink_to(candidate)
            incoming = root / 'incoming/release-A'
            incoming.mkdir(parents=True)
            if scope is not None:
                (incoming / 'deploy-scope').write_text(scope)
            job = root / 'build/deploy/jobs/release-A'
            job.mkdir(parents=True)
            (job / 'exit-code').write_text(str(exit_code))
            (root / 'sudo').write_text('#!/bin/sh\nexit ' + ('0' if service_active else '1') + '\n')
            (root / 'sudo').chmod(0o755)
            script = r'''
set -Eeuo pipefail
source "$1"
REMOTE_DIR="$2" RELEASE_ID=release-A
ssh_exec_env() { export REMOTE_DIR RELEASE_ID; bash -s; }
phase_deploy_status
'''
            result = subprocess.run(['/bin/bash', '-c', script, 'test', str(MODULE), temporary],
                                    env=dict(os.environ, PATH=temporary + ':' + os.environ['PATH']),
                                    capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            return json.loads(result.stdout)

    def test_full_deployment_cannot_complete_with_old_daemon(self):
        result = self.status(daemon_release='release-old')
        self.assertEqual(result['deployment_state'], 'pending')
        self.assertEqual(result['components']['daemon']['state'], 'pending')

    def test_failed_web_is_a_failed_full_deployment(self):
        self.assertEqual(self.status(exit_code=1)['deployment_state'], 'failed')

    def test_all_activated_components_complete_full_deployment(self):
        self.assertEqual(self.status()['deployment_state'], 'complete')

    def test_stopped_services_cannot_complete_deployment(self):
        self.assertEqual(self.status(service_active=False)['deployment_state'], 'pending')

    def test_missing_scope_is_never_inferred_as_complete(self):
        self.assertEqual(self.status(scope=None)['deployment_state'], 'unknown_scope')

    def test_web_scope_does_not_require_daemon_activation(self):
        self.assertEqual(self.status(scope='web', daemon_release='release-old')['deployment_state'], 'complete')

    def dispatch_retry(self, activated=False, running=False):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            job = root / 'build/deploy/jobs/release-A'
            job.mkdir(parents=True)
            (job / 'exit-code').write_text('1\n')
            (job / 'payload.sh').write_text('original failed payload\n')
            if activated:
                candidate = root / 'web-releases/release-A'
                candidate.mkdir(parents=True)
                (candidate / '.activated').touch()
            for name, contents in {
                'sudo': '#!/bin/sh\nexec "$@"\n',
                'systemctl': '#!/bin/sh\nexit ' + ('0' if running else '1') + '\n',
                'systemd-run': '#!/bin/sh\nexit 0\n',
            }.items():
                (root / name).write_text(contents)
                (root / name).chmod(0o755)
            script = r'''
set -Eeuo pipefail
source "$1"
REMOTE_DIR="$2" RELEASE_ID=release-A DEPLOY_USER=test DEPLOY_LOCK_DIR="$2/lock"
WEB_REUSE_BUILD=0 WEB_RETRY_BUILD=1 LOCK_HELD=1 BUILD_TMP="$2/local-build"
log() { :; }
prepare_build_tmp() { mkdir -p "$BUILD_TMP"; }
upload_release_artifacts() {
  mkdir -p "$REMOTE_DIR/incoming/$RELEASE_ID"
  cp "$1" "$REMOTE_DIR/incoming/$RELEASE_ID/web-job.sh"
}
ssh_exec_env() {
  local var
  for var in "$@"; do export "$var"; done
  bash -s
}
phase_web_wait() { :; }
ssh_web_job_exec_env REMOTE_DIR RELEASE_ID <<'PAYLOAD'
echo new retry payload
PAYLOAD
test "$LOCK_HELD" = 0
'''
            result = subprocess.run(['/bin/bash', '-c', script, 'test', str(MODULE), str(root)],
                                    env=dict(os.environ, PATH=str(root) + ':' + os.environ['PATH']),
                                    capture_output=True, text=True, timeout=5)
            preserved = list((root / 'build/deploy/failed-jobs').glob('*/payload.sh'))
            return result, [p.read_text() for p in preserved], (job / 'payload.sh').read_text()

    def test_retry_quarantines_failed_job_and_dispatches_once(self):
        result, preserved, current = self.dispatch_retry()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(preserved, ['original failed payload\n'])
        self.assertIn('new retry payload', current)

    def test_retry_cannot_overwrite_activated_release(self):
        result, preserved, current = self.dispatch_retry(activated=True)
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertEqual(preserved, [])
        self.assertEqual(current, 'original failed payload\n')

    def test_retry_cannot_dispatch_over_a_running_job(self):
        result, preserved, current = self.dispatch_retry(running=True)
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertEqual(preserved, [])
        self.assertEqual(current, 'original failed payload\n')


if __name__ == '__main__':
    unittest.main()
