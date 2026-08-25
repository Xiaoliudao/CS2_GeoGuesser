import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { questionDevServerPlugin } from "./scripts/content/question-dev-server.ts";
import { renderSiteHtml } from "./src/shared/siteConfig.ts";

function siteMetadataPlugin(): Plugin {
  return {
    name: "cs2-map-guesser-site-metadata",
    transformIndexHtml: {
      order: "pre",
      handler: renderSiteHtml,
    },
  };
}

export default defineConfig(({ command }) => ({
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [siteMetadataPlugin(), react(), questionDevServerPlugin(), cloudflare()],
  // public/__dev_assets__ is intentionally served only by the local dev server.
  // Production gameplay continues to use Worker/R2 media routes.
  publicDir: command === "serve" ? "public" : false,
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
}));
