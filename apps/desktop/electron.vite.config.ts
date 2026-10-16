import { resolve } from "path";
import { resolveDownloadUrl } from "./scripts/distribution.mjs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // fix-path is ESM; require() returns a namespace, not its default function.
    build: { rollupOptions: { output: { interop: "auto" } } },
    define: { __DESKTOP_DOWNLOAD_URL__: JSON.stringify(resolveDownloadUrl()) },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: { minify: "esbuild" },
    server: {
      // Allow parallel worktrees to run `pnpm dev:desktop` side-by-side
      // (e.g. iTeamify Canary alongside a primary checkout) by overriding
      // the renderer port via env. Falls back to 5173 for the common case.
      port: Number(process.env.DESKTOP_RENDERER_PORT) || 5173,
      strictPort: true,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
      },
      dedupe: ["react", "react-dom", "@tanstack/react-query"],
    },
  },
});
