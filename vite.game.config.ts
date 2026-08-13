import { defineConfig } from "vite";

export default defineConfig({
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
