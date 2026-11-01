/**
 * Crafted arrows: ammunition a bow spends one a shot while a kind is nocked, each with its own effect. They stack in
 * the bag as materials do, are made at the Smith from a log and an ore, and when the nocked stack runs out the bow
 * shoots plain arrows again. Every number to tune is in this file.
 */
import type { OreId } from "./refine";
import { CARD_EFFECT_DEFAULTS } from "./card-effects";

export type ArrowId = "steel_arrow" | "fire_arrow" | "venom_arrow" | "frost_arrow" | "piercing_arrow" | "star_arrow";
export type ArrowEffect = "damage" | "burn" | "poison" | "chill" | "pierce" | "critDamage";

export type ArrowKind = {
  name: string;
  effect: ArrowEffect;
  /** What the effect does, in the bag and the Smith. */
  text: string;
  /** One craft: these materials make `makes` arrows. */
  recipe: Readonly<Partial<Record<OreId, number>>>;
  makes: number;
};

export const ARROW_KINDS: Readonly<Record<ArrowId, ArrowKind>> = {
  steel_arrow: { name: "Steel Arrow", effect: "damage", text: "Arrow damage ×1.1", recipe: { pine_log: 1, iron_ore: 1 }, makes: 100 },
  fire_arrow: { name: "Fire Arrow", effect: "burn", text: "Hits burn for a hit's damage over 3s", recipe: { oak_log: 1, copper_ore: 2 }, makes: 100 },
  venom_arrow: { name: "Venom Arrow", effect: "poison", text: "Hits poison and weaken enemies 15%", recipe: { oak_log: 1, iron_ore: 2 }, makes: 100 },
  frost_arrow: { name: "Frost Arrow", effect: "chill", text: "Hits slow enemies 40% for 2s", recipe: { yew_log: 1, arcane_crystal: 1 }, makes: 100 },
  piercing_arrow: { name: "Piercing Arrow", effect: "pierce", text: "Passes through one more enemy", recipe: { yew_log: 1, mithril_ore: 1 }, makes: 100 },
  star_arrow: { name: "Star Arrow", effect: "critDamage", text: "Critical hits ×1.25", recipe: { elder_log: 2, starshard: 1 }, makes: 250 },
};
export const ARROW_IDS = Object.keys(ARROW_KINDS) as ArrowId[];
export const isArrowId = (value: unknown): value is ArrowId => typeof value === "string" && value in ARROW_KINDS;

/** Steel Arrow's damage, Star Arrow's on a critical hit, Fire Arrow's burn (a share of the hit over 3s). */
export const STEEL_ARROW_DAMAGE = 1.1;
export const STAR_ARROW_CRIT_DAMAGE = 1.25;
export const FIRE_ARROW_BURN = Object.freeze({ share: 1, seconds: 3 });
/** Piercing Arrow carries on through this many more regular enemies. */
export const PIERCING_ARROW_EXTRA_TARGETS = 1;

/**
 * Arrows a run of shots spends: one a shot, less the chance to keep one (none yet; Mastery or a card may give it).
 * Fractional: the client keeps the remainder, the server rounds what it takes down so it never takes more.
 */
export const arrowsSpent = (shots: number, saveChance = 0) => Math.max(0, shots) * (1 - Math.min(1, Math.max(0, saveChance)));

/** A nocked arrow's damage on a hit: Steel always, Star on a critical. */
export const arrowHitMultiplier = (arrow: ArrowId | null | undefined, critical: boolean) =>
  arrow === "steel_arrow" ? STEEL_ARROW_DAMAGE : arrow === "star_arrow" && critical ? STAR_ARROW_CRIT_DAMAGE : 1;

/**
 * The most a nocked arrow adds to a hit, for the server's kill bound: Steel's damage, Fire's and Venom's damage over
 * time counted whole (the looser side), Star's on every critical, and Piercing's extra enemy.
 */
export function arrowOffenseBound(arrow: ArrowId | null | undefined) {
  return {
    damage: arrow === "steel_arrow" ? STEEL_ARROW_DAMAGE : arrow === "fire_arrow" ? 1 + FIRE_ARROW_BURN.share
      : arrow === "venom_arrow" ? 1 + CARD_EFFECT_DEFAULTS.poison.share : 1,
    critical: arrow === "star_arrow" ? STAR_ARROW_CRIT_DAMAGE : 1,
    reach: arrow === "piercing_arrow" ? 1 + PIERCING_ARROW_EXTRA_TARGETS : 1,
  };
}
