import { itemTier } from "./item-tier";
import { canonicalItemId } from "./items";
import { MAP_IDS, MAP_DISPLAY_NAMES } from "./rules";

export const CAMPAIGN_UNLOCK_FIELDS = ["desertUnlocked", "snowlandsUnlocked", "lavaUnlocked", "infernalUnlocked",
  "waterUnlocked", "samuraiUnlocked", "cloudspireUnlocked", "moonfenUnlocked", "crystalHollowsUnlocked",
  "clockworkRuinsUnlocked", "duskfallOrchardUnlocked", "neonBastionUnlocked", "verdantCatacombsUnlocked", "ionCitadelUnlocked"] as const;
export type CampaignAccess = Partial<Record<typeof CAMPAIGN_UNLOCK_FIELDS[number], boolean>>;

export function highestCampaignMap(progress: CampaignAccess) {
  return CAMPAIGN_UNLOCK_FIELDS.reduce((highest, field, index) => progress[field] ? index + 1 : highest, 0);
}

/**
 * Campaign map the player may actually stand on. MAP_IDS is the ladder in
 * order and CAMPAIGN_UNLOCK_FIELDS holds the flag for each rung above the
 * first, so a map they have not earned sends them to their highest rung.
 * Maps outside the ladder (home, procedural) are left for their own checks.
 */
export function accessibleCampaignMap(mapId: string, progress: CampaignAccess): string {
  const rung = MAP_IDS.indexOf(mapId);
  if (rung <= 0 || progress[CAMPAIGN_UNLOCK_FIELDS[rung - 1]]) return mapId;
  return MAP_IDS[highestCampaignMap(progress)];
}

export function equipmentMapRequirement(itemId: string, progress: CampaignAccess | null | undefined): string | null {
  const tier = itemTier(canonicalItemId(itemId) ?? itemId);
  if (!tier || tier <= 1 || progress?.[CAMPAIGN_UNLOCK_FIELDS[tier - 2]]) return null;
  return MAP_DISPLAY_NAMES[MAP_IDS[tier - 1] as keyof typeof MAP_DISPLAY_NAMES] ?? `Map ${tier}`;
}

export const EQUIPMENT_ACCESS_FIELDS = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const;

/** Keep ownership and cosmetics; locked equipment cannot contribute combat stats. */
export function withoutLockedEquipment<T extends Partial<Record<typeof EQUIPMENT_ACCESS_FIELDS[number], string>>>(loadout: T, access: CampaignAccess,
  fallback: Partial<Record<typeof EQUIPMENT_ACCESS_FIELDS[number], string>> = {}): T {
  const result = { ...loadout };
  for (const field of EQUIPMENT_ACCESS_FIELDS) {
    if (result[field] && equipmentMapRequirement(result[field], access)) {
      const replacement = fallback[field] ?? "";
      result[field] = equipmentMapRequirement(replacement, access) ? "" : replacement;
    }
  }
  return result;
}
