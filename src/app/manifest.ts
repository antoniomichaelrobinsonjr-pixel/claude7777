import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CompPilot",
    short_name: "CompPilot",
    description: "Guided comparable-sales market analysis",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6fb",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
