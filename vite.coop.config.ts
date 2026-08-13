import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/wildwood-coop.ts",
      name: "WildwoodCoop",
      formats: ["iife"],
      fileName: () => "assets/wildwood/coop-client.js",
    },
    outDir: "dist",
    // This build runs first. It recreates the deploy artifact and copies public/.
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});
