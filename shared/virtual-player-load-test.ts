// Browser- and server-safe load-test contract. Keep bot controls, offered load,
// and server authorization limits on one set of values.
export const VIRTUAL_PLAYER_MIN = 1;
export const VIRTUAL_PLAYER_LIMIT = 3_000;
export const VIRTUAL_PLAYER_DEFAULT = 10;
export const VIRTUAL_PLAYER_MOVEMENT_HZ = 15;
export const VIRTUAL_PLAYER_SAVE_INTERVAL_MS = 2_500;

export function normalizeVirtualPlayerCount(value: number) {
  if (!Number.isFinite(value)) return VIRTUAL_PLAYER_DEFAULT;
  return Math.max(VIRTUAL_PLAYER_MIN, Math.min(VIRTUAL_PLAYER_LIMIT, Math.floor(value)));
}
