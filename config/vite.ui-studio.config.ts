import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Watches public/assets/wildstat/game.css (which Vite's publicDir does not HMR
 * by default) and pushes a custom HMR event so the UI Studio iframe swaps its
 * stylesheet live without losing scroll position or interactive state.
 */
function livePublicCss(): Plugin {
  const cssPath = resolve(import.meta.dirname, "../public/assets/wildstat/game.css");
  return {
    name: "wildstat-live-public-css",
    configureServer(server) {
      server.watcher.add(cssPath);
      server.watcher.on("change", changed => {
        if (resolve(changed) === cssPath) {
          server.ws.send({ type: "custom", event: "wildstat:css-update", data: { at: Date.now() } });
        }
      });
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname, "../tools"),
  publicDir: resolve(import.meta.dirname, "../public"),
  base: "./",
  plugins: [livePublicCss()],
  server: {
    fs: {
      allow: [resolve(import.meta.dirname, "..")],
    },
  },
  build: {
    rollupOptions: {
      input: {
        studio: resolve(import.meta.dirname, "../tools/ui-studio.html"),
        frame: resolve(import.meta.dirname, "../tools/ui-studio-frame.html"),
      },
    },
  },
});
