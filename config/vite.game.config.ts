import { defineConfig } from "vite";

// Paths remain relative to the repository root, where npm scripts run.

export default defineConfig({
  // Worker URLs stay relative so the same artifact works at localhost `/`
  // and the GitHub Pages `/wildwood/` project path.
  base: "./",
  build: {
    lib: {
      entry: "src/main.ts",
      name: "WildstatGame",
      formats: ["iife"],
      fileName: () => "assets/wildstat/game.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: "none",
      },
    },
  },
});
