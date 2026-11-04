/**
 * What the world shows of fishing, written by the fishing runtime (fishing-runtime.ts) and read by the renderers,
 * as woodcuttingScene is: where every spot is now, the one being fished, and the rod.
 */
export const fishingScene = {
  /** Every spot where it is now. */
  spots: [] as { spot: number; site: number; x: number; y: number }[],
  /** The spot being fished, or null. */
  fishing: null as number | null,
  /** Whether the rod is out: the player holds it instead of their weapon while fishing. */
  rodOut: false,
  /** A catch's splash at the spot being fished, counting down from 1. */
  splash: 0,
  /** Fishing experience, for the level and progress shown over the player while the rod is out. */
  experience: 0,
  /** The last catch's experience, rising off that display, and how much of its rise is left, from 1. */
  gain: 0,
  gainLeft: 0,
};

export function resetFishingScene() {
  fishingScene.spots = [];
  fishingScene.fishing = null;
  fishingScene.rodOut = false;
  fishingScene.splash = 0;
  fishingScene.experience = 0;
  fishingScene.gain = 0;
  fishingScene.gainLeft = 0;
}
