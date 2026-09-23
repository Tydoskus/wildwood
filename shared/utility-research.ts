import { OFFLINE_WINDOW_SECONDS } from "./offline-progress";

function rank(value: unknown, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(Number(value)))) : 0;
}

/** Utility research affects new timers; a timer already running keeps its finish time. */
export function slotUpgradeDurationWithResearch(baseMs: number, speedRank: number) {
  return Math.max(1_000, Math.round(baseMs / (1 + rank(speedRank, 5) * .01)));
}

export function enemyRespawnSecondsWithResearch(baseSeconds: number, respawnRank: number) {
  return Math.max(1, baseSeconds - rank(respawnRank, 5) * .5);
}

export function bossRespawnSecondsWithResearch(baseSeconds: number, respawnRank: number) {
  return Math.max(1, baseSeconds - rank(respawnRank, 5));
}

export function offlineWindowSecondsWithResearch(offlineRank: number) {
  return OFFLINE_WINDOW_SECONDS + rank(offlineRank, 3) * 10 * 60;
}
