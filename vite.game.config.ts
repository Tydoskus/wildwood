import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      name: "WildwoodGame",
      formats: ["iife"],
      fileName: () => "game.js",
    },
    outDir: "assets/wildwood",
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        exports: "none",
      },
    },
  },
});
