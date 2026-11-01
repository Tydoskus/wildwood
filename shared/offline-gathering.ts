import { MINING_NODE_KINDS, MINING_NODES, MINING_VEINS, canMineRock, miningBreakSeconds, miningGain, miningRockOre, type MiningNode } from "./mining";
import { WOOD_STANDS, WOOD_TREE_NODES, WOODCUTTING_LOGS, WOODCUTTING_RESPAWN_SECONDS, canChopStand, woodcuttingChopSeconds, woodcuttingGain, type WoodTree } from "./woodcutting";
import { gatherRespawnMs } from "./gather-respawn";

/**
 * What time away is collected as: the player is shown all three on return and picks one. Fighting is
 * shared/offline-progress.ts; mining and chopping split the time evenly over every vein or stand the skill opens.
 */
export type OfflineActivity = "fight" | "mine" | "chop";
export const offlineActivity = (value: unknown): OfflineActivity | null =>
  value === "fight" || value === "mine" || value === "chop" ? value : null;

/** Mining and chopping away run at this share of the speed of playing, as offline gold is half. */
export const OFFLINE_GATHER_SPEED = .5;
/** Walking from one rock or tree to the next. */
export const OFFLINE_GATHER_WALK_SECONDS = 2.5;
/** A bound on the loop, well past what eight hours at full speed can break. */
const OFFLINE_GATHER_MAX_BREAKS = 20_000;

type Spot<T> = { at: T; seconds: (skill: number) => number; respawnSeconds: number; gain: number; value: number };

/**
 * Every break in `seconds` away, in order: the free spot that pays most per second next, waiting when none is free.
 * Skill grows with each break, so later breaks are quicker; the spots stay the ones picked at the start.
 */
function simulate<T>(spots: readonly Spot<T>[], skill: number, seconds: number) {
  const readyAt = spots.map(() => 0), breaks: T[] = [], budget = Math.max(0, seconds) * OFFLINE_GATHER_SPEED;
  let now = 0;
  while (spots.length && breaks.length < OFFLINE_GATHER_MAX_BREAKS) {
    let best = -1, bestRate = -1;
    for (let i = 0; i < spots.length; i++) {
      if (readyAt[i] > now) continue;
      const rate = spots[i].value / (spots[i].seconds(skill) + OFFLINE_GATHER_WALK_SECONDS);
      if (rate > bestRate) { best = i; bestRate = rate; }
    }
    if (best < 0) { now = Math.min(...readyAt); continue; }
    const end = now + OFFLINE_GATHER_WALK_SECONDS + spots[best].seconds(skill);
    if (end > budget) break;
    now = end;
    readyAt[best] = now + spots[best].respawnSeconds;
    skill += spots[best].gain;
    breaks.push(spots[best].at);
  }
  return { breaks, skill };
}

/** Each area's turn in order, an even share of the time, skill carried from one to the next. */
function simulateShares<T>(areas: readonly (readonly Spot<T>[])[], skill: number, seconds: number) {
  const breaks: T[] = [];
  for (const spots of areas) {
    const share = simulate(spots, skill, seconds / areas.length);
    breaks.push(...share.breaks);
    skill = share.skill;
  }
  return { breaks, skill };
}

/** Every open area, shallowest first; the first is always open. */
function openAreas(count: number, open: (index: number) => boolean) {
  const opened = Array.from({ length: count }, (_, index) => index).filter(open);
  return opened.length ? opened : [0];
}

/** The veins mined away: every vein this Mining opens, with its ore rocks and the crystal rocks Mining opens there. */
export const offlineMiningVeins = (mining: number) => openAreas(MINING_VEINS.length, index => canMineRock({ kind: "small", vein: index }, mining));

export function simulateOfflineMining(input: { mining: number; seconds: number; cardSpeed?: number; pickaxe?: number; respawnRank?: number }) {
  const veins = offlineMiningVeins(input.mining);
  const areas = veins.map(vein => MINING_NODES.filter(node => node.vein === vein && canMineRock(node, input.mining)).map((node): Spot<MiningNode> => ({
    at: node, gain: miningGain(node),
    seconds: skill => miningBreakSeconds(node, skill, input.cardSpeed ?? 0, input.pickaxe ?? 0),
    respawnSeconds: gatherRespawnMs(MINING_NODE_KINDS[node.kind].respawnSeconds, input.respawnRank ?? 0) / 1_000,
    // A Mysterious rock's Starshard is worth walking to first, and a crystal rock's Arcane Crystal next.
    value: miningRockOre(node) + (node.kind === "mysterious" ? 10 : node.kind === "crystal" ? 5 : 0),
  })));
  return { veins, ...simulateShares(areas, input.mining, input.seconds) };
}

/** The stands chopped away: every stand this Woodcutting opens. */
export const offlineWoodStands = (woodcutting: number) => openAreas(WOOD_STANDS.length, index => canChopStand(WOOD_STANDS[index], woodcutting));

export function simulateOfflineChopping(input: { woodcutting: number; seconds: number; cardSpeed?: number; hatchet?: number; respawnRank?: number }) {
  const stands = offlineWoodStands(input.woodcutting);
  const areas = stands.map(stand => WOOD_TREE_NODES.filter(tree => tree.stand === stand).map((tree): Spot<WoodTree> => ({
    at: tree, gain: woodcuttingGain(tree), value: WOODCUTTING_LOGS,
    seconds: skill => woodcuttingChopSeconds(tree, skill, input.hatchet ?? 0, input.cardSpeed ?? 0),
    respawnSeconds: gatherRespawnMs(WOODCUTTING_RESPAWN_SECONDS, input.respawnRank ?? 0) / 1_000,
  })));
  return { stands, ...simulateShares(areas, input.woodcutting, input.seconds) };
}
