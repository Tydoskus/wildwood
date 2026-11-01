import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import { offlineGold, rollBossGold, rollKillGold } from "../../shared/gold";
import { cardStatFactors, type CardTotals } from "../../shared/card-effects";
import { luckMultiplier, type LuckRanks } from "../../shared/luck-research";
import { activeCardTotalsFor } from "./active-cards";
import { luckInPlay } from "./luck-research";
import { serverBoostRewardMultiplier } from "./server-boost-tables";
import { guildHallBonusFor } from "./guild-hall-bonus";

/** Each player's gold (shared/gold.ts). Private; the player reads their own through my_gold. */
export const playerGold = table({ name: "player_gold", public: false }, {
  identity: t.identity().primaryKey(),
  gold: t.u64(),
});

type Ctx = any;

export const goldFor = (ctx: Ctx, identity: Identity): bigint => ctx.db.playerGold.identity.find(identity)?.gold ?? 0n;

export function addGold(ctx: Ctx, identity: Identity, amount: number) {
  const gold = Math.floor(amount);
  if (!(gold > 0)) return;
  const row = ctx.db.playerGold.identity.find(identity);
  if (row) ctx.db.playerGold.identity.update({ ...row, gold: row.gold + BigInt(gold) });
  else ctx.db.playerGold.insert({ identity, gold: BigInt(gold) });
}

/** Takes `amount` gold, or none when the player has less. Returns whether it did. */
export function takeGold(ctx: Ctx, identity: Identity, amount: number | bigint) {
  const cost = typeof amount === "bigint" ? amount : BigInt(Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0)));
  if (cost < 0n) return false;
  const row = ctx.db.playerGold.identity.find(identity);
  const held: bigint = row?.gold ?? 0n;
  if (held < cost) return false;
  if (cost > 0n) ctx.db.playerGold.identity.update({ ...row, gold: held - cost });
  return true;
}

/** What Treasure cards in the worn gear, Gold Luck (the gearLuck rank) and the guild's Great Table multiply the gold drop chance by. `cards` saves a reread. */
export function goldChanceMultiplier(ctx: Ctx, identity: Identity, cards?: CardTotals, luck?: LuckRanks) {
  const treasure = 1 + cardStatFactors(cards ?? activeCardTotalsFor(ctx, identity)).treasure;
  return treasure * luckMultiplier("gearLuck", (luck ?? luckInPlay(ctx, identity)).gearLuck) * (1 + guildHallBonusFor(ctx, identity, "table"));
}

/**
 * An accepted kill report's gold: a roll per regular kill, and a boss's first clear in the run, doubled during a Server Boost. A boss clear is the
 * client's claim, so a repeat pays nothing.
 */
export function awardKillGold(ctx: Ctx, identity: Identity, kills: number, firstBossClear: boolean, cards?: CardTotals,
  read?: { luck: () => LuckRanks; serverBoost: () => number }) {
  const chance = kills > 0 ? goldChanceMultiplier(ctx, identity, cards, read?.luck()) : 1;
  const boss = firstBossClear ? rollBossGold(() => ctx.random()) + guildHallBonusFor(ctx, identity, "trophies") : 0;
  const gold = rollKillGold(kills, () => ctx.random(), chance) + boss;
  addGold(ctx, identity, gold * (read ? read.serverBoost() : serverBoostRewardMultiplier(ctx)));
}

/** Offline kills pay half the in-play rate, without rolling. */
export const awardOfflineGold = (ctx: Ctx, identity: Identity, kills: number) => addGold(ctx, identity, offlineGold(kills));

/** Reset Save and account removal clear it; prestige keeps it. */
export function removeGold(ctx: Ctx, identity: Identity) {
  if (ctx.db.playerGold.identity.find(identity)) ctx.db.playerGold.identity.delete(identity);
}

/** A guest's save replaces the account's on link, as Mining does, its gold with it. */
export function mergeGold(ctx: Ctx, guest: Identity, account: Identity) {
  const gold = goldFor(ctx, guest);
  removeGold(ctx, account);
  removeGold(ctx, guest);
  if (gold > 0n) ctx.db.playerGold.insert({ identity: account, gold });
}

/** The player's own gold, for the HUD. */
export function registerGold(spacetimedb: typeof spacetimedbType) {
  const myGold = spacetimedb.view({ name: "my_gold", public: true }, t.array(playerGold.rowType),
    (ctx: any) => { const row = ctx.db.playerGold.identity.find(ctx.sender); return row ? [row] : []; });
  return { myGold };
}
