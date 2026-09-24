import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { MAX_LOOT_FILTER_BATCH, isDropFiltered, lootFilterId } from "../../shared/loot-filter";

/**
 * The player's loot filter: one row per entry turned off, either a whole slot
 * (itemId `slot:HAND` and the like, on every map) or one item. A filtered item
 * never drops for that player, first copy included; see shared/loot-filter.ts
 * for the rule. It is an account setting chosen from the map window, so it
 * follows the account across devices and survives prestige and reset, like
 * the volumes.
 *
 * Its own private table, read through the caller-scoped my_ignored_drops
 * view: a column on a table every session reads would strand every open tab
 * on publish. Keyed "identityHex:itemId", so a repeat write costs nothing.
 */
export const playerIgnoredDrop = table({ name: "player_ignored_drop", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
});

type Ctx = any;

export const ignoredDropKey = (identity: { toHexString(): string }, filterId: string) => `${identity.toHexString()}:${filterId}`;

/** Whether the player's filter turns this drop away, by its slot or by the item itself. */
export function isDropIgnored(ctx: Ctx, identity: Identity, itemId: string) {
  return isDropFiltered(itemId, filterId => Boolean(ctx.db.playerIgnoredDrop.key.find(ignoredDropKey(identity, filterId))));
}

/**
 * Rolled loot minus what the player filtered. Called where loot is awarded,
 * before anything reaches the bag, an offer or the drop reveal. A filtered
 * roll is simply dropped, never re-rolled into another item. Costs nothing
 * when nothing dropped.
 */
export function keepWantedDrops(ctx: Ctx, identity: Identity, drops: Map<string, number>) {
  for (const itemId of [...drops.keys()]) if (isDropIgnored(ctx, identity, itemId)) drops.delete(itemId);
  return drops;
}

/** Every entry must be a slot or a droppable item; anything else is refused before anything is written. */
function requireFilterIds(values: unknown): string[] {
  if (!Array.isArray(values)) throw new SenderError("Choose the items to filter.");
  if (values.length > MAX_LOOT_FILTER_BATCH) throw new SenderError(`Choose at most ${MAX_LOOT_FILTER_BATCH} items at once.`);
  const ids = values.map(value => {
    const id = lootFilterId(value);
    if (!id) throw new SenderError("That item cannot be filtered.");
    return id;
  });
  return [...new Set(ids)];
}

/**
 * Turns entries off (`ignored` true) or back on. Turning something off also
 * answers Ignore to every offer it covers that is already waiting, so a card
 * on screen clears at once instead of sitting there for its five minutes.
 */
export function writeIgnoredDrops(ctx: Ctx, { itemIds, ignored }: { itemIds: string[]; ignored: boolean }) {
  const ids = requireFilterIds(itemIds);
  for (const filterId of ids) {
    const key = ignoredDropKey(ctx.sender, filterId);
    const current = ctx.db.playerIgnoredDrop.key.find(key);
    if (ignored && !current) ctx.db.playerIgnoredDrop.insert({ key, identity: ctx.sender, itemId: filterId });
    if (!ignored && current) ctx.db.playerIgnoredDrop.key.delete(key);
  }
  if (!ignored) return;
  const marked = new Set(ids);
  for (const offer of [...ctx.db.pendingEquipmentOffer.identity.filter(ctx.sender)] as any[]) {
    if (isDropFiltered(offer.itemId, filterId => marked.has(filterId))) ctx.db.pendingEquipmentOffer.id.delete(offer.id);
  }
}

/**
 * A guest signing in to an account. The two lists are joined: each is what
 * the same player said they did not want, so neither undoes the other. The
 * guest's rows never survive.
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
