// Browser-safe deterministic regular-enemy rules. The server does not own
// regular enemies, so every client evaluates this versioned timeline locally.

export const REGULAR_ENEMY_SIMULATION_VERSION = 2;
export const REGULAR_ENEMY_WORLD_SEED = 0x57_49_4c_44;
export const REGULAR_ENEMY_TICK_MS = 100;
export const REGULAR_ENEMY_CONSENSUS_DELAY_MS = 350;
export const REGULAR_ENEMY_POSITION_QUANTUM = 4;
/** Covers the worst radial error when both centers round to the position grid. */
export const REGULAR_ENEMY_AGGRO_EDGE_TOLERANCE = REGULAR_ENEMY_POSITION_QUANTUM * Math.SQRT2;
/** Once acquired, a target must move meaningfully farther away before release. */
export const REGULAR_ENEMY_AGGRO_RELEASE_PADDING = 48;

const AMBIENT_SEGMENT_MS = 5_000;
const AMBIENT_MIN_RADIUS = 22;
const AMBIENT_RADIUS = 72;
const TARGET_SWITCH_ADVANTAGE = 24;
const UINT32_RANGE = 0x1_0000_0000;
const TAU = Math.PI * 2;

export type RegularEnemyAggroCandidate = {
  id: string;
  x: number;
  y: number;
  radius: number;
  local: boolean;
  /** Optional candidate-specific acquisition edge, such as player attack range. */
  acquireRadius?: number;
};

export type RegularEnemyAmbientPose = {
  x: number;
  y: number;
  facingX: -1 | 1;
  phase: number;
};

function mixString(hash: number, value: string) {
  let mixed = hash >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    mixed ^= value.charCodeAt(index);
    mixed = Math.imul(mixed, 0x01000193);
  }
  return mixed >>> 0;
}

const digits = new Uint8Array(16);
/** mixString(hash, `${Math.trunc(value)}`) without building the string: the ambient pose hashes ~7 numbers per enemy each step. */
export function mixInteger(hash: number, value: number) {
  let rest = Math.trunc(value);
  if (!(Math.abs(rest) <= Number.MAX_SAFE_INTEGER)) return mixString(hash, `${rest}`);
  let mixed = hash >>> 0;
  if (rest < 0) { mixed = Math.imul(mixed ^ 45, 0x01000193); rest = -rest; }
  let count = 0;
  do { digits[count++] = rest % 10; rest = (rest - digits[count - 1]) / 10; } while (rest > 0);
  while (count > 0) mixed = Math.imul(mixed ^ (48 + digits[--count]), 0x01000193);
  return mixed >>> 0;
}

function avalanche(hash: number) {
  let mixed = hash >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

/** Addressable randomness: skipping frames or joining late cannot advance it. */
export function regularEnemySeededUnit(...parts: readonly (string | number)[]) {
  let hash = REGULAR_ENEMY_WORLD_SEED;
  for (const part of parts) {
    hash = typeof part === "number" ? mixInteger(hash, part) : mixString(hash, part);
    hash ^= 0x9e3779b9;
  }
  return avalanche(hash) / UINT32_RANGE;
}

/** regularEnemySeededUnit(label, mapId, siteId[, segment]) without its rest-argument array: the ambient pose asks seven times per enemy each step. */
export function regularEnemySiteUnit(label: string, mapId: string, siteId: number, segment?: number) {
  let hash = mixString(REGULAR_ENEMY_WORLD_SEED, label) ^ 0x9e3779b9;
  hash = mixString(hash, mapId) ^ 0x9e3779b9;
  hash = mixInteger(hash, siteId) ^ 0x9e3779b9;
  if (segment !== undefined) hash = mixInteger(hash, segment) ^ 0x9e3779b9;
  return avalanche(hash) / UINT32_RANGE;
}

export function regularEnemySimulationTick(serverNowMs: number) {
  const now = Number.isFinite(serverNowMs) ? Math.max(0, serverNowMs) : 0;
  return Math.floor(now / REGULAR_ENEMY_TICK_MS);
}

// Reused by regularEnemyAmbientPose, which reads them straight back: two waypoints per enemy each step.
const previousPoint = { x: 0, y: 0 }, nextPoint = { x: 0, y: 0 };
function waypoint(mapId: string, siteId: number, segment: number, homeX: number, homeY: number, out: { x: number; y: number }) {
  const angle = regularEnemySiteUnit("ambient-angle", mapId, siteId, segment) * TAU;
  const distance = AMBIENT_MIN_RADIUS + regularEnemySiteUnit("ambient-distance", mapId, siteId, segment) * (AMBIENT_RADIUS - AMBIENT_MIN_RADIUS);
  out.x = homeX + Math.cos(angle) * distance;
  out.y = homeY + Math.sin(angle) * distance;
  return out;
}

function smoothstep(value: number) {
  const amount = Math.max(0, Math.min(1, value));
  return amount * amount * (3 - 2 * amount);
}

type AmbientSite = {
  homeX: number;
  homeY: number;
  phaseOffset: number;
  animationPhase: number;
  segment: number;
  previousX: number;
  previousY: number;
  nextX: number;
  nextY: number;
  holdFraction: number;
  facingX: -1 | 1;
};
// Per-site hashes and the current segment's waypoints, kept between steps: the same numbers, worked out once per segment.
const ambientSites = new Map<string, AmbientSite[]>();
function ambientSite(mapId: string, siteId: number, homeX: number, homeY: number) {
  let sites = ambientSites.get(mapId);
  if (!sites) {
    sites = [];
    ambientSites.set(mapId, sites);
  }
  let site = sites[siteId];
  if (!site || !Object.is(site.homeX, homeX) || !Object.is(site.homeY, homeY)) {
    site = {
      homeX,
      homeY,
      phaseOffset: regularEnemySiteUnit("ambient-phase", mapId, siteId) * AMBIENT_SEGMENT_MS,
      animationPhase: regularEnemySiteUnit("animation-phase", mapId, siteId) * TAU,
      segment: Number.NaN,
      previousX: 0,
      previousY: 0,
      nextX: 0,
      nextY: 0,
      holdFraction: 0,
      facingX: 1,
    };
    sites[siteId] = site;
  }
  return site;
}

function ambientNow(serverNowMs: number) {
  return Number.isFinite(serverNowMs) ? Math.max(0, serverNowMs) : 0;
}

/** Pure ambient pose at an authoritative time; no frame-integrated RNG state. */
export function regularEnemyAmbientPose(
  mapId: string,
  siteId: number,
  homeX: number,
  homeY: number,
  serverNowMs: number,
): RegularEnemyAmbientPose {
  const now = ambientNow(serverNowMs);
  const site = ambientSite(mapId, siteId, homeX, homeY);
  const timeline = now + site.phaseOffset;
  const segment = Math.floor(timeline / AMBIENT_SEGMENT_MS);
  const segmentProgress = timeline / AMBIENT_SEGMENT_MS - segment;
  if (site.segment !== segment) {
    const previous = waypoint(mapId, siteId, segment - 1, homeX, homeY, previousPoint);
    const next = waypoint(mapId, siteId, segment, homeX, homeY, nextPoint);
    site.previousX = previous.x;
    site.previousY = previous.y;
    site.nextX = next.x;
    site.nextY = next.y;
    site.holdFraction = .44 + regularEnemySiteUnit("ambient-hold", mapId, siteId, segment) * .25;
    const facingDelta = next.x - previous.x;
    site.facingX = Math.abs(facingDelta) > .5
      ? facingDelta < 0 ? -1 : 1
      : regularEnemySiteUnit("ambient-facing", mapId, siteId, segment) < .5 ? -1 : 1;
    site.segment = segment;
  }
  const holdFraction = site.holdFraction;
  const travelProgress = smoothstep((segmentProgress - holdFraction) / Math.max(.01, 1 - holdFraction));
  return {
    x: site.previousX + (site.nextX - site.previousX) * travelProgress,
    y: site.previousY + (site.nextY - site.previousY) * travelProgress,
    facingX: site.facingX,
    phase: (now / 1_000 * 3 + site.animationPhase) % TAU,
  };
}

/** regularEnemyAmbientPose(...).phase alone. */
export function regularEnemyAmbientPhase(mapId: string, siteId: number, homeX: number, homeY: number, serverNowMs: number) {
  return (ambientNow(serverNowMs) / 1_000 * 3 + ambientSite(mapId, siteId, homeX, homeY).animationPhase) % TAU;
}

export function quantizeRegularEnemyCoordinate(value: number) {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.round(finite / REGULAR_ENEMY_POSITION_QUANTUM) * REGULAR_ENEMY_POSITION_QUANTUM;
}

/** Prevents acquire/release oscillation when an authored leash is too small. */
export function regularEnemyAggroRetainRadius(acquireRadius: number, authoredLeashRadius: number) {
  const acquire = Math.max(0, Number.isFinite(acquireRadius) ? acquireRadius : 0);
  const leash = Math.max(0, Number.isFinite(authoredLeashRadius) ? authoredLeashRadius : 0);
  return Math.max(leash, acquire + REGULAR_ENEMY_AGGRO_RELEASE_PADDING);
}

function stableCandidateOrder(left: RegularEnemyAggroCandidate, right: RegularEnemyAggroCandidate) {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function nearerCandidate(left: RegularEnemyAggroCandidate, leftDistanceSquared: number, right: RegularEnemyAggroCandidate, rightDistanceSquared: number) {
  const distanceDifference = leftDistanceSquared - rightDistanceSquared;
  return distanceDifference ? distanceDifference < 0 : stableCandidateOrder(left, right) < 0;
}

/** Deterministic closest-player selection with a small target-switch dead band. */
export function selectRegularEnemyAggroTarget(options: {
  enemyX: number;
  enemyY: number;
  acquireRadius: number;
  retainRadius: number;
  currentTargetId?: string | null;
  candidates: readonly RegularEnemyAggroCandidate[];
}) {
  const acquireRadius = Math.max(0, options.acquireRadius);
  const retainRadius = Math.max(acquireRadius, options.retainRadius);
  // The first of each in nearest-then-stable order, found in one pass: copying and sorting the candidates ran for every enemy each step.
  // The enemy's grid point is rounded once and each candidate's squared distance worked out once.
  const enemyX = quantizeRegularEnemyCoordinate(options.enemyX);
  const enemyY = quantizeRegularEnemyCoordinate(options.enemyY);
  let best: RegularEnemyAggroCandidate | null = null, current: RegularEnemyAggroCandidate | null = null;
  let bestDistanceSquared = 0, currentDistanceSquared = 0;
  for (const candidate of options.candidates) {
    const dx = quantizeRegularEnemyCoordinate(candidate.x) - enemyX;
    const dy = quantizeRegularEnemyCoordinate(candidate.y) - enemyY;
    const distanceSquared = dx * dx + dy * dy;
    const candidateAcquireRadius = Math.max(0, candidate.acquireRadius ?? acquireRadius);
    if (distanceSquared <= candidateAcquireRadius * candidateAcquireRadius && (!best || nearerCandidate(candidate, distanceSquared, best, bestDistanceSquared))) {
      best = candidate;
      bestDistanceSquared = distanceSquared;
    }
    if (options.currentTargetId && candidate.id === options.currentTargetId && (!current || nearerCandidate(candidate, distanceSquared, current, currentDistanceSquared))) {
      current = candidate;
      currentDistanceSquared = distanceSquared;
    }
  }
  if (!current || currentDistanceSquared > retainRadius * retainRadius) return best;
  if (!best || best.id === current.id) return current;
  return Math.sqrt(bestDistanceSquared) + TARGET_SWITCH_ADVANTAGE < Math.sqrt(currentDistanceSquared) ? best : current;
}

export function deterministicRegularEnemyAttackInterval(
  mapId: string,
  siteId: number,
  attackIndex: number,
  baseInterval: number,
) {
  const interval = Math.max(.01, Number.isFinite(baseInterval) ? baseInterval : 1);
  return interval * (.83 + regularEnemySeededUnit("enemy-attack", mapId, siteId, attackIndex) * .34);
}

export function deterministicRemoteCritical(
  mapId: string,
  siteId: number,
  targetId: string,
  engagementTick: number,
  attackIndex: number,
  chance = .12,
  projectileIndex = 0,
) {
  return regularEnemySeededUnit("remote-critical", mapId, siteId, targetId, engagementTick, attackIndex, projectileIndex) < Math.max(0, Math.min(1, chance));
}
