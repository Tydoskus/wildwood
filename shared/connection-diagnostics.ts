/** Only operational fields cross this boundary; never credentials or full URLs. */
export const CONNECTION_EVENT_KINDS = ["socket-close", "socket-error", "connect-error", "decompression-error", "lifecycle-failure", "reconnected", "session-blocked", "title-screen", "update-reload", "user-sign-out", "map-retry", "page-hidden", "page-visible", "page-exit", "offline", "online", "connection-reset", "portal-start", "portal-complete", "portal-failed", "wake-resume", "wake-reconnect", "rewards-discarded"] as const;
export type ConnectionEventKind = typeof CONNECTION_EVENT_KINDS[number];
export type ConnectionDiagnostic = {
  eventId: string; kind: ConnectionEventKind; occurredAtMs: number;
  clientVersion: string; protocolVersion: number; mapId: string; database: string;
  transport: string; phase: string; attempt: number; connectionAgeMs: number;
  lastActivityAgeMs: number; mapAgeMs: number; latencyMs: number; hidden: boolean; online: boolean;
  platform: string; code: number; clean: boolean; intentional: boolean; detail: string;
  activity: string; hiddenForMs: number; sinceVisibleMs: number; category: string;
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
export function normalizeConnectionDiagnostic(value: unknown): ConnectionDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!CONNECTION_EVENT_KINDS.includes(v.kind as ConnectionEventKind) || typeof v.eventId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(v.eventId)) return null;
  const activity = ["foreground", "background", "tab-return"].includes(String(v.activity)) ? String(v.activity) : v.hidden === true ? "background" : "unknown";
  const category = v.kind === "decompression-error" || v.kind === "socket-close" && [1002, 1003, 1007].includes(Number(v.code)) ? "protocol-error"
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
  };
}
