import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const config = parse(readFileSync(fileURLToPath(new URL("../../../.goreleaser.yml", import.meta.url)), "utf8"));
// Share CLI build/archive settings without generating upstream tap exports.
delete config.brews;
delete config.homebrew_casks;
const epoch = execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], { encoding: "utf8" }).trim();
const date = new Date(Number(epoch) * 1000).toISOString().replace(/\.\d+Z$/, "Z");
for (const build of config.builds) {
  build.flags = [...new Set([...(build.flags || []), "-trimpath"])];
  build.ldflags = build.ldflags.map((flag) => flag.startsWith("-X main.date=") ? `-X main.date=${date}` : flag);
}
if (!process.argv[2]) throw new Error("Pass a temporary output config path");
writeFileSync(process.argv[2], stringify(config));
