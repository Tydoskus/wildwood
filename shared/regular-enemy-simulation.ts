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
    hash = mixString(hash, typeof part === "number" ? `${Math.trunc(part)}` : part);
    hash ^= 0x9e3779b9;
  }
  return avalanche(hash) / UINT32_RANGE;
}

export function regularEnemySimulationTick(serverNowMs: number) {
  const now = Number.isFinite(serverNowMs) ? Math.max(0, serverNowMs) : 0;
  return Math.floor(now / REGULAR_ENEMY_TICK_MS);
}

function waypoint(mapId: string, siteId: number, segment: number, homeX: number, homeY: number) {
  const angle = regularEnemySeededUnit("ambient-angle", mapId, siteId, segment) * TAU;
  const distance = AMBIENT_MIN_RADIUS + regularEnemySeededUnit("ambient-distance", mapId, siteId, segment) * (AMBIENT_RADIUS - AMBIENT_MIN_RADIUS);
  return {
    x: homeX + Math.cos(angle) * distance,
    y: homeY + Math.sin(angle) * distance,
  };
}

function smoothstep(value: number) {
  const amount = Math.max(0, Math.min(1, value));
  return amount * amount * (3 - 2 * amount);
}

/** Pure ambient pose at an authoritative time; no frame-integrated RNG state. */
export function regularEnemyAmbientPose(
  mapId: string,
  siteId: number,
  homeX: number,
  homeY: number,
  serverNowMs: number,
): RegularEnemyAmbientPose {
  const now = Number.isFinite(serverNowMs) ? Math.max(0, serverNowMs) : 0;
  const phaseOffset = regularEnemySeededUnit("ambient-phase", mapId, siteId) * AMBIENT_SEGMENT_MS;
  const timeline = now + phaseOffset;
  const segment = Math.floor(timeline / AMBIENT_SEGMENT_MS);
  const segmentProgress = timeline / AMBIENT_SEGMENT_MS - segment;
  const previous = waypoint(mapId, siteId, segment - 1, homeX, homeY);
  const next = waypoint(mapId, siteId, segment, homeX, homeY);
  const holdFraction = .44 + regularEnemySeededUnit("ambient-hold", mapId, siteId, segment) * .25;
  const travelProgress = smoothstep((segmentProgress - holdFraction) / Math.max(.01, 1 - holdFraction));
  const x = previous.x + (next.x - previous.x) * travelProgress;
  const y = previous.y + (next.y - previous.y) * travelProgress;
  const facingDelta = next.x - previous.x;
  const facingX = Math.abs(facingDelta) > .5
    ? facingDelta < 0 ? -1 : 1
    : regularEnemySeededUnit("ambient-facing", mapId, siteId, segment) < .5 ? -1 : 1;
  return {
    x,
    y,
    facingX,
    phase: (now / 1_000 * 3 + regularEnemySeededUnit("animation-phase", mapId, siteId) * TAU) % TAU,
  };
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

function distanceSquaredTo(enemyX: number, enemyY: number, candidate: RegularEnemyAggroCandidate) {
  const dx = quantizeRegularEnemyCoordinate(candidate.x) - quantizeRegularEnemyCoordinate(enemyX);
  const dy = quantizeRegularEnemyCoordinate(candidate.y) - quantizeRegularEnemyCoordinate(enemyY);
  return dx * dx + dy * dy;
}

function stableCandidateOrder(left: RegularEnemyAggroCandidate, right: RegularEnemyAggroCandidate) {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
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
  const ordered = [...options.candidates].sort((left, right) => {
    const distanceDifference = distanceSquaredTo(options.enemyX, options.enemyY, left) - distanceSquaredTo(options.enemyX, options.enemyY, right);
    return distanceDifference || stableCandidateOrder(left, right);
  });
  const best = ordered.find((candidate) => {
    const candidateAcquireRadius = Math.max(0, candidate.acquireRadius ?? acquireRadius);
    return distanceSquaredTo(options.enemyX, options.enemyY, candidate) <= candidateAcquireRadius * candidateAcquireRadius;
  }) ?? null;
  const current = options.currentTargetId
    ? ordered.find((candidate) => candidate.id === options.currentTargetId) ?? null
    : null;
  if (!current || distanceSquaredTo(options.enemyX, options.enemyY, current) > retainRadius * retainRadius) return best;
  if (!best || best.id === current.id) return current;
  const bestDistance = Math.sqrt(distanceSquaredTo(options.enemyX, options.enemyY, best));
  const currentDistance = Math.sqrt(distanceSquaredTo(options.enemyX, options.enemyY, current));
  return bestDistance + TARGET_SWITCH_ADVANTAGE < currentDistance ? best : current;
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
