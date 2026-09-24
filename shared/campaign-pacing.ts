import { CAMPAIGN_MAPS } from "./campaign-registry";
/** Lab duration references restored to the pre-0.740 campaign.
 * These are comparison targets, never gameplay timers or payout multipliers. */
export const FOREST_TARGET_SECONDS = 48 * 60;
export const CAMPAIGN_PACING_MAPS = CAMPAIGN_MAPS.length;
export const DEFAULT_PACING_STEP = 1;
export function campaignMapTargetSeconds(index: number, desertSeconds = 52 * 60, step = DEFAULT_PACING_STEP, addedSeconds = 76 * 60) {
  if (index === 0) return FOREST_TARGET_SECONDS;
  return desertSeconds * step ** (index - 1) + addedSeconds * (index - 1);
}
export const CAMPAIGN_ENTRY_TARGET_SECONDS = Array.from({ length: CAMPAIGN_PACING_MAPS }, (_, i) => campaignMapTargetSeconds(i)).reduce((a, b) => a + b, 0);
