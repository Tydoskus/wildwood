import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { hasWeaponStats, rollWeaponStats, type WeaponStatRoll } from "../../shared/weapon-stat-rolls";
import { touchCombatProfile } from "./combat-profile";

/**
 * Every graded weapon's rolled attack speed and crit damage (shared/weapon-stat-rolls.ts), in one table keyed like
 * player_staff_skill: the first copy's by player and item, each kept copy's "copy:<id>", each offer's "offer:<id>".
 * Public, as player_item_refine is, so profiles and duels can read another player's weapon. New table, not columns:
 * a column on a table every session reads would strand every open tab.
 */
export const playerWeaponStat = table({ name: "player_weapon_stat", public: true }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"), itemId: t.string(),
  copyId: t.u64(), offerId: t.u64(),
  attackSpeed: t.f32(), critDamage: t.f32(),
});

type Ctx = any;
const firstKey = (identity: Identity, itemId: string) => `${identity.toHexString()}:${itemId}`;
export const copyStatKey = (copyId: bigint) => `copy:${copyId}`;
export const offerStatKey = (offerId: bigint) => `offer:${offerId}`;
const rollOf = (row: any): Partial<WeaponStatRoll> => row ? { attackSpeed: row.attackSpeed, critDamage: row.critDamage } : {};

/** A roll that lacks the stats (from before weapons rolled them) keeps the row's own, or draws them now. */
function completed(ctx: Ctx, itemId: string, roll: Partial<WeaponStatRoll>, current: any): WeaponStatRoll {
  const given = (stat: keyof WeaponStatRoll) => Number.isFinite(roll[stat]) ? roll[stat]! : current ? current[stat] as number : undefined;
  const speed = given("attackSpeed"), crit = given("critDamage");
  const fresh = speed === undefined || crit === undefined ? rollWeaponStats(itemId, () => ctx.random()) : null;
  return { attackSpeed: speed ?? fresh!.attackSpeed, critDamage: crit ?? fresh!.critDamage };
}
function writeRow(ctx: Ctx, key: string, identity: Identity, itemId: string, copyId: bigint, offerId: bigint, roll: Partial<WeaponStatRoll>) {
  if (!hasWeaponStats(itemId)) return;
  const current = ctx.db.playerWeaponStat.key.find(key);
  const row = { key, identity, itemId, copyId, offerId, ...completed(ctx, itemId, roll, current) };
  if (current && current.attackSpeed === row.attackSpeed && current.critDamage === row.critDamage
    && current.identity.toHexString() === identity.toHexString() && current.itemId === itemId) return;
  if (current) ctx.db.playerWeaponStat.key.update(row);
  else ctx.db.playerWeaponStat.insert(row);
}

/** The first copy's roll, empty when it has none (or is no graded weapon). */
export const firstStatRoll = (ctx: Ctx, identity: Identity, itemId: string) => rollOf(ctx.db.playerWeaponStat.key.find(firstKey(identity, itemId)));
export const copyStatRoll = (ctx: Ctx, copyId: bigint) => rollOf(ctx.db.playerWeaponStat.key.find(copyStatKey(copyId)));
export const offerStatRoll = (ctx: Ctx, offerId: bigint) => rollOf(ctx.db.playerWeaponStat.key.find(offerStatKey(offerId)));

export function setFirstStatRoll(ctx: Ctx, identity: Identity, itemId: string, roll: Partial<WeaponStatRoll>) {
  writeRow(ctx, firstKey(identity, itemId), identity, itemId, 0n, 0n, roll);
  // The worn weapon's speed and crit are in the combat profile.
  if (hasWeaponStats(itemId)) touchCombatProfile(ctx, identity);
}
export const setCopyStatRoll = (ctx: Ctx, identity: Identity, itemId: string, copyId: bigint, roll: Partial<WeaponStatRoll>) =>
  writeRow(ctx, copyStatKey(copyId), identity, itemId, copyId, 0n, roll);
export const setOfferStatRoll = (ctx: Ctx, identity: Identity, itemId: string, offerId: bigint, roll: Partial<WeaponStatRoll>) =>
  writeRow(ctx, offerStatKey(offerId), identity, itemId, 0n, offerId, roll);

/** A first copy held without a roll gets one; one already rolled is kept (destruction and prestige never reroll). */
export function ensureFirstStatRoll(ctx: Ctx, identity: Identity, itemId: string) {
  if (hasWeaponStats(itemId) && !ctx.db.playerWeaponStat.key.find(firstKey(identity, itemId))) setFirstStatRoll(ctx, identity, itemId, {});
}

const forget = (ctx: Ctx, key: string) => { if (ctx.db.playerWeaponStat.key.find(key)) ctx.db.playerWeaponStat.key.delete(key); };
export const forgetFirstStatRoll = (ctx: Ctx, identity: Identity, itemId: string) => forget(ctx, firstKey(identity, itemId));
export const forgetCopyStatRoll = (ctx: Ctx, copyId: bigint) => forget(ctx, copyStatKey(copyId));
export const forgetOfferStatRoll = (ctx: Ctx, offerId: bigint) => forget(ctx, offerStatKey(offerId));

/** A kept copy or offer that changed hands takes its roll with it. */
export function moveStatRow(ctx: Ctx, key: string, identity: Identity) {
  const row = ctx.db.playerWeaponStat.key.find(key);
  if (row) ctx.db.playerWeaponStat.key.update({ ...row, identity });
}

/** Reset and deletion: every roll the player has. */
export function removeWeaponStats(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerWeaponStat.identity.filter(identity)] as any[]) ctx.db.playerWeaponStat.key.delete(row.key);
}

/** A guest's first-copy rolls join the account's where it has none; copies and offers move with their rows. */
export function mergeWeaponStats(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerWeaponStat.identity.filter(guest)] as any[]) {
    if (row.copyId !== 0n || row.offerId !== 0n) continue;
    ctx.db.playerWeaponStat.key.delete(row.key);
    if (!ctx.db.playerWeaponStat.key.find(firstKey(account, row.itemId))) setFirstStatRoll(ctx, account, row.itemId, rollOf(row));
  }
}

/** The caller's own rolls, every copy and offer: the client reads its weapons' speed and crit here. */
export function registerWeaponStats(spacetimedb: any) {
  const myWeaponStats = spacetimedb.view({ name: "my_weapon_stats", public: true }, t.array(playerWeaponStat.rowType),
    (ctx: any) => [...ctx.db.playerWeaponStat.identity.filter(ctx.sender)]);
  return { myWeaponStats };
}
