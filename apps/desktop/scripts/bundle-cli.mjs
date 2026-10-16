#!/usr/bin/env node
// Builds the `iteamify` CLI from server/cmd/iteamify and copies the binary
// into apps/desktop/resources/bin/ so electron-vite (dev) and electron-
// builder (prod) pick it up. Running this on every dev/package
// invocation guarantees the bundled CLI always matches the current Go
// source — no more stale binary surprises. Go's build cache makes the
// no-op case (nothing changed) effectively free.
//
// ldflags mirror `make build` so `iteamify --version` reports a meaningful
// version / commit / date.
//
// CI and packaging require Go and a freshly built binary. Only the explicit
// --allow-missing-go development option permits runtime bootstrapping.

import { access, chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const serverDir = join(repoRoot, "server");

const PLATFORM_TO_GOOS = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

const SUPPORTED_ARCHS = new Set(["x64", "arm64"]);

function runtimePlatformFromArgs(argv) {
  const flagIndex = argv.indexOf("--target-platform");
  if (flagIndex === -1) return process.platform;
  return argv[flagIndex + 1] ?? "";
}

function runtimeArchFromArgs(argv) {
  const flagIndex = argv.indexOf("--target-arch");
  if (flagIndex === -1) return process.arch;
  return argv[flagIndex + 1] ?? "";
}

function normalizeRuntimePlatform(platform) {
  if (platform in PLATFORM_TO_GOOS) return platform;
  throw new Error(
    `[bundle-cli] unsupported target platform: ${platform}. ` +
      "Use darwin, linux, or win32.",
  );
}

function normalizeRuntimeArch(arch) {
  if (SUPPORTED_ARCHS.has(arch)) return arch;
  throw new Error(
    `[bundle-cli] unsupported target architecture: ${arch}. ` +
      "Use x64 or arm64.",
  );
}

function binaryNameForPlatform(platform) {
  return platform === "win32" ? "iteamify.exe" : "iteamify";
}

const targetPlatform = normalizeRuntimePlatform(
  runtimePlatformFromArgs(process.argv.slice(2)),
);
const targetArch = normalizeRuntimeArch(runtimeArchFromArgs(process.argv.slice(2)));
const goos = PLATFORM_TO_GOOS[targetPlatform];
const goarch = targetArch === "x64" ? "amd64" : targetArch;
const binName = binaryNameForPlatform(targetPlatform);
const srcBinary = join(serverDir, "bin", `${goos}-${goarch}`, binName);
const destDir = join(repoRoot, "apps", "desktop", "resources", "bin");
const destBinary = join(destDir, binName);

// Hand git arguments straight to the binary (no shell). A match pattern like
// `v[0-9]*` must reach git as one literal argument; routing it through a shell
// string breaks on Windows, where cmd.exe keeps the POSIX single quotes and
// git matches no tag — degrading the bundled CLI's version to the
// 0.0.0-g<hash> fallback.
function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf-8", cwd: repoRoot }).trim();
  } catch {
    return "";
  }
}

function hasGo() {
  try {
    execFileSync("go", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (hasGo()) {
  const version =
    process.env.DESKTOP_BUILD_VERSION ||
    git("describe", "--tags", "--match", "v[0-9]*", "--always", "--dirty") ||
    "dev";
  const commit = git("rev-parse", "--short", "HEAD") || "unknown";
  const epoch = process.env.SOURCE_DATE_EPOCH || git("show", "-s", "--format=%ct", "HEAD");
  if (!/^\d+$/.test(epoch)) throw new Error("[bundle-cli] SOURCE_DATE_EPOCH or a Git commit timestamp is required");
  const date = new Date(Number(epoch) * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const symbols = process.argv.includes("--allow-missing-go") ? "" : "-s -w ";
  const ldflags = `${symbols}-X main.version=${version} -X main.commit=${commit} -X main.date=${date}`;

  console.log(
    `[bundle-cli] go build → ${srcBinary} (${goos}/${goarch}, version=${version} commit=${commit})`,
  );
  await mkdir(join(serverDir, "bin", `${goos}-${goarch}`), { recursive: true });
  execFileSync(
    "go",
    [
      "build",
      "-trimpath",
      "-ldflags",
      ldflags,
      "-o",
      srcBinary,
      "./cmd/iteamify",
    ],
    {
      cwd: serverDir,
      stdio: "inherit",
      env: {
        ...process.env,
        CGO_ENABLED: "0",
        GOOS: goos,
        GOARCH: goarch,
      },
    },
  );
} else {
  // A stale server/bin binary must never masquerade as a successful build.
  await rm(destDir, { recursive: true, force: true });
  if (!process.argv.includes("--allow-missing-go") || process.env.CI) {
    throw new Error("[bundle-cli] Go is required for CI and packaging; install the version in server/go.mod");
  }
  console.warn("[bundle-cli] Go unavailable; development CLI bundle omitted");
  process.exit(0);
}

if (!(await exists(srcBinary))) {
  throw new Error(`[bundle-cli] go build did not produce ${srcBinary}`);
}

await rm(destDir, { recursive: true, force: true });
await mkdir(destDir, { recursive: true });
await copyFile(srcBinary, destBinary);
await chmod(destBinary, 0o755);

// macOS: ad-hoc sign so Gatekeeper doesn't complain when the parent app
// (which itself may be unsigned in dev) spawns the child.
if (process.platform === "darwin" && targetPlatform === "darwin") {
  try {
    execFileSync("codesign", ["-s", "-", "--force", destBinary], {
      stdio: "pipe",
    });
  } catch {
    // Non-fatal. Unsigned binaries still run when the parent app is trusted.
  }
}

console.log(`[bundle-cli] bundled ${srcBinary} → ${destBinary}`);
