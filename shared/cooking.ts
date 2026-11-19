import { FISH, fishById, type Fish, type FishId } from "./fishing";
import { skilletBonus } from "./tools";
import { TOWN_CENTER } from "./town";

// Feet of the three open campfires (stone-ring firepits, not torches) in the baked village scene.
export const COOK_FIRES = [[672, 349], [-1021, 71], [-1706, -913]]
  .map(([dx, dy]) => ({ x: TOWN_CENTER.x + dx, y: TOWN_CENTER.y + dy }));
export const FIRE_REACH = 72;
export const COOKING_RECIPES = [
  { id: "skewer", name: "River Skewer", level: 1, fish: 1, bonus: 0, seconds: 3 },
  { id: "cakes", name: "Fish Cakes", level: 4, fish: 2, bonus: 1, seconds: 3.6 },
  { id: "chowder", name: "Fisher's Chowder", level: 12, fish: 3, bonus: 2, seconds: 4.2 },
  { id: "pie", name: "Harbour Pie", level: 26, fish: 4, bonus: 4, seconds: 4.8 },
  { id: "platter", name: "Captain's Platter", level: 48, fish: 5, bonus: 7, seconds: 5.4 },
  { id: "feast", name: "River Feast", level: 72, fish: 6, bonus: 12, seconds: 6 },
] as const;

export type CookingRecipe = typeof COOKING_RECIPES[number];
export type CookedFishId = `cooked_${FishId}`;
export const COOKED_FISH_IDS: readonly CookedFishId[] = Object.freeze(FISH.map(fish => `cooked_${fish.id}` as CookedFishId));
const COOKED_FISH_BY_ID = new Map<string, Fish>(FISH.map(fish => [`cooked_${fish.id}`, fish]));

export const cookedFishId = (fishId: FishId): CookedFishId => `cooked_${fishId}`;
export const fishForCookedId = (id: unknown): Fish | null => typeof id === "string" ? COOKED_FISH_BY_ID.get(id) ?? null : null;
export const isCookedFishId = (id: unknown): id is CookedFishId => fishForCookedId(id) !== null;

export type FoodBuffStat = "maxHp" | "damage" | "armor" | "regen";
export type FoodBuffFactors = { maxHp: number; damage: number; armor: number; regen: number };
export const NO_FOOD_BUFF: Readonly<FoodBuffFactors> = Object.freeze({ maxHp: 1, damage: 1, armor: 1, regen: 1 });
export type ActiveFoodBuff = { fishId: FishId; endsAtMs: number };

export type CookedFishProfile = {
  fishId: FishId;
  sellPrice: number;
  durationSeconds: number;
  bonuses: Readonly<Partial<Record<FoodBuffStat, number>>>;
};

export const COOKED_FISH_PROFILES: Readonly<Record<FishId, CookedFishProfile>> = Object.freeze({
  minnow: { fishId: "minnow", sellPrice: 2, durationSeconds: 300, bonuses: { maxHp: 0.05 } },
  perch: { fishId: "perch", sellPrice: 3, durationSeconds: 360, bonuses: { damage: 0.05 } },
  bluegill: { fishId: "bluegill", sellPrice: 4, durationSeconds: 420, bonuses: { regen: 0.08 } },
  eel: { fishId: "eel", sellPrice: 6, durationSeconds: 480, bonuses: { armor: 0.08 } },
  trout: { fishId: "trout", sellPrice: 8, durationSeconds: 600, bonuses: { maxHp: 0.10 } },
  carp: { fishId: "carp", sellPrice: 10, durationSeconds: 660, bonuses: { damage: 0.10 } },
  salmon: { fishId: "salmon", sellPrice: 12, durationSeconds: 720, bonuses: { regen: 0.14 } },
  tuna: { fishId: "tuna", sellPrice: 15, durationSeconds: 840, bonuses: { armor: 0.14 } },
  lobster: { fishId: "lobster", sellPrice: 18, durationSeconds: 960, bonuses: { maxHp: 0.12, armor: 0.12 } },
  catfish: { fishId: "catfish", sellPrice: 22, durationSeconds: 1080, bonuses: { damage: 0.12, regen: 0.14 } },
  swordfish: { fishId: "swordfish", sellPrice: 26, durationSeconds: 1200, bonuses: { damage: 0.18 } },
  pike: { fishId: "pike", sellPrice: 32, durationSeconds: 1320, bonuses: { armor: 0.16, maxHp: 0.16 } },
  jellyfish: { fishId: "jellyfish", sellPrice: 38, durationSeconds: 1440, bonuses: { regen: 0.25 } },
  shark: { fishId: "shark", sellPrice: 46, durationSeconds: 1560, bonuses: { damage: 0.20, maxHp: 0.18 } },
  anglerfish: { fishId: "anglerfish", sellPrice: 56, durationSeconds: 1680, bonuses: { damage: 0.22, armor: 0.20 } },
  golden_koi: { fishId: "golden_koi", sellPrice: 100, durationSeconds: 1800, bonuses: { damage: 0.25, maxHp: 0.25, armor: 0.25, regen: 0.25 } },
});

/** Cooking level required to attempt cooking a fish: matches its Fishing tier (1 -> 90). */
export const fishCookingLevel = (fish: Pick<Fish, "level">) => fish.level;
export const canCookFish = (fish: Pick<Fish, "level">, cookingLevel: number) => cookingLevel >= fishCookingLevel(fish);

/** Level at which a fish stops burning without a skillet. */
export const cookingStopBurnLevel = (fish: Pick<Fish, "level">) =>
  fish.level + Math.min(28, 10 + Math.floor(fish.level / 5));

/**
 * Probability [0..1] that a cook succeeds instead of burning.
 * Freshly unlocked fish carry a real burn chance; leveling Cooking and upgrading the Skillet
 * (+2 effective levels per Skillet rank) smoothly bring it to 100%.
 */
export function cookingSuccessChance(fish: Pick<Fish, "level">, cookingLevel: number, skilletLevel = 0) {
  if (cookingLevel < fish.level) return 0;
  const effective = cookingLevel + Math.max(0, Math.floor(skilletLevel)) * 2;
  const stopDelta = Math.max(1, cookingStopBurnLevel(fish) - fish.level);
  const delta = Math.max(0, effective - fish.level);
  if (delta >= stopDelta) return 1;
  const baseBurn = Math.min(0.45, 0.22 + fish.level * 0.0025);
  return Math.max(0.5, Math.min(1, 1 - baseBurn * (1 - delta / stopDelta)));
}

/** Cooked portions added to inventory when a recipe succeeds. */
export const cookedPortionsFor = (recipe: Pick<CookingRecipe, "fish" | "bonus">) => recipe.fish + recipe.bonus;

/** Gold value of a single cooked fish when sold from inventory. */
export const cookedFishSellPrice = (fishId: FishId) => COOKED_FISH_PROFILES[fishId].sellPrice;

/** Grace window for server kill validation so a buff that just ticked down during a batch isn't clipped. */
export const FOOD_BUFF_REPORT_GRACE_MS = 15_000;

export function foodBuffRemainingMs(buff: ActiveFoodBuff | null | undefined, nowMs: number) {
  if (!buff || !fishById(buff.fishId)) return 0;
  return Math.max(0, buff.endsAtMs - nowMs);
}

export function foodBuffFactors(buff: ActiveFoodBuff | null | undefined, nowMs: number, graceMs = 0): FoodBuffFactors {
  if (!buff || !fishById(buff.fishId)) return NO_FOOD_BUFF;
  if (buff.endsAtMs + graceMs <= nowMs) return NO_FOOD_BUFF;
  const bonuses = COOKED_FISH_PROFILES[buff.fishId].bonuses;
  return {
    maxHp: 1 + (bonuses.maxHp ?? 0),
    damage: 1 + (bonuses.damage ?? 0),
    armor: 1 + (bonuses.armor ?? 0),
    regen: 1 + (bonuses.regen ?? 0),
  };
}

const STAT_LABELS: Readonly<Record<FoodBuffStat, string>> = {
  damage: "Damage",
  maxHp: "Max HP",
  armor: "Armor",
  regen: "Regen",
};

export function formatFoodBuffStats(fishId: FishId) {
  const bonuses = COOKED_FISH_PROFILES[fishId].bonuses;
  const entries = (Object.entries(bonuses) as [FoodBuffStat, number][]).filter(([, v]) => v > 0);
  if (entries.length === 4 && entries.every(([, v]) => v === entries[0][1])) {
    return `+${Math.round(entries[0][1] * 100)}% All Combat Stats`;
  }
  return entries.map(([stat, value]) => `+${Math.round(value * 100)}% ${STAT_LABELS[stat]}`).join(", ");
}

export function formatFoodBuffSummary(fishId: FishId) {
  const profile = COOKED_FISH_PROFILES[fishId];
  const mins = Math.round(profile.durationSeconds / 60);
  return `${formatFoodBuffStats(fishId)} · ${mins}m`;
}

export function formatFoodBuffClock(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 10) return `${minutes}m`;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${seconds}s`;
}

export function cookingReward(fish: Fish, recipe: CookingRecipe, skilletLevel = 0) {
  const factor = skilletBonus(skilletLevel);
  const portions = cookedPortionsFor(recipe);
  return {
    portions,
    gold: cookedFishSellPrice(fish.id) * portions,
    experience: Math.round((recipe.fish * Math.ceil(fish.experience / 8) + recipe.bonus * recipe.level) * factor),
  };
}

export function nextCookingUnlock(level: number) {
  const nextRecipe = COOKING_RECIPES.find(recipe => recipe.level > level);
  const nextFish = FISH.find(fish => fish.level > level);
  if (!nextRecipe && !nextFish) return "Every Fish & Recipe Open";
  if (nextFish && (!nextRecipe || nextFish.level <= nextRecipe.level)) {
    return `Next: ${nextFish.name} at Lv ${nextFish.level}`;
  }
  return `Next: ${nextRecipe!.name} at Lv ${nextRecipe!.level}`;
}
