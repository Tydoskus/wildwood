import { ENEMY_CHASE_TURN_RATE } from './enemy-simulation';
import type { Circle, EnemyShot, Position } from './types';

/**
 * Autofarm plays like an active player: it steps out of an attack it can see
 * coming (a boss's telegraphed rings, cones and pulses, an enemy's shot in
 * flight), and with a bow it runs a small circle around the melee enemies
 * chasing it, as good players do, so they never catch it. It keeps shooting
 * all the while: attacks never wait for standing still.
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

/**
 * Where an enemy not yet fighting wakes: a player whose centre comes inside
 * `r` of it (its aggro radius, padded). `own` marks the farmed camp, and the
 * camp already fighting: waking more of it only brings the next kill sooner,
 * so it costs a little; any other camp is never walked into.
 */
export type WakeZone = Circle & { own?: boolean };

/** How deep a spot is inside the wake zones of the farmed camp (`own`), or of every other camp, summed. */
function wakeDepth(wake: readonly WakeZone[], point: Position, own: boolean) {
  let depth = 0;
  for (const zone of wake) if (Boolean(zone.own) === own) depth += Math.max(0, zone.r - Math.hypot(point.x - zone.x, point.y - zone.y));
  return depth;
}
const wakesOther = (wake: readonly WakeZone[], point: Position) => wakeDepth(wake, point, false) > 0;

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
  /** Where enemies not fighting the player would wake: a step away from one fight should not start another. */
  wake?: readonly WakeZone[];
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
  // Kiting never steps into another camp's wake zone. Out of an attack (dodging
  // wins), or already inside one, it only costs dearly: the shallower the better.
  const wake = options.wake ?? [], spare = threatened || wakesOther(wake, from);
  const wakes = (point: Position) => wakeDepth(wake, point, true) + (spare ? 3 * wakeDepth(wake, point, false) : 0);
  const cost = (point: Position) => Math.hypot(point.x - from.x, point.y - from.y) + (options.inReach(point) ? 0 : OUT_OF_REACH)
    + (chasers.length ? 3 * Math.max(0, KITE_ROOM - room(point)) : 0) + 2 * wakes(point);
  const spots: Position[] = [...options.extra ?? []];
  for (const ring of RINGS) for (let turn = 0; turn < DIRECTIONS; turn++) {
    const angle = turn * Math.PI * 2 / DIRECTIONS;
    spots.push({ x: from.x + Math.cos(angle) * ring, y: from.y + Math.sin(angle) * ring });
  }
  // Kiting moves only for a spot better than where it stands; out of an attack, anywhere safe beats staying.
  const stay = threatened ? Infinity : cost(from);
  const ranked = spots.filter(point => options.standable(point) && options.danger(point) === Infinity && (spare || !wakesOther(wake, point)))
    .map(point => ({ point, cost: cost(point) })).filter(entry => entry.cost < stay).sort((a, b) => a.cost - b.cost);
  let fallback: Position | null = null, fewest = Infinity;
  for (const { point } of ranked) {
    const crossed = pathHits(options, point, spare ? [] : wake);
    if (crossed === 0) return crowded || Math.hypot(point.x - from.x, point.y - from.y) / Math.max(1, options.speed) + DODGE_SLACK >= lands ? point : null;
    if (threatened && crossed < fewest) { fallback = point; fewest = crossed; }
  }
  return fallback;
}

/**
 * How much of the walk to `to` something in play reaches first: steps where an
 * attack lands before, or as, the player passes. A blocked step (off the map,
 * into a portal or the boss, or through another camp's `wake`) is the whole walk.
 */
function pathHits(options: EvadeOptions, to: Position, wake: readonly WakeZone[]) {
  const { from, speed } = options, length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / PATH_STEP)), slack = PATH_STEP / Math.max(1, speed);
  let crossed = 0;
  for (let step = 1; step <= steps; step++) {
    const share = step / steps, point = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
    if (!options.standable(point) || wakesOther(wake, point)) return Infinity;
    if (options.danger(point) <= length * share / Math.max(1, speed) + slack) crossed++;
  }
  return crossed;
}

/**
 * The circle kite. A chaser runs a little faster than the player (player
 * speed + 25), so backing straight off only delays it, and runs across the
 * map into other camps. But it turns slowly (ENEMY_CHASE_TURN_RATE): run a
 * small enough circle and it settles onto a circle just inside, trailing, and
 * never closes. The orbit is a fixed centre and radius; the chasers stay
 * inside it, in reach, while the bow fires on the move.
 */
export type Orbit = Position & { r: number; dir: 1 | -1 };

/**
 * How the kite is tuned. The defaults are what measured best in the virtual
 * player runs (autofarm-sim); a comparison run overrides them.
 */
export type KiteTuning = {
  /** 'circle': circle the chasers; 'back-off': only back away from them; 'off': stand and fight (dodging still). */
  mode: 'circle' | 'back-off' | 'off';
  /** A chaser this close to the player's edge starts the circle... */
  startGap: number;
  /** ...which runs until none is this close. */
  stopGap: number;
  /** More melee enemies chasing than this (near or still on their way) are stood and farmed in place; dodging still applies. */
  maxChasers: number;
  /** Added to an enemy's aggro radius for its wake zone: its wander between looks, and the grid aggro is measured on. */
  wakePad: number;
  /** With no circle that holds (too many chasers, or too big), still run a wide loop; otherwise back off. */
  wide: boolean;
  /**
   * Whether the kite model (auto-farm-kite-model.ts) decides what is kited and
   * how much Pull Whole Group pulls; off, every melee chaser worth avoiding is
   * kited, up to maxChasers, and Pull pulls everything.
   */
  model: boolean;
};
export const KITE_TUNING: KiteTuning = { mode: 'circle', startGap: 120, stopGap: 260, maxChasers: Infinity, wakePad: 32, wide: true, model: true };

/** Room kept between a settled chaser and the player beyond touching. */
const ORBIT_CLEARANCE = 6;
/** A crowd strings out along the inner circle: each chaser past the first needs this share of its radius, times the square root of how many. */
const ORBIT_CROWDING = .55;
/** Within the band of circles that hold, how far toward the widest: a wider one gives a crowd room. */
const ORBIT_BAND_SHARE = .7;
/** With no circle that holds (too many chasers, or too big), wide loops still cut the hits several-fold: the widest of these that is safe. */
const WIDE_LOOPS = [220, 170, 130];
const MIN_LOOP = 40;
/** A circle that cannot hold costs as much as being this much the wrong size. */
const NOT_HOLDING = 150;
/** The circle's centre is tried in these directions around the player (eighths of a turn, both ways round). */
const CENTRE_TURNS = 8;
/**
 * A new circle is best begun heading straight away from the chasers (its
 * centre to one side): they arrive at the full chase speed, and one begun
 * across or toward them lets the first blow land. Each radian off costs this.
 */
const ENTRY_COST = 15;
/** The arc ahead is checked for attacks this far, in seconds of running (or one lap, if sooner), this often. */
const ARC_SECONDS = 2;
const ARC_STEP = .1;
/** Keeping the circle it runs costs this much less than a new one; turning the other way along it (a flip) a little less. */
const ORBIT_KEEP = 40, ORBIT_FLIP = 20;
/** A chaser this near the player's edge is never run toward by the arc ahead, over this many seconds of it. */
const CHASER_ROOM = 40, CHASER_LOOK = .6;
/** The point steered for, this far ahead along the circle in seconds of running. */
const ORBIT_LEAD = .15;
/** The circle is checked for standing room this often along its length. */
const ORBIT_SAMPLE = 24;

/**
 * How far a chaser trails a player running a circle of `radius` at `speed`,
 * centre to centre, once the chase settles: it runs an inner circle, its turn
 * lagging the player's (its velocity eases toward the player at `turnRate`).
 * Null when it does not settle: on a wider circle it is quick enough to cut
 * across and close in.
 */
export function orbitTrail(radius: number, speed: number, chaseSpeed: number, turnRate = ENEMY_CHASE_TURN_RATE) {
  const spin = speed / radius, lag = Math.atan(spin / turnRate);
  const inner = chaseSpeed / (spin * Math.sqrt(1 + (spin / turnRate) ** 2));
  const square = radius * radius - (inner * Math.cos(lag)) ** 2;
  return square < 0 ? null : inner * Math.sin(lag) + Math.sqrt(square);
}

/**
 * The circle to run for these chasers: the radii it may take, best first, and
 * the band of radii a settled chase never closes from (null when none does:
 * too many chasers, or too big, for the player's speed). Never wider than `maxRadius`.
 */
export function orbitRadii(options: { speed: number; chaseSpeed: number; r: number; chasers: readonly Circle[]; maxRadius: number }) {
  const { chasers, speed } = options;
  const widest = Math.max(...chasers.map(chaser => chaser.r)), mean = chasers.reduce((sum, chaser) => sum + chaser.r, 0) / chasers.length;
  const needed = options.r + widest + ORBIT_CLEARANCE + ORBIT_CROWDING * mean * Math.sqrt(chasers.length - 1);
  let low = Infinity, high = -Infinity;
  for (let radius = MIN_LOOP; radius <= options.maxRadius; radius += 2) {
    const trail = orbitTrail(radius, speed, Math.max(speed, options.chaseSpeed));
    if (trail === null) break;
    if (trail >= needed) { low = Math.min(low, radius); high = radius; }
  }
  const band: [number, number] | null = Number.isFinite(low) ? [low, high] : null;
  const span = band ? band[1] - band[0] : 0;
  const radii = [...band ? [band[0] + span * ORBIT_BAND_SHARE, band[0] + span * .4, band[0] + span * .95] : [],
    ...WIDE_LOOPS, 100, 70].filter(radius => radius >= MIN_LOOP && radius <= options.maxRadius);
  return { radii: [...new Set(radii)], band, preferred: radii[0] ?? MIN_LOOP };
}

export type OrbitOptions = EvadeOptions & {
  /** The circle it is running, if any. */
  orbit: Orbit | null;
  /** How fast the chasers chase (enemyChaseSpeed): the player's speed and a little more. */
  chaseSpeed: number;
  /** The widest circle: the weapon's reach, so what circles inside it stays in range. */
  maxRadius: number;
  /** Whether what it fights is in reach from a spot on the circle; a chaser circles along, so only a boss, or an enemy not chasing, is asked about. inReach otherwise. */
  orbitReach?: (point: Position) => boolean;
  /** A target that must stay in reach from every spot on the circle: one shot part-way down that is not chasing (it would heal back, or never be finished). */
  orbitHold?: (point: Position) => boolean;
  /** How many melee enemies chase it in all, the ones still far off included (`chasers` are those near enough to matter now). */
  chasing?: number;
};

/**
 * The safest circle to run around the chasers: one whose whole loop is
 * standable (in the map, clear of the boss and the portals), wakes no other
 * camp, and runs into no attack in play over the arc ahead; of those, the one
 * the chase holds on, keeping the target in reach, nearest the current one.
 * When the arc ahead is blocked the other way round (a flip: it turns the
 * other way, carrying on in the direction it runs) or a tighter or looser
 * circle is taken. Null when no circle is safe.
 */
export function chooseOrbit(options: OrbitOptions & { wide?: boolean }): Orbit | null {
  const { from, chasers } = options;
  if (!chasers.length) return null;
  const { radii, band, preferred } = orbitRadii({ speed: options.speed, chaseSpeed: options.chaseSpeed, r: options.r, chasers, maxRadius: options.maxRadius });
  const holds = (radius: number) => band !== null && radius >= band[0] - 1 && radius <= band[1] + 1;
  const toward = Math.atan2(chasers.reduce((sum, chaser) => sum + chaser.y, 0) / chasers.length - from.y,
    chasers.reduce((sum, chaser) => sum + chaser.x, 0) / chasers.length - from.x);
  const candidates: { orbit: Orbit; cost: number }[] = [];
  const add = (orbit: Orbit, cost: number) => candidates.push({ orbit, cost: cost + Math.abs(orbit.r - preferred) + (holds(orbit.r) ? 0 : NOT_HOLDING) });
  if (options.orbit && (options.wide !== false || holds(options.orbit.r))) {
    const kept = options.orbit;
    add(kept, -ORBIT_KEEP);
    add({ x: 2 * from.x - kept.x, y: 2 * from.y - kept.y, r: kept.r, dir: kept.dir === 1 ? -1 : 1 }, ORBIT_FLIP - ORBIT_KEEP);
  }
  for (const radius of options.wide === false ? radii.filter(holds) : radii) for (let turn = 0; turn < CENTRE_TURNS; turn++) for (const dir of [1, -1] as const) {
    // The player stands on the circle; it sets off along it, square to the centre.
    const angle = toward + turn * 2 * Math.PI / CENTRE_TURNS, heading = angle + Math.PI + dir * Math.PI / 2;
    const offAway = Math.abs(Math.atan2(Math.sin(heading - toward - Math.PI), Math.cos(heading - toward - Math.PI)));
    add({ x: from.x + Math.cos(angle) * radius, y: from.y + Math.sin(angle) * radius, r: radius, dir }, offAway * ENTRY_COST);
  }
  // Cheapest first, by what each costs in all; the loop's cost is only ever
  // added (never negative), so it is worked out only for the circles that
  // could still be best, and the arc only for the best of those.
  const queue = candidates.sort((a, b) => a.cost - b.cost), scored: typeof candidates = [];
  for (let next = 0; next < queue.length || scored.length;) {
    const bound = next < queue.length ? queue[next].cost : Infinity;
    let pick = -1;
    for (let index = 0; index < scored.length; index++) if (scored[index].cost <= bound && (pick < 0 || scored[index].cost < scored[pick].cost)) pick = index;
    if (pick >= 0) {
      const [entry] = scored.splice(pick, 1);
      if (arcClear(options, entry.orbit)) return entry.orbit;
      continue;
    }
    const entry = queue[next++], cost = entry.cost + loopCost(options, entry.orbit);
    if (Number.isFinite(cost)) scored.push({ orbit: entry.orbit, cost });
  }
  return null;
}

/**
 * What running this loop costs: Infinity where it cannot be stood on or runs
 * into another camp's wake zone (one the player is already inside only costs,
 * the shallower the better); the farmed camp's zones and leaving the target's
 * reach cost a little.
 */
function loopCost(options: OrbitOptions, orbit: Orbit) {
  let cost = 0;
  for (const zone of options.wake ?? []) {
    const depth = zone.r - Math.abs(Math.hypot(zone.x - orbit.x, zone.y - orbit.y) - orbit.r);
    if (depth <= 0) continue;
    if (zone.own) cost += depth;
    else if (Math.hypot(options.from.x - zone.x, options.from.y - zone.y) <= zone.r) cost += 3 * depth;
    else return Infinity;
  }
  const samples = Math.max(16, Math.ceil(2 * Math.PI * orbit.r / ORBIT_SAMPLE));
  let outside = 0;
  for (let index = 0; index < samples; index++) {
    const angle = index * 2 * Math.PI / samples, point = { x: orbit.x + Math.cos(angle) * orbit.r, y: orbit.y + Math.sin(angle) * orbit.r };
    if (!options.standable(point) || (options.orbitHold && !options.orbitHold(point))) return Infinity;
    if (!(options.orbitReach ?? options.inReach)(point)) outside++;
  }
  return cost + OUT_OF_REACH * outside / samples;
}

/**
 * Whether the arc ahead runs into nothing: no spot along it is hit by an
 * attack in play before, or as, the player passes, and none soon after
 * setting off is nearer a chaser close by than the player is now. Settled, a
 * chaser trails behind; one still arriving (or slow off the mark) can be met
 * head on by a circle that loops back to it.
 */
function arcClear(options: OrbitOptions, orbit: Orbit) {
  const { from, chasers, r } = options;
  const speed = Math.max(1, options.speed), horizon = Math.min(ARC_SECONDS, 2 * Math.PI * orbit.r / speed);
  const start = Math.atan2(from.y - orbit.y, from.x - orbit.x);
  if (options.danger(from) <= ARC_STEP) return false;
  const gap = (point: Position, chaser: Circle) => Math.hypot(point.x - chaser.x, point.y - chaser.y) - chaser.r - r;
  const close = chasers.filter(chaser => gap(from, chaser) < CHASER_ROOM);
  for (let at = ARC_STEP; at <= horizon + 1e-9; at += ARC_STEP) {
    const angle = start + orbit.dir * speed * at / orbit.r;
    const point = { x: orbit.x + Math.cos(angle) * orbit.r, y: orbit.y + Math.sin(angle) * orbit.r };
    if (options.danger(point) <= at + ARC_STEP) return false;
    if (at <= CHASER_LOOK && close.some(chaser => gap(point, chaser) < gap(from, chaser))) return false;
  }
  return true;
}

/** The point to steer for to run the circle: a little ahead along it, which also draws a player off it back on. */
export function orbitStep(orbit: Orbit, from: Position, speed: number): Position {
  const angle = Math.atan2(from.y - orbit.y, from.x - orbit.x) + orbit.dir * Math.min(1, Math.max(1, speed) * ORBIT_LEAD / orbit.r);
  return { x: orbit.x + Math.cos(angle) * orbit.r, y: orbit.y + Math.sin(angle) * orbit.r };
}

/** A circle to run, or a spot to step to (`kiting` when it backs off rather than dodges). */
export type Evasion = { orbit: Orbit } | { to: Position; kiting: boolean };

/**
 * What to do about the attacks in play and the chasers: run a circle around
 * the chasers once one comes close (its arc clear of every attack in play, so
 * dodging always wins); with no safe circle, dodge or back off as evadePoint
 * says; with more chasing than tuning.maxChasers, only dodge; null to carry on.
 */
export function planEvasion(options: OrbitOptions & { tuning?: KiteTuning }): Evasion | null {
  const tuning = options.tuning ?? KITE_TUNING;
  const gap = (chaser: Circle) => Math.hypot(chaser.x - options.from.x, chaser.y - options.from.y) - chaser.r - options.r;
  const crowd = Math.max(options.chasers.length, options.chasing ?? 0) > tuning.maxChasers;
  const chasers = tuning.mode === 'off' || crowd ? [] : options.chasers;
  if (tuning.mode === 'circle') {
    const near = chasers.filter(chaser => gap(chaser) < tuning.stopGap);
    if (near.some(chaser => gap(chaser) < (options.orbit ? tuning.stopGap : tuning.startGap))) {
      const orbit = chooseOrbit({ ...options, chasers: near, wide: tuning.wide });
      if (orbit) return { orbit };
    }
  }
  const to = evadePoint({ ...options, chasers });
  return to && { to, kiting: !Number.isFinite(options.danger(options.from)) };
}
