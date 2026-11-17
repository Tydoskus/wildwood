import { highestCampaignMap, type CampaignAccess } from "./equipment-access";
import { ITEM_DEFINITIONS, itemDamageMultiplierBonus, itemMaxHealthMultiplierBonus, itemRegenerationMultiplierBonus, itemDefinition, isCosmeticOnlyItem } from "./items";
import { itemTier } from "./item-tier";
import { weaponKind } from "./equip-best";
import { MAP_IDS } from "./rules";

export const GEAR_MAIL_ID = "rebalance-gear-2026-09-17";
export const GEAR_MAIL_LEVEL = 9;
export const GEAR_MAIL_TITLE = "Gear for your map";
export const GEAR_MAIL_BODY = "Hey WildGang, some of you don't have gear for the map you're on anymore after the rebalance, so here's a +9 helmet, chest and bow for your highest unlocked map when I sent this.\n\nIf you already have one, it'll be brought up to +9. Your +10 gear stays +10. Make some room in your bag if you need to -- the gift will stay here until you claim it.\n\nThanks for sticking with me!";

export function gearForHighestMap(progress: CampaignAccess) {
  const tier = Math.min(15, highestCampaignMap(progress) + 1);
  // The letter promises a bow (GEAR_MAIL_BODY), so the map's sword, which hits harder, never stands in for it.
  const items = Object.values(ITEM_DEFINITIONS).filter(item => item.acquisition !== "FISHING_DROP" && itemTier(item.id) === tier && !isCosmeticOnlyItem(item.id)
    && weaponKind(item.id) === "RANGED");
  const itemIds = (["HEAD", "CHEST", "HAND"] as const).map(slot => {
    const candidates = items.filter(item => item.slot === slot).sort((a, b) => {
      const score = (id: string) => itemDamageMultiplierBonus(id) + itemMaxHealthMultiplierBonus(id) + itemRegenerationMultiplierBonus(id) * 10;
      return score(b.id) - score(a.id) || a.id.localeCompare(b.id);
    });
    if (!candidates[0]) throw new Error(`Missing tier ${tier} ${slot} gift`);
    return candidates[0].id;
  });
  return { mapId: MAP_IDS[tier - 1], itemIds };
}

/** Bag space excludes equipped items and cosmetics; running upgrades reserve their return slots. */
export function gearClaimSpace(owned: string[], equipped: string[], upgrading: string[], gift: string[], capacity: number, oreKinds = 0) {
  const allOwned = new Set([...owned, ...upgrading]);
  const equippedSet = new Set(equipped);
  // Each kind of ore held takes a slot too (shared/ore-bag.ts).
  const used = [...allOwned].filter(id => itemDefinition(id) && !isCosmeticOnlyItem(id) && !equippedSet.has(id)).length + Math.max(0, Math.floor(oreKinds));
  const missing = [...new Set(gift)].filter(id => !allOwned.has(id));
  return { missing, slotsToFree: missing.length ? Math.max(0, used + missing.length - capacity) : 0 };
}
