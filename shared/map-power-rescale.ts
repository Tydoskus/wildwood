import { MAP_STAT_GROWTH, referenceBuildForMap } from "./progression";
import { playerPowerForStats, type PlayerPowerStats } from "./player-power";

export const MAP_RESCALE_UNLOCKS = ["desertUnlocked", "snowlandsUnlocked", "lavaUnlocked", "infernalUnlocked",
  "waterUnlocked", "samuraiUnlocked", "cloudspireUnlocked", "moonfenUnlocked", "crystalHollowsUnlocked"] as const;
export type MapRescaleProgress = PlayerPowerStats & Partial<Record<typeof MAP_RESCALE_UNLOCKS[number], boolean>>;

export function furthestUnlockedMapIndex(progress: MapRescaleProgress) {
  return MAP_RESCALE_UNLOCKS.reduce((furthest, key, index) => progress[key] ? index + 1 : furthest, 0);
}

/** Forest finishes at Desert entry; every later map spans one reference tier. */
export function mapExitPowerReference(mapIndex: number) {
  if (!Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex > MAP_RESCALE_UNLOCKS.length) {
    throw new RangeError("Unknown map index");
  }
  const build = referenceBuildForMap(Math.max(0, mapIndex - 1));
  return playerPowerForStats({ ...build, attackRate: build.attackInterval }) * (mapIndex === 0 ? 1 : MAP_STAT_GROWTH);
}

/** Preview only. This policy is not invoked by gameplay or saved-player migration.
 * Compress excess logarithmically; preserve a veteran advantage above the map's
 * exit reference instead of assigning every veteran the same power. */
export function previewMapPowerRescale<T extends MapRescaleProgress>(progress: T, effectivePower: number) {
  if (!Number.isFinite(effectivePower) || effectivePower < 0) throw new RangeError("Invalid effective power");
  const mapIndex = furthestUnlockedMapIndex(progress);
  const referencePower = mapExitPowerReference(mapIndex);
  const targetPower = effectivePower <= referencePower ? effectivePower
    : referencePower * (1 + .25 * Math.log(effectivePower / referencePower));
  const factor = effectivePower > 0 ? Math.min(1, targetPower / effectivePower) : 1;
  return {
    mapIndex, referencePower, targetPower, factor,
    progress: factor === 1 ? progress : {
      ...progress, damage: Math.max(1, progress.damage * factor), maxHp: Math.max(1, progress.maxHp * factor),
      armor: progress.armor * factor, regen: progress.regen * factor,
    },
  };
}

/** Rank-constrained map targets, returned in input order. Equal input powers
 * retain ties. Adjacent incompatible map targets are pooled in log space.
 * A small retained share of the original log-power gap makes compression strict. */
export function rankPreservingPowerTargets(entries: readonly { power: number; mapIndex: number }[]) {
  const sorted = entries.map((entry, index) => ({ ...entry, index })).sort((a, b) => a.power - b.power);
  const groups: { members: typeof sorted; power: number; desired: number }[] = [];
  for (const entry of sorted) {
    if (!Number.isFinite(entry.power) || entry.power < 0) throw new RangeError("Invalid power");
    const reference = mapExitPowerReference(entry.mapIndex);
    const desired = entry.power <= reference ? entry.power : reference * (1 + .25 * Math.log(entry.power / reference));
    const last = groups[groups.length - 1];
    if (last?.power === entry.power) {
      last.members.push(entry);
      last.desired = Math.min(last.desired, desired);
    } else groups.push({ members: [entry], power: entry.power, desired });
  }
  type Block = { start: number; end: number; sum: number; weight: number; bound: number; value: number };
  const blocks: Block[] = [];
  groups.forEach((group, index) => {
    const value = Math.log(Math.max(1, group.desired));
    blocks.push({ start: index, end: index, sum: value, weight: 1, bound: Math.log(Math.max(1, group.power)), value });
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const sum = left.sum + right.sum;
      const weight = left.weight + right.weight;
      const bound = Math.min(left.bound, right.bound);
      blocks.push({ start: left.start, end: right.end, sum, weight, bound, value: Math.min(bound, sum / weight) });
    }
  });
  const targets = new Array<number>(entries.length);
  let previous = -1;
  for (const block of blocks) {
    for (let index = block.start; index <= block.end; index++) {
      const group = groups[index];
      const compressed = Math.exp(.95 * block.value + .05 * Math.log(Math.max(1, group.power)));
      const target = Math.min(group.power, Math.max(previous + 1, Math.round(compressed)));
      for (const member of group.members) targets[member.index] = target;
      previous = target;
    }
  }
  return targets;
}

// One-time v7 conversion calibrated against the September 4 account snapshot.
// Raw-power knots carry the rank-constrained effective-power plan back into a
// context-free transform that offline queued saves can apply identically.
const LEGACY_MAP_POWER_KNOTS: readonly (readonly [number, number])[] = [
  [16_347, 16_347],
  [61_455, 21_684.010116132034],
  [145_998, 25_206],
  [527_635, 196_522.13207581226],
  [1_123_933, 227_485.7300686156],
  [9_861_857_449, 51_477_757.0373639],
  [131_013_015_785, 172_177_454.34890783],
  [520_183_634_831, 233_331_110.6642781],
];

export function legacyMapTargetRawPower(power: number) {
  if (!Number.isFinite(power) || power <= LEGACY_MAP_POWER_KNOTS[0][0]) return power;
  for (let i = 1; i < LEGACY_MAP_POWER_KNOTS.length; i++) {
    const [x1, y1] = LEGACY_MAP_POWER_KNOTS[i - 1];
    const [x2, y2] = LEGACY_MAP_POWER_KNOTS[i];
    if (power <= x2) {
      const fraction = Math.log(power / x1) / Math.log(x2 / x1);
      return y1 * Math.pow(y2 / y1, fraction);
    }
  }
  const [lastPower, lastTarget] = LEGACY_MAP_POWER_KNOTS[LEGACY_MAP_POWER_KNOTS.length - 1];
  return lastTarget * Math.pow(power / lastPower, .15);
}

/** Versioned migration only, never an ongoing reward cap. */
export function compressLegacyMapPower<T extends PlayerPowerStats>(progress: T): T {
  const before = playerPowerForStats(progress);
  const target = legacyMapTargetRawPower(before);
  if (target >= before || before <= 0) return progress;
  const factor = target / before;
  return {
    ...progress,
    damage: Math.fround(Math.max(1, progress.damage * factor)),
    maxHp: Math.fround(Math.max(1, progress.maxHp * factor)),
    armor: Math.fround(progress.armor * factor),
    regen: Math.fround(progress.regen * factor),
  };
}
