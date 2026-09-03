import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "../tools"),
  publicDir: resolve(import.meta.dirname, "../public"),
  base: "./",
  build: {
    outDir: resolve(import.meta.dirname, "../dist/balance-lab"),
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "../tools/balance-lab.html"),
      output: {
        entryFileNames: "assets/balance-lab-[hash].js",
        chunkFileNames: "assets/balance-lab-[hash].js",
        assetFileNames: "assets/balance-lab-[hash][extname]",
      },
    },
  },
});
