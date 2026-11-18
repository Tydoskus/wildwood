/**
 * What the world shows of the player's cooking at a village campfire, written by the cooking fire window
 * and read by the overhead skill badge renderer (fishing-badge.ts).
 */
export const cookingScene = {
  /** True while a dish is actively cooking on the fire. */
  active: false,
  /** Cooking experience, for the level and progress shown over the player. */
  experience: 0,
  /** The last dish's Cooking XP, rising off the badge, and how much of its rise is left, from 1. */
  gain: 0,
  gainLeft: 0,
  /** Seconds to keep the badge visible after finishing a dish. */
  badgeLeft: 0,
};

export function resetCookingScene() {
  cookingScene.active = false;
  cookingScene.experience = 0;
  cookingScene.gain = 0;
  cookingScene.gainLeft = 0;
  cookingScene.badgeLeft = 0;
}
