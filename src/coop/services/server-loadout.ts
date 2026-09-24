import { equipmentMapRequirement } from "../../../shared/equipment-access";
import { fallbackWeapon } from "../../../shared/equip-best";
import { itemDefinition, isCosmeticOnlyItem } from "../../../shared/items";
import type { PlayerProgress, ProgressSave } from "./progress";

export const EQUIPPED_FIELDS = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const;
export type EquippedField = typeof EQUIPPED_FIELDS[number];
type Loadout = Record<EquippedField, string>;

/** One slot the server changed by itself: what it holds now and what it held. */
export type ServerLoadoutChange = { field: EquippedField; itemId: string; previous: string };

const HAND_FIELDS: readonly EquippedField[] = ["equippedRightHand", "equippedLeftHand"];

/**
 * The equipment slots the server changed on its own between two readings of
 * this player's progress row: auto equip putting on new or newly unlocked
 * gear, or prestige swapping locked gear for usable gear.
 *
 * The client normally owns the loadout and the server follows its saves, so
 * a slot counts only when the local save still held what the server had
 * before. A slot the player changed here since then is theirs, and their
 * save wins. Without taking these in, the next save (every kill queues one)
 * would put the old gear back.
 *
 * Only gear going on counts: an item the player may use, in the slot it fits.
 * Auto equip and prestige never take anything off, and a blank slot in the
 * row is an ordinary saved state (older saves have blank hands), not an
 * instruction to unequip. Taking in a blank hand left players with no weapon.
 */
export function serverLoadoutChanges(
  previous: PlayerProgress | null,
  next: PlayerProgress,
  pending: ProgressSave | null,
): ServerLoadoutChange[] {
  if (!previous) return [];
  return EQUIPPED_FIELDS
    .filter(field => previous[field] !== next[field] && (!pending || pending[field] === previous[field]))
    .filter(field => puttingOn(field, next[field], next))
    .map(field => ({ field, itemId: next[field], previous: previous[field] }));
}

function puttingOn(field: EquippedField, itemId: string, access: PlayerProgress) {
  const slot = itemDefinition(itemId)?.slot;
  if (!slot || isCosmeticOnlyItem(itemId) || equipmentMapRequirement(itemId, access)) return false;
  return HAND_FIELDS.includes(field) ? slot === "HAND" : field === `equipped${slot[0]}${slot.slice(1).toLowerCase()}`;
}

/**
 * Puts the server's changes on a loadout the way the inventory would: a
 * weapon going into one hand leaves the other hand empty.
 */
export function applyServerLoadout<T extends Loadout>(loadout: T, changes: readonly ServerLoadoutChange[]): T {
  const next = { ...loadout };
  for (const { field, itemId } of changes) {
    if (HAND_FIELDS.includes(field)) for (const hand of HAND_FIELDS) next[hand] = "";
    next[field] = itemId;
  }
  return next;
}

/** A queued save carrying the server's changes, so it does not undo them. */
export function withServerLoadout(pending: ProgressSave, changes: readonly ServerLoadoutChange[]): ProgressSave {
  return applyServerLoadout(pending, changes);
}

/**
 * A loadout that can attack. Both hands blank (a blank saved hand, or gear
 * whose map is locked again) is filled the way the server reads that hand:
 * the best usable weapon owned, else the starter stone. Returns the weapon
 * put on, or "" when a hand already held one.
 */
export function fillEmptyHand(loadout: Loadout, itemIds: readonly string[], access: Parameters<typeof fallbackWeapon>[1]) {
  const usable = (itemId: string) => Boolean(itemId) && !equipmentMapRequirement(itemId, access);
  if (usable(loadout.equippedRightHand) || usable(loadout.equippedLeftHand)) return "";
  loadout.equippedLeftHand = "";
  loadout.equippedRightHand = fallbackWeapon(itemIds, access);
  return loadout.equippedRightHand;
}
