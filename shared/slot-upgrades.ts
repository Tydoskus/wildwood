import { MAX_SLOT_UPGRADE_TIER, UPGRADE_SLOTS, canonicalItemId, itemDefinition, type UpgradeSlot } from "./items";

/**
 * Which tier track an item draws from.
 *
 * Both hands share the weapon track, so swapping a bow between hands, or for a
 * better one, keeps the tiers the slot has earned. Feet have no track: nothing
 * that goes there carries the stats a tier would scale.
 */
export function upgradeSlotForItem(itemId: unknown): UpgradeSlot | null {
  const definition = itemDefinition(canonicalItemId(itemId));
  if (!definition) return null;
  return definition.slot === "HAND" || definition.slot === "HEAD" || definition.slot === "CHEST"
    ? definition.slot
    : null;
}

export function isUpgradeSlot(value: unknown): value is UpgradeSlot {
  return typeof value === "string" && (UPGRADE_SLOTS as readonly string[]).includes(value);
}

export function normalizeSlotTier(tier: unknown) {
  return Number.isFinite(tier)
    ? Math.max(0, Math.min(MAX_SLOT_UPGRADE_TIER, Math.floor(Number(tier))))
    : 0;
}

/** Human-facing name for a track, as the bench and the profile label it. */
export const UPGRADE_SLOT_LABELS: Readonly<Record<UpgradeSlot, string>> = {
  HAND: "WEAPON",
  HEAD: "HELMET",
  CHEST: "ARMOR",
};

/**
 * What a whole account's tiers look like, keyed by slot. Used by the client's
 * cache, the profile view and the migration that converted per-item levels.
 */
export type SlotTiers = Partial<Record<UpgradeSlot, number>>;

export function slotTier(tiers: SlotTiers | undefined, slot: UpgradeSlot | null) {
  return slot ? normalizeSlotTier(tiers?.[slot] ?? 0) : 0;
}

/** The tier that applies to an item: whatever its slot has reached. */
export function itemSlotTier(tiers: SlotTiers | undefined, itemId: unknown) {
  return slotTier(tiers, upgradeSlotForItem(itemId));
}
