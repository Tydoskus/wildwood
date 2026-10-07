/**
 * The Balance Lab's death model: who joins a fight, when their hits land, and
 * whether the player's health survives it. Kept apart from the progression
 * clock (simulator.ts) so the rules read in one place.
 *
 * Every number here is the game's own: aggro radii and group camps
 * (enemy-simulation.ts, enemy-lifecycle.ts, world.ts createSpawnSites), the
 * chase ramp, ranged hold band and shot speed, the death screen, and Auto's
 * ten-minute skip of a group it just died to. What is not the game's is the
 * standing point (the player stops at the Lab's usual approach distance) and
 * that nobody dodges.
 */
import { damageAfterArmor } from "../game/combat";
import { ENEMY_HIT_SPEED_RECOVERY_SECONDS, RANGED_PROJECTILE_SPEED, REGULAR_ENEMY_AGGRO_PADDING } from "../game/constants";
import type { EnemyDefinition } from "../game/enemies";
import { rangedEnemyHoldBand } from "../game/runtime/ranged-enemy-range";
import { PLAYER_DEATH_FALL_DURATION_MS } from "../game/runtime/player-death-animation";
import { DIED_TO_GROUP_MS } from "../game/runtime/auto-farm-brain";
import { DEATH_RESPAWN_DELAY_MS } from "../ui/death-screen-controller";
import { bossAbilityTimelineAt, type BossSimulationKind } from "../../shared/boss-simulation";
import { BOSS_DAMAGE_PROFILES } from "../../shared/boss-damage";
import { DEFAULT_ATTACK_RANGE, ENEMY_CHASE_SPEED_MARGIN, PLAYER_RADIUS } from "../../shared/rules";

/** The fall, then the countdown, before the player stands at the map's arrival again. */
export const DEATH_SCREEN_SECONDS = (PLAYER_DEATH_FALL_DURATION_MS + DEATH_RESPAWN_DELAY_MS) / 1_000;
/** Auto leaves a group it just died to alone this long while another group has enemies. */
export const DIED_TO_CAMP_SECONDS = DIED_TO_GROUP_MS / 1_000;
/** Where the Lab's player stops to shoot (its travel model approaches to the same point). */
export const STANDOFF_DISTANCE = DEFAULT_ATTACK_RANGE * .72;
/** A spawned ranged enemy's first shot: .2 s plus a seeded unit (enemy-lifecycle.ts), on average. */
const RANGED_FIRST_SHOT_SECONDS = .7;
/** Past this many hits a fight is settled on its average rate instead of hit by hit. */
const MAX_FIGHT_EVENTS = 4_000;

export type Point = { x: number; y: number };

/** One source of hits: the first lands at `start`, then one every `interval`. */
export type Attacker = { start: number; interval: number; hit: number };

export type CampSite = Point & {
  campName: string;
  groupAggro?: boolean;
  leashRange: number;
};

/** The radius inside which a resting enemy notices the player (enemy-simulation.ts regularAggroRadius). */
export function enemyAggroRadius(enemy: EnemyDefinition) {
  if (!enemy.ranged) return enemy.elite ? 300 : 225;
  return enemy.elite ? enemy.aggro ?? 0 : Math.max(0, DEFAULT_ATTACK_RANGE - REGULAR_ENEMY_AGGRO_PADDING);
}

/** Where the player stands to shoot `target`, coming from `from`. */
export function standingPoint(from: Point, target: Point): Point {
  const dx = from.x - target.x, dy = from.y - target.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= STANDOFF_DISTANCE || distance === 0) return { x: from.x, y: from.y };
  return { x: target.x + dx / distance * STANDOFF_DISTANCE, y: target.y + dy / distance * STANDOFF_DISTANCE };
}

/**
 * Seconds for a newly woken enemy to cover `gap`. Its speed ramps from nothing
 * to the chase speed over ENEMY_HIT_SPEED_RECOVERY_SECONDS (enemy-simulation.ts recoverySpeed).
 */
function closeGapSeconds(gap: number, chaseSpeed: number) {
  if (gap <= 0) return 0;
  const ramp = ENEMY_HIT_SPEED_RECOVERY_SECONDS;
  const rampDistance = chaseSpeed * ramp / 2;
  return gap <= rampDistance ? Math.sqrt(2 * ramp * gap / chaseSpeed) : ramp + (gap - rampDistance) / chaseSpeed;
}

/**
 * The enemies that fight the player while it kills `target` from `standing`:
 * the target, every resting enemy whose aggro radius covers the player, the
 * whole of a group-aggro camp once one of it wakes, and anything still chasing
 * from the last fight that has not run past its leash.
 */
export function fightParticipants<Site extends CampSite>(
  target: Site,
  alive: readonly Site[],
  standing: Point,
  chasing: ReadonlySet<Site>,
  enemyOf: (site: Site) => EnemyDefinition,
) {
  const woken = new Set<Site>([target]);
  for (const site of alive) {
    if (site === target) continue;
    const distance = Math.hypot(site.x - standing.x, site.y - standing.y);
    if (chasing.has(site) ? distance <= site.leashRange : distance <= enemyAggroRadius(enemyOf(site))) woken.add(site);
  }
  const groupCamps = new Set([...woken].filter(site => site.groupAggro).map(site => site.campName));
  if (groupCamps.size) for (const site of alive) if (site.groupAggro && groupCamps.has(site.campName)) woken.add(site);
  return woken;
}

/** When and how hard each participant hits the player standing at `standing`. */
export function participantAttackers<Site extends CampSite>(
  participants: Iterable<Site>,
  standing: Point,
  chasing: ReadonlySet<Site>,
  enemyOf: (site: Site) => EnemyDefinition,
  armor: number,
  damageMultiplier: number,
  playerSpeed: number,
): Attacker[] {
  const chaseSpeed = Math.max(1, playerSpeed + ENEMY_CHASE_SPEED_MARGIN);
  const attackers: Attacker[] = [];
  for (const site of participants) {
    const enemy = enemyOf(site);
    const hit = damageAfterArmor(enemy.damage * damageMultiplier, armor);
    if (!(hit > 0) || !(enemy.attackSpeed > 0)) continue;
    const interval = 1 / Math.max(.01, enemy.attackSpeed);
    const distance = Math.hypot(site.x - standing.x, site.y - standing.y);
    let start: number;
    if (chasing.has(site)) {
      // Already on the player: its next hit is somewhere in its cycle.
      start = interval / 2;
    } else if (enemy.ranged) {
      const hold = rangedEnemyHoldBand(DEFAULT_ATTACK_RANGE, PLAYER_RADIUS + enemy.r + 4).approachAbove;
      start = closeGapSeconds(distance - hold, chaseSpeed) + RANGED_FIRST_SHOT_SECONDS + Math.min(distance, hold) / RANGED_PROJECTILE_SPEED;
    } else {
      start = closeGapSeconds(distance - (PLAYER_RADIUS + enemy.r), chaseSpeed);
    }
    attackers.push({ start, interval, hit });
  }
  return attackers;
}

export type FightOutcome = { diedAt: number | null; health: number };

/**
 * Plays the hits of `seconds` of fighting against `health` (of `maxHealth`),
 * regenerating `regen` a second throughout. Returns when the player fell, or
 * the health left at the end.
 */
export function resolveFight(health: number, maxHealth: number, regen: number, seconds: number, attackers: readonly Attacker[]): FightOutcome {
  let total = 0;
  for (const attacker of attackers) {
    if (attacker.start <= seconds) total += (1 + Math.floor((seconds - attacker.start) / attacker.interval)) * attacker.hit;
  }
  // No sequence of these hits can empty the bar: skip the order.
  if (total < health) return { diedAt: null, health: Math.min(maxHealth, health - total + Math.max(0, regen) * seconds) };
  const next = attackers.map(attacker => attacker.start);
  let hp = health, time = 0;
  for (let events = 0; events < MAX_FIGHT_EVENTS; events++) {
    let index = -1;
    for (let candidate = 0; candidate < next.length; candidate++) if (index < 0 || next[candidate] < next[index]) index = candidate;
    if (index < 0 || next[index] > seconds) return { diedAt: null, health: Math.min(maxHealth, hp + Math.max(0, regen) * (seconds - time)) };
    const at = next[index];
    hp = Math.min(maxHealth, hp + Math.max(0, regen) * (at - time));
    time = at;
    hp -= attackers[index].hit;
    if (hp <= 0) return { diedAt: at, health: 0 };
    next[index] += attackers[index].interval;
  }
  // A long fight: settle the rest on the average rate.
  const net = attackers.reduce((sum, attacker) => sum + attacker.hit / attacker.interval, 0) - Math.max(0, regen);
  if (net > 0 && time + hp / net <= seconds) return { diedAt: time + hp / net, health: 0 };
  return { diedAt: null, health: Math.min(maxHealth, hp - net * (seconds - time)) };
}

/**
 * Share of a boss's ability turns that land on a player who stands and shoots.
 * Calibrated on the autofarm harness's boss duels (see the Balance Lab notes).
 */
export const BOSS_ABILITY_LAND_SHARE = 1;

const bossCycleCache = new Map<string, number>();
/** Mean seconds between a boss's ability turns (shared/boss-simulation.ts). */
export function bossAbilitySeconds(kind: BossSimulationKind) {
  const cached = bossCycleCache.get(kind);
  if (cached !== undefined) return cached;
  let at = 0, slots = 0;
  do {
    const slot = bossAbilityTimelineAt({ kind, serverNowMs: at });
    at = slot.startedAtMs + slot.slotDurationMs;
    slots += 1;
  } while (bossAbilityTimelineAt({ kind, serverNowMs: at }).sequenceIndex !== 0 && slots < 16);
  const seconds = at / slots / 1_000;
  bossCycleCache.set(kind, seconds);
  return seconds;
}

/**
 * A boss as one attacker: an ability turn every bossAbilitySeconds, landing
 * BOSS_ABILITY_LAND_SHARE of them, each its kind's mean ability hit scaled to
 * the strongest hit the Lab prices the boss at.
 */
export function bossAttacker(kind: keyof typeof BOSS_DAMAGE_PROFILES, strongestHit: number, armor: number): Attacker {
  const profile = BOSS_DAMAGE_PROFILES[kind] as Record<string, number>;
  const values = Object.values(profile);
  const abilities = Object.entries(profile).filter(([name]) => name !== "contact").map(([, value]) => value);
  const meanShare = (abilities.length ? abilities.reduce((sum, value) => sum + value, 0) / abilities.length : Math.max(...values)) / Math.max(...values);
  const interval = bossAbilitySeconds(kind) / BOSS_ABILITY_LAND_SHARE;
  return { start: interval / 2, interval, hit: damageAfterArmor(strongestHit * meanShare, armor) };
}
