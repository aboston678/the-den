import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A new name for public files on every build (src/asset.ts): Vercel's commit, else the build time.
const ASSET_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? Date.now().toString(36);

export default defineConfig({
  plugins: [react()],
  define: { __ASSET_VERSION__: JSON.stringify(ASSET_VERSION) },
  // One .env file at the repo root serves both client and server.
  envDir: "..",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
