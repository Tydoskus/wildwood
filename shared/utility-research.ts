import { OFFLINE_WINDOW_SECONDS } from "./offline-progress";
import { DEFAULT_ATTACK_RANGE } from "./rules";

function rank(value: unknown, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(Number(value)))) : 0;
}

/** The server also reapplies this duration to running slot upgrades. */
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

export function attackRangeWithResearch(rangeRank: number) {
  return DEFAULT_ATTACK_RANGE + rank(rangeRank, 5) * 10;
}
