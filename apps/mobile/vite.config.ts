import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: {
    port: Number(process.env.MOBILE_DEV_PORT) || 5174,
    strictPort: true,
    host: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
});
