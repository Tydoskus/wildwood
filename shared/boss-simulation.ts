// Browser-safe deterministic boss presentation rules. Boss health, accepted
// damage, contributions, rewards, and respawns stay authoritative; clients use
// this addressable seed only for repeatable hazard layouts and nearby-player
// attack presentation.

export const BOSS_SIMULATION_VERSION = 1;
export const BOSS_WORLD_SEED = 0x42_4f_53_53;

const UINT32_RANGE = 0x1_0000_0000;
const TAU = Math.PI * 2;

export type BossSimulationKind =
  | "dragon"
  | "spider"
  | "frostclaw"
  | "magmalisk"
  | "gloomroot"
  | "tidewyrm";

type BossSeedPart = string | number | bigint;

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

/** Addressable randomness: frame rate, skipped frames, and join time do not advance it. */
export function bossSeededUnit(...parts: readonly BossSeedPart[]) {
  let hash = BOSS_WORLD_SEED ^ BOSS_SIMULATION_VERSION;
  for (const part of parts) {
    const normalized = typeof part === "number" ? `${Math.trunc(part)}` : String(part);
    hash = mixString(hash, normalized);
    hash ^= 0x9e3779b9;
  }
  return avalanche(hash) / UINT32_RANGE;
}

export function bossSeededRange(
  minimum: number,
  maximum: number,
  ...parts: readonly BossSeedPart[]
) {
  const low = Number.isFinite(minimum) ? minimum : 0;
  const high = Number.isFinite(maximum) ? maximum : low;
  return low + (high - low) * bossSeededUnit(...parts);
}

export function seededBossHazardPolar(options: {
  kind: BossSimulationKind;
  encounter: bigint | null;
  pattern: string;
  patternIndex: number;
  hazardIndex: number;
  hazardCount: number;
  angleJitter: number;
  minimumRadius: number;
  maximumRadius: number;
  centerFirst?: boolean;
}) {
  const encounter = options.encounter ?? 0n;
  const hazardCount = Math.max(1, Math.floor(options.hazardCount));
  const hazardIndex = Math.max(0, Math.floor(options.hazardIndex));
  const patternIndex = Math.max(0, Math.floor(options.patternIndex));
  const angle = hazardIndex * TAU / hazardCount + bossSeededRange(
    -Math.max(0, options.angleJitter),
    Math.max(0, options.angleJitter),
    "hazard-angle",
    options.kind,
    encounter,
    options.pattern,
    patternIndex,
    hazardIndex,
  );
  const radius = options.centerFirst && hazardIndex === 0
    ? 0
    : bossSeededRange(
      options.minimumRadius,
      options.maximumRadius,
      "hazard-radius",
      options.kind,
      encounter,
      options.pattern,
      patternIndex,
      hazardIndex,
    );
  return { angle, radius };
}
