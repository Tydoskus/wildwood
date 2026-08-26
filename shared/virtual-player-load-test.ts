// Browser- and server-safe load-test contract. Keep bot controls, offered load,
// and server authorization limits on one set of values.
export const VIRTUAL_PLAYER_MIN = 1;
export const VIRTUAL_PLAYER_LIMIT = 3_000;
export const VIRTUAL_PLAYER_DEFAULT = 10;
// Chromium limits same-group WebSockets to roughly 255. Leave room for the
// game, devtools, and reconnects; larger tests belong in the Node runner.
export const BROWSER_VIRTUAL_PLAYER_LIMIT = 200;
// Expected steady moving ingress after sparse state-change + heartbeat gating.
export const VIRTUAL_PLAYER_MOVEMENT_HZ = 2;
export const VIRTUAL_PLAYER_SIMULATION_HZ = 60;
export const VIRTUAL_PLAYER_MAX_STEP_SECONDS = .15;
export const VIRTUAL_PLAYER_SAVE_INTERVAL_MS = 30_000;
export const VIRTUAL_PLAYER_SAVE_STRESS_INTERVAL_MS = 2_500;
export const VIRTUAL_PLAYER_TICKET_BYTES = 24;
export const VIRTUAL_PLAYER_TICKET_HEX_LENGTH = VIRTUAL_PLAYER_TICKET_BYTES * 2;

export function normalizeVirtualPlayerCount(value: number) {
  if (!Number.isFinite(value)) return VIRTUAL_PLAYER_DEFAULT;
  return Math.max(VIRTUAL_PLAYER_MIN, Math.min(VIRTUAL_PLAYER_LIMIT, Math.floor(value)));
}

export function isVirtualPlayerTicket(value: string) {
  return value.length === VIRTUAL_PLAYER_TICKET_HEX_LENGTH && /^[a-f0-9]+$/.test(value);
}

/** Mirrors the real client's 60 Hz sender clock from a cheaper 10 Hz bot loop. */
export function advanceVirtualPlayerSimulationTick(currentTick: number, elapsedSeconds: number) {
  const current = Number.isFinite(currentTick) ? Math.max(0, Math.floor(currentTick)) >>> 0 : 0;
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.min(VIRTUAL_PLAYER_MAX_STEP_SECONDS, elapsedSeconds))
    : 0;
  const elapsedTicks = elapsed > 0
    ? Math.max(1, Math.round(elapsed * VIRTUAL_PLAYER_SIMULATION_HZ))
    : 0;
  return (current + elapsedTicks) >>> 0;
}
