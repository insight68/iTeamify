import { extractFile, listPackage } from "@electron/asar";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Runs after every target is packed, before installers or update feeds exist.
export default function verifyPackage(context) {
  const platform = context.electronPlatformName;
  const arch = { 1: "x64", 3: "arm64" }[context.arch];
  if (!arch) throw new Error(`Unsupported package architecture: ${context.arch}`);
  const resources = platform === "darwin"
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : join(context.appOutDir, "resources");
  const archive = join(resources, "app.asar");
  const files = new Set(listPackage(archive).map((file) => file.replace(/^\//, "")));
  for (const file of ["out/main/index.js", "out/preload/index.js", "out/renderer/index.html", "package.json",
    ...["@electron-toolkit/preload", "@electron-toolkit/utils", "electron-updater", "fix-path"].map((name) => `node_modules/${name}/package.json`)]) {
    if (!files.has(file)) throw new Error(`Package is missing ${file}`);
  }
  for (const file of files) {
    if (/^(src|dist|scripts|node_modules\/@iteamify)\//.test(file)) throw new Error(`Unexpected source/output in package: ${file}`);
  }
  const asarBytes = statSync(archive).size;
  if (asarBytes > 60 * 1024 * 1024) throw new Error(`app.asar exceeded the 60 MiB package budget: ${asarBytes}`);
  const cli = join(resources, "app.asar.unpacked", "resources", "bin", platform === "win32" ? "iteamify.exe" : "iteamify");
  const info = execFileSync("go", ["version", "-m", cli], { encoding: "utf8" });
  const goarch = arch === "x64" ? "amd64" : arch;
  const goos = platform === "win32" ? "windows" : platform;
  if (!info.includes(`GOARCH=${goarch}`) || !info.includes(`GOOS=${goos}`)) {
    throw new Error(`Bundled CLI architecture does not match ${platform}/${arch}: ${info}`);
  }
  const metadata = JSON.parse(extractFile(archive, "package.json").toString());
  const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const report = { platform, arch, version: metadata.version, asarBytes, fileCount: files.size,
    asarSha256: sha256(archive), cliSha256: sha256(cli), cliBuildInfo: info };
  writeFileSync(resolve(context.outDir, `package-report-${platform}-${arch}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[verify-package] ${platform}/${arch}: ${asarBytes} bytes, ${files.size} entries, CLI architecture verified`);
}
