import { describe, expect, it } from "vitest";
import { accessibleCampaignMap, CAMPAIGN_UNLOCK_FIELDS, type CampaignAccess } from "./equipment-access";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  ION_CITADEL_MAP_ID,
  MAP_IDS,
  MOONFEN_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
} from "./rules";

/** Unlocks every rung up to and including the given map. */
function progressThrough(mapId: string): CampaignAccess {
  const rung = MAP_IDS.indexOf(mapId);
  return Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.slice(0, rung).map(field => [field, true]));
}

describe("accessibleCampaignMap", () => {
  it("keeps the ladder and its unlock flags aligned rung for rung", () => {
    expect(CAMPAIGN_UNLOCK_FIELDS).toHaveLength(MAP_IDS.length - 1);
  });

  it("leaves the first map alone even with no progress at all", () => {
    expect(accessibleCampaignMap(TUTORIAL_FOREST_MAP_ID, {})).toBe(TUTORIAL_FOREST_MAP_ID);
  });

  it("keeps a map the player has unlocked", () => {
    expect(accessibleCampaignMap(SAMURAI_GARDEN_MAP_ID, progressThrough(SAMURAI_GARDEN_MAP_ID)))
      .toBe(SAMURAI_GARDEN_MAP_ID);
  });

  it("drops a locked map to the highest one earned", () => {
    expect(accessibleCampaignMap(ION_CITADEL_MAP_ID, progressThrough(WATER_REACH_MAP_ID)))
      .toBe(WATER_REACH_MAP_ID);
  });

  it("sends a player with nothing unlocked back to the first map", () => {
    expect(accessibleCampaignMap(MOONFEN_MAP_ID, {})).toBe(TUTORIAL_FOREST_MAP_ID);
  });

  it("resolves every rung to itself once it is unlocked", () => {
    for (const mapId of MAP_IDS) {
      expect(accessibleCampaignMap(mapId, progressThrough(mapId))).toBe(mapId);
    }
  });

  it("never returns a map the player has not unlocked", () => {
    for (const earned of MAP_IDS) {
      const progress = progressThrough(earned);
      for (const requested of MAP_IDS) {
        const resolved = accessibleCampaignMap(requested, progress);
        const rung = MAP_IDS.indexOf(resolved);
        expect(rung === 0 || progress[CAMPAIGN_UNLOCK_FIELDS[rung - 1]]).toBe(true);
      }
    }
  });

  it("honours a flag set out of order rather than stopping below the gap", () => {
    // Bosses can grant two rungs at once, so a player may hold a later flag
    // without the one beneath it. The earned map still wins.
    const gapped: CampaignAccess = { ...progressThrough(ADVANCED_LAVA_WASTES_MAP_ID), cloudspireUnlocked: true };
    expect(accessibleCampaignMap(MOONFEN_MAP_ID, gapped)).toBe(CLOUDSPIRE_MAP_ID);
  });

  it("leaves maps outside the campaign ladder for their own checks", () => {
    expect(accessibleCampaignMap("home_exterior", {})).toBe("home_exterior");
    expect(accessibleCampaignMap("generated_7", progressThrough(BEGINNER_DESERT_MAP_ID))).toBe("generated_7");
  });
});
