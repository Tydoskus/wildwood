import { canDestroyEquipment, isCosmeticOnlyItem, itemDefinition } from "./items";

/**
 * Duplicate equipment.
 *
 * The bag's inventoryJson holds each item id once. That one entry is the
 * item's first copy, and its bow skill roll (if any) is the player_bow_skill
 * row for that id. Every further copy a player chose to keep is its own row in
 * player_equipment_copy, carrying its own roll. The first copy is always the
 * one a slot equips: equipping another copy swaps the two rolls, so
 * everything that reads the equipped bow's roll by item id keeps working.
 *
 * A drop of equipment the player already owns becomes an offer they Keep or
 * Ignore. An offer nobody answers is ignored after five minutes, on the
 * server, so it happens with the tab closed too.
 */
export const EQUIPMENT_OFFER_LIFETIME_MS = 5 * 60_000;
/** Farming cannot pile offers up: past this many, the oldest is ignored. */
export const MAX_PENDING_EQUIPMENT_OFFERS = 10;
/**
 * How many items one set_ignored_drops call may mark: a map's whole drop list,
 * which the map window's "Ignore all" sends at once, with room to spare.
 */
export const MAX_IGNORED_DROP_BATCH = 32;

/**
 * Which items a duplicate drop offers: real equipment the player could also
 * throw away again. Cosmetic-only looks and permanent starter or developer
 * items are never offered as copies.
 */
export function isDuplicateOfferItem(itemId: unknown) {
  return Boolean(itemDefinition(itemId)) && !isCosmeticOnlyItem(itemId) && canDestroyEquipment(itemId);
}

/**
 * Bag slots in use: every distinct non-cosmetic item not in an equipment slot,
 * plus each kept extra copy (an extra copy is never the equipped one). The
 * same count the Mailbox gear claim and the inventory grid use.
 */
export function bagSlotsUsed(owned: readonly string[], equipped: readonly string[], extraCopies: number) {
  const equippedSet = new Set(equipped);
  const distinct = [...new Set(owned)].filter(id => itemDefinition(id) && !isCosmeticOnlyItem(id) && !equippedSet.has(id));
  return distinct.length + Math.max(0, Math.floor(extraCopies));
}
