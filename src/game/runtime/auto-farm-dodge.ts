import type { Circle, EnemyShot, Position } from './types';

/**
 * Autofarm plays like an active player: it steps out of an attack it can see
 * coming (a boss's telegraphed rings, cones and pulses, an enemy's shot in
 * flight), and with a bow it backs away from a melee enemy closing in. It
 * keeps shooting all the while: attacks never wait for standing still.
 */

/** Every attack is taken this much wider, so a step out stops clear of the edge rather than on it. */
export const DODGE_PAD = 12;
/** A melee enemy this close to the player's edge is backed away from... */
export const KITE_GAP = 60;
/**
 * ...until it is this far off again: a spot nearer than this pays for it. A
 * chaser is a little faster than the player, so kiting keeps moving while it
 * comes, and the gap it opens after each hit (the enemy stops to strike) lasts.
 */
export const KITE_ROOM = 160;
/** Leaving the target's reach costs as much as walking this far. */
const OUT_OF_REACH = 300;
/** A spot this near an enemy not yet fighting would wake it: one nearer pays for it. */
const WAKE_RADIUS = 260;
/** Spots tried around the player: these distances, in this many directions. */
const RINGS = [40, 80, 130, 190, 260, 340];
const DIRECTIONS = 16;
/** A path is checked this often along its length. */
const PATH_STEP = 16;
/**
 * A step out of an attack starts this long before the latest moment it could,
 * and no sooner: until then the farm carries on (a shot from across the map is
 * sidestepped as it arrives, not the moment it is fired).
 */
const DODGE_SLACK = .3;

/** Seconds until an enemy shot would hit a circle of radius `r` at `point`; Infinity when none will. Shots fly straight. */
export function shotDanger(shots: readonly EnemyShot[], point: Position, r: number) {
  let soonest = Infinity;
  for (const shot of shots) {
    if (!(shot.life > 0)) continue;
    const wx = point.x - shot.x, wy = point.y - shot.y, reach = r + shot.r;
    const outside = wx * wx + wy * wy - reach * reach;
    // Already touching: one waiting out the player's hurt window lands when it ends.
    if (outside <= 0) return 0;
    const speed = shot.vx * shot.vx + shot.vy * shot.vy, closing = wx * shot.vx + wy * shot.vy;
    const square = closing * closing - speed * outside;
    if (!speed || closing <= 0 || square < 0) continue;
    const at = (closing - Math.sqrt(square)) / speed;
    if (at <= shot.life) soonest = Math.min(soonest, at);
  }
  return soonest;
}

export type EvadeOptions = {
  from: Position;
  speed: number;
  /** The player's radius. */
  r: number;
  /** Whether the player can stand here: inside the map, clear of the boss's body and the portals. */
  standable: (point: Position) => boolean;
  /** Seconds until something already in play would hit a player standing here; Infinity when nothing will. */
  danger: (point: Position) => number;
  /** Melee enemies to keep off a bow (none with a melee weapon, or in Reflect Only). */
  chasers: readonly Circle[];
  /** How close a chaser comes before it is backed away from: KITE_GAP, or KITE_ROOM once kiting. */
  kiteGap?: number;
  /** Enemies not fighting the player: a step away from one fight should not start another. */
  idle?: readonly Position[];
  /** Whether what it is fighting is still in reach from here. */
  inReach: (point: Position) => boolean;
  /** More spots worth trying, such as around the boss at the edge of reach. */
  extra?: readonly Position[];
};

/**
 * Where to step to now, or null to carry on: the nearest spot nothing in play
 * will hit, reached by a path nothing hits on the way (preferring one still in
 * reach of the target), once it is nearly time to go; or, with a melee enemy
 * closing on a bow, the nearest spot with room from it. With no clean way out
 * of an attack, the path that crosses the least of it; with none at all, it
 * stays and keeps shooting.
 */
export function evadePoint(options: EvadeOptions): Position | null {
  const { from, chasers } = options;
  const room = (point: Position) => {
    let gap = Infinity;
    for (const chaser of chasers) gap = Math.min(gap, Math.hypot(point.x - chaser.x, point.y - chaser.y) - chaser.r - options.r);
    return gap;
  };
  const lands = options.danger(from), threatened = Number.isFinite(lands), crowded = room(from) < (options.kiteGap ?? KITE_GAP);
  if (!threatened && !crowded) return null;
  const wakes = (point: Position) => {
    let nearest = Infinity;
    for (const enemy of options.idle ?? []) nearest = Math.min(nearest, Math.hypot(point.x - enemy.x, point.y - enemy.y));
    return Math.max(0, WAKE_RADIUS - nearest);
  };
  const cost = (point: Position) => Math.hypot(point.x - from.x, point.y - from.y) + (options.inReach(point) ? 0 : OUT_OF_REACH)
    + (chasers.length ? 3 * Math.max(0, KITE_ROOM - room(point)) : 0) + 2 * wakes(point);
  const spots: Position[] = [...options.extra ?? []];
  for (const ring of RINGS) for (let turn = 0; turn < DIRECTIONS; turn++) {
    const angle = turn * Math.PI * 2 / DIRECTIONS;
    spots.push({ x: from.x + Math.cos(angle) * ring, y: from.y + Math.sin(angle) * ring });
  }
  // Kiting moves only for a spot better than where it stands; out of an attack, anywhere safe beats staying.
  const stay = threatened ? Infinity : cost(from);
  const ranked = spots.filter(point => options.standable(point) && options.danger(point) === Infinity)
    .map(point => ({ point, cost: cost(point) })).filter(entry => entry.cost < stay).sort((a, b) => a.cost - b.cost);
  let fallback: Position | null = null, fewest = Infinity;
  for (const { point } of ranked) {
    const crossed = pathHits(options, point);
    if (crossed === 0) return crowded || Math.hypot(point.x - from.x, point.y - from.y) / Math.max(1, options.speed) + DODGE_SLACK >= lands ? point : null;
    if (threatened && crossed < fewest) { fallback = point; fewest = crossed; }
  }
  return fallback;
}

/**
 * How much of the walk to `to` something in play reaches first: steps where an
 * attack lands before, or as, the player passes. A blocked step is the whole walk.
 */
function pathHits(options: EvadeOptions, to: Position) {
  const { from, speed } = options, length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / PATH_STEP)), slack = PATH_STEP / Math.max(1, speed);
  let crossed = 0;
  for (let step = 1; step <= steps; step++) {
    const share = step / steps, point = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
    if (!options.standable(point)) return Infinity;
    if (options.danger(point) <= length * share / Math.max(1, speed) + slack) crossed++;
  }
  return crossed;
}
