import { defineConfig } from "vite";

export default defineConfig({
  // Worker URLs stay relative so the same artifact works at localhost `/`
  // and the GitHub Pages `/wildwood/` project path.
  base: "./",
  build: {
    lib: {
      entry: "src/main.ts",
      name: "WildwoodGame",
      formats: ["iife"],
      fileName: () => "assets/wildwood/game.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        exports: "none",
      },
    },
  },
});
