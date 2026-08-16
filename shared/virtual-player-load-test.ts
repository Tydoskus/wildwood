// Browser- and server-safe load-test contract. Keep bot controls, offered load,
// and server authorization limits on one set of values.
export const VIRTUAL_PLAYER_COUNT_OPTIONS = [5, 10, 25, 50] as const;
export const VIRTUAL_PLAYER_LIMIT = VIRTUAL_PLAYER_COUNT_OPTIONS[VIRTUAL_PLAYER_COUNT_OPTIONS.length - 1];
export const VIRTUAL_PLAYER_MOVEMENT_HZ = 15;
export const VIRTUAL_PLAYER_SAVE_INTERVAL_MS = 2_500;
