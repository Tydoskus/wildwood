import type { PlayerProgress, ProgressSave } from "./progress";

export const EQUIPPED_FIELDS = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const;
export type EquippedField = typeof EQUIPPED_FIELDS[number];

/** One slot the server changed by itself: what it holds now and what it held. */
export type ServerLoadoutChange = { field: EquippedField; itemId: string; previous: string };

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
 */
export function serverLoadoutChanges(
  previous: PlayerProgress | null,
  next: PlayerProgress,
  pending: ProgressSave | null,
): ServerLoadoutChange[] {
  if (!previous) return [];
  return EQUIPPED_FIELDS
    .filter(field => previous[field] !== next[field] && (!pending || pending[field] === previous[field]))
    .map(field => ({ field, itemId: next[field], previous: previous[field] }));
}

/** A queued save carrying the server's changes, so it does not undo them. */
export function withServerLoadout(pending: ProgressSave, changes: readonly ServerLoadoutChange[]): ProgressSave {
  const next = { ...pending };
  for (const { field, itemId } of changes) next[field] = itemId;
  return next;
}
