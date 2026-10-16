import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { resolveDownloadUrl } from "./distribution.mjs";

// Upload only distributable files, never full unpacked applications.
const root = resolve("dist");
const output = join(root, "artifacts");
mkdirSync(output, { recursive: true });
const names = readdirSync(root).filter((name) => /\.(dmg|zip|exe|AppImage|deb|rpm|blockmap)$/.test(name) || /^latest.*\.yml$/.test(name) || /^(package|smoke)-report-.*\.json$/.test(name));
const installers = names.filter((name) => /\.(dmg|zip|exe|AppImage|deb|rpm)$/.test(name));
if (!installers.length) throw new Error("No Desktop installers were produced");
const metadata = names.filter((name) => /^latest.*\.yml$/.test(name));
if (resolveDownloadUrl() && !metadata.length) throw new Error("Configured distribution requires updater metadata");
for (const name of metadata) {
  const feed = parse(readFileSync(join(root, name), "utf8"));
  if (!Array.isArray(feed.files) || !feed.files.length) throw new Error(`Empty update feed: ${name}`);
  for (const file of feed.files) {
    const asset = decodeURIComponent(file.url);
    if (basename(asset) !== asset || !installers.includes(asset)) throw new Error(`Update feed references missing installer: ${asset}`);
    const bytes = readFileSync(join(root, asset));
    if (file.size !== bytes.length || file.sha512 !== createHash("sha512").update(bytes).digest("base64")) {
      throw new Error(`Update feed checksum/size disagrees with ${asset}`);
    }
  }
}
const lines = [];
for (const name of names.sort()) {
  copyFileSync(join(root, name), join(output, name));
  lines.push(`${createHash("sha256").update(readFileSync(join(root, name))).digest("hex")}  ${name}`);
}
const reportName = names.find((name) => name.startsWith("package-report-"));
if (!reportName) throw new Error("Missing package integrity report");
const report = JSON.parse(readFileSync(join(root, reportName), "utf8"));
writeFileSync(join(output, `SHA256SUMS-${report.platform}-${report.arch}.txt`), `${lines.join("\n")}\n`);
console.log(`[stage-artifacts] ${installers.length} installers, ${metadata.length} verified feeds, ${names.length} upload files`);
