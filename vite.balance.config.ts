import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/balance-lab",
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "balance-lab.html"),
      output: {
        entryFileNames: "assets/balance-lab-[hash].js",
        chunkFileNames: "assets/balance-lab-[hash].js",
        assetFileNames: "assets/balance-lab-[hash][extname]",
      },
    },
  },
});
