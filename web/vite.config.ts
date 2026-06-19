import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The React app builds into dist/web/public, which the Loom server serves as
// static assets (with an index.html SPA fallback).
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // shared, framework-free core (the CRDT) — single source of truth
      "@core": resolve(__dirname, "../src/core"),
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/web/public"),
    emptyOutDir: true,
  },
});
