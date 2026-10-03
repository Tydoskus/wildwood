import entries from "./campaign-registry.json";
export type CampaignMapDefinition = typeof entries[number];
/** Append new maps here; claimIndex is permanent save metadata, not an array index. */
export const CAMPAIGN_MAPS: readonly CampaignMapDefinition[] = entries;
export function campaignEndpoint(maps: readonly CampaignMapDefinition[] = CAMPAIGN_MAPS) {
  if (!maps.length) throw new Error("Campaign must contain at least one map.");
  const last = maps[maps.length - 1];
  return { mapId: last.id, bossKind: last.bossKind, bossArt: last.bossArt, mapNumber: maps.length,
    // Desert is tier zero: the tier immediately after the final campaign map.
    endlessTier: maps.length - 1 };
}
export const CAMPAIGN_ENDPOINT = campaignEndpoint();

