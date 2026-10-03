import { defineConfig } from "vite";
import { recentChangelog } from "./vite-recent-changelog";

// Paths remain relative to the repository root, where npm scripts run.

export default defineConfig({
  plugins: [recentChangelog()],
  build: {
    lib: {
      entry: "src/wildstat-coop.ts",
      name: "WildstatCoop",
      formats: ["iife"],
      fileName: () => "assets/wildstat/coop-client.js",
    },
    outDir: "dist",
    // This build runs first. It recreates the deploy artifact and copies public/.
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});
