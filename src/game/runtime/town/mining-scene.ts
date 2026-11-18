/**
 * What the world shows of the player's mining, written by the mining runtime (mining-runtime.ts) and read by the
 * renderers, as soulWellFall is: the rocks that are bare for the player, the rock they are mining, how far along,
 * and their pickaxe's swing.
 */
export const miningScene = {
  /** Rocks the player broke that have yet to grow back for them. */
  bare: new Set<number>(),
  /** The rock being mined, or null. */
  target: null as number | null,
  /** How far through breaking it, 0 to 1. */
  progress: 0,
  /** Whether the pickaxe is out: the player holds it instead of their weapon while mining. */
  pickaxeOut: false,
  /** The pickaxe swing's clock, counting down like a weapon's attack clock (sword-swing.ts reads it). */
  swingClock: 0,
  /** Why the rock in reach is not being mined, if it is not: Mining short of it, or no bag room. */
  blocked: null as "vein" | "bag" | null,
  /** The pickaxe's level (shared/tools.ts), for its colour in hand. */
  toolLevel: 0,
  /** Current Mining stat, for the overhead skill badge. */
  level: 0,
  /** Last rock's Mining gain, rising off the badge, and how much of its rise is left, from 1. */
  gain: 0,
  gainLeft: 0,
  /** Seconds to keep the badge visible after swinging or breaking a rock. */
  badgeLeft: 0,
};

export function resetMiningScene() {
  miningScene.bare.clear();
  miningScene.target = null;
  miningScene.progress = 0;
  miningScene.pickaxeOut = false;
  miningScene.swingClock = 0;
  miningScene.blocked = null;
  miningScene.toolLevel = 0;
  miningScene.level = 0;
  miningScene.gain = 0;
  miningScene.gainLeft = 0;
  miningScene.badgeLeft = 0;
}
