import { soulInPlayFor } from "../../../../shared/bonus-toggles";
import {
  addSoulKills, cleanSoulStats, EMPTY_REWARD_KILLS, isSoulMap, soulDimensionAccess, soulEnemyStats, soulTier,
  withSoulStats, withoutSoulStats, EMPTY_SOUL_STATS, SOUL_CAMPS, SOUL_STAT_DETAILS, soulCritRatingAfterKills, soulAttackSpeedRatingAfterKills, soulAttackSpeedBonus,
  cleanSoulLevel, soulLevelTotalXp, soulLevelXpNeeded, soulRewardMultiplier, SOUL_LEVEL_CAP, SOUL_XP_PER_KILL,
  type RewardKillCounts, type SoulLevel, type SoulStatId, type SoulStats, type SoulStrength,
} from "../../../../shared/soul-dimension";
import { TOWN_SOUL_PORTAL } from "../../../../shared/town";
import { isDeveloperIdentity } from "../../../app/developer";
import { ENEMY_TYPES, type EnemyDefinition } from "../../enemies";
import { regionSpawnPoints } from "../../region-scatter";
import { soulCampName, soulCampStat, soulRewardText, soulStatOfCampName, SOUL_ENEMY_SPECIES } from "../../soul-world";
import type { MapId, SpawnSite } from "../../world";
import type { MapPortal } from "../map-controller";
import type { EnemyState, PlayerState } from "../types";
import { createSoulDefenseForce } from "./soul-defense-force";
import { type AttackCapArg } from "../../../../shared/stat-rating";

/** Long enough for any kill report to come back: soul kills the server has not counted by then never will be. */
const PENDING_SOUL_KILL_MS = 15_000;

export type SoulDimensionSource = {
  localIdentity?: () => string | undefined;
  prestige?: () => { level: number } | null;
  soulStats?: () => SoulStats | null;
  soulLevel?: () => SoulLevel | null;
  rewardKills?: () => RewardKillCounts;
  soulDimensionOpen?: () => boolean;
  setSoulDimensionOpen?: (open: boolean) => Promise<boolean>;
  prestigeChallenge?: () => { active?: boolean } | null;
  aggroChallenge?: () => { active?: boolean } | null;
  /** The bonus item ids switched off (shared/bonus-toggles.ts): a soul stat off reads zero in combat. */
  bonusOff?: () => readonly string[];
};

/** The Town's portal in, standing for players who may use it. */
const TOWN_PORTAL: MapPortal = { ...TOWN_SOUL_PORTAL };
const STRENGTH_REFRESH_SECONDS = 1;

/**
 * Runs the Soul Dimension on the client: fills Tutorial Forest's camps with
 * soul enemies (each camp the stat its roll and the player's tier make it),
 * builds each one at the player's strength as it spawns, and owns the Town's
 * portal's presence and the soul stats combat adds.
 */
/** The Soul Defense Force is off for now: the crit cap took away the runs it answered. Kills still count. */
const SOUL_DEFENSE_FORCE_ON = false;

export function createSoulDimensionRuntime(deps: {
  source: () => SoulDimensionSource | null | undefined;
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  currentMapId: () => MapId;
  spawnFromSite: (site: SpawnSite) => void;
  /** The Town's map entry, whose second portal is the Soul Dimension's when this player may use it. */
  townMap: { secondaryPortal?: MapPortal };
  /** The player as combat has them now: weapon damage a second, health, armor, regen. */
  strength: () => SoulStrength;
  /** Damage a second with Double Strike and Arrow Storm in: the Soul Defense Force's health. */
  fullDps?: () => number;
  logPickup?: (label: string, color: string) => void;
  /** The player's fastest attack interval: Reflect Only wins raise the cap, and soul attack speed may reach it. */
  attackCap?: () => AttackCapArg;
  /** For the Soul Defense Force (soul-defense-force.ts). */
  damagePlayer?: (damage: number, source: EnemyState) => void;
  message?: (text: string, color: string) => void;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  sendToTown?: () => Promise<boolean>;
  /** The capped critical damage multiplier with this much soul crit damage rating in it, as combat rolls it. */
  researchCritMultiplier?: (soulCritDamage: number) => number;
  /** The server has raised the Soul Level. */
  levelUp?: (level: number, multiplier: number) => void;
  /** A message the player must dismiss, such as the Soul Defense Force's defeat. */
  notice?: (text: string) => void;
}) {
  let filledTier = -1;
  const defenseForce = createSoulDefenseForce({ identity: () => deps.source()?.localIdentity?.(), player: deps.player, enemies: deps.enemies,
    strength: deps.strength, fullDps: deps.fullDps, spawnFromSite: deps.spawnFromSite, damagePlayer: deps.damagePlayer, message: deps.message, burst: deps.burst, sendToTown: deps.sendToTown,
    critMultiplier: deps.researchCritMultiplier && (() => deps.researchCritMultiplier!(inPlay().critDamage)),
    notice: deps.notice });
  let strengthClock = 0;
  /** Soul kills this client has made since the server's soul row last changed: shown and fought with at once. */
  let pending: SoulStats = cleanSoulStats(null);
  let lastServerSoul: SoulStats | null = null;
  /** Soul crit kills since the server's row: each pays from where the soul's crit stands, so they are counted, not summed. */
  let pendingCritKills = 0;
  /** Soul attack speed kills likewise: each adds its 0.001 a second from where the soul stands (soulAttackSpeedRatingAfterKills). */
  let pendingSpeedKills = 0;
  let lastSoulKillAt = 0;
  /** Soul XP from kills the server has not counted yet, and the level row they are counted against. */
  let pendingXp = 0;
  let lastServerLevel: SoulLevel | null = null;

  const source = () => deps.source();
  const serverSoul = () => source()?.soulStats?.() ?? null;
  /**
   * A new server row takes off only the kills it counts. Clearing them all dropped kills still on their way,
   * so attack speed fell back and jumped up again, and the save step took the gap for the run's own speed.
   * Kills the server never counts drop out after a while.
   */
  function settle(server: SoulStats | null) {
    const before = lastServerSoul ? cleanSoulStats(lastServerSoul) : null, after = cleanSoulStats(server);
    lastServerSoul = server;
    if (!before) { pending = cleanSoulStats(null); pendingCritKills = 0; pendingSpeedKills = 0; return; }
    for (const key of ["damage", "maxHp", "armor", "regen"] as const) pending[key] = Math.max(0, pending[key] - Math.max(0, after[key] - before[key]));
    const speedCounted = (soulAttackSpeedBonus(after.attackSpeed) - soulAttackSpeedBonus(before.attackSpeed)) / SOUL_STAT_DETAILS.attackSpeed.reward;
    pendingSpeedKills = Number.isFinite(speedCounted) ? Math.max(0, pendingSpeedKills - Math.max(0, Math.round(speedCounted))) : 0;
    // The fewest kills that reach the server's rating: each kill at a higher Soul Level counts as several.
    let low = 0, high = pendingCritKills;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (soulCritRatingAfterKills(before.critDamage, mid) < after.critDamage - 1e-9) low = mid + 1; else high = mid;
    }
    pendingCritKills -= low;
  }
  /** A new level row takes off the Soul XP it counts, and a higher level is announced. */
  function settleLevel(server: SoulLevel | null) {
    const before = lastServerLevel;
    lastServerLevel = server;
    if (!server) return;
    // No row before: a first soul kill made it, or it is the account's row loading in.
    const from = before ?? (pendingXp > 0 ? cleanSoulLevel(null) : null);
    if (!from) return;
    pendingXp = Math.max(0, pendingXp - Math.max(0, soulLevelTotalXp(server) - soulLevelTotalXp(from)));
    if (server.level > from.level) deps.levelUp?.(server.level, soulRewardMultiplier(server.level));
  }
  const serverLevel = () => {
    const server = source()?.soulLevel?.() ?? null;
    if (server !== lastServerLevel) settleLevel(server);
    return cleanSoulLevel(server);
  };
  /** What each soul kill pays now: the server's level, which pays the whole of the next report. */
  const rewardMultiplier = () => soulRewardMultiplier(serverLevel().level);
  /** The Soul Level as shown: the server's level, its XP with kills on their way added up to the next level. */
  function soulLevel() {
    soulStats();
    const server = serverLevel();
    const needed = soulLevelXpNeeded(server.level);
    const xp = server.level >= SOUL_LEVEL_CAP ? 0 : Math.min(needed, server.xp + pendingXp);
    return { level: server.level, xp, needed, multiplier: soulRewardMultiplier(server.level), max: server.level >= SOUL_LEVEL_CAP };
  }
  function soulStats(): SoulStats {
    const server = serverSoul();
    if (server !== lastServerSoul) settle(server);
    if (Date.now() - lastSoulKillAt > PENDING_SOUL_KILL_MS && (pendingSpeedKills || pendingCritKills || pending.damage || pending.maxHp || pending.armor || pending.regen)) {
      pending = cleanSoulStats(null); pendingCritKills = 0; pendingSpeedKills = 0; pendingXp = 0;
    }
    const base = cleanSoulStats(server);
    return {
      damage: base.damage + pending.damage, maxHp: base.maxHp + pending.maxHp, armor: base.armor + pending.armor,
      regen: base.regen + pending.regen, attackSpeed: soulAttackSpeedRatingAfterKills(base.attackSpeed, pendingSpeedKills),
      critDamage: soulCritRatingAfterKills(base.critDamage, pendingCritKills),
    };
  }
  /** The soul stats in play: all of them in a normal run but those switched off, none during a challenge (Reflect Only or Aggro). */
  function inPlay(): SoulStats {
    const coop = source();
    return coop?.prestigeChallenge?.()?.active || coop?.aggroChallenge?.()?.active
      ? { ...EMPTY_SOUL_STATS } : soulInPlayFor(soulStats(), new Set(coop?.bonusOff?.() ?? []));
  }
  const rewardKills = () => source()?.rewardKills?.() ?? EMPTY_REWARD_KILLS;
  const tier = () => soulTier(rewardKills());
  function access() {
    const coop = source();
    return soulDimensionAccess({
      open: Boolean(coop?.soulDimensionOpen?.()),
      developer: isDeveloperIdentity(coop?.localIdentity?.() ?? ""),
      prestigeLevel: coop?.prestige?.()?.level ?? 0,
    });
  }

  function definitionFor(stat: SoulStatId): EnemyDefinition {
    const species = ENEMY_TYPES[SOUL_ENEMY_SPECIES[stat]];
    const built = soulEnemyStats(deps.strength());
    return { ...species, hp: built.hp, damage: built.damage, attackSpeed: built.attackSpeed, regen: 0,
      // A soul kill pays soul stats (enemyDefeated below), never the run's own.
      reward: { type: "damage", amount: 0 } };
  }

  /** Every forest camp's soul enemies for this tier, where the forest's own stand. */
  function fillCamps(currentTier: number) {
    filledTier = currentTier;
    deps.enemies.length = 0;
    deps.spawnSites.length = 0;
    // The Soul Dimension's own camp layout, separate from the forest's.
    for (const soulCamp of SOUL_CAMPS) {
      const camp = soulCamp;
      const stat = soulCampStat(soulCamp, currentTier);
      if (!stat) continue;
      for (const point of regionSpawnPoints(camp).slice(0, camp.count)) {
        const site: SpawnSite = { id: deps.spawnSites.length, x: point.x, y: point.y, type: SOUL_ENEMY_SPECIES[stat], campName: soulCampName(stat, soulCamp),
          groupAggro: false, leashRange: Math.max(420, camp.radius * .9), alive: false, respawnAt: 0, definition: definitionFor(stat) };
        deps.spawnSites.push(site);
        deps.spawnFromSite(site);
      }
    }
  }

  /** Waiting soul enemies are rebuilt at the player's current strength, so a respawn always meets them as they are. */
  function refreshWaitingDefinitions() {
    for (const site of deps.spawnSites) {
      const stat = soulStatOfCampName(site.campName);
      if (!site.alive && stat) site.definition = definitionFor(stat);
    }
  }

  return {
    update(dt: number) {
      deps.townMap.secondaryPortal = access() === "open" ? TOWN_PORTAL : undefined;
      if (!isSoulMap(deps.currentMapId())) { filledTier = -1; defenseForce.update(dt, false); return; }
      // A map load empties the site list; a new tier wakes new camps.
      const currentTier = tier();
      if (currentTier !== filledTier || (!deps.spawnSites.length && currentTier > 0)) fillCamps(currentTier);
      defenseForce.update(dt, SOUL_DEFENSE_FORCE_ON && currentTier > 0);
      strengthClock -= dt;
      if (strengthClock <= 0) { strengthClock = STRENGTH_REFRESH_SECONDS; refreshWaitingDefinitions(); }
    },
    /** The soul stat a killed enemy pays, or null for anything that is not a soul enemy. */
    soulStatOf(enemy: EnemyState) {
      return isSoulMap(deps.currentMapId()) ? soulStatOfCampName(enemy.campName) : null;
    },
    /** A soul kill: counted and shown at once, until the server's row catches up (combat adds it to the player itself). */
    soulKill(stat: SoulStatId) {
      soulStats();
      const multiplier = rewardMultiplier();
      lastSoulKillAt = Date.now();
      defenseForce.countKill();
      pendingXp += SOUL_XP_PER_KILL;
      if (stat === "critDamage") pendingCritKills += multiplier; else if (stat === "attackSpeed") pendingSpeedKills += multiplier; else pending = addSoulKills(pending, stat, 1, multiplier);
      const detail = SOUL_STAT_DETAILS[stat];
      deps.logPickup?.(`${soulRewardText(stat, multiplier)} Soul ${detail.label}`, detail.color);
    },
    /** Saved progress with the soul stats added: what the player's stats load from. Nothing is added in a challenge. */
    withSoul<T extends { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }>(progress: T | null): T | null {
      return progress ? withSoulStats(progress, inPlay(), deps.attackCap?.()) : progress;
    },
    /**
     * The player's stats with the soul's share taken back out: what a save stores. Saving them as they are
     * stored the soul stats as the run's, and loading added them again, so every save added them once more.
     */
    withoutSoul<T extends { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }>(stats: T, savedAttackRate: number): T {
      return withoutSoulStats(stats, inPlay(), savedAttackRate, deps.attackCap?.());
    },
    critDamage: () => inPlay().critDamage,
    /** The Soul Defense Force's kill (nothing paid or reported), its blame for a death, and the Town trip after the respawn. */
    defeated: defenseForce.defeated,
    playerDied: defenseForce.playerDied,
    afterRespawn: defenseForce.afterRespawn,
    inPlay,
    soulStats,
    soulLevel,
    rewardMultiplier,
    rewardKills,
    tier,
    access,
  };
}
