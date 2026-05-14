import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Harwick",
    short_name: "Harwick",
    description: "Private lead desk for real estate teams.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "fullscreen", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    categories: ["business", "productivity"],
    lang: "en-US",
    icons: [
      {
        src: "/harwick-gemini-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/harwick-gemini-logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/harwick-gemini-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Ask Harwick",
        short_name: "Voice",
        description: "Hands-free voice command",
        url: "/v?voice=1",
      },
      {
        name: "Queue",
        short_name: "Queue",
        description: "What needs you now",
        url: "/queue",
      },
      {
        name: "Conversations",
        short_name: "Inbox",
        description: "Live conversations",
        url: "/conversations",
      },
    ],
    prefer_related_applications: false,
  };
}
