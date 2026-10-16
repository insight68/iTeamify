import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iteamify — AI-native collaboration",
    short_name: "iteamify",
    description:
      "An AI-native collaboration platform for small teams: tasks, projects, knowledge and agents in one workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    // Brand Deep Blue — also the PWA title-bar tint on Android.
    theme_color: "#0F2D3D",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
