// Preview iframe runner for WildStat UI Studio: mounts either an interactive extra scene
// or any DOM scene from tools/visual-check/scenes-dom.ts, with live game.css HMR + live CSS injection.
import { EXTRA_SCENES } from "./extra-scenes";
import { DOM_SCENES } from "../visual-check/scenes-dom";

const ALL_SCENES: Record<string, () => Promise<void>> = {
  ...DOM_SCENES,
  ...EXTRA_SCENES,
};

const liveCssStyle = document.getElementById("studioLiveCss") as HTMLStyleElement;

function reloadGameStylesheets(stamp = Date.now()) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const url = new URL(link.href, location.href);
    url.searchParams.set("studioHmr", String(stamp));
    link.href = url.toString();
  }
  window.parent?.postMessage({ type: "studio:css-reloaded" }, "*");
}

if (import.meta.hot) {
  import.meta.hot.on("wildstat:css-update", (data: { at?: number }) => {
    reloadGameStylesheets(data?.at ?? Date.now());
  });
}

window.addEventListener("message", event => {
  const data = event.data as { type?: string; css?: string; freeze?: boolean } | null;
  if (!data) return;
  if (data.type === "studio:set-css") liveCssStyle.textContent = data.css ?? "";
  if (data.type === "studio:set-freeze") document.body.classList.toggle("studio-freeze", Boolean(data.freeze));
});

async function boot() {
  const id = decodeURIComponent(location.hash.replace(/^#/, "")) || "guild-crossing";
  const draw = ALL_SCENES[id];
  if (!draw) throw new Error(`Unknown UI Studio scene "${id}".`);
  await draw();
  window.parent?.postMessage({ type: "studio:ready", id }, "*");
}

boot().catch(error => {
  console.error(error);
  const pre = document.createElement("pre");
  pre.style.cssText = "margin:16px;padding:12px;border-radius:8px;background:#2a1216;color:#ff9b9b;white-space:pre-wrap;";
  pre.textContent = String(error?.stack ?? error);
  document.body.append(pre);
});
