// Player progress rows and what they own: the default row, the fresh-save and
// equal-values checks, the inventory a row describes, slot upgrade tiers, the
// equipped and cosmetic presentation, and max health. Moved out of index.ts
// unchanged; reducers that write progress stay there.
import { PLAYER_STARTING_POWER } from "../../shared/player-power";
import { PLAYER_PROJECTILE_SPEED, DEFAULT_ATTACK_RANGE, PLAYER_SPEED, isBaseStoredSpeed } from "../../shared/rules";
import { STARTER_STONE, MAX_FOREST_ITEM_COUNT, canonicalItemId, STARTER_ITEM_IDS, DEVELOPER_ITEM_IDS, STARTER_BOW, WOODEN_ARMOR, EQUIPMENT_DROP_ITEM_IDS, SUPERIOR_GOLDEN_HELMET, BASIC_PAPER_HAT, itemFitsEquipmentSlot, equipmentMaxHealth, type ItemLevel } from "../../shared/items";
import { refineLevelFor } from "./item-refine";
import { activeCardTotalsFor } from "./active-cards";
import { cardStatFactors } from "../../shared/card-effects";
import { PRISMSHELL_ID } from "./boss-combat";
import { isDeveloperIdentity } from "./session-guards";
import { normalizeSlotTier, upgradeSlotForItem } from "../../shared/slot-upgrades";
import { readPlayerProgress } from "./wide-stats";
import { activeItemUpgradeEntriesFor } from "./upgrade-bench-slots";
import { weaponKind } from "../../shared/equip-best";
import { canonicalSavedHand, blankHandWeapon } from "./loadout";
import { cosmeticUnlocks } from "../../shared/cosmetic-conversion";
import { isHiddenCosmeticItem, HIDDEN_COSMETIC_ITEM_ID, resolveEquipmentAppearance } from "../../shared/equipment-appearance";
import { lentLooksFor } from "./patreon";
import { researchInPlay } from "./bonus-toggles";
import { soulStatsFor } from "./soul-dimension";

export function defaultPlayerProgress(identity: any) {
  return {
    identity,
    ...PLAYER_STARTING_POWER,
    projectileSpeed: PLAYER_PROJECTILE_SPEED,
    projectileCount: 1,
    attackRange: DEFAULT_ATTACK_RANGE,
    speed: PLAYER_SPEED,
    bootsCollected: true,
    inventoryJson: JSON.stringify([STARTER_STONE]),
    equippedHead: "",
    equippedChest: "",
    equippedFeet: "",
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
    introComplete: false,
    desertUnlocked: false,
    snowlandsUnlocked: false,
    lavaUnlocked: false,
    infernalUnlocked: false,
    waterUnlocked: false,
    samuraiUnlocked: false,
    cloudspireUnlocked: false,
    moonfenUnlocked: false,
    crystalHollowsUnlocked: false, clockworkRuinsUnlocked: false, duskfallOrchardUnlocked: false, neonBastionUnlocked: false, verdantCatacombsUnlocked: false, ionCitadelUnlocked: false,
    bossRewardClaims: 0,
    critRating: 0, maxHpWide: 0, damageWide: 0, armorWide: 0, regenWide: 0,
    bowCount: 0,
    woodenArmorCount: 0,
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    cosmeticItemsJson: "[]",
    speedOverride: 0,
  };
}

export const PLAYER_PROGRESS_VALUE_FIELDS = [
  "maxHp",
  "damage",
  "attackRate",
  "projectileSpeed",
  "projectileCount",
  "attackRange",
  "armor",
  "regen",
  "speed",
  "bootsCollected",
  "inventoryJson",
  "equippedHead",
  "equippedChest",
  "equippedFeet",
  "equippedRightHand",
  "equippedLeftHand",
  "introComplete",
  "desertUnlocked",
  "snowlandsUnlocked",
  "lavaUnlocked",
  "infernalUnlocked",
  "waterUnlocked",
  "samuraiUnlocked",
  "cloudspireUnlocked",
  "moonfenUnlocked",
  "crystalHollowsUnlocked", "clockworkRuinsUnlocked", "duskfallOrchardUnlocked", "neonBastionUnlocked", "verdantCatacombsUnlocked", "ionCitadelUnlocked",
  "bossRewardClaims",
  "bowCount",
  "woodenArmorCount",
  "cosmeticHead",
  "cosmeticChest",
  "cosmeticFeet",
  "cosmeticRightHand",
  "cosmeticLeftHand",
  "cosmeticItemsJson",
  "speedOverride",
] as const;

export function samePlayerProgressValues(left: any, right: any) {
  return PLAYER_PROGRESS_VALUE_FIELDS.every((field) => left[field] === right[field]);
}

export function hasFreshProgress(progress: any) {
  const defaultProgress = defaultPlayerProgress(progress.identity);
  return !progress.introComplete &&
    progress.maxHp === defaultProgress.maxHp &&
    progress.damage === defaultProgress.damage &&
    progress.attackRate === defaultProgress.attackRate &&
    progress.projectileSpeed === defaultProgress.projectileSpeed &&
    progress.projectileCount === defaultProgress.projectileCount &&
    progress.attackRange === defaultProgress.attackRange &&
    progress.armor === defaultProgress.armor &&
    (progress.regen === 0 || Math.abs(progress.regen - defaultProgress.regen) < 1e-6) &&
    isBaseStoredSpeed(progress.speed) &&
    (progress.speedOverride ?? 0) === 0 &&
    progress.bootsCollected === defaultProgress.bootsCollected &&
    progress.inventoryJson === defaultProgress.inventoryJson &&
    progress.equippedHead === defaultProgress.equippedHead &&
    progress.equippedFeet === defaultProgress.equippedFeet &&
    progress.equippedChest === defaultProgress.equippedChest &&
    progress.equippedRightHand === defaultProgress.equippedRightHand &&
    progress.equippedLeftHand === defaultProgress.equippedLeftHand &&
    progress.cosmeticHead === defaultProgress.cosmeticHead &&
    progress.cosmeticChest === defaultProgress.cosmeticChest &&
    progress.cosmeticFeet === defaultProgress.cosmeticFeet &&
    progress.cosmeticRightHand === defaultProgress.cosmeticRightHand &&
    progress.cosmeticLeftHand === defaultProgress.cosmeticLeftHand &&
    progress.bowCount === defaultProgress.bowCount &&
    progress.woodenArmorCount === defaultProgress.woodenArmorCount &&
    progress.desertUnlocked === defaultProgress.desertUnlocked &&
    progress.snowlandsUnlocked === defaultProgress.snowlandsUnlocked &&
    progress.lavaUnlocked === defaultProgress.lavaUnlocked &&
    progress.infernalUnlocked === defaultProgress.infernalUnlocked &&
    progress.waterUnlocked === defaultProgress.waterUnlocked &&
    progress.samuraiUnlocked === defaultProgress.samuraiUnlocked &&
    progress.cloudspireUnlocked === defaultProgress.cloudspireUnlocked &&
    progress.moonfenUnlocked === defaultProgress.moonfenUnlocked &&
    progress.crystalHollowsUnlocked === defaultProgress.crystalHollowsUnlocked &&
    progress.clockworkRuinsUnlocked === defaultProgress.clockworkRuinsUnlocked &&
    progress.duskfallOrchardUnlocked === defaultProgress.duskfallOrchardUnlocked &&
    progress.neonBastionUnlocked === defaultProgress.neonBastionUnlocked &&
    (progress.bossRewardClaims ?? 0) === defaultProgress.bossRewardClaims;
}

export function resultIncludesContributor(latest: any, identity: any) {
  if (!latest) return false;
  try {
    const contributors = JSON.parse(latest.contributorsJson);
    const identityHex = identity.toHexString();
    return Array.isArray(contributors) && contributors.some((entry: any) => entry?.identity === identityHex);
  } catch {
    return false;
  }
}

export function contributedToLatestPrismshell(ctx: any, identity: any) {
  return resultIncludesContributor(ctx.db.prismshellResult?.id.find(PRISMSHELL_ID), identity);
}

export function forestItemCountForProgress(progress: any, itemId: string, field: "bowCount" | "woodenArmorCount") {
  const storedCount = Number.isInteger(progress?.[field]) ? progress[field] : 0;
  let legacyCount = 0;
  try {
    const savedItems = JSON.parse(progress.inventoryJson ?? "[]");
    if (Array.isArray(savedItems)) legacyCount = savedItems.filter((savedItem) => savedItem === itemId).length;
  } catch {}
  return Math.max(0, Math.min(MAX_FOREST_ITEM_COUNT, Math.max(storedCount, legacyCount)));
}

// Each player's last bag, by identity: kill reports decode the same one again and again. The list
// is a pure function of the four fields compared, and callers get a copy, so a hit is exact.
type InventoryMemo = { json: string; developer: boolean; bowCount: unknown; woodenArmorCount: unknown; items: ReturnType<typeof decodeInventory> };
const inventoryMemo = new Map<string, InventoryMemo>();
const INVENTORY_MEMO_PLAYERS = 512;

export function inventoryForProgress(progress: any) {
  const json = progress.inventoryJson ?? "[]", developer = isDeveloperIdentity(progress.identity);
  const key = typeof json === "string" ? progress.identity?.toHexString?.() : undefined;
  const hit = key === undefined ? undefined : inventoryMemo.get(key);
  if (hit && hit.json === json && hit.developer === developer
    && Object.is(hit.bowCount, progress.bowCount) && Object.is(hit.woodenArmorCount, progress.woodenArmorCount)) return hit.items.slice();
  const items = decodeInventory(progress, json, developer);
  if (key !== undefined) {
    inventoryMemo.delete(key);
    inventoryMemo.set(key, { json, developer, bowCount: progress.bowCount, woodenArmorCount: progress.woodenArmorCount, items });
    if (inventoryMemo.size > INVENTORY_MEMO_PLAYERS) inventoryMemo.delete(inventoryMemo.keys().next().value!);
  }
  return items.slice();
}

function decodeInventory(progress: any, json: unknown, developer: boolean) {
  // Decode once. Previously every catalog item reparsed the same JSON payload.
  let saved: unknown[] = [];
  try { const value = JSON.parse(json as string); if (Array.isArray(value)) saved = value; } catch {}
  const owned = new Set(saved.map(canonicalItemId).filter(Boolean));
  const forestCount = (itemId: string, field: string) => Math.max(0, Math.min(MAX_FOREST_ITEM_COUNT,
    Math.max(Number.isInteger(progress[field]) ? progress[field] : 0, saved.filter(id => id === itemId).length)));
  return [
    ...STARTER_ITEM_IDS,
    ...(developer ? DEVELOPER_ITEM_IDS : DEVELOPER_ITEM_IDS.filter(id => owned.has(id))),
    ...Array(forestCount(STARTER_BOW, "bowCount")).fill(STARTER_BOW),
    ...Array(forestCount(WOODEN_ARMOR, "woodenArmorCount")).fill(WOODEN_ARMOR),
    ...OWNED_EQUIPMENT_DROP_IDS.filter(id => owned.has(id)),
  ];
}

// The starter bow and wooden armor go through the count-field migration above.
export const OWNED_EQUIPMENT_DROP_IDS = EQUIPMENT_DROP_ITEM_IDS.filter(id => id !== STARTER_BOW && id !== WOODEN_ARMOR);

export function inventoryWithBetaHelmet(progress: any, grant: boolean) {
  const inventory = inventoryForProgress(progress);
  if (grant && !inventory.includes(SUPERIOR_GOLDEN_HELMET)) inventory.push(SUPERIOR_GOLDEN_HELMET);
  return inventory;
}

export function slotUpgradeKey(identity: any, slot: string) {
  return `${identity.toHexString()}:${slot}`;
}

/** The tier a slot has reached, zero when it has never been upgraded. */
export function slotUpgradeTierFor(ctx: any, identity: any, slot: string | null) {
  if (!slot) return 0;
  return normalizeSlotTier(ctx.db.playerItemUpgrade.key.find(slotUpgradeKey(identity, slot))?.level ?? 0);
}

/** The tier that applies to an item: whatever its slot has earned. */
export function itemUpgradeLevelFor(ctx: any, identity: any, itemId: unknown) {
  return slotUpgradeTierFor(ctx, identity, upgradeSlotForItem(itemId));
}

/**
 * What a worn item's stat stands on: its slot's tier and its own refine (item-refine.ts). An equipment slot
 * always holds an item's first copy, so the refine is the first copy's.
 */
export function itemLevelFor(ctx: any, identity: any, itemId: unknown): ItemLevel {
  const canonical = canonicalItemId(itemId);
  return { tier: itemUpgradeLevelFor(ctx, identity, itemId), refine: canonical ? refineLevelFor(ctx, identity, canonical) : 0 };
}

export function progressHasItem(progress: any, itemId: string) {
  return inventoryForProgress(progress).includes(itemId);
}

export function playerOwnsItem(ctx: any, identity: any, itemId: string) {
  const progress = readPlayerProgress(ctx, identity);
  if (progressHasItem(progress ?? defaultPlayerProgress(identity), itemId)) return true;
  return activeItemUpgradeEntriesFor(ctx, identity).some(({ active }) => active.itemId === itemId);
}

export function restoreItemToProgress(progress: any, itemId: string) {
  let next = { ...progress };
  if (itemId === STARTER_BOW) next.bowCount = 1;
  else if (itemId === WOODEN_ARMOR) next.woodenArmorCount = 1;
  else {
    const inventory = inventoryForProgress(next);
    if (!inventory.includes(itemId)) inventory.push(itemId);
    next.inventoryJson = JSON.stringify(inventory);
  }
  next.inventoryJson = JSON.stringify([...new Set(inventoryForProgress(next))]);
  return next;
}

export function equippedHeadForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  if (progress.equippedHead === "") return "";
  return inventory.includes(progress.equippedHead) ? progress.equippedHead : BASIC_PAPER_HAT;
}

export function equippedChestForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  return inventory.includes(progress.equippedChest) ? progress.equippedChest : "";
}

export function equippedFeetForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  return inventory.includes(progress.equippedFeet) ? progress.equippedFeet : "";
}

export function equippedRightHandForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  const saved = canonicalSavedHand(progress, "equippedRightHand");
  if (saved && inventory.includes(saved)) return saved;
  if (equippedLeftHandForProgress(progress, inventory)) return "";
  return blankHandWeapon(inventory, weaponKind(saved || canonicalSavedHand(progress, "equippedLeftHand")));
}

export function equippedLeftHandForProgress(progress: any, inventory = inventoryForProgress(progress)) {
  const saved = canonicalSavedHand(progress, "equippedLeftHand");
  return saved && inventory.includes(saved) ? saved : "";
}

export function cosmeticEquipmentForProgress(progress: any, lentLooks: readonly string[], inventory = inventoryForProgress(progress)) {
  const ownedItemIds = new Set([...inventory, ...cosmeticUnlocks(progress.cosmeticItemsJson), ...lentLooks]);
  const itemFor = (field: "cosmeticHead" | "cosmeticChest" | "cosmeticFeet" | "cosmeticRightHand" | "cosmeticLeftHand", slot: "HEAD" | "CHEST" | "FEET" | "RIGHT_HAND" | "LEFT_HAND") => {
    if (isHiddenCosmeticItem(progress[field])) return HIDDEN_COSMETIC_ITEM_ID;
    const itemId = canonicalItemId(progress[field]);
    return itemId && ownedItemIds.has(itemId) && itemFitsEquipmentSlot(itemId, slot) ? itemId : "";
  };
  const cosmeticRightHand = itemFor("cosmeticRightHand", "RIGHT_HAND");
  return {
    cosmeticHead: itemFor("cosmeticHead", "HEAD"),
    cosmeticChest: itemFor("cosmeticChest", "CHEST"),
    cosmeticFeet: itemFor("cosmeticFeet", "FEET"),
    cosmeticRightHand,
    cosmeticLeftHand: cosmeticRightHand ? "" : itemFor("cosmeticLeftHand", "LEFT_HAND"),
  };
}

export function equipmentPresentationForProgress(ctx: any, progress: any, inventory = inventoryForProgress(progress)) {
  // Empty hands look empty; combat bounds still read them as the best weapon owned.
  const rightHandItem = progress.equippedRightHand || progress.equippedLeftHand ? equippedRightHandForProgress(progress, inventory) : "";
  const cosmetics = cosmeticEquipmentForProgress(progress, lentLooksFor(ctx, progress.identity), inventory);
  return resolveEquipmentAppearance({
    equippedFeet: equippedFeetForProgress(progress, inventory),
    equippedHead: equippedHeadForProgress(progress, inventory),
    equippedChest: equippedChestForProgress(progress, inventory),
    equippedRightHand: rightHandItem,
    equippedLeftHand: rightHandItem ? "" : equippedLeftHandForProgress(progress, inventory),
    ...cosmetics,
  });
}

export function leaderboardAppearanceForProgress(ctx: any, progress: any, profile: any) {
  return {
    skinTone: profile?.skinTone ?? 3,
    ...equipmentPresentationForProgress(ctx, progress),
  };
}

export function maxHealthForProgress(ctx: any, identity: any, progress: any) {
  const headItem = equippedHeadForProgress(progress);
  const chestItem = equippedChestForProgress(progress);
  const vitalityMultiplier = 1 + (researchInPlay(ctx, identity)?.vitality ?? 0) * .02;
  return equipmentMaxHealth(progress.maxHp + (soulStatsFor(ctx, identity)?.maxHp ?? 0),
    headItem,
    chestItem,
    vitalityMultiplier,
    itemLevelFor(ctx, identity, headItem),
    itemLevelFor(ctx, identity, chestItem),
  ) * cardStatFactors(activeCardTotalsFor(ctx, identity)).maxHp;
}
