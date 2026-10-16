import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import {
  resolveDevRemoteApiUrl,
  resolveRemoteApiUrl,
} from "./config/runtime-urls";

// Load root .env so local next.config.ts rewrites see REMOTE_API_URL.
// Production requests use proxy.ts runtime rewrites, which read process.env
// when the Next.js server runs instead of baking these URLs at build time.
const repoRoot = resolve(__dirname, "../..");
const envFile = process.env.ENV_FILE || (existsSync(resolve(repoRoot, ".env.aurocreator.local")) ? ".env.aurocreator.local" : ".env");
config({ path: resolve(repoRoot, envFile), quiet: true });

// `next dev` falls back to the conventional localhost upstreams; builds use
// the strict resolvers so prebuilt images keep unset upstreams unproxied.
const isDev = process.env.NODE_ENV === "development";
const remoteApiUrl = isDev
  ? resolveDevRemoteApiUrl(process.env)
  : resolveRemoteApiUrl(process.env);

// Parse hostnames from CORS_ALLOWED_ORIGINS so that Next.js dev server
// allows cross-origin HMR / webpack requests (e.g. from Tailscale IPs).
const allowedDevOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => {
        try {
          return new URL(origin.trim()).host;
        } catch {
          return origin.trim();
        }
      })
      .filter(Boolean)
  : undefined;

const nextConfig: NextConfig = {
  // This is an artifact identity, supplied once at build time by deployment.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  // Isolate production verification from concurrent dev/build processes.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...(process.env.STANDALONE === "true" ? { output: "standalone" as const } : {}),
  // Keep file tracing anchored to this monorepo. Production builds live under
  // /opt/iteamify/build/src while an older release may still exist at
  // /opt/iteamify; relying on automatic root detection would then trace the
  // parent tree and emit paths such as build/src/apps/web/server.js.
  outputFileTracingRoot: resolve(__dirname, "../.."),
  transpilePackages: ["@iteamify/core", "@iteamify/ui", "@iteamify/views"],
  ...(allowedDevOrigins && allowedDevOrigins.length > 0
    ? { allowedDevOrigins }
    : {}),
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 80, 85],
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: remoteApiUrl
        ? [
            {
              source: "/api/:path*",
              destination: `${remoteApiUrl}/api/:path*`,
            },
            {
              source: "/ws",
              destination: `${remoteApiUrl}/ws`,
            },
            {
              source: "/auth/:path*",
              destination: `${remoteApiUrl}/auth/:path*`,
            },
            {
              source: "/uploads/:path*",
              destination: `${remoteApiUrl}/uploads/:path*`,
            },
          ]
        : [],
      fallback: [],
    };
  },
};

export default nextConfig;
