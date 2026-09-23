import { GAME_VERSION } from "../../game/runtime/game-settings";
import { PROTOCOL_VERSION } from "../../../shared/rules";
import type { ConnectionDiagnostic, ConnectionEventKind } from "../../../shared/connection-diagnostics";
import { createConnectionDiagnostics } from "./connection-diagnostics";
import { createConnectionVisibility } from "./connection-visibility";
// The account shell and game are separate bundles: share one collector per page.
const key = Symbol.for("wildstat.connection-diagnostics");
const globals = globalThis as typeof globalThis & { [key: symbol]: unknown };
const bus = (globals[key] ??= {}) as { collector?: ReturnType<typeof createConnectionDiagnostics> };
export function recordConnectionDiagnostic(kind: ConnectionEventKind, data: Partial<ConnectionDiagnostic> = {}) { bus.collector?.record(kind, data); }
/** For events with no identity yet: delivered by the next connection in this tab. */
export function recordCarriedConnectionDiagnostic(kind: ConnectionEventKind, data: Partial<ConnectionDiagnostic> = {}) { bus.collector?.record(kind, data, true); }
export function flushConnectionDiagnostics() { return bus.collector?.flush() ?? Promise.resolve(); }
export function configureConnectionDiagnostics(options: Parameters<typeof createConnectionDiagnostics>[0]) {
  const visibility = createConnectionVisibility(Date.now, document.hidden);
  let map = ""; let mapSince = performance.now();
  bus.collector = createConnectionDiagnostics({ ...options, snapshot: () => {
    const context = options.snapshot();
    if (context.mapId !== map) { map = context.mapId ?? ""; mapSince = performance.now(); }
    const ua = navigator.userAgent;
    const native = Boolean((window as Window & { WILDSTAT_NATIVE_PREVIEW?: boolean }).WILDSTAT_NATIVE_PREVIEW);
    const device = /android/i.test(ua) ? "android" : /iphone|ipad/i.test(ua) ? "ios" : "desktop";
    return { ...context, ...visibility.snapshot(), clientVersion: GAME_VERSION, protocolVersion: PROTOCOL_VERSION,
      mapAgeMs: performance.now() - mapSince, platform: `${native ? "native" : "web"}-${device}`,
      hidden: document.hidden, online: navigator.onLine };
  } });
  // Fixed low-frequency flush, never a send on movement, combat, or each frame.
  window.setInterval(() => { void flushConnectionDiagnostics(); }, 15_000);
  for (const event of ["offline", "online"] as const) window.addEventListener(event, () => recordConnectionDiagnostic(event));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) visibility.hide(); else visibility.show();
    recordConnectionDiagnostic(document.hidden ? "page-hidden" : "page-visible");
  });
  window.addEventListener("pagehide", () => { visibility.hide(); recordConnectionDiagnostic("page-exit"); });
  window.addEventListener("pageshow", () => { if (!document.hidden) visibility.show(); });
}
