import {
  addSoulKills, cleanSoulStats, EMPTY_REWARD_KILLS, isSoulMap, soulChunkOf, soulDimensionAccess, soulEnemyStats, soulTier,
  withSoulStats, SOUL_HOME_GATE, SOUL_STAT_DETAILS, type RewardKillCounts, type SoulStatId, type SoulStats, type SoulStrength,
} from "../../../shared/soul-dimension";
import { HOME_EXTERIOR_MAP_ID, HOME_SOUL_PORTAL } from "../../../shared/home";
import { isDeveloperIdentity } from "../../app/developer";
import { ENEMY_TYPES, type EnemyDefinition } from "../enemies";
import { SOUL_VILLAGE_SOLIDS } from "../soul-village";
import { soulCampName, soulCampPoints, soulCampStat, soulStatOfCampName, soulWindowCamps, soulWindowDecor, SOUL_ENEMY_SPECIES } from "../soul-world";
import type { MapId, SpawnSite, WorldDecor } from "../world";
import type { MapPortal } from "./map-controller";
import type { EnemyState, PlayerState } from "./types";

export type SoulDimensionSource = {
  localIdentity?: () => string | undefined;
  prestige?: () => { level: number } | null;
  soulStats?: () => SoulStats | null;
  rewardKills?: () => RewardKillCounts;
  soulDimensionOpen?: () => boolean;
  setSoulDimensionOpen?: (open: boolean) => Promise<boolean>;
};

/** The gate home in the village, drawn and used like any map portal. */
export const SOUL_HOME_GATE_PORTAL: MapPortal = { x: SOUL_HOME_GATE.x, y: SOUL_HOME_GATE.y, width: 130, height: 150, depth: SOUL_HOME_GATE.y,
  destination: HOME_EXTERIOR_MAP_ID, label: "Home" };
const HOME_PORTAL: MapPortal = { ...HOME_SOUL_PORTAL };

/** The village's water and building footprints: a player cannot walk through them. */
const SOLIDS = SOUL_VILLAGE_SOLIDS;
const STRENGTH_REFRESH_SECONDS = 1;

/**
 * Runs the Soul Dimension on the client: streams its chunks (props and camps)
 * in and out as the player walks, builds each soul enemy at the player's
 * strength as it spawns, keeps them out of the village's houses, and owns the
 * home portal's presence and the soul stats combat adds.
 */
export function createSoulDimensionRuntime(deps: {
  source: () => SoulDimensionSource | null | undefined;
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  decor: WorldDecor[];
  currentMapId: () => MapId;
  spawnFromSite: (site: SpawnSite) => void;
  invalidateDepthOrder: () => void;
  /** The home map's entry, whose second portal is the Soul Dimension's when this player may use it. */
  homeMap: { secondaryPortal?: MapPortal };
  /** The player as combat has them now: weapon damage a second, health, armor, regen. */
  strength: () => SoulStrength;
  logPickup?: (label: string, color: string) => void;
}) {
  let windowKey = "";
  let windowTier = -1;
  let strengthClock = 0;
  /** Soul kills this client has made since the server's soul row last changed: shown and fought with at once. */
  let pending: SoulStats = cleanSoulStats(null);
  let lastServerSoul: SoulStats | null = null;
  /** Camp key -> the site slots it holds. Freed slots are kept (an enemy's site id is its index) and reused. */
  const campSlots = new Map<string, number[]>();
  const freeSlots: number[] = [];

  const source = () => deps.source();
  const serverSoul = () => source()?.soulStats?.() ?? null;
  function soulStats(): SoulStats {
    const server = serverSoul();
    if (server !== lastServerSoul) { lastServerSoul = server; pending = cleanSoulStats(null); }
    const base = cleanSoulStats(server);
    return {
      damage: base.damage + pending.damage, maxHp: base.maxHp + pending.maxHp, armor: base.armor + pending.armor,
      regen: base.regen + pending.regen, attackSpeed: base.attackSpeed + pending.attackSpeed, critDamage: base.critDamage + pending.critDamage,
    };
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

  function releaseCamp(key: string) {
    const slots = campSlots.get(key);
    if (!slots) return;
    for (const id of slots) {
      for (let index = deps.enemies.length - 1; index >= 0; index--) {
        if (deps.enemies[index].siteId === id) deps.enemies.splice(index, 1);
      }
      const site = deps.spawnSites[id];
      if (site) Object.assign(site, { alive: false, respawnAt: 0, campName: "", definition: undefined });
      freeSlots.push(id);
    }
    campSlots.delete(key);
  }

  function claimSlot(): SpawnSite {
    const reused = freeSlots.pop();
    if (reused !== undefined && deps.spawnSites[reused]) return deps.spawnSites[reused];
    const site: SpawnSite = { id: deps.spawnSites.length, x: 0, y: 0, campName: "", type: "Spitter", leashRange: 420, alive: false, respawnAt: 0 };
    deps.spawnSites.push(site);
    return site;
  }

  /** Brings the props and camps around the player up to date. */
  function refreshWindow(force = false) {
    const { player } = deps;
    const currentTier = tier();
    const key = `${soulChunkOf(player.x)}:${soulChunkOf(player.y)}`;
    if (!force && key === windowKey && currentTier === windowTier) return;
    const tierChanged = currentTier !== windowTier;
    windowKey = key;
    windowTier = currentTier;
    deps.decor.splice(0, deps.decor.length, ...soulWindowDecor(player.x, player.y));
    deps.invalidateDepthOrder();
    const camps = soulWindowCamps(player.x, player.y);
    const wanted = new Set(camps.map(camp => camp.key));
    for (const campKey of [...campSlots.keys()]) if (tierChanged || !wanted.has(campKey)) releaseCamp(campKey);
    for (const camp of camps) {
      if (campSlots.has(camp.key)) continue;
      const stat = soulCampStat(camp, currentTier);
      if (!stat) continue;
      const slots: number[] = [];
      for (const point of soulCampPoints(camp)) {
        const site = claimSlot();
        Object.assign(site, { x: point.x, y: point.y, type: SOUL_ENEMY_SPECIES[stat], campName: soulCampName(stat, camp),
          groupAggro: false, leashRange: 420, alive: false, respawnAt: 0, definition: definitionFor(stat) });
        slots.push(site.id);
        deps.spawnFromSite(site);
      }
      campSlots.set(camp.key, slots);
    }
  }

  /** Waiting soul enemies are rebuilt at the player's current strength, so a respawn always meets them as they are. */
  function refreshWaitingDefinitions() {
    for (const slots of campSlots.values()) {
      for (const id of slots) {
        const site = deps.spawnSites[id];
        const stat = soulStatOfCampName(site?.campName);
        if (site && !site.alive && stat) site.definition = definitionFor(stat);
      }
    }
  }

  function resolveVillageCollision() {
    const { player } = deps;
    for (const solid of SOLIDS) {
      const left = solid.left - player.r, right = solid.right + player.r, top = solid.top - player.r, bottom = solid.bottom + player.r;
      if (player.x <= left || player.x >= right || player.y <= top || player.y >= bottom) continue;
      const pushes = [player.x - left, right - player.x, player.y - top, bottom - player.y];
      const smallest = Math.min(...pushes);
      if (smallest === pushes[0]) player.x = left;
      else if (smallest === pushes[1]) player.x = right;
      else if (smallest === pushes[2]) player.y = top;
      else player.y = bottom;
    }
  }

  function reset() {
    windowKey = "";
    windowTier = -1;
    campSlots.clear();
    freeSlots.length = 0;
  }

  return {
    update(dt: number) {
      deps.homeMap.secondaryPortal = access() === "open" ? HOME_PORTAL : undefined;
      if (!isSoulMap(deps.currentMapId())) { if (windowKey) reset(); return; }
      // A map load empties the site list; start the window over with it.
      if (windowKey && !deps.spawnSites.length) reset();
      refreshWindow();
      resolveVillageCollision();
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
      pending = addSoulKills(pending, stat, 1);
      const detail = SOUL_STAT_DETAILS[stat];
      const amount = stat === "critDamage" ? `${+(detail.reward * 100).toFixed(1)}%` : `${detail.reward}`;
      deps.logPickup?.(`+${amount} Soul ${detail.label}`, detail.color);
    },
    /** Saved progress with the soul stats added: what the player's stats load from. */
    withSoul<T extends { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }>(progress: T | null): T | null {
      return progress ? withSoulStats(progress, soulStats()) : progress;
    },
    critDamage: () => soulStats().critDamage,
    soulStats,
    rewardKills,
    tier,
    access,
    /** Forces the window to rebuild, as after the map loads. */
    refresh: () => refreshWindow(true),
  };
}
export type SoulDimensionRuntime = ReturnType<typeof createSoulDimensionRuntime>;
