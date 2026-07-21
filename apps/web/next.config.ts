import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Load root .env so REMOTE_API_URL is available to next.config.ts
config({ path: resolve(__dirname, "../../.env") });

const remoteApiUrl =
  process.env.REMOTE_API_URL || process.env.API_URL || "https://pub.niuwoai.com";

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
  ...(process.env.STANDALONE === "true" ? { output: "standalone" as const } : {}),
  transpilePackages: ["@teamify/core", "@teamify/ui", "@teamify/views"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@tiptap/starter-kit",
      "cmdk",
      "@base-ui/react",
      "date-fns",
      "emoji-mart",
      "@emoji-mart/data",
    ],
  },
  ...(allowedDevOrigins && allowedDevOrigins.length > 0
    ? { allowedDevOrigins }
    : {}),
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 80, 85],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${remoteApiUrl}/api/:path*`,
      },
      // In dev the WS client connects directly to the backend, bypassing
      // this rewrite proxy (Next.js HTTP rewrites are unreliable for
      // long-lived WebSocket connections).  Production deployments typically
      // have nginx/caddy in front so this rule is kept as a fallback.
      {
        source: "/ws",
        destination: `${remoteApiUrl}/ws`,
      },
      // Exclude /auth/callback (Next.js OAuth page) — only proxy API auth
      // paths to the backend.  Top-level rewrites run before filesystem
      // checks so Vercel's staticRoute for /auth/callback cannot interfere.
      {
        source: "/auth/:path((?!callback).*)",
        destination: `${remoteApiUrl}/auth/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${remoteApiUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
