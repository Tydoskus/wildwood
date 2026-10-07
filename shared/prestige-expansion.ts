import { formatTimerMs } from "./timer-format";

/** One shared countdown, persisted by the server on the expansion's first launch. */
export const PRESTIGE_EXPANSION_DELAY_MS = 30 * 60_000;
export const PRESTIGE_LEGACY_CAP = 20;
export const PRESTIGE_EXPANSION_PERK_IDS = ["bossSlayer", "secondWind", "longShot", "fleetFoot"] as const;

export function prestigeExpansionUnlocked(unlocksAtMs: number | null | undefined, nowMs: number) {
  return Number.isFinite(unlocksAtMs) && Number(unlocksAtMs) > 0 && nowMs >= Number(unlocksAtMs);
}

export function prestigeExpansionLabel(unlocksAtMs: number, nowMs: number) {
  if (prestigeExpansionUnlocked(unlocksAtMs, nowMs)) return "Prestige 20 uncapped · New perks available";
  return `Prestige 20 uncapped in ${formatTimerMs(unlocksAtMs - nowMs)} · New perks coming`;
}
