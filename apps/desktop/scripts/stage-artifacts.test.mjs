import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("release artifact integrity", () => {
  it.each([false, true])("rejects corrupt updater metadata: corrupt=%s", (corrupt) => {
    const root = mkdtempSync(join(tmpdir(), "iteamify-release-assets-"));
    try {
      const dist = join(root, "dist");
      mkdirSync(dist);
      const bytes = Buffer.from("installer fixture");
      writeFileSync(join(dist, "iteamify.exe"), bytes);
      writeFileSync(join(dist, "latest.yml"), JSON.stringify({ files: [{ url: "iteamify.exe", size: bytes.length, sha512: corrupt ? "bad" : createHash("sha512").update(bytes).digest("base64") }] }));
      writeFileSync(join(dist, "package-report-win32-x64.json"), JSON.stringify({ platform: "win32", arch: "x64" }));
      writeFileSync(join(dist, "builder-effective-config.yaml"), "never upload effective configuration");
      const result = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "stage-artifacts.mjs")], {
        cwd: root, encoding: "utf8", env: { ...process.env, DESKTOP_DOWNLOAD_URL: "https://example.com/releases" },
      });
      expect(result.status === 0).toBe(!corrupt);
      if (corrupt) expect(result.stderr).toContain("checksum/size disagrees");
      else expect(readFileSync(join(dist, "artifacts", "SHA256SUMS-win32-x64.txt"), "utf8")).not.toContain("builder-effective");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
