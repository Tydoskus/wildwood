import {
  addSoulKills, cleanSoulStats, EMPTY_REWARD_KILLS, isSoulMap, soulChunkOf, soulDimensionAccess, soulEnemyStats, soulTier, SOUL_ARRIVAL,
  withSoulStats, SOUL_HOME_GATE, SOUL_STAT_DETAILS, type RewardKillCounts, type SoulStatId, type SoulStats, type SoulStrength,
} from "../../../shared/soul-dimension";
import { HOME_EXTERIOR_MAP_ID, HOME_SOUL_PORTAL } from "../../../shared/home";
import { isDeveloperIdentity } from "../../app/developer";
import { ENEMY_TYPES, type EnemyDefinition } from "../enemies";
import { SOUL_VILLAGE_PITS, SOUL_VILLAGE_SOLIDS, type SoulSolid } from "../soul-village";
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
  fallIntoWell?: () => Promise<boolean>;
};

/** The gate home in the village, drawn and used like any map portal. */
export const SOUL_HOME_GATE_PORTAL: MapPortal = { x: SOUL_HOME_GATE.x, y: SOUL_HOME_GATE.y, width: 150, height: 158, depth: SOUL_HOME_GATE.y,
  destination: HOME_EXTERIOR_MAP_ID, label: "Home", art: "packGate" };
const HOME_PORTAL: MapPortal = { ...HOME_SOUL_PORTAL };

/** The village's water and building footprints: a player cannot walk through them. */
const SOLIDS = SOUL_VILLAGE_SOLIDS;
const STRENGTH_REFRESH_SECONDS = 1;
/** Where the feet are below the player's position (depth-world-renderer sorts the player there too), and how wide. */
const FEET_OFFSET = 29;
const FEET_RADIUS = 12;
/** How far into a well's outline the feet must reach to fall: its opening, not its rim. */
const WELL_OPENING = .6;

function inside(x: number, y: number, solid: SoulSolid) {
  let hit = false;
  for (let i = 0, j = solid.xs.length - 1; i < solid.xs.length; j = i++) {
    if ((solid.ys[i] > y) !== (solid.ys[j] > y) && x < (solid.xs[j] - solid.xs[i]) * (y - solid.ys[i]) / (solid.ys[j] - solid.ys[i]) + solid.xs[i]) hit = !hit;
  }
  return hit;
}
/** Whether a point is in a well's opening: inside its outline shrunk towards its middle. */
function inWell(x: number, y: number, well: SoulSolid) {
  if (x < well.left || x > well.right || y < well.top || y > well.bottom) return false;
  const cx = well.xs.reduce((sum, v) => sum + v, 0) / well.xs.length, cy = well.ys.reduce((sum, v) => sum + v, 0) / well.ys.length;
  return inside(cx + (x - cx) / WELL_OPENING, cy + (y - cy) / WELL_OPENING, well);
}

/** Moves a circle out of a polygon: to the nearest point of its outline, plus the circle's radius. */
export function pushOutOf(circle: { x: number; y: number; r: number }, solid: SoulSolid) {
  const { xs, ys } = solid;
  let inside = false, nearestX = circle.x, nearestY = circle.y, nearest = Infinity;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if ((ys[i] > circle.y) !== (ys[j] > circle.y) && circle.x < (xs[j] - xs[i]) * (circle.y - ys[i]) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
    const dx = xs[i] - xs[j], dy = ys[i] - ys[j], length = dx * dx + dy * dy;
    const t = length > 0 ? Math.max(0, Math.min(1, ((circle.x - xs[j]) * dx + (circle.y - ys[j]) * dy) / length)) : 0;
    const px = xs[j] + dx * t, py = ys[j] + dy * t, distance = Math.hypot(circle.x - px, circle.y - py);
    if (distance < nearest) { nearest = distance; nearestX = px; nearestY = py; }
  }
  if (!inside && nearest >= circle.r) return;
  // Away from the outline: outward when outside, through it when the centre is already inside.
  let nx = circle.x - nearestX, ny = circle.y - nearestY;
  const length = Math.hypot(nx, ny) || 1;
  nx /= length; ny /= length;
  if (inside) { nx = -nx; ny = -ny; }
  circle.x = nearestX + nx * circle.r;
  circle.y = nearestY + ny * circle.r;
}

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

  /**
   * Collision is at the player's feet, as the pack's colliders sit at the foot of each wall, tree and well:
   * a small circle where the body stands (the same point the world sorts the player by), not its middle.
   */
  function resolveVillageCollision() {
    const { player } = deps;
    const feet = { x: player.x, y: player.y + FEET_OFFSET, r: FEET_RADIUS };
    for (const solid of SOLIDS) {
      if (feet.x <= solid.left - feet.r || feet.x >= solid.right + feet.r || feet.y <= solid.top - feet.r || feet.y >= solid.bottom + feet.r) continue;
      pushOutOf(feet, solid);
    }
    player.x = feet.x;
    player.y = feet.y - FEET_OFFSET;
  }

  let falling = false;
  /** Feet in a well: splash, back on the square, and the server is told so it agrees where the player is. */
  function checkWells() {
    const { player } = deps;
    if (falling || player.hp <= 0) return;
    const feetY = player.y + FEET_OFFSET;
    if (!SOUL_VILLAGE_PITS.some(well => inWell(player.x, feetY, well))) return;
    falling = true;
    deps.logPickup?.("Splash! You fell into the well", "#7fd4ff");
    player.x = SOUL_ARRIVAL.x;
    player.y = SOUL_ARRIVAL.y;
    player.moving = false;
    void (source()?.fallIntoWell?.() ?? Promise.resolve(false)).catch(() => false).finally(() => { falling = false; });
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
      checkWells();
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
