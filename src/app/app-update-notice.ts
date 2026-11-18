import { nativeUpdates, type NativeUpdateState } from "./native-updates";
import { recordConnectionDiagnostic, connectionDiagnosticsActive } from "../coop/services/connection-diagnostic-runtime";

/** The installed app's own files, not a downloaded update. */
const INSTALLED = "Installed app";
const REPORT_CHECK_MS = 30_000;
const INSTALLED_KEY = Symbol.for("wildstat.app-update-notice");

/** A downloaded update waiting for the next launch: something to tell the player about. */
export function updateWaiting(state: Pick<NativeUpdateState, "channel" | "pending"> | null | undefined) {
  return Boolean(state && state.channel === "production" && state.pending && state.pending !== INSTALLED);
}

/** One line for the server: what the phone runs, what waits, and what the updater last said. */
export function updateReport(state: Pick<NativeUpdateState, "channel" | "current" | "pending" | "message">) {
  return `current=${state.current} pending=${state.pending ?? "none"} channel=${state.channel} message=${state.message}`.slice(0, 240);
}

/**
 * On the Android app: a banner once an update has downloaded, since it only applies when the app is closed and
 * opened again, and a report to the server whenever the updater's state changes, so stuck phones show up.
 */
export function installAppUpdateNotice(doc: Document = document) {
  // Both coop-client.js (for the start/protocol-refusal screens) and game.js call this; install once per document.
  const markerHost = doc as unknown as Record<symbol, unknown>;
  if (markerHost[INSTALLED_KEY]) return;
  markerHost[INSTALLED_KEY] = true;
  let banner: HTMLElement | null = null, dismissed = "", reported = "";
  function render() {
    const state = nativeUpdates()?.snapshot();
    report(state);
    const show = updateWaiting(state) && state!.pending !== dismissed;
    if (!show) { if (banner) banner.hidden = true; return; }
    if (!banner) {
      banner = doc.createElement("section");
      banner.id = "appUpdateReadyBanner";
      banner.setAttribute("aria-label", "App update ready");
      const message = doc.createElement("span");
      message.setAttribute("role", "status");
      const restart = nativeUpdates()?.applyNow;
      // One tap restarts into it; an older updater without the restart asks for a close and reopen.
      message.textContent = restart ? "Update Ready" : "Update ready · Close and reopen WildStat";
      const ok = doc.createElement("button");
      ok.type = "button";
      ok.textContent = restart ? "Later" : "OK";
      ok.addEventListener("click", () => { dismissed = nativeUpdates()?.snapshot().pending ?? ""; render(); });
      if (restart) {
        const now = doc.createElement("button");
        now.type = "button";
        now.textContent = "Restart";
        now.addEventListener("click", () => {
          if (now.disabled) return;
          now.disabled = true;
          void Promise.resolve(nativeUpdates()?.applyNow?.()).catch(() => {}).finally(() => { now.disabled = false; });
        });
        banner.append(message, now, ok);
      } else banner.append(message, ok);
      doc.body.append(banner);
    }
    banner.hidden = false;
  }
  function report(state: NativeUpdateState | undefined) {
    if (!state || state.busy || !connectionDiagnosticsActive()) return;
    const line = updateReport(state);
    if (line === reported) return;
    reported = line;
    recordConnectionDiagnostic("app-update", { detail: line });
  }
  const view = doc.defaultView;
  view?.addEventListener("wildstat:ota-available", render);
  view?.addEventListener("wildstat:ota-changed", render);
  // Diagnostics start after sign-in: the first state is reported once they can carry it.
  view?.setInterval(() => report(nativeUpdates()?.snapshot()), REPORT_CHECK_MS);
  render();
}
