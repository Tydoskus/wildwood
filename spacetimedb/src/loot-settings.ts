import { SenderError, table, t } from "spacetimedb/server";

/**
 * The account's loot automation, set at the top of the Loot Filter window.
 *
 * autoKeepBest: a duplicate drop is settled on the spot instead of becoming a
 * Keep/Ignore offer. The better skill roll becomes the first copy, the one in
 * the slot, and the rest is thrown away (see equipment-copies.ts).
 * autoEquipBest: a new item from loot, or gear a newly reached map makes
 * usable, goes on when it beats what is in its slot (see auto-equip.ts).
 *
 * Both default to on: a missing row means on, so no account needed a
 * migration. An account setting like the volumes: it follows the player
 * across devices and survives prestige and reset.
 *
 * Its own private table, read through the caller-scoped my_loot_settings
 * view: a column on a table every session reads would strand every open tab
 * on publish.
 */
export const playerLootSetting = table({ name: "player_loot_setting", public: false }, {
  identity: t.identity().primaryKey(),
  autoKeepBest: t.bool(),
  autoEquipBest: t.bool(),
  updatedAt: t.timestamp(),
});

export type LootSettings = { autoKeepBest: boolean; autoEquipBest: boolean };

export const DEFAULT_LOOT_SETTINGS: LootSettings = Object.freeze({ autoKeepBest: true, autoEquipBest: true });

/** The player's settings, both on when they never chose. */
export function lootSettingsFor(ctx: { db: any }, identity: any): LootSettings {
  const row = ctx.db.playerLootSetting.identity.find(identity);
  return row ? { autoKeepBest: row.autoKeepBest, autoEquipBest: row.autoEquipBest } : DEFAULT_LOOT_SETTINGS;
}

/** Writes only when a value actually changed, so a repeat send costs no update. */
export function writeLootSettings(
  ctx: { db: any; sender: any; timestamp: any },
  { autoKeepBest, autoEquipBest }: LootSettings,
) {
  if (typeof autoKeepBest !== "boolean" || typeof autoEquipBest !== "boolean") throw new SenderError("Choose on or off.");
  const previous = ctx.db.playerLootSetting.identity.find(ctx.sender);
  if (previous && previous.autoKeepBest === autoKeepBest && previous.autoEquipBest === autoEquipBest) return;
  const row = { identity: ctx.sender, autoKeepBest, autoEquipBest, updatedAt: ctx.timestamp };
  if (previous) ctx.db.playerLootSetting.identity.update(row);
  else ctx.db.playerLootSetting.insert(row);
}

/**
 * A guest signing in to an account. As with the volumes, the account's own
 * choice wins, because it is what the player set on their other devices; the
 * guest's moves across only when the account has none. The guest row never
 * survives.
 */
export function mergeLootSettings(ctx: { db: any }, guest: any, account: any) {
  const guestRow = ctx.db.playerLootSetting.identity.find(guest);
  if (!guestRow) return;
  if (!ctx.db.playerLootSetting.identity.find(account)) {
    ctx.db.playerLootSetting.insert({ ...guestRow, identity: account });
  }
  ctx.db.playerLootSetting.identity.delete(guest);
}

export function removeLootSettings(ctx: { db: any }, identity: any) {
  if (ctx.db.playerLootSetting.identity.find(identity)) ctx.db.playerLootSetting.identity.delete(identity);
}
