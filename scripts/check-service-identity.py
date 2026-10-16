#!/usr/bin/env python3
"""Validate a local API's project, checkout instance and migration set before reuse."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
port = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PORT", "8080")
versions = sorted(p.name.removesuffix(".up.sql") for p in (root / "server/migrations").glob("*.up.sql"))
expected = hashlib.sha256("\n".join(versions).encode()).hexdigest()
try:
    with urllib.request.urlopen(f"http://localhost:{port}/readyz", timeout=5) as response:
        data = json.load(response)
except (OSError, ValueError) as error:
    raise SystemExit(f"Cannot verify local API on :{port}: {error}") from None
identity = data.get("identity", {})
if data.get("status") != "ok" or identity.get("project") != "aurocreator":
    raise SystemExit("Local API is not a ready Aurocreator instance")
if identity.get("instance_id") != os.environ.get("ITEAMIFY_PROJECT_ID"):
    raise SystemExit("Local API belongs to a different checkout instance")
if identity.get("migrations_digest") != expected:
    raise SystemExit("Local API migration set does not match this checkout")
expected_commits = {
    subprocess.check_output(["git", "rev-parse", option, "HEAD"], cwd=root, text=True).strip()
    for option in ("--short", "--verify")
}
if identity.get("commit") not in expected_commits:
    raise SystemExit("Local API build commit does not match this checkout; restart it using make server/start/dev")
print(f"Verified Aurocreator API on :{port}; commit={identity.get('commit')}")
