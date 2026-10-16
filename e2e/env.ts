import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

const envCandidates = process.env.ENV_FILE ? [process.env.ENV_FILE] : [".env.aurocreator.local", ".env.worktree", ".env"];

for (const filename of envCandidates) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) {
    config({ path });
    break;
  }
}
