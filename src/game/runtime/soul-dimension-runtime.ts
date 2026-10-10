import {
  addSoulKills, cleanSoulStats, EMPTY_REWARD_KILLS, isSoulMap, soulDimensionAccess, soulEnemyStats, soulTier,
  withSoulStats, withoutSoulStats, EMPTY_SOUL_STATS, SOUL_CAMPS, SOUL_STAT_DETAILS,
  type RewardKillCounts, type SoulStatId, type SoulStats, type SoulStrength,
} from "../../../shared/soul-dimension";
import { TOWN_SOUL_PORTAL } from "../../../shared/town";
import { isDeveloperIdentity } from "../../app/developer";
import { ENEMY_TYPES, type EnemyDefinition } from "../enemies";
import { regionSpawnPoints } from "../region-scatter";
import { soulCampName, soulCampStat, soulRewardText, soulStatOfCampName, SOUL_ENEMY_SPECIES } from "../soul-world";
import type { MapId, SpawnSite } from "../world";
import type { MapPortal } from "./map-controller";
import type { EnemyState, PlayerState } from "./types";
import { createSoulDefenseForce } from "./soul-defense-force";
import { cleanRating } from "../../../shared/stat-rating";
import { gameConfirm } from "../../ui/confirm-dialog";

export type SoulDimensionSource = {
  localIdentity?: () => string | undefined;
  prestige?: () => { level: number } | null;
  soulStats?: () => SoulStats | null;
  rewardKills?: () => RewardKillCounts;
  soulDimensionOpen?: () => boolean;
  setSoulDimensionOpen?: (open: boolean) => Promise<boolean>;
  prestigeChallenge?: () => { active?: boolean } | null;
  aggroChallenge?: () => { active?: boolean } | null;
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
/** The Soul Defense Force is off for now (Ryan, 0.901.38): the crit cap took away the runs it answered. Kills still count. */
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
  attackCap?: () => number;
  /** For the Soul Defense Force (soul-defense-force.ts). */
  damagePlayer?: (damage: number, source: EnemyState) => void;
  message?: (text: string, color: string) => void;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  sendToTown?: () => Promise<boolean>;
  /** The capped critical damage multiplier with this much soul crit damage rating in it, as combat rolls it. */
  researchCritMultiplier?: (soulCritDamage: number) => number;
}) {
  let filledTier = -1;
  const defenseForce = createSoulDefenseForce({ identity: () => deps.source()?.localIdentity?.(), player: deps.player, enemies: deps.enemies,
    strength: deps.strength, fullDps: deps.fullDps, spawnFromSite: deps.spawnFromSite, damagePlayer: deps.damagePlayer, message: deps.message, burst: deps.burst, sendToTown: deps.sendToTown,
    critMultiplier: deps.researchCritMultiplier && (() => deps.researchCritMultiplier!(inPlay().critDamage)),
    notice: text => { void gameConfirm({ message: text, confirmLabel: "OK", cancelLabel: "" }); } });
  let strengthClock = 0;
  /** Soul kills this client has made since the server's soul row last changed: shown and fought with at once. */
  let pending: SoulStats = cleanSoulStats(null);
  let lastServerSoul: SoulStats | null = null;

  const source = () => deps.source();
  const serverSoul = () => source()?.soulStats?.() ?? null;
  function soulStats(): SoulStats {
    const server = serverSoul();
    if (server !== lastServerSoul) { lastServerSoul = server; pending = cleanSoulStats(null); }
    const base = cleanSoulStats(server);
    return {
      damage: base.damage + pending.damage, maxHp: base.maxHp + pending.maxHp, armor: base.armor + pending.armor,
      regen: base.regen + pending.regen, attackSpeed: cleanRating(base.attackSpeed + pending.attackSpeed),
      critDamage: cleanRating(base.critDamage + pending.critDamage),
    };
  }
  /** The soul stats in play: all of them in a normal run, none during a challenge (Reflect Only or Aggro). */
  function inPlay(): SoulStats {
    const coop = source();
    return coop?.prestigeChallenge?.()?.active || coop?.aggroChallenge?.()?.active ? { ...EMPTY_SOUL_STATS } : soulStats();
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
    return { ...species, hp: built.hp, damage: built.damage, attackSpeed: built.attackSpeed, regen: 0, armor: 0,
      // A soul kill pays soul stats (enemyDefeated below), never the run's own.
      reward: { type: "damage", amount: 0 } };
  }

  /** Every forest camp's soul enemies for this tier, where the forest's own stand. */
  function fillCamps(currentTier: number) {
    filledTier = currentTier;
    deps.enemies.length = 0;
    deps.spawnSites.length = 0;
    // The camps the forest had before 0.901.47: the Soul Dimension keeps them as they were.
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
      defenseForce.countKill();
      pending = addSoulKills(pending, stat, 1);
      const detail = SOUL_STAT_DETAILS[stat];
      deps.logPickup?.(`${soulRewardText(stat)} Soul ${detail.label}`, detail.color);
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
    rewardKills,
    tier,
    access,
  };
}
export type SoulDimensionRuntime = ReturnType<typeof createSoulDimensionRuntime>;
