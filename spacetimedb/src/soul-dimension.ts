import { table, t, SenderError } from "spacetimedb/server";
import type { default as spacetimedbType } from "./index";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { isProceduralMap } from "../../shared/procedural-maps";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import {
  addSoulKills, cleanSoulStats, isSoulMap, soulDimensionAccess, soulDoorDestination, soulStatsUnlocked, soulTier, SOUL_ARRIVAL, SOUL_MAP_ID,
  SOUL_STAT_ORDER, SOUL_TIER_KILL_TYPES, type RewardKillCounts, type SoulStatId, type SoulStats,
} from "../../shared/soul-dimension";

/**
 * The Soul Dimension's server side (shared/soul-dimension.ts has the rules).
 *
 * - player_reward_kills counts every campaign and Endless kill by its reward
 *   type, for everyone, from the release that adds it: tiers read it, and it
 *   fills while the dimension is still closed, so it is ready when it opens.
 * - player_soul_stats holds what soul enemies paid. Nothing resets it.
 * - soul_dimension_config is the switch: closed, only the developer can
 *   travel there; open, anyone who has prestiged can.
 */
export const playerRewardKills = table({ name: "player_reward_kills", public: false }, {
  identity: t.identity().primaryKey(),
  damage: t.u64(),
  health: t.u64(),
  armor: t.u64(),
  regen: t.u64(),
  speed: t.u64(),
});
export const playerSoulStats = table({ name: "player_soul_stats", public: false }, {
  identity: t.identity().primaryKey(),
  damage: t.f64(),
  maxHp: t.f64(),
  armor: t.f64(),
  regen: t.f64(),
  /** Attacks a second added to the run's. */
  attackSpeed: t.f64(),
  /** Added to the critical hit multiplier: .002 a kill. */
  critDamage: t.f64(),
  kills: t.u64(),
});
export const soulDimensionConfig = table({ name: "soul_dimension_config", public: true }, {
  id: t.u8().primaryKey(),
  open: t.bool(),
});
export const soulDimensionTables = { playerRewardKills, playerSoulStats, soulDimensionConfig };

const identityHex = (identity: any) => identity?.toHexString?.() ?? "";

/** Open to every prestiged player unless the developer's switch has closed it (no row: open). */
export function soulDimensionOpen(ctx: any) {
  return ctx.db.soulDimensionConfig.id.find(0)?.open ?? true;
}
/** Whether this player may be in the Soul Dimension right now. */
export function soulDimensionOpenFor(ctx: any, identity: any) {
  return soulDimensionAccess({
    open: soulDimensionOpen(ctx),
    developer: isDeveloperIdentity(identityHex(identity)),
    prestigeLevel: ctx.db.playerPrestige.identity.find(identity)?.level ?? 0,
  }) === "open";
}

/** The soul stats combat adds to a run; nothing for a player with none. */
export function soulStatsFor(ctx: any, identity: any): SoulStats | null {
  const row = identity ? ctx.db.playerSoulStats.identity.find(identity) : null;
  return row ? cleanSoulStats(row) : null;
}

export function rewardKillsFor(ctx: any, identity: any): RewardKillCounts {
  const row = ctx.db.playerRewardKills.identity.find(identity);
  return {
    damage: Number(row?.damage ?? 0n), health: Number(row?.health ?? 0n), armor: Number(row?.armor ?? 0n),
    regen: Number(row?.regen ?? 0n), speed: Number(row?.speed ?? 0n),
  };
}

const COUNTED = new Set<string>(SOUL_TIER_KILL_TYPES);
const isTierMap = (mapId: string) => CAMPAIGN_MAPS.some(map => map.id === mapId) || isProceduralMap(mapId);

/** Adds paid campaign and Endless kills to the reward-type counters. Bosses are not a reward type. */
export function countRewardKills(ctx: any, identity: any, rewards: readonly { type: string; count: number }[]) {
  const add: Record<string, bigint> = {};
  for (const reward of rewards) {
    if (!COUNTED.has(reward.type) || !(reward.count > 0)) continue;
    add[reward.type] = (add[reward.type] ?? 0n) + BigInt(Math.floor(reward.count));
  }
  if (!Object.keys(add).length) return;
  const row = ctx.db.playerRewardKills.identity.find(identity);
  const next = {
    identity,
    damage: (row?.damage ?? 0n) + (add.damage ?? 0n),
    health: (row?.health ?? 0n) + (add.health ?? 0n),
    armor: (row?.armor ?? 0n) + (add.armor ?? 0n),
    regen: (row?.regen ?? 0n) + (add.regen ?? 0n),
    speed: (row?.speed ?? 0n) + (add.speed ?? 0n),
  };
  if (row) ctx.db.playerRewardKills.identity.update(next); else ctx.db.playerRewardKills.insert(next);
}

/**
 * After a kill report is paid: soul kills add soul stats (only for soul
 * enemies this player's tier spawns), and campaign or Endless kills count
 * towards the tiers.
 */
export function noteEnemyDefeats(ctx: any, mapId: string, rewards: readonly { type: string; amount: number; count: number }[]) {
  if (!isSoulMap(mapId)) {
    if (isTierMap(mapId)) countRewardKills(ctx, ctx.sender, rewards);
    return;
  }
  if (!soulDimensionOpenFor(ctx, ctx.sender)) return;
  const unlocked = soulStatsUnlocked(soulTier(rewardKillsFor(ctx, ctx.sender)));
  const row = ctx.db.playerSoulStats.identity.find(ctx.sender);
  let soul = cleanSoulStats(row);
  let kills = row?.kills ?? 0n;
  for (const reward of rewards) {
    const stat = reward.type.startsWith("soul:") ? reward.type.slice(5) as SoulStatId : null;
    if (!stat || !SOUL_STAT_ORDER.includes(stat) || !unlocked.includes(stat) || !(reward.count > 0)) continue;
    soul = addSoulKills(soul, stat, reward.count);
    kills += BigInt(Math.floor(reward.count));
  }
  if (kills === (row?.kills ?? 0n)) return;
  const next = { identity: ctx.sender, ...soul, kills };
  if (row) ctx.db.playerSoulStats.identity.update(next); else ctx.db.playerSoulStats.insert(next);
}

export function removeSoulDimensionRows(ctx: any, identity: any) {
  if (ctx.db.playerRewardKills.identity.find(identity)) ctx.db.playerRewardKills.identity.delete(identity);
  if (ctx.db.playerSoulStats.identity.find(identity)) ctx.db.playerSoulStats.identity.delete(identity);
}

/** A guest's progress moving onto their account: kills and soul stats add up. */
export function mergeSoulDimensionRows(ctx: any, from: any, into: any) {
  const kills = ctx.db.playerRewardKills.identity.find(from);
  if (kills) {
    const target = ctx.db.playerRewardKills.identity.find(into);
    const next = { identity: into, damage: kills.damage + (target?.damage ?? 0n), health: kills.health + (target?.health ?? 0n),
      armor: kills.armor + (target?.armor ?? 0n), regen: kills.regen + (target?.regen ?? 0n), speed: kills.speed + (target?.speed ?? 0n) };
    if (target) ctx.db.playerRewardKills.identity.update(next); else ctx.db.playerRewardKills.insert(next);
  }
  const soul = ctx.db.playerSoulStats.identity.find(from);
  if (soul) {
    const target = ctx.db.playerSoulStats.identity.find(into);
    const a = cleanSoulStats(soul), b = cleanSoulStats(target);
    const next = { identity: into, damage: a.damage + b.damage, maxHp: a.maxHp + b.maxHp, armor: a.armor + b.armor, regen: a.regen + b.regen,
      attackSpeed: a.attackSpeed + b.attackSpeed, critDamage: a.critDamage + b.critDamage, kills: soul.kills + (target?.kills ?? 0n) };
    if (target) ctx.db.playerSoulStats.identity.update(next); else ctx.db.playerSoulStats.insert(next);
  }
  removeSoulDimensionRows(ctx, from);
}

type SoulDeps = {
  requireDeveloper: (ctx: any, action: string) => void;
  requireControllingPlayer: (ctx: any) => any;
  playerWithMotion: (ctx: any, player: any) => any;
  transitionPlayerMap: (ctx: any, current: any, mapId: string, arrival: { x: number; y: number }) => void;
};

export function registerSoulDimension(spacetimedb: typeof spacetimedbType, deps: SoulDeps) {
  const mySoulStats = spacetimedb.view({ name: "my_soul_stats", public: true }, t.array(playerSoulStats.rowType), (ctx: any) => {
    const row = ctx.db.playerSoulStats.identity.find(ctx.sender);
    return row ? [row] : [];
  });
  const myRewardKills = spacetimedb.view({ name: "my_reward_kills", public: true }, t.array(playerRewardKills.rowType), (ctx: any) => {
    const row = ctx.db.playerRewardKills.identity.find(ctx.sender);
    return row ? [row] : [];
  });
  /** The developer's switch: open the Soul Dimension to everyone who has prestiged, or close it again. */
  const setSoulDimensionOpen = spacetimedb.reducer({ open: t.bool() }, (ctx, { open }) => {
    deps.requireDeveloper(ctx, "set_soul_dimension_open");
    const row = ctx.db.soulDimensionConfig.id.find(0);
    if (row) ctx.db.soulDimensionConfig.id.update({ id: 0, open });
    else ctx.db.soulDimensionConfig.insert({ id: 0, open });
  });
  /** Walking into one of the village's wells: a splash, and back on the square. It only ever moves a player to the arrival. */
  const fallIntoWell = spacetimedb.reducer({}, ctx => {
    const player = deps.requireControllingPlayer(ctx);
    if (!isSoulMap(player.mapId)) throw new SenderError("There is no well here.");
    deps.transitionPlayerMap(ctx, deps.playerWithMotion(ctx, player), SOUL_MAP_ID, SOUL_ARRIVAL);
  });
  /**
   * Going through a village door: into its room from just outside it, or back out from inside the room.
   * It only ever moves a player between a door and its own room, and only when they are at one of the two.
   */
  const useSoulDoor = spacetimedb.reducer({ door: t.u32() }, (ctx, { door }) => {
    const player = deps.requireControllingPlayer(ctx);
    if (!isSoulMap(player.mapId)) throw new SenderError("There is no door here.");
    const moving = deps.playerWithMotion(ctx, player);
    const destination = soulDoorDestination(door, moving.x, moving.y);
    if (!destination) throw new SenderError("That door is too far away.");
    deps.transitionPlayerMap(ctx, moving, SOUL_MAP_ID, destination);
  });
  return { mySoulStats, myRewardKills, setSoulDimensionOpen, fallIntoWell, useSoulDoor };
}

export function requireSoulDimensionOpen(ctx: any) {
  if (!soulDimensionOpenFor(ctx, ctx.sender)) throw new SenderError("The Soul Dimension is not open to you yet.");
}

// index.ts has no lines to spare, so what it needs from these shared modules comes through here.
export { isSoulMap, SOUL_ARRIVAL, withSoulStats } from "../../shared/soul-dimension";
export { worldBoundsFor, wideMotionMap } from "../../shared/world-bounds";
