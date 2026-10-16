#!/usr/bin/env python3
"""Readiness and retained public assets for the standalone web deployment."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse


IDENTITY = re.compile(r"^[A-Za-z0-9_-]+$")
HASH_NAME = re.compile(r"[0-9a-f]{8,}")
HTTP_HEADERS = {"Cache-Control": "no-cache", "User-Agent": "aurocreator-deployment/1.0"}
# The artifact identity hashes the sources and the values baked into the
# bundle. Build outputs, dependency trees, caches and generated shims change
# without changing the artifact, so they are not part of the identity. The
# names mirror the rsync hide rules in phase_sync_web so the identity covers
# exactly what the deployment host receives.
FINGERPRINT_SKIP_DIRS = frozenset(
    {".git", "node_modules", ".turbo", ".iteamify", "dist", "build", "coverage", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache", "test-results"}
)
FINGERPRINT_SKIP_DIR_SUFFIXES = (".egg-info",)
FINGERPRINT_SKIP_NAMES = frozenset({"next-env.d.ts", ".DS_Store"})
FINGERPRINT_SKIP_SUFFIXES = (".pyc", ".tsbuildinfo", ".log")


def fetch(url, timeout):
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP {error.code} checking {url}; server={error.headers.get('Server', 'unknown')}") from error


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(data)
    temporary.chmod(0o644)
    temporary.replace(path)


def deployment_id(release):
    config = json.loads((release / "apps/web/.next/required-server-files.json").read_text())
    return config["config"].get("deploymentId") or ""


def fingerprint(root, inputs=None):
    """Content identity of the sources and build inputs that produce the artifact.

    Identical trees and inputs must yield the same identity so a redeployment
    of unchanged sources reuses the Turbo cache and the retained public asset
    archive instead of rebuilding a cold artifact on the deployment host.
    """
    if not root.is_dir():
        raise ValueError(f"source root is missing: {root}")
    digest = hashlib.sha256()
    for value in inputs or ():
        digest.update(b"input\0" + value.encode() + b"\0")
    files = 0
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(
            name for name in dirnames
            if name not in FINGERPRINT_SKIP_DIRS
            and not name.startswith(".next")
            and not name.endswith(FINGERPRINT_SKIP_DIR_SUFFIXES)
        )
        for filename in sorted(filenames):
            if filename in FINGERPRINT_SKIP_NAMES or filename.startswith(".env") or filename.endswith(FINGERPRINT_SKIP_SUFFIXES):
                continue
            path = Path(current) / filename
            relative = path.relative_to(root)
            if path.is_symlink():
                # Reading through a link can escape the tree and double count
                # files; the link target is the source-level fact instead.
                digest.update(b"link\0" + str(relative).encode() + b"\0" + os.readlink(path).encode() + b"\0")
                continue
            digest.update(b"file\0" + str(relative).encode() + b"\0")
            with open(path, "rb") as handle:
                for chunk in iter(lambda: handle.read(1 << 20), b""):
                    digest.update(chunk)
            files += 1
    if files == 0:
        raise ValueError(f"no source files under {root}")
    return digest.hexdigest()[:16]


def verify(url, identity, pid=None, cwd=None, timeout=3):
    if pid is not None:
        if pid <= 0:
            raise ValueError("web PID must identify a running process")
        os.kill(pid, 0)
        if cwd is not None and Path(f"/proc/{pid}/cwd").resolve() != cwd.resolve():
            raise RuntimeError("web process is running a different release")
    html = fetch(url, timeout).decode()
    if f'data-dpl-id="{identity}"' not in html:
        raise RuntimeError("HTTP deployment identity does not match the candidate")
    if pid is not None:
        os.kill(pid, 0)


def verify_assets(root, url, keep=3):
    """Check retained JS, CSS and deployment metadata through the real proxy."""
    archives = sorted((p for p in (root / "releases").iterdir() if (p / "manifest.json").is_file()), key=lambda p: p.stat().st_mtime, reverse=True)[:keep]
    if not archives:
        raise ValueError("no retained static artifacts")
    for archive in archives:
        files = json.loads((archive / "manifest.json").read_text())["files"]
        samples = []
        for prefix, suffix in (("chunks/", ".js"), ("css/", ".css"), ("", "/_buildManifest.js")):
            candidates = [name for name in sorted(files) if name.startswith(prefix) and name.endswith(suffix)]
            if candidates:
                samples.append(candidates[0])
        if not samples:
            raise ValueError("retained artifact has no checkable assets")
        for name in samples:
            target = url.rstrip("/") + "/_next/static/" + urllib.parse.quote(name) + "?dpl=" + archive.name
            digest = hashlib.sha256(fetch(target, 15)).hexdigest()
            if digest != files[name]:
                raise RuntimeError(f"retained asset content mismatch: {archive.name}/{name}")


def smoke(release, identity, port, node, timeout, log):
    if deployment_id(release) != identity:
        raise RuntimeError("build config deployment identity does not match release")
    # Never accept a response from an existing listener or kill its owner.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("127.0.0.1", port))
        port = probe.getsockname()[1]
    print(f"candidate smoke port={port}", flush=True)
    env = dict(os.environ, NODE_ENV="production", HOSTNAME="127.0.0.1", PORT=str(port))
    with open(log, "wb") as output:
        process = subprocess.Popen([node, "apps/web/server.js"], cwd=release, env=env, stdout=output, stderr=output)
        try:
            deadline = time.monotonic() + timeout
            last_error = None
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"candidate exited with {process.returncode}; see {log}")
                try:
                    verify(f"http://127.0.0.1:{port}/", identity, process.pid)
                    if process.poll() is None:
                        return
                except (OSError, RuntimeError) as error:
                    last_error = error
                time.sleep(0.2)
            raise RuntimeError(f"candidate readiness timed out: {last_error}; see {log}")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


def validate_build(build, identity):
    """Resume only a complete standalone build with the exact release identity."""
    runtime = build / "standalone"
    if deployment_id(runtime) != identity:
        raise ValueError("standalone build identity does not match release")
    for path in (build, runtime / "apps/web/.next"):
        config = json.loads((path / "required-server-files.json").read_text())
        if config["config"].get("deploymentId") != identity:
            raise ValueError("build identity does not match release")
        if not (path / "BUILD_ID").read_text().strip():
            raise ValueError("empty BUILD_ID")
        json.loads((path / "prerender-manifest.json").read_text())
    if (build / "BUILD_ID").read_bytes() != (runtime / "apps/web/.next/BUILD_ID").read_bytes():
        raise ValueError("standalone BUILD_ID does not match build")
    if not (runtime / "apps/web/server.js").is_file() or not any((build / "static/chunks").glob("*.js")):
        raise ValueError("standalone server or static chunks are missing")


def publish(root, release):
    configured = deployment_id(release)
    identity = configured or (release.parent.name if release.name == "web" else release.name)
    if not IDENTITY.fullmatch(identity):
        raise ValueError("invalid release identity")
    static = release / "apps/web/.next/static"
    build_id = (release / "apps/web/.next/BUILD_ID").read_text().strip()
    files = {}
    shared = []
    for source in sorted(static.rglob("*")):
        if source.is_symlink():
            raise ValueError("symlinks are not allowed in public assets")
        if not source.is_file():
            continue
        relative = source.relative_to(static)
        files[str(relative)] = hashlib.sha256(source.read_bytes()).hexdigest()
        # The fixed BUILD_ID manifests are deployment metadata, not immutable
        # objects. Legacy unique BUILD_ID manifests remain reachable too.
        if (relative.parts[0] in ("chunks", "css", "media") and HASH_NAME.search(relative.name)) or (not configured and relative.parts[0] == build_id):
            shared.append(relative)
    if not files:
        raise ValueError("empty static artifact")
    archive = root / "releases" / identity
    metadata = {"files": files, "shared": [str(p) for p in shared]}
    if archive.exists():
        if json.loads((archive / "manifest.json").read_text()) != metadata:
            raise ValueError("release identity already belongs to a different artifact")
    else:
        archive.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=".publish-", dir=archive.parent))
        try:
            staging.chmod(0o755)
            shutil.copytree(static, staging / "_next/static")
            atomic_write(staging / "manifest.json", json.dumps(metadata, sort_keys=True))
            staging.rename(archive)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    for relative in shared:
        target = root / "immutable/_next/static" / relative
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != files[str(relative)]:
                raise ValueError(f"immutable asset collision: {relative}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + ".tmp")
            shutil.copyfile(static / relative, temporary)
            temporary.chmod(0o644)
            temporary.replace(target)
    return identity


def nginx(root, site, conf_dir, validate=False):
    # A whitelist map prevents an arbitrary dpl value becoming a file path.
    entries = []
    for archive in sorted((root / "releases").iterdir()):
        if IDENTITY.fullmatch(archive.name) and (archive / "manifest.json").is_file():
            entries.append(f'    ~^{archive.name}$ "{archive}";')
    current = root.parent / "web-current"
    mapping = '\n'.join(["map $arg_dpl $auro_static_root {", f'    default "{root}/immutable";', f'    "" "{current}";', *entries, "}", ""])
    updates = {conf_dir / "conf.d/aurocreator-web-assets.conf": mapping}
    locations = f'''location ^~ /_next/static/ {{
    root $auro_static_root;
    try_files $uri @auro_retained_static;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options nosniff;
}}
location @auro_retained_static {{
    root "{root}/immutable";
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options nosniff;
}}
'''
    include = conf_dir / "aurocreator-web-assets.locations.conf"
    updates[include] = locations
    text = site.read_text()
    directive = f"include {include};"
    if directive not in text:
        # Install only in blocks that actually proxy the web runtime, never
        # the HTTP redirect or default-deny server blocks.
        text, count = re.subn(r"(    location / \{\s*\n\s*proxy_pass http://127\.0\.0\.1:)", f"    {directive}\n\n\\1", text)
        if count == 0:
            raise ValueError("managed web proxy location was not found")
        updates[site] = text
    previous = {path: path.read_text() if path.exists() else None for path in updates}
    try:
        for path, data in updates.items():
            atomic_write(path, data)
        if validate:
            subprocess.run(["nginx", "-t"], check=True)
    except BaseException:
        for path, data in previous.items():
            if data is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, data)
        raise


def prune(root, current, keep, days):
    if keep < 3 or days < 1:
        raise ValueError("retain at least three builds and one day of assets")
    protected = {current}
    runtime = (root.parent / "web-current").resolve()
    if (runtime / "apps/web/.next/required-server-files.json").is_file():
        protected.add(deployment_id(runtime) or (runtime.parent.name if runtime.name == "web" else runtime.name))
    # Every retained runtime is also an eligible rollback target.
    for release in (root.parent / "web-releases").glob("*"):
        if (release / "apps/web/.next/required-server-files.json").is_file():
            protected.add(deployment_id(release) or release.name)
    archives = sorted((p for p in (root / "releases").iterdir() if (p / "manifest.json").is_file()), key=lambda p: p.stat().st_mtime, reverse=True)
    retained = set()
    cutoff = time.time() - days * 86400
    for index, archive in enumerate(archives):
        if index < keep or archive.name in protected or archive.stat().st_mtime >= cutoff:
            retained.update(json.loads((archive / "manifest.json").read_text())["shared"])
        else:
            shutil.rmtree(archive)
    immutable = root / "immutable/_next/static"
    if immutable.exists():
        for asset in immutable.rglob("*"):
            if asset.is_file() and str(asset.relative_to(immutable)) not in retained:
                asset.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    s = commands.add_parser("smoke")
    s.add_argument("release", type=Path)
    s.add_argument("identity")
    s.add_argument("--port", type=int, default=0)
    s.add_argument("--node", default="/usr/bin/node")
    s.add_argument("--timeout", type=float, default=60)
    s.add_argument("--log", required=True)
    b = commands.add_parser("validate-build")
    b.add_argument("build", type=Path)
    b.add_argument("identity")
    f = commands.add_parser("fingerprint")
    f.add_argument("root", type=Path)
    f.add_argument("--input", action="append", dest="inputs", metavar="KEY=VALUE",
                   help="build input mixed into the identity; repeatable")
    v = commands.add_parser("verify")
    v.add_argument("url")
    v.add_argument("identity")
    v.add_argument("--pid", type=int)
    v.add_argument("--cwd", type=Path)
    v.add_argument("--timeout", type=float, default=15)
    a = commands.add_parser("verify-assets")
    a.add_argument("root", type=Path)
    a.add_argument("url")
    a.add_argument("--keep", type=int, default=3)
    for name in ("publish", "nginx", "prune"):
        p = commands.add_parser(name)
        p.add_argument("root", type=Path)
        if name == "publish":
            p.add_argument("release", type=Path)
        elif name == "nginx":
            p.add_argument("site", type=Path)
            p.add_argument("--conf-dir", type=Path, default=Path("/etc/nginx"))
            p.add_argument("--validate", action="store_true")
        else:
            p.add_argument("current")
            p.add_argument("--keep", type=int, default=3)
            p.add_argument("--days", type=int, default=14)
    args = vars(parser.parse_args())
    command = args.pop("command")
    if command == "fingerprint":
        # The deployment reads this identity from stdout and passes it to the
        # build and every readiness check as NEXT_DEPLOYMENT_ID.
        print(fingerprint(**args))
        return
    if command == "smoke":
        # finally still runs on signals, including cancellation over SSH.
        def interrupted(signum, _frame):
            raise SystemExit(128 + signum)
        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        signal.signal(signal.SIGHUP, interrupted)
    globals()[command.replace("-", "_")](**args)


if __name__ == "__main__":
    main()
