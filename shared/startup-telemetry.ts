// Browser- and server-safe startup telemetry contract. Keep this module free
// of DOM, Node, and SpacetimeDB imports so both runtimes enforce one allowlist.

export const STARTUP_TELEMETRY_STAGES = [
  "page-load",
  "account-restore",
  "authentication",
  "game-bundle",
  "current-map-assets",
  "connecting",
  "preparing-session",
  "hydrating",
  "gameplay-ready",
] as const;

export type StartupTelemetryStage = typeof STARTUP_TELEMETRY_STAGES[number];

export const STARTUP_TELEMETRY_OUTCOMES = [
  "success",
  "failure",
  "timeout",
  "cancelled",
] as const;

export type StartupTelemetryOutcome = typeof STARTUP_TELEMETRY_OUTCOMES[number];

export const STARTUP_TELEMETRY_ISSUE_CODES = [
  "none",
  "account-restore-error",
  "auth-cancelled",
  "auth-timeout",
  "auth-network-error",
  "auth-state-mismatch",
  "auth-token-invalid",
  "auth-exchange-error",
  "bundle-load-error",
  "asset-load-error",
  "connection-timeout",
  "session-timeout",
  "hydration-timeout",
  "connection-error",
  "connection-closed",
  "session-error",
  "subscription-error",
  "startup-timeout",
  "startup-error",
  "offline",
] as const;

export type StartupTelemetryIssueCode = typeof STARTUP_TELEMETRY_ISSUE_CODES[number];

export const STARTUP_TELEMETRY_CONNECTIVITY = [
  "online",
  "offline",
  "unknown",
] as const;

export type StartupTelemetryConnectivity = typeof STARTUP_TELEMETRY_CONNECTIVITY[number];

export const STARTUP_TELEMETRY_MAX_DURATION_MS = 30 * 60_000;
export const STARTUP_TELEMETRY_MAX_ATTEMPT = 255;
export const STARTUP_TELEMETRY_MAX_BATCH = 8;
export const STARTUP_TELEMETRY_MAX_CLIENT_QUEUE = 24;

export type StartupTelemetrySample = {
  stage: StartupTelemetryStage;
  outcome: StartupTelemetryOutcome;
  issueCode: StartupTelemetryIssueCode;
  durationMs: number;
  attempt: number;
  clientVersion: string;
  connectivity: StartupTelemetryConnectivity;
};

const STAGES = new Set<string>(STARTUP_TELEMETRY_STAGES);
const OUTCOMES = new Set<string>(STARTUP_TELEMETRY_OUTCOMES);
const ISSUE_CODES = new Set<string>(STARTUP_TELEMETRY_ISSUE_CODES);
const CONNECTIVITY_VALUES = new Set<string>(STARTUP_TELEMETRY_CONNECTIVITY);
const CLIENT_VERSION_PATTERN = /^(?:unknown|\d{1,4}(?:\.\d{1,4}){1,3})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStartupTelemetryStage(value: unknown): value is StartupTelemetryStage {
  return typeof value === "string" && STAGES.has(value);
}

export function isStartupTelemetryOutcome(value: unknown): value is StartupTelemetryOutcome {
  return typeof value === "string" && OUTCOMES.has(value);
}

export function isStartupTelemetryIssueCode(value: unknown): value is StartupTelemetryIssueCode {
  return typeof value === "string" && ISSUE_CODES.has(value);
}

export function isStartupTelemetryConnectivity(value: unknown): value is StartupTelemetryConnectivity {
  return typeof value === "string" && CONNECTIVITY_VALUES.has(value);
}

export function isStartupTelemetryClientVersion(value: unknown): value is string {
  return typeof value === "string" && CLIENT_VERSION_PATTERN.test(value);
}

/**
 * Rebuilds a sample from its fixed fields. Unknown/free-form values are
 * rejected instead of being copied into storage or sent to the server.
 */
export function normalizeStartupTelemetrySample(value: unknown): StartupTelemetrySample | null {
  if (!isRecord(value)) return null;
  if (!isStartupTelemetryStage(value.stage) || !isStartupTelemetryOutcome(value.outcome)) return null;
  if (!isStartupTelemetryIssueCode(value.issueCode)) return null;
  if (!isStartupTelemetryClientVersion(value.clientVersion)) return null;
  if (!isStartupTelemetryConnectivity(value.connectivity)) return null;
  if (!Number.isFinite(value.durationMs) || !Number.isFinite(value.attempt)) return null;

  const durationMs = Math.max(0, Math.min(STARTUP_TELEMETRY_MAX_DURATION_MS, Math.round(Number(value.durationMs))));
  const attempt = Math.max(0, Math.min(STARTUP_TELEMETRY_MAX_ATTEMPT, Math.floor(Number(value.attempt))));
  const issueCode = value.issueCode;
  if ((value.outcome === "success") !== (issueCode === "none")) return null;

  return {
    stage: value.stage,
    outcome: value.outcome,
    issueCode,
    durationMs,
    attempt,
    clientVersion: value.clientVersion,
    connectivity: value.connectivity,
  };
}
