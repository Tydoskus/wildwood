import { BOSS_REWARD_CLAIM_BITS } from "./rules";
import { CAMPAIGN_MAPS, type CampaignMapDefinition } from "./campaign-registry";

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
  return Boolean(bossRewardClaims & BOSS_REWARD_CLAIM_BITS[CAMPAIGN_MAPS[CAMPAIGN_MAPS.length - 1].bossKind]);
}

/** Prestige follows absolute map numbers, even when the campaign grows. */
export const PRESTIGE_FIRST_MAP = 15;
export function prestigeRequiredMap(nextLevel: number) {
  return PRESTIGE_FIRST_MAP + Math.max(1, Math.floor(Number.isFinite(nextLevel) ? nextLevel : 1)) - 1;
}
export function prestigeEndlessRequirement(nextLevel: number, campaignLength = CAMPAIGN_MAPS.length) {
  return Math.max(0, prestigeRequiredMap(nextLevel) - campaignLength);
}
export function prestigeCampaignTarget(nextLevel: number, maps: readonly CampaignMapDefinition[] = CAMPAIGN_MAPS) {
  return maps[Math.min(prestigeRequiredMap(nextLevel), maps.length) - 1];
}
export function prestigeCampaignComplete(bossRewardClaims: number, nextLevel: number, maps: readonly CampaignMapDefinition[] = CAMPAIGN_MAPS) {
  const target = prestigeCampaignTarget(nextLevel, maps);
  return Boolean(target && (bossRewardClaims & 2 ** target.claimIndex));
}
export function prestigeUnlocked(bossRewardClaims: number, completedEndless = 0, nextLevel = 1, maps: readonly CampaignMapDefinition[] = CAMPAIGN_MAPS) {
  return prestigeCampaignComplete(bossRewardClaims, nextLevel, maps)
    && completedEndless >= prestigeEndlessRequirement(nextLevel, maps.length);
}
/** The target can be an authored boss or a stage after the campaign. */
export function prestigeRequirementHint(campaignDone: boolean, completedEndless: number, nextLevel: number, maps: readonly CampaignMapDefinition[] = CAMPAIGN_MAPS) {
  const stage = prestigeEndlessRequirement(nextLevel, maps.length);
  if (stage) return campaignDone && completedEndless >= stage ? "" : `Clear the Endless ${stage} boss to prestige.`;
  const target = maps[prestigeRequiredMap(nextLevel) - 1];
  return campaignDone ? "" : `Defeat ${target?.bossName ?? `the Map ${prestigeRequiredMap(nextLevel)} boss`} to unlock Prestige.`;
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
export const PRESTIGE_BADGE_PX = 19;
