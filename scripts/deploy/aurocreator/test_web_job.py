import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class WebJobTests(unittest.TestCase):
    def run_job(self, code, owner="release-A", payload=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        job = base / "job"
        job.mkdir()
        lock = base / "lock"
        lock.mkdir()
        (lock / "owner").write_text(owner + "\n")
        # Replace sudo only in the test runner's PATH, never call real sudo.
        (base / "sudo").write_text('#!/bin/sh\nexec "$@"\n')
        (base / "sudo").chmod(0o755)
        (job / "payload.sh").write_text(payload or f"exit {code}\n")
        runner = Path(__file__).with_name("web-job-runner.sh")
        result = subprocess.run(["bash", str(runner), str(job), str(lock), "release-A"],
                                env=dict(os.environ, PATH=str(base) + ":" + os.environ["PATH"]),
                                capture_output=True, text=True, timeout=5)
        return result, job, lock

    def test_success_records_exit_and_releases_own_lock(self):
        result, job, lock = self.run_job(0)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((job / "exit-code").read_text(), "0\n")
        self.assertTrue((job / "started-at").is_file())
        self.assertTrue((job / "finished-at").is_file())
        self.assertTrue((job / "resources").is_file())
        self.assertFalse(lock.exists())

    def test_failure_preserves_real_exit_status_and_releases_own_lock(self):
        result, job, lock = self.run_job(42)
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertEqual((job / "exit-code").read_text(), "42\n")
        self.assertFalse(lock.exists())

    def test_finished_job_cannot_remove_a_successor_lock(self):
        result, job, lock = self.run_job(0, payload='printf "release-B\\n" >"$(dirname "$BASH_SOURCE")/../lock/owner"\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((job / "exit-code").read_text(), "0\n")
        self.assertEqual((lock / "owner").read_text(), "release-B\n")

    def test_job_cannot_start_without_owning_the_lock(self):
        result, job, lock = self.run_job(0, owner="release-B")
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertEqual((job / "exit-code").read_text(), "73\n")
        self.assertEqual((lock / "owner").read_text(), "release-B\n")

    def test_terminated_job_records_signal_status_instead_of_success(self):
        result, job, lock = self.run_job(0, payload='kill -TERM "$PPID"\nexit 0\n')
        self.assertEqual(result.returncode, 143, result.stderr)
        self.assertEqual((job / "exit-code").read_text(), "143\n")
        self.assertFalse(lock.exists())

    def test_deploy_controller_reports_cancellation_as_failure(self):
        common = Path(__file__).with_name("common.sh")
        for signum, expected in (("INT", 130), ("TERM", 143)):
            with self.subTest(signum=signum):
                result = subprocess.run(["bash", "-c", 'LOCK_HELD=0; source "$1"; kill -"$2" $$',
                                         "test", str(common), signum], capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, expected, result.stderr)


if __name__ == "__main__":
    unittest.main()
