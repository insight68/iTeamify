import { app, type BrowserWindow, session } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// A local command-line diagnostic only; renderer input cannot enable it.
export function initializeSmoke(): string | null {
  if (!process.argv.includes("--desktop-smoke-test")) return null;
  const root = process.env.DESKTOP_SMOKE_DIR;
  if (!root || !isAbsolute(root) || process.env.HOME !== root || process.env.USERPROFILE !== root) {
    throw new Error("Desktop smoke requires an absolute, isolated HOME/USERPROFILE/DESKTOP_SMOKE_DIR");
  }
  const userData = join(root, "user-data");
  mkdirSync(userData, { recursive: true });
  app.setPath("home", root);
  app.setPath("userData", userData);
  return root;
}

export function isolateSmokeNetwork(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowed = ["file:", "data:", "blob:", "devtools:"].includes(url.protocol) ||
      (["http:", "ws:"].includes(url.protocol) && url.hostname === "127.0.0.1");
    callback({ cancel: !allowed });
  });
}

export async function verifySmokeWindow(window: BrowserWindow, root: string): Promise<void> {
  const failures: string[] = [];
  window.webContents.on("render-process-gone", (_event, details) => failures.push(`Renderer exited: ${details.reason}`));
  window.webContents.on("preload-error", (_event, _path, error) => failures.push(`Preload failed: ${error.message}`));
  try {
    let result: { version: string; cliInstalled: boolean; state: string; rendered: boolean } | undefined;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (failures.length) throw new Error(failures.join("; "));
      result = await window.webContents.executeJavaScript(`(async () => ({
        version: window.desktopAPI?.appInfo.version,
        cliInstalled: await window.daemonAPI?.isCliInstalled(),
        state: (await window.daemonAPI?.getStatus())?.state,
        rendered: !!document.querySelector('#root input') && document.querySelector('#root').innerText.length > 0
      }))()`);
      if (result?.rendered && result.cliInstalled && result.state === "stopped") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!result?.rendered || !result.cliInstalled || result.state !== "stopped") {
      throw new Error(`Packaged renderer/IPC/CLI did not become ready: ${JSON.stringify(result)}`);
    }
    if (result.version !== app.getVersion()) throw new Error("Preload app version disagrees with packaged main");
    const pdf = await window.webContents.printToPDF({ pageSize: "A4" });
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Native PDF generation failed");
    writeFileSync(join(root, "report.json"), JSON.stringify({ ...result, pdfBytes: pdf.length, platform: process.platform, arch: process.arch }));
    app.exit(0);
  } catch (error) {
    console.error("[desktop-smoke]", error);
    writeFileSync(join(root, "report.json"), JSON.stringify({ error: String(error), failures }));
    app.exit(1);
  }
}
