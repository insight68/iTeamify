import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("CLI build without a Go toolchain", () => {
  it.each([
    [[], undefined, false],
    [["--allow-missing-go"], "true", false],
    [["--allow-missing-go"], undefined, true],
  ])("requires an explicit development-only fallback: %j, CI=%s", (args, ci, success) => {
    const root = mkdtempSync(join(tmpdir(), "iteamify-cli-build-"));
    try {
      const scripts = join(root, "apps", "desktop", "scripts");
      const resources = join(root, "apps", "desktop", "resources", "bin");
      mkdirSync(scripts, { recursive: true });
      mkdirSync(resources, { recursive: true });
      mkdirSync(join(root, "empty-path"));
      writeFileSync(join(resources, "iteamify"), "stale binary");
      const script = join(scripts, "bundle-cli.mjs");
      copyFileSync(join(dirname(fileURLToPath(import.meta.url)), "bundle-cli.mjs"), script);
      const result = spawnSync(process.execPath, [script, ...args], {
        cwd: root, encoding: "utf8",
        env: { PATH: join(root, "empty-path"), SystemRoot: process.env.SystemRoot, ...(ci ? { CI: ci } : {}) },
      });
      expect(result.status === 0).toBe(success);
      expect(existsSync(resources)).toBe(false);
      if (!success) expect(result.stderr).toContain("Go is required for CI and packaging");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
