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

/** The campaign's last boss is down: the clearance Endless itself needs. */
export function campaignComplete(bossRewardClaims: number) {
  return Boolean(bossRewardClaims & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS]);
}

/**
 * Each prestige asks for one stage more than the last: the first for the
 * campaign, the second for Endless 1 as well, the third for Endless 2, and so
 * on. Endless progress resets with everything else, so every run has to
 * actually reach its stage rather than lean on an earlier one.
 */
export function prestigeEndlessRequirement(nextLevel: number) {
  return Math.max(0, Math.floor(Number.isFinite(nextLevel) ? nextLevel : 1) - 1);
}

/** Whether a run has earned its next prestige: `nextLevel` is the level it would reach. */
export function prestigeUnlocked(bossRewardClaims: number, completedEndless = 0, nextLevel = 1) {
  return campaignComplete(bossRewardClaims) && completedEndless >= prestigeEndlessRequirement(nextLevel);
}

/** What still stands between this run and its next prestige, in the player's words; empty when nothing does. */
export function prestigeRequirementHint(campaignDone: boolean, completedEndless: number, nextLevel: number) {
  const stage = prestigeEndlessRequirement(nextLevel);
  // The ladder is one list of maps: tier 15 is Aegis Prime, tier 16 is Endless
  // 1, and so on. A run that has cleared Endless N has necessarily cleared
  // everything below it, so naming anything but the stage itself is noise.
  if (stage) return completedEndless >= stage ? "" : `Clear the Endless ${stage} boss to prestige.`;
  return campaignDone ? "" : "Defeat Aegis Prime to unlock Prestige.";
}

/** What one kill's stat reward is worth after `level` prestiges. */
export function prestigeStatMultiplier(level: number) {
  return 1 + Math.max(0, Math.floor(Number.isFinite(level) ? level : 0)) * PRESTIGE_STAT_GAIN_PER_LEVEL;
}

/** A flat mark, so it stays crisp at the twelve pixels a name tag allows. */
export const PRESTIGE_BADGE_ASSET = "assets/wildstat/ui/prestige-shield.svg";
/**
 * One size for the badge wherever it appears: the tag over a player's head,
 * chat, the HUD and the profile. The tag is drawn on a canvas and the rest are
 * DOM, so without a shared number the two drift apart on every layout change.
 * game.css carries the same value as --prestige-badge-size.
 */
export const PRESTIGE_BADGE_PX = 16;
