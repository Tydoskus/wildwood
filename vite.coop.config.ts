import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/wildwood-coop.ts",
      name: "WildwoodCoop",
      formats: ["iife"],
      fileName: () => "coop-client.js",
    },
    outDir: "assets/wildwood",
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});
