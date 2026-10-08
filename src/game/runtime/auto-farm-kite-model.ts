import { ENEMY_HIT_MIN_MOVE_SPEED, ENEMY_HIT_SPEED_RECOVERY_SECONDS } from '../constants';
import { ENEMY_CHASE_TURN_RATE } from './enemy-simulation';
import { worldReflectDamage } from '../../../shared/prestige-perks';

/**
 * What a melee chase costs, from the rules the chase runs by
 * (enemy-simulation.ts): a chaser runs at the player's speed + 25
 * (shared/rules.ts enemyChaseSpeed), so it is never outrun; it lands a blow
 * on touching, at most every 1 / attackSpeed; the blow stops it dead, and it
 * takes ENEMY_HIT_SPEED_RECOVERY_SECONDS to come back up to speed (its first
 * engage too). The player's arrows never slow it, and fly while the player
 * moves.
 *
 * Standing, each chaser touching lands a blow every 1 / attackSpeed.
 * Running, each lands one blow, then spends its ramp and the catch-up at 25 a
 * second not landing any: kitedHitInterval. On a small enough circle a chaser
 * settles trailing inside it and never lands one at all (auto-farm-dodge.ts
 * orbitTrail): for as many chasers as such a circle holds, kiting is free.
 */

/** A chaser, as the model needs it: its blow (after the player's armor), how often it can land one, its health and size. */
export type ChaserThreat = {
  damage: number; attackSpeed: number; hp: number; r: number;
  /** Its blow as it arrives, before armor: what Reflect throws back (default `damage`). */
  raw?: number;
};

/**
 * What a build gets back from the hits it takes: Reflect throws a blow back
 * at the hitter at the reflect chance (worldReflectDamage of the blow as it
 * arrived, at most max health outside Reflect Only), and Second Wind heals a
 * share of max health each kill. A build with either can farm a mob standing
 * that would wear another down: its kills come faster, or pay health back.
 */
export type TankPerks = { reflect: number; reflectOnly?: boolean; secondWind: number };

/** Reflect damage a second from `hitsPerSecond` blows of `chasers` landing (each at its share of the blows). */
function reflectRate(chasers: readonly ChaserThreat[], hitsPerSecond: number, maxHp: number, perks?: TankPerks) {
  if (!perks || !(perks.reflect > 0) || !chasers.length) return 0;
  const landing = chasers.filter(chaser => chaser.damage > 0);
  if (!landing.length) return 0;
  const mean = landing.reduce((sum, chaser) => sum + worldReflectDamage(chaser.raw ?? chaser.damage, maxHp, Boolean(perks.reflectOnly)), 0) / landing.length;
  return hitsPerSecond * mean * Math.min(1, perks.reflect);
}

/**
 * Health a fight with `chasers` costs, taking `damagePerSecond` in
 * `hitsPerSecond` blows at its start: killed one after another (in the order
 * given, by the build's damage and the blows Reflect throws back), the blows
 * thin out as the crowd does, once fewer are left than land at once;
 * regeneration puts health back all through, and Second Wind on each kill.
 * The most it is down at any point: what the reserve is kept against.
 */
export function perkFightLoss(options: { damagePerSecond: number; hitsPerSecond: number; chasers: readonly ChaserThreat[]; maxHp: number; regen: number; dps: number; perks?: TankPerks }) {
  const { chasers, perks } = options;
  if (!chasers.length) return 0;
  // Every chaser's own rate, uncapped: the crowd's blows can only fall below the given rate once these do.
  const rate = (chaser: ChaserThreat) => chaser.damage * chaser.attackSpeed;
  const uncapped = chasers.reduce((sum, chaser) => sum + rate(chaser), 0), uncappedHits = chasers.reduce((sum, chaser) => sum + chaser.attackSpeed, 0);
  const heal = perks && perks.secondWind > 0 ? Math.min(1, perks.secondWind) * options.maxHp : 0;
  let left = uncapped, leftHits = uncappedHits, loss = 0, deepest = 0;
  for (let index = 0; index < chasers.length; index++) {
    const damage = Math.min(options.damagePerSecond, left), hits = Math.min(options.hitsPerSecond, leftHits);
    const killing = Math.max(1e-9, options.dps + reflectRate(chasers.slice(index), hits, options.maxHp, perks));
    const seconds = Math.max(0, chasers[index].hp) / killing;
    loss = Math.max(0, loss + (damage - options.regen) * seconds);
    deepest = Math.max(deepest, loss);
    loss = Math.max(0, loss - heal);
    left -= rate(chasers[index]); leftHits -= chasers[index].attackSpeed;
  }
  return deepest;
}

const cycleCache = new Map<string, number>();
/**
 * Seconds between a chaser's blows on a player who runs straight from it at
 * `speed`: the blow stops it, it ramps back to `chaseSpeed` over the recovery
 * (its velocity easing at the chase turn rate), and closes the gap that
 * opened at the 25 a second it has on the player.
 */
export function kitedHitInterval(speed: number, chaseSpeed: number) {
  const key = `${Math.round(speed)}|${Math.round(chaseSpeed)}`, cached = cycleCache.get(key);
  if (cached !== undefined) return cached;
  const step = 1 / 240, ease = 1 - Math.exp(-ENEMY_CHASE_TURN_RATE * step);
  let at = 0, enemy = 0, velocity = 0, interval = Infinity;
  while (at < 120) {
    at += step;
    const target = ENEMY_HIT_MIN_MOVE_SPEED + (chaseSpeed - ENEMY_HIT_MIN_MOVE_SPEED) * Math.min(1, at / ENEMY_HIT_SPEED_RECOVERY_SECONDS);
    velocity += (target - velocity) * ease;
    enemy += velocity * step;
    if (at > ENEMY_HIT_SPEED_RECOVERY_SECONDS && enemy >= speed * at) { interval = at; break; }
  }
  if (cycleCache.size > 64) cycleCache.clear();
  cycleCache.set(key, interval);
  return interval;
}

/** How many chasers of radius `r` can touch a player of radius `playerR` at once: a ring of them, shoulder to shoulder. */
export function contactCapacity(playerR: number, r: number) {
  return Math.max(1, Math.floor(Math.PI * (playerR + r) / Math.max(1, r)));
}

/**
 * Damage a second from these chasers: standing (each touching lands a blow
 * every 1 / attackSpeed, as many as fit round the player, the hardest
 * hitters first) and kited (none on a circle that `holds`; otherwise one blow
 * each per kitedHitInterval, or per 1 / attackSpeed if that is longer).
 */
export function chaseDamage(options: { chasers: readonly ChaserThreat[]; speed: number; chaseSpeed: number; playerR: number; holds: boolean }) {
  const { chasers } = options;
  if (!chasers.length) return { standing: 0, kited: 0, standingHits: 0, kitedHits: 0 };
  const mean = chasers.reduce((sum, chaser) => sum + chaser.r, 0) / chasers.length;
  const touching = [...chasers].sort((a, b) => b.damage * b.attackSpeed - a.damage * a.attackSpeed).slice(0, contactCapacity(options.playerR, mean));
  const cycle = kitedHitInterval(options.speed, options.chaseSpeed);
  let standing = 0, standingHits = 0, kited = 0, kitedHits = 0;
  for (const chaser of touching) { standing += chaser.damage * chaser.attackSpeed; standingHits += chaser.attackSpeed; }
  if (!options.holds) for (const chaser of chasers) {
    const every = Math.max(cycle, 1 / Math.max(1e-9, chaser.attackSpeed));
    kited += chaser.damage / every; kitedHits += 1 / every;
  }
  return { standing, kited, standingHits, kitedHits };
}

/** Health kept in hand by a fight stood through: a pull, or a mob farmed in place, never takes the player below this share. */
export const TANK_RESERVE = .35;

/**
 * How many of `chasers` (in the order given: the ones already coming first)
 * the build can farm standing without falling below TANK_RESERVE of `maxHp`:
 * what Pull Whole Group pulls. At least one.
 */
export function tankableCount(options: { chasers: readonly ChaserThreat[]; playerR: number; maxHp: number; regen: number; dps: number; perks?: TankPerks }) {
  const budget = options.maxHp * (1 - TANK_RESERVE);
  let count = 1;
  for (let size = 2; size <= options.chasers.length; size++) {
    const group = options.chasers.slice(0, size);
    // Standing, the rate does not depend on speed: holds and speeds play no part.
    const { standing, standingHits } = chaseDamage({ chasers: group, speed: 1, chaseSpeed: 1, playerR: options.playerR, holds: true });
    if (perkFightLoss({ damagePerSecond: standing, hitsPerSecond: standingHits, chasers: group, maxHp: options.maxHp, regen: options.regen, dps: options.dps, perks: options.perks }) > budget) break;
    count = size;
  }
  return count;
}
