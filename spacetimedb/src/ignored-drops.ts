import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { canonicalItemId } from "../../shared/items";
import { MAX_IGNORED_DROP_BATCH, isDuplicateOfferItem } from "../../shared/equipment-copies";

/**
 * Equipment a player chose to stop being asked about, one row per item.
 *
 * A drop of an item listed here that the player already owns is answered
 * Ignore on arrival: no offer is made, so no Keep/Ignore card appears. A first
 * copy still goes into the bag as usual, so marking an item never loses new
 * gear. It is an account setting chosen from the map window, so it follows the
 * account across devices and survives prestige and reset, like the volumes.
 *
 * Its own private table, read through the caller-scoped my_ignored_drops
 * view: a column on a table every session reads would strand every open tab
 * on publish. Keyed "identityHex:itemId", so a repeat mark costs nothing.
 */
export const playerIgnoredDrop = table({ name: "player_ignored_drop", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
});

type Ctx = any;

export const ignoredDropKey = (identity: { toHexString(): string }, itemId: string) => `${identity.toHexString()}:${itemId}`;

/** Whether copies of this item are ignored for the player. Only equipment that could be offered ever is. */
export function isDropIgnored(ctx: Ctx, identity: Identity, itemId: string) {
  const canonical = canonicalItemId(itemId);
  return Boolean(canonical && ctx.db.playerIgnoredDrop.key.find(ignoredDropKey(identity, canonical)));
}

/** Every id must be equipment a duplicate drop could offer; anything else is refused before anything is written. */
function requireIgnorableItems(itemIds: unknown): string[] {
  if (!Array.isArray(itemIds)) throw new SenderError("Choose the items to ignore.");
  if (itemIds.length > MAX_IGNORED_DROP_BATCH) throw new SenderError(`Choose at most ${MAX_IGNORED_DROP_BATCH} items at once.`);
  const canonical = itemIds.map(itemId => {
    const id = canonicalItemId(itemId);
    if (!id || !isDuplicateOfferItem(id)) throw new SenderError("That item cannot be ignored.");
    return id;
  });
  return [...new Set(canonical)];
}

/**
 * Marks items ignored or not. Marking one also answers Ignore to every offer
 * of it already waiting, so the card on screen clears at once instead of
 * sitting there for its five minutes.
 */
export function writeIgnoredDrops(ctx: Ctx, { itemIds, ignored }: { itemIds: string[]; ignored: boolean }) {
  const items = requireIgnorableItems(itemIds);
  for (const itemId of items) {
    const key = ignoredDropKey(ctx.sender, itemId);
    const current = ctx.db.playerIgnoredDrop.key.find(key);
    if (ignored && !current) ctx.db.playerIgnoredDrop.insert({ key, identity: ctx.sender, itemId });
    if (!ignored && current) ctx.db.playerIgnoredDrop.key.delete(key);
  }
  if (!ignored) return;
  const marked = new Set(items);
  for (const offer of [...ctx.db.pendingEquipmentOffer.identity.filter(ctx.sender)] as any[]) {
    if (marked.has(offer.itemId)) ctx.db.pendingEquipmentOffer.id.delete(offer.id);
  }
}

/**
 * A guest signing in to an account. The two lists are joined: each is a list
 * of things the same player said they did not want to be asked about, so
 * neither undoes the other. The guest's rows never survive.
 */
export function mergeIgnoredDrops(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerIgnoredDrop.identity.filter(guest)] as any[]) {
    ctx.db.playerIgnoredDrop.key.delete(row.key);
    const key = ignoredDropKey(account, row.itemId);
    if (!ctx.db.playerIgnoredDrop.key.find(key)) ctx.db.playerIgnoredDrop.insert({ key, identity: account, itemId: row.itemId });
  }
}

export function removeIgnoredDrops(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerIgnoredDrop.identity.filter(identity)] as any[]) ctx.db.playerIgnoredDrop.key.delete(row.key);
}
