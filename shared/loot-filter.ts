import { canDestroyEquipment, canonicalItemId, itemDefinition, type ItemSlot } from "./items";

/**
 * The loot filter: which drops a player never wants to pick up.
 *
 * A filtered item never drops for that player, not even a first copy: it is
 * skipped where loot is awarded, before anything reaches the bag, an offer or
 * the drop reveal. Filtered rolls are not re-rolled into something else.
 *
 * Two kinds of entry share one list. A slot entry (`slot:HAND` and so on)
 * turns off every droppable item of that slot on every map, including maps
 * not visited yet, which is what "only bows" needs. An item entry turns off
 * one item. An item is filtered when its slot is off or it is off itself, so
 * an item entry only matters while its slot is on.
 *
 * Gifts, mail and developer grants are deliberate and never filtered.
 */
export const LOOT_FILTER_SLOTS: readonly { slot: ItemSlot; label: string }[] = [
  { slot: "HAND", label: "Weapons" },
  { slot: "CHEST", label: "Armor" },
  { slot: "HEAD", label: "Helmets" },
  { slot: "FEET", label: "Boots" },
];

/** How many entries one set_ignored_drops call may change: every slot and a map's whole drop list, with room to spare. */
export const MAX_LOOT_FILTER_BATCH = 32;

export const slotFilterId = (slot: ItemSlot) => `slot:${slot}`;
const SLOT_FILTER_IDS = new Set(LOOT_FILTER_SLOTS.map(({ slot }) => slotFilterId(slot)));

/** Items the filter can turn off: anything that comes from a drop table. Starter and developer items never drop. */
export function isFilterableDrop(itemId: unknown) {
  return Boolean(itemDefinition(itemId)) && canDestroyEquipment(itemId);
}

/** The id a filter entry is stored under, or undefined when it is neither a slot entry nor a droppable item. */
export function lootFilterId(value: unknown): string | undefined {
  if (typeof value === "string" && SLOT_FILTER_IDS.has(value)) return value;
  const itemId = canonicalItemId(value);
  return itemId && isFilterableDrop(itemId) ? itemId : undefined;
}

/** Whether a drop of this item is filtered, given which entries are on the list. */
export function isDropFiltered(itemId: unknown, listed: (filterId: string) => boolean) {
  const item = itemDefinition(canonicalItemId(itemId));
  if (!item || !isFilterableDrop(item.id)) return false;
  return listed(slotFilterId(item.slot)) || listed(item.id);
}

/** The slot an item belongs to, for the window's slot-off rows. */
export function itemSlot(itemId: unknown): ItemSlot | undefined {
  return itemDefinition(canonicalItemId(itemId))?.slot;
}
