import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("web_release", Path(__file__).with_name("web-release.py"))
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.assets = self.base / "web-assets"

    def release(self, identity, chunk="feature.12345678.js", body="old", configured=True):
        release = self.base / "web-releases" / identity
        next_dir = release / "apps/web/.next"
        (next_dir / "static/chunks").mkdir(parents=True)
        (next_dir / "required-server-files.json").write_text(json.dumps({"config": {"deploymentId": identity if configured else ""}}))
        (next_dir / "BUILD_ID").write_text("fixed-build" if configured else identity)
        (next_dir / "static/chunks" / chunk).write_text(body)
        metadata = next_dir / "static" / ("fixed-build" if configured else identity)
        metadata.mkdir()
        (metadata / "_buildManifest.js").write_text(identity)
        return release

    def test_old_chunks_and_per_deployment_metadata_survive_new_build(self):
        a = self.release("A")
        b = self.release("B", "feature.87654321.js", "new")
        web.publish(self.assets, a)
        web.publish(self.assets, b)
        self.assertEqual((self.assets / "immutable/_next/static/chunks/feature.12345678.js").read_text(), "old")
        self.assertEqual((self.assets / "releases/A/_next/static/fixed-build/_buildManifest.js").read_text(), "A")
        self.assertEqual((self.assets / "releases/B/_next/static/fixed-build/_buildManifest.js").read_text(), "B")
        self.assertFalse((self.assets / "immutable/_next/static/fixed-build").exists())

    def test_legacy_manifest_retained_and_collisions_rejected(self):
        a = self.release("A", configured=False)
        web.publish(self.assets, a)
        self.assertTrue((self.assets / "immutable/_next/static/A/_buildManifest.js").is_file())
        b = self.release("B", body="different bytes")
        with self.assertRaisesRegex(ValueError, "collision"):
            web.publish(self.assets, b)
        (a / "apps/web/.next/static/chunks/feature.12345678.js").write_text("changed")
        with self.assertRaisesRegex(ValueError, "different artifact"):
            web.publish(self.assets, a)

    def test_retention_protects_runtime_rollback_and_recent_tabs(self):
        for index in range(6):
            release = self.release(f"R{index}", f"feature.{index:08x}.js")
            web.publish(self.assets, release)
            age = time.time() - (30 - index) * 86400
            os.utime(self.assets / "releases" / release.name, (age, age))
            if index not in (0, 1):
                import shutil
                shutil.rmtree(release)
        # R0 is current, R1 is rollback, R3-R5 occupy the latest three slots.
        web.prune(self.assets, "R0", 3, 14)
        self.assertTrue((self.assets / "releases/R1").exists())
        self.assertFalse((self.assets / "releases/R2").exists())
        self.assertFalse((self.assets / "immutable/_next/static/chunks/feature.00000002.js").exists())
        self.assertTrue((self.assets / "immutable/_next/static/chunks/feature.00000001.js").exists())

    def test_nginx_map_is_whitelisted_and_install_is_idempotent(self):
        web.publish(self.assets, self.release("A"))
        site = self.base / "nginx/site.conf"
        site.parent.mkdir()
        site.write_text("server {\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n    }\n}\n")
        web.nginx(self.assets, site, site.parent)
        first = site.read_text()
        web.nginx(self.assets, site, site.parent)
        self.assertEqual(first, site.read_text())
        mapping = (site.parent / "conf.d/aurocreator-web-assets.conf").read_text()
        self.assertIn('~^A$', mapping)
        self.assertNotIn("/$arg_dpl", mapping)
        self.assertIn("try_files $uri =404", (site.parent / "aurocreator-web-assets.locations.conf").read_text())

    def test_invalid_nginx_config_restores_previous_files(self):
        web.publish(self.assets, self.release("A"))
        site = self.base / "nginx/site.conf"
        site.parent.mkdir()
        original = "server {\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n    }\n}\n"
        site.write_text(original)
        with patch.object(web.subprocess, "run", side_effect=RuntimeError("nginx rejected config")):
            with self.assertRaisesRegex(RuntimeError, "rejected"):
                web.nginx(self.assets, site, site.parent, validate=True)
        self.assertEqual(site.read_text(), original)
        self.assertFalse((site.parent / "conf.d/aurocreator-web-assets.conf").exists())

    def test_asset_verification_checks_each_retained_identity_and_rejects_wrong_bytes(self):
        web.publish(self.assets, self.release("A"))
        web.publish(self.assets, self.release("B", "feature.87654321.js", "new"))
        requests = []
        def response(request, timeout):
            self.assertEqual(request.get_header("User-agent"), "aurocreator-deployment/1.0")
            requests.append(request.full_url)
            url = web.urllib.parse.urlparse(request.full_url)
            identity = web.urllib.parse.parse_qs(url.query)["dpl"][0]
            return io.BytesIO((self.assets / "releases" / identity / url.path.lstrip("/")).read_bytes())
        with patch.object(web.urllib.request, "urlopen", side_effect=response):
            web.verify_assets(self.assets, "https://fixture.invalid")
        self.assertTrue(any("dpl=A" in request for request in requests))
        self.assertTrue(any("dpl=B" in request for request in requests))
        with patch.object(web.urllib.request, "urlopen", return_value=io.BytesIO(b"wrong artifact")):
            with self.assertRaisesRegex(RuntimeError, "content mismatch"):
                web.verify_assets(self.assets, "https://fixture.invalid")

    def test_public_identity_check_uses_identifiable_client_and_keeps_http_failure(self):
        def response(request, timeout):
            self.assertEqual(request.get_header("User-agent"), "aurocreator-deployment/1.0")
            self.assertEqual(request.get_header("Cache-control"), "no-cache")
            return io.BytesIO(b'<html data-dpl-id="A"></html>')
        with patch.object(web.urllib.request, "urlopen", side_effect=response):
            web.verify("https://fixture.invalid/", "A")
        error = web.urllib.error.HTTPError("https://fixture.invalid/", 403, "Forbidden", {"Server": "cloudflare"}, None)
        with patch.object(web.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "HTTP 403 checking https://fixture.invalid/; server=cloudflare"):
                web.verify("https://fixture.invalid/", "A")

    def test_smoke_rejects_occupied_port_and_reaps_failed_candidate(self):
        release = self.release("A")
        server = release / "apps/web/server.js"
        pid_file = self.base / "candidate.pid"
        server.write_text(f'import os, time\nopen({str(pid_file)!r}, "w").write(str(os.getpid()))\ntime.sleep(60)\n')
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", 0))
            port = occupied.getsockname()[1]
            with self.assertRaises(OSError):
                web.smoke(release, "A", port, sys.executable, 0.2, str(self.base / "smoke.log"))
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            web.smoke(release, "A", port, sys.executable, 0.2, str(self.base / "smoke.log"))
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)
        # No leaked candidate or listener after failure.
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))

    def test_smoke_requires_http_identity_and_reaps_success(self):
        release = self.release("A")
        (release / "apps/web/server.js").write_text('''import http.server, os
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'<html data-dpl-id="A"></html>')
http.server.HTTPServer(("127.0.0.1", int(os.environ["PORT"])), Handler).serve_forever()
''')
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        web.smoke(release, "A", port, sys.executable, 3, str(self.base / "smoke.log"))
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
        with self.assertRaisesRegex(RuntimeError, "build config"):
            web.smoke(release, "B", port, sys.executable, 3, str(self.base / "smoke.log"))
        server = release / "apps/web/server.js"
        server.write_text(server.read_text().replace('data-dpl-id="A"', 'data-dpl-id="wrong"'))
        with self.assertRaisesRegex(RuntimeError, "identity"):
            web.smoke(release, "A", port, sys.executable, 1, str(self.base / "smoke.log"))

    def test_automatic_smoke_port_works_with_other_listener_running(self):
        release = self.release("A")
        pid_file = self.base / "automatic.pid"
        port_file = self.base / "automatic.port"
        (release / "apps/web/server.js").write_text(f'''import http.server, os
open({str(pid_file)!r}, "w").write(str(os.getpid()))
port = int(os.environ["PORT"])
open({str(port_file)!r}, "w").write(str(port))
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'<html data-dpl-id="A"></html>')
http.server.HTTPServer(("127.0.0.1", port), Handler).serve_forever()
''')
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", 0))
            occupied.listen()
            web.smoke(release, "A", 0, sys.executable, 3, str(self.base / "smoke.log"))
            self.assertNotEqual(int(port_file.read_text()), occupied.getsockname()[1])
            self.assertGreater(int(port_file.read_text()), 0)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)

    def test_resume_build_requires_complete_matching_artifact(self):
        import shutil
        runtime = self.release("A")
        build = self.base / "build"
        shutil.copytree(runtime / "apps/web/.next", build)
        shutil.copytree(runtime, build / "standalone")
        for path in (build, build / "standalone/apps/web/.next"):
            (path / "prerender-manifest.json").write_text('{}')
        (build / "standalone/apps/web/server.js").write_text('server')
        web.validate_build(build, "A")
        with self.assertRaisesRegex(ValueError, "identity"):
            web.validate_build(build, "B")
        (build / "standalone/apps/web/.next/BUILD_ID").write_text("different")
        with self.assertRaisesRegex(ValueError, "BUILD_ID"):
            web.validate_build(build, "A")
        (build / "standalone/apps/web/.next/BUILD_ID").write_text("fixed-build")
        (build / "prerender-manifest.json").unlink()
        with self.assertRaises(FileNotFoundError):
            web.validate_build(build, "A")

    def test_cancelled_smoke_reaps_its_candidate(self):
        release = self.release("A")
        pid_file = self.base / "candidate.pid"
        (release / "apps/web/server.js").write_text(f'import os, time\nopen({str(pid_file)!r}, "w").write(str(os.getpid()))\ntime.sleep(60)\n')
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        parent = subprocess.Popen([sys.executable, str(Path(__file__).with_name("web-release.py")), "smoke", str(release), "A", "--node", sys.executable, "--port", str(port), "--log", str(self.base / "smoke.log")])
        try:
            deadline = time.monotonic() + 5
            while not pid_file.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(pid_file.exists(), "candidate did not start")
            parent.terminate()
            self.assertEqual(parent.wait(timeout=10), 143)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pid_file.read_text()), 0)
        finally:
            if parent.poll() is None:
                parent.terminate()
                parent.wait(timeout=10)

    def test_fingerprint_tracks_sources_and_inputs_but_ignores_build_output(self):
        root = self.base / "src"
        (root / "apps/web").mkdir(parents=True)
        (root / "apps/web/page.tsx").write_text("page")
        (root / "packages/views").mkdir(parents=True)
        (root / "packages/views/view.tsx").write_text("view")
        for generated in ("node_modules/pkg/index.js", "apps/web/.next/cache/pack.bin",
                           "apps/web/.next-performance-trial/static/x.js", "apps/web/next-env.d.ts"):
            path = root / generated
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("generated")
        identity = web.fingerprint(root)
        self.assertRegex(identity, r"^[0-9a-f]{16}$")
        self.assertEqual(identity, web.fingerprint(root))
        for generated in ("node_modules/pkg/index.js", "apps/web/.next/cache/pack.bin",
                          "apps/web/.next-performance-trial/static/x.js", "apps/web/next-env.d.ts"):
            (root / generated).write_text("rewritten")
        self.assertEqual(identity, web.fingerprint(root))
        (root / "packages/views/view.tsx").write_text("changed")
        self.assertNotEqual(identity, web.fingerprint(root))
        (root / "packages/views/view.tsx").write_text("view")
        self.assertEqual(identity, web.fingerprint(root))
        self.assertNotEqual(identity, web.fingerprint(root, ["NEXT_PUBLIC_APP_VERSION=2"]))
        with self.assertRaisesRegex(ValueError, "missing"):
            web.fingerprint(self.base / "absent")

    def test_cli_dispatch_passes_exact_argument_names_to_every_handler(self):
        # main() calls handlers with argparse destination names as keywords, so
        # each handler parameter must match its CLI argument names exactly.
        cases = {
            "smoke": ["smoke", "release", "identity", "--log", "smoke.log"],
            "validate-build": ["validate-build", "build", "identity"],
            "fingerprint": ["fingerprint", "src", "--input", "NEXT_PUBLIC_APP_VERSION=1"],
            "verify": ["verify", "http://127.0.0.1:3000/", "identity"],
            "verify-assets": ["verify-assets", "web-assets", "http://127.0.0.1:3000/"],
            "publish": ["publish", "web-assets", "release"],
            "nginx": ["nginx", "web-assets", "site.conf"],
            "prune": ["prune", "web-assets", "identity"],
        }
        for command, argv in cases.items():
            with self.subTest(command=command):
                handler = command.replace("-", "_")
                with patch.object(web, handler, autospec=True) as stub, patch.object(sys, "argv", ["web-release.py", *argv]):
                    web.main()
                stub.assert_called_once()


if __name__ == "__main__":
    unittest.main()
