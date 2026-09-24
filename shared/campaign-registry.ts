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

/** Fill neighboring campaign portals; authored positions always win. */
export function fillCampaignPortals(
  arrivals: Record<string, { x: number; y: number }>,
  portals: Record<string, { x: number; y: number; destination: string }[]>,
  overrides: Record<string, { arrival?: { x: number; y: number } }>,
) {
  for (const [index, map] of CAMPAIGN_MAPS.entries()) {
    arrivals[map.id] ??= overrides[map.id]?.arrival ?? { x: 580, y: 770 };
    portals[map.id] ??= index > 0 ? [{ x: 360, y: 617, destination: CAMPAIGN_MAPS[index - 1].id }] : [];
    const next = CAMPAIGN_MAPS[index + 1];
    if (next && !portals[map.id].some(portal => portal.destination === next.id)) {
      portals[map.id].push({ x: 580, y: 617, destination: next.id });
    }
  }
}
