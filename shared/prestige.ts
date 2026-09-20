import { BOSS_REWARD_CLAIM_BITS } from "./rules";
import { PROCEDURAL_ENTRY_BOSS } from "./procedural-maps";

/**
 * Prestige trades a finished campaign for permanent account bonuses. The reset
 * it performs is the ordinary progress reset, unlock flags included, so the
 * next prestige is earned from the forest up rather than from the last map.
 */
export const PRESTIGE_STAT_GAIN_PER_LEVEL = .1;
/** One perk point per level, so a rerun plays differently and not merely faster. */
export const PRESTIGE_PERK_POINTS_PER_LEVEL = 1;

/** The clearance Endless needs: the campaign's last boss is down. */
export function prestigeUnlocked(bossRewardClaims: number) {
  return Boolean(bossRewardClaims & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS]);
}

/** What one kill's stat reward is worth after `level` prestiges. */
export function prestigeStatMultiplier(level: number) {
  return 1 + Math.max(0, Math.floor(Number.isFinite(level) ? level : 0)) * PRESTIGE_STAT_GAIN_PER_LEVEL;
}
