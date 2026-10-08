import { ENEMY_HIT_MIN_MOVE_SPEED, ENEMY_HIT_SPEED_RECOVERY_SECONDS } from '../constants';
import { ENEMY_CHASE_TURN_RATE } from './enemy-simulation';

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
export type ChaserThreat = { damage: number; attackSpeed: number; hp: number; r: number };

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

/**
 * Health a fight costs: damage a second less regeneration, over the seconds
 * it takes to kill every chaser at `dps`. Nothing when regeneration keeps up.
 */
export function fightLoss(damagePerSecond: number, regen: number, chasers: readonly ChaserThreat[], dps: number) {
  const seconds = chasers.reduce((sum, chaser) => sum + chaser.hp, 0) / Math.max(1e-9, dps);
  return Math.max(0, damagePerSecond - regen) * seconds;
}

/** Health kept in hand by a fight stood through: a pull, or a mob farmed in place, never takes the player below this share. */
export const TANK_RESERVE = .35;

/**
 * How many of `chasers` (in the order given: the ones already coming first)
 * the build can farm standing without falling below TANK_RESERVE of `maxHp`:
 * what Pull Whole Group pulls. At least one.
 */
export function tankableCount(options: { chasers: readonly ChaserThreat[]; playerR: number; maxHp: number; regen: number; dps: number }) {
  const budget = options.maxHp * (1 - TANK_RESERVE);
  let count = 1;
  for (let size = 2; size <= options.chasers.length; size++) {
    const group = options.chasers.slice(0, size);
    // Standing, the rate does not depend on speed: holds and speeds play no part.
    const { standing } = chaseDamage({ chasers: group, speed: 1, chaseSpeed: 1, playerR: options.playerR, holds: true });
    if (fightLoss(standing, options.regen, group, options.dps) > budget) break;
    count = size;
  }
  return count;
}
