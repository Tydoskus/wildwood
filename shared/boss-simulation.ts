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
  | "tidewyrm"
  | "koiShogun";

export type BossAbilityName =
  | "cone"
  | "rain"
  | "web"
  | "venom"
  | "roar"
  | "icefall"
  | "rift"
  | "bite"
  | "eruption"
  | "sweep"
  | "bloom"
  | "surge"
  | "slash"
  | "whirlpool";

type BossAbilityDefinition = {
  ability: BossAbilityName;
  /** Time from this ability starting until the next one starts. */
  slotDurationMs: number;
  /** Time during which this ability has a visible or damaging effect. */
  activeDurationMs: number;
};

// These intervals preserve the existing hand-tuned boss pacing. Keeping them
// here makes the ability order and start time addressable from server time,
// instead of allowing each browser's local dt accumulator to choose the phase.
const BOSS_ABILITY_CYCLES: Record<BossSimulationKind, readonly BossAbilityDefinition[]> = {
  dragon: [
    { ability: "cone", slotDurationMs: 4_750, activeDurationMs: 1_950 },
    { ability: "rain", slotDurationMs: 4_800, activeDurationMs: 1_780 },
  ],
  spider: [
    { ability: "web", slotDurationMs: 3_650, activeDurationMs: 1_150 },
    { ability: "venom", slotDurationMs: 4_200, activeDurationMs: 1_550 },
  ],
  frostclaw: [
    { ability: "roar", slotDurationMs: 4_400, activeDurationMs: 1_800 },
    { ability: "icefall", slotDurationMs: 4_800, activeDurationMs: 1_840 },
    { ability: "rift", slotDurationMs: 4_650, activeDurationMs: 1_750 },
  ],
  magmalisk: [
    { ability: "bite", slotDurationMs: 4_020, activeDurationMs: 1_620 },
    { ability: "eruption", slotDurationMs: 5_000, activeDurationMs: 1_900 },
  ],
  gloomroot: [
    { ability: "sweep", slotDurationMs: 4_350, activeDurationMs: 1_850 },
    { ability: "bloom", slotDurationMs: 5_200, activeDurationMs: 2_000 },
  ],
  tidewyrm: [
    { ability: "surge", slotDurationMs: 4_320, activeDurationMs: 1_870 },
    { ability: "whirlpool", slotDurationMs: 5_100, activeDurationMs: 1_950 },
  ],
  koiShogun: [
    { ability: "slash", slotDurationMs: 4_200, activeDurationMs: 1_820 },
    { ability: "whirlpool", slotDurationMs: 5_000, activeDurationMs: 1_900 },
  ],
};

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

/**
 * Returns the boss ability occupying an absolute server-time slot. Two clients
 * can join at different times or render at different frame rates and still
 * recover the same ability, pattern index, and phase without another server row.
 */
export function bossAbilityTimelineAt(options: {
  kind: BossSimulationKind;
  serverNowMs: number;
}) {
  const definitions = BOSS_ABILITY_CYCLES[options.kind];
  const cycleDurationMs = definitions.reduce((total, definition) => total + definition.slotDurationMs, 0);
  const nowMs = Number.isFinite(options.serverNowMs) ? Math.max(0, options.serverNowMs) : 0;
  // Timing is a hidden global metronome, not another random output. The seed
  // varies targets and geometry, while every client shares these exact beats.
  const cycleIndex = Math.floor(nowMs / cycleDurationMs);
  const cycleStartedAtMs = cycleIndex * cycleDurationMs;
  const elapsedInCycleMs = nowMs - cycleStartedAtMs;
  let slotStartedInCycleMs = 0;
  let sequenceIndex = 0;
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    if (elapsedInCycleMs < slotStartedInCycleMs + definition.slotDurationMs) {
      sequenceIndex = index;
      break;
    }
    slotStartedInCycleMs += definition.slotDurationMs;
  }
  const definition = definitions[sequenceIndex];
  const startedAtMs = cycleStartedAtMs + slotStartedInCycleMs;
  return {
    ability: definition.ability,
    attackIndex: cycleIndex * definitions.length + sequenceIndex,
    sequenceIndex,
    startedAtMs,
    elapsedMs: Math.max(0, nowMs - startedAtMs),
    slotDurationMs: definition.slotDurationMs,
    activeDurationMs: definition.activeDurationMs,
  };
}

/** Shared absolute cadence for one player's attacks against a boss. */
export function bossPlayerAttackCycle(options: {
  kind: BossSimulationKind;
  encounter: bigint;
  playerId: string;
  attackInterval: number;
  serverNowMs: number;
}) {
  const intervalMs = Math.max(
    50,
    (Number.isFinite(options.attackInterval) ? options.attackInterval : 1) * 1_000,
  );
  const nowMs = Number.isFinite(options.serverNowMs) ? Math.max(0, options.serverNowMs) : 0;
  // Retain the original seed address so this correction does not reshuffle the
  // observer-side phase introduced with simulation version 1.
  const phaseOffsetMs = bossSeededUnit(
    "remote-player-attack-phase",
    options.kind,
    options.encounter,
    options.playerId,
  ) * intervalMs;
  const attackIndex = Math.floor((nowMs + phaseOffsetMs) / intervalMs);
  return {
    attackIndex,
    intervalMs,
    startedAtMs: attackIndex * intervalMs - phaseOffsetMs,
  };
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
