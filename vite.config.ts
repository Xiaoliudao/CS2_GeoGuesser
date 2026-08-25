import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { questionDevServerPlugin } from "./scripts/content/question-dev-server.ts";

export default defineConfig(({ command }) => ({
  plugins: [react(), questionDevServerPlugin(), cloudflare()],
  // public/__dev_assets__ is intentionally served only by the local dev server.
  // Production gameplay continues to use Worker/R2 media routes.
  publicDir: command === "serve" ? "public" : false,
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
}));
