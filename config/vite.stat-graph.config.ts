import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "../tools"),
  publicDir: resolve(import.meta.dirname, "../public"),
  base: "./",
  build: {
    outDir: resolve(import.meta.dirname, "../dist/balance-stat-graph"),
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "../tools/balance-stat-graph.html"),
      output: {
        entryFileNames: "assets/balance-stat-graph-[hash].js",
        chunkFileNames: "assets/balance-stat-graph-[hash].js",
        assetFileNames: "assets/balance-stat-graph-[hash][extname]",
      },
    },
  },
});
