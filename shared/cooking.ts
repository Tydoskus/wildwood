import type { Fish } from "./fishing";

import { TOWN_CENTER } from "./town";

// Feet of the animated open campfires in the baked village scene.
export const COOK_FIRES = [[672, 349], [-1021, 71], [-1510, -1039], [-1706, -913], [-1970, -844], [-93, 644]]
  .map(([dx, dy]) => ({ x: TOWN_CENTER.x + dx, y: TOWN_CENTER.y + dy }));
export const FIRE_REACH = 72;
export const COOKING_RECIPES = [
  { id: "skewer", name: "River Skewer", level: 1, fish: 1, bonus: 0 },
  { id: "cakes", name: "Fish Cakes", level: 4, fish: 2, bonus: 1 },
  { id: "chowder", name: "Fisher's Chowder", level: 12, fish: 3, bonus: 2 },
  { id: "pie", name: "Harbour Pie", level: 26, fish: 4, bonus: 4 },
  { id: "platter", name: "Captain's Platter", level: 48, fish: 5, bonus: 7 },
  { id: "feast", name: "River Feast", level: 72, fish: 6, bonus: 12 },
] as const;

export type CookingRecipe = typeof COOKING_RECIPES[number];

export function cookingReward(fish: Fish, recipe: CookingRecipe) {
  return {
    gold: recipe.fish * (1 + Math.floor(fish.level / 12)) + recipe.bonus,
    experience: recipe.fish * Math.ceil(fish.experience / 8) + recipe.bonus * recipe.level,
  };
}

export function nextCookingUnlock(level: number) {
  const next = COOKING_RECIPES.find(recipe => recipe.level > level);
  return next ? `Next: ${next.name} at Lv ${next.level}` : "Every Recipe Open";
}
