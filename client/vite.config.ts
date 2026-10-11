import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // One .env file at the repo root serves both client and server.
  envDir: "..",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
