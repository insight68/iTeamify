import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createServer } from "node:net";

const [sourceFile = ".env", targetFile = ".env.aurocreator.local"] = process.argv.slice(2);
if (existsSync(targetFile)) throw new Error(`${targetFile} already exists; it has not been overwritten`);
const database = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) throw new Error("Local isolation requires a local PostgreSQL target");
const suffix = createHash("sha256").update(resolve(".")).digest("hex").slice(0, 8);
const dbName = `aurocreator_local_${suffix}`;
database.pathname = `/${dbName}`;

async function availablePort(start) {
  for (let port = start; port < start + 100; port++) {
    const free = await new Promise((resolvePort, reject) => {
      const server = createServer();
      server.once("error", (error) => error.code === "EADDRINUSE" ? resolvePort(false) : reject(error));
      server.listen(port, () => server.close(() => resolvePort(true)));
    });
    if (free) return port;
  }
  throw new Error(`No free port near ${start}`);
}
const port = await availablePort(18080);
const webPort = await availablePort(13000);
const origin = `http://localhost:${webPort}`;
let redisUrl = "";
if (process.env.REDIS_URL) {
  const redis = new URL(process.env.REDIS_URL);
  if (["localhost", "127.0.0.1", "[::1]"].includes(redis.hostname)) {
    redis.pathname = "/9";
    redisUrl = redis.toString();
  }
}
const overrides = {
  DATABASE_URL: database.toString(), POSTGRES_DB: dbName,
  POSTGRES_USER: decodeURIComponent(database.username), POSTGRES_PASSWORD: decodeURIComponent(database.password),
  POSTGRES_PORT: database.port || "5432", PORT: port, BACKEND_PORT: port, API_PORT: port, SERVER_PORT: port,
  FRONTEND_PORT: webPort, FRONTEND_ORIGIN: origin, ITEAMIFY_APP_URL: origin,
  ITEAMIFY_SERVER_URL: `ws://localhost:${port}/ws`, REMOTE_API_URL: `http://localhost:${port}`,
  NEXT_PUBLIC_API_URL: "", NEXT_PUBLIC_WS_URL: "", PLAYWRIGHT_BASE_URL: origin,
  SERVER_HOST: "127.0.0.1", APP_ENV: "development", ITEAMIFY_PROJECT_ID: `aurocreator:${suffix}`,
  CORS_ALLOWED_ORIGINS: origin, ITEAMIFY_DEV_VERIFICATION_CODE: "888888", ANALYTICS_DISABLED: "true",
  RESEND_API_KEY: "", SMTP_HOST: "",
  REDIS_URL: redisUrl, LOCAL_UPLOAD_DIR: "../.iteamify/local/uploads", LOCAL_UPLOAD_BASE_URL: `http://localhost:${port}`,
  GOOGLE_REDIRECT_URI: `${origin}/auth/callback`, COMPOSIO_CALLBACK_BASE_URL: origin,
  ITEAMIFY_GMAIL_CALLBACK_BASE_URL: `http://localhost:${port}`,
};
// Preserve secrets and unrelated operator settings in the original file.
const lines = readFileSync(sourceFile, "utf8").split(/\r?\n/).filter((line) => {
  const key = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=/)?.[1];
  return !key || !Object.hasOwn(overrides, key);
});
for (const [key, value] of Object.entries(overrides)) {
  if (/[\s'"`$#]/.test(String(value))) throw new Error(`Unsupported shell character in ${key}; use a URL-encoded connection string`);
  lines.push(`${key}=${value}`);
}
writeFileSync(targetFile, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
console.log(`Created ${targetFile}: database=${dbName}, API=${port}, Web=${webPort}`);
console.log("Original env, database and listening processes were preserved. Run make migrate-up next.");
