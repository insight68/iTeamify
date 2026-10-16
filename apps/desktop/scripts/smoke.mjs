import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const targetDir = process.platform === "darwin" ? (process.arch === "arm64" ? "mac-arm64" : "mac")
  : `${process.platform === "win32" ? "win" : "linux"}${process.arch === "arm64" ? "-arm64" : ""}-unpacked`;
const executable = process.argv[2] || join("dist", targetDir,
  process.platform === "darwin" ? "iteamify.app/Contents/MacOS/iteamify" : process.platform === "win32" ? "iteamify.exe" : "iteamify-desktop");
const root = mkdtempSync(join(tmpdir(), "iteamify-desktop-smoke-"));
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify({ registration_enabled: false, password_auth_enabled: true }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
mkdirSync(join(root, ".iteamify"));
writeFileSync(join(root, ".iteamify", "desktop.json"), JSON.stringify({ schemaVersion: 1, apiUrl: `http://127.0.0.1:${port}`, appUrl: `http://127.0.0.1:${port}` }));
writeFileSync(join(root, ".iteamify", "desktop_prefs.json"), JSON.stringify({ autoStart: false, autoStop: false }));
// Spawn asynchronously so the local fixture server can answer renderer fetches.
const { spawn } = await import("node:child_process");
const env = { ...process.env, HOME: root, USERPROFILE: root, DESKTOP_SMOKE_DIR: root,
  ZDOTDIR: root, ENV: join(root, "empty-profile"), BASH_ENV: join(root, "empty-profile"),
  XDG_CONFIG_HOME: join(root, ".config"), XDG_CACHE_HOME: join(root, ".cache"), XDG_DATA_HOME: join(root, ".local", "share") };
delete env.ELECTRON_RUN_AS_NODE;
const resources = process.platform === "darwin" ? resolve(dirname(executable), "../Resources") : join(dirname(executable), "resources");
const cli = join(resources, "app.asar.unpacked", "resources", "bin", process.platform === "win32" ? "iteamify.exe" : "iteamify");
let timer;
let child;
try {
  const cliInfo = JSON.parse(execFileSync(cli, ["version", "--output", "json"], { env, encoding: "utf8", timeout: 5_000 }));
  if (cliInfo.arch !== (process.arch === "x64" ? "amd64" : process.arch)) throw new Error("Bundled CLI cannot run on the native host");
  child = spawn(resolve(executable), ["--desktop-smoke-test", "--no-sandbox"], { env, stdio: "inherit" });
  timer = setTimeout(() => child.kill("SIGKILL"), 75_000);
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  if (code !== 0) throw new Error(`Packaged native smoke exited ${code}`);
  const report = JSON.parse(readFileSync(join(root, "report.json"), "utf8"));
  if (report.error || !report.cliInstalled || !report.rendered || report.arch !== process.arch) throw new Error(`Invalid native smoke result: ${JSON.stringify(report)}`);
  if (cliInfo.version.replace(/^v/, "") !== report.version) throw new Error("Desktop and bundled CLI versions differ");
  report.cliVersion = cliInfo.version;
  report.cliCommit = cliInfo.commit;
  writeFileSync(join(root, "report.json"), JSON.stringify(report));
  copyFileSync(join(root, "report.json"), resolve("dist", `smoke-report-${process.platform}-${process.arch}.json`));
  console.log(`[desktop-smoke] passed: ${JSON.stringify(report)}`);
} catch (error) {
  const reportPath = join(root, "report.json");
  let report;
  try { report = JSON.parse(readFileSync(reportPath, "utf8")); } catch { report = {}; }
  writeFileSync(resolve("dist", `smoke-report-${process.platform}-${process.arch}.json`), JSON.stringify({ ...report, error: String(error) }));
  throw error;
} finally {
  clearTimeout(timer);
  server.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
