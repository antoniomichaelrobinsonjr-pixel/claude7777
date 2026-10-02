import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CompPilot",
    short_name: "CompPilot",
    description: "Guided comparable-sales market analysis",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#070b1c",
    theme_color: "#16204a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
