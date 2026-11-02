/** Only operational fields cross this boundary; never credentials or full URLs. */
export const CONNECTION_EVENT_KINDS = ["socket-close", "socket-error", "connect-error", "decompression-error", "lifecycle-failure", "reconnected", "session-blocked", "title-screen", "update-reload", "user-sign-out", "map-retry", "page-hidden", "page-visible", "page-exit", "offline", "online", "connection-reset", "portal-start", "portal-complete", "portal-failed", "wake-resume", "wake-reconnect", "rewards-discarded", "rewards-throttled", "rewards-stalled", "autofarm-death", "latency-spike", "app-update", "graphics", "canvas-purge", "subscription-error"] as const;
export type ConnectionEventKind = typeof CONNECTION_EVENT_KINDS[number];
export type ConnectionDiagnostic = {
  eventId: string; kind: ConnectionEventKind; occurredAtMs: number;
  clientVersion: string; protocolVersion: number; mapId: string; database: string;
  transport: string; phase: string; attempt: number; connectionAgeMs: number;
  lastActivityAgeMs: number; mapAgeMs: number; latencyMs: number; hidden: boolean; online: boolean;
  platform: string; code: number; clean: boolean; intentional: boolean; detail: string;
  activity: string; hiddenForMs: number; sinceVisibleMs: number; category: string;
  /** Only on "graphics": how this browser draws, and the FPS it reached. */
  graphics?: GraphicsDiagnostic;
};
export const GRAPHICS_CLASSES = ["GPU", "Software", "Unknown"] as const;
export type GraphicsClass = typeof GRAPHICS_CLASSES[number];
export type GraphicsDiagnostic = {
  rendererClass: GraphicsClass; renderer: string; vendor: string; masked: boolean;
  caveat: "pass" | "fail" | "unavailable"; webgl: boolean; webgl2: boolean;
  dpr: number; canvasWidth: number; canvasHeight: number;
  fpsAvg: number; fpsLow: number; fpsSamples: number; workFps: number; browser: string; os: string;
};
export const CONNECTION_DIAGNOSTIC_QUEUE_LIMIT = 80;
export const CONNECTION_DIAGNOSTIC_BATCH_LIMIT = 12;
export function safeDiagnosticText(value: unknown, max = 240): string {
  if (typeof value !== "string") return "";
  return value.replace(/(?:https?|wss?):\/\/[^\s"']+/gi, "[url]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, "[token]")
    .replace(/\b(?:Bearer\s+\S+|(?:token|authorization|password|secret|code)=\S+)/gi, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/[\u0000-\u001f]/g, " ").slice(0, max);
}
const number = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
const identifier = (v: unknown, max = 80) => typeof v === "string" && /^[a-zA-Z0-9_.:-]+$/.test(v) ? v.slice(0, max) : "unknown";
function normalizeGraphics(value: unknown): GraphicsDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  if (!GRAPHICS_CLASSES.includes(g.rendererClass as GraphicsClass)) return null;
  return {
    rendererClass: g.rendererClass as GraphicsClass, renderer: safeDiagnosticText(g.renderer, 160), vendor: safeDiagnosticText(g.vendor, 80),
    masked: g.masked === true, caveat: g.caveat === "pass" || g.caveat === "fail" ? g.caveat : "unavailable",
    webgl: g.webgl === true, webgl2: g.webgl2 === true,
    dpr: typeof g.dpr === "number" && Number.isFinite(g.dpr) ? Math.max(0, Math.min(8, Math.round(g.dpr * 100) / 100)) : 0,
    canvasWidth: number(g.canvasWidth, 16384), canvasHeight: number(g.canvasHeight, 16384),
    fpsAvg: number(g.fpsAvg, 1000), fpsLow: number(g.fpsLow, 1000), fpsSamples: number(g.fpsSamples, 1e6), workFps: number(g.workFps, 10000),
    browser: typeof g.browser === "string" && /^[A-Za-z]+(?: \d{1,4})?$/.test(g.browser) ? g.browser : "Other",
    os: typeof g.os === "string" && /^[A-Za-z]{1,16}$/.test(g.os) ? g.os : "Other",
  };
}
export function normalizeConnectionDiagnostic(value: unknown): ConnectionDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!CONNECTION_EVENT_KINDS.includes(v.kind as ConnectionEventKind) || typeof v.eventId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(v.eventId)) return null;
  const activity = ["foreground", "background", "tab-return"].includes(String(v.activity)) ? String(v.activity) : v.hidden === true ? "background" : "unknown";
  const graphics = v.kind === "graphics" ? normalizeGraphics(v.graphics) : null;
  if (v.kind === "graphics" && !graphics) return null;
  const category = v.kind === "graphics" || v.kind === "canvas-purge" ? "graphics" : v.kind === "decompression-error" || v.kind === "socket-close" && [1002, 1003, 1007].includes(Number(v.code)) ? "protocol-error"
    : v.intentional === true && v.detail === "route-change" ? "portal-transition"
    : activity === "background" || activity === "tab-return" ? "tab-away"
    : v.intentional === true ? "intentional-reset"
    : ["socket-close", "socket-error", "connect-error", "lifecycle-failure", "map-retry"].includes(String(v.kind)) ? "connection-failure" : "lifecycle";
  return {
    eventId: v.eventId, kind: v.kind as ConnectionEventKind, occurredAtMs: number(v.occurredAtMs, 9e15),
    clientVersion: identifier(v.clientVersion, 20), protocolVersion: number(v.protocolVersion, 1e6),
    mapId: identifier(v.mapId), database: identifier(v.database), transport: identifier(v.transport, 20),
    phase: identifier(v.phase, 40), attempt: number(v.attempt, 65535), connectionAgeMs: number(v.connectionAgeMs, 7 * 864e5),
    lastActivityAgeMs: number(v.lastActivityAgeMs, 7 * 864e5), mapAgeMs: number(v.mapAgeMs, 7 * 864e5), latencyMs: number(v.latencyMs, 300e3),
    hidden: v.hidden === true, online: v.online === true, platform: identifier(v.platform, 32),
    code: number(v.code, 65535), clean: v.clean === true, intentional: v.intentional === true, detail: safeDiagnosticText(v.detail),
    activity, category, hiddenForMs: number(v.hiddenForMs, 7 * 864e5), sinceVisibleMs: number(v.sinceVisibleMs, 7 * 864e5),
    ...(graphics ? { graphics } : {}),
  };
}
