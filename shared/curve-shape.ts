/**
 * The shape the balance curve (shared/curve-steps.ts) is laid over, taken once from the live balance:
 * - CURVE_FOREST: Tutorial Forest's damage camp (its regular damage, attack speed and crit enemies); every map's
 *   damage camp grows from it by the curve's steps.
 * - CURVE_ROLES: each role (regular or elite, by what it pays) against its map's damage camp, its average over
 *   maps 2-15 (the Forest's regular regen camp, a role no other map has, its own).
 * - CURVE_BOSS_HEALTH: every boss against its damage camp's health.
 * - CURVE_BOSS_ATTACKS: each boss's attacks against its damage camp's hit.
 * - CURVE_FOREST_ENEMIES: Tutorial Forest enemies shaped apart from their role, against the same damage camp.
 * The curve's numbers are rounded to 6 significant digits (map-balance.ts), so these shares land on whole targets.
 */
export type CurveStats = { readonly hp: number; readonly damage: number; readonly reward: number };

export const CURVE_FOREST: CurveStats = Object.freeze({ hp: 95.6522, damage: 28.5217, reward: 1.92857 });
export const CURVE_ROLES: Readonly<Record<string, CurveStats>> = Object.freeze({
  "regular:damage": { hp: 1.0, damage: 1.0, reward: 1.0 },
  "regular:health": { hp: 1.23076, damage: 0.692888, reward: 49.4411 },
  "elite:health": { hp: 4.19589, damage: 2.11252, reward: 114.867 },
  "regular:armor": { hp: 1.86129, damage: 0.832793, reward: 8.39786 },
  "elite:damage": { hp: 2.51683, damage: 1.6354, reward: 3.51791 },
  "elite:regen": { hp: 1.70195, damage: 0.978002, reward: 4.30226 },
  "regular:regen": { hp: 2.3, damage: 1.96341, reward: 1.55556 },
});
/** Forest enemies' own shares of its damage camp, over their role's (Spitter 18 health, 12 hit, 1 damage; Bramble 42/14/11; King Slime pays 50). */
export const CURVE_FOREST_ENEMIES: Readonly<Record<string, Partial<CurveStats>>> = Object.freeze({
  Spitter: { hp: 0.188182, damage: 0.420732, reward: 0.518519 },
  Bramble: { hp: 0.439091, damage: 0.490854, reward: 5.70371 },
  "King Slime": { reward: 25.92594 },
});
export const CURVE_BOSS_HEALTH = 73.713;
export const CURVE_BOSS_ATTACKS: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  // The Dragon hits hard enough that Reflect Only has something to throw back at it.
  tutorial_forest: { rain: 5.0488, cone: 25.2439, contact: 10.09755 },
  beginner_desert: { web: 3.31965, venom: 4.64751, contact: 2.65572 },
  intermediate_snowlands: { roar: 4.2621, icefall: 5.96694, rift: 8.5242, contact: 3.83589 },
  advanced_lava_wastes: { bite: 8.47886, eruption: 5.65258, contact: 3.39155 },
  infernal_depths: { sweep: 7.90072, bloom: 5.53051, contact: 3.95036 },
  water_reach: { surge: 8.98909, whirlpool: 6.29237, contact: 4.49455 },
  samurai_garden: { slash: 9.97415, whirlpool: 6.98191, contact: 4.98708 },
  cloudspire: { charge: 10.8107, thunder: 7.5675, contact: 5.40535 },
  moonfen: { tongue: 11.0006, bogBurst: 7.70041, contact: 5.50029 },
  crystal_hollows: { shatter: 11.4391, crystalBurst: 8.00739, contact: 5.71956 },
  clockwork_ruins: { shatter: 11.5819, crystalBurst: 8.10731, contact: 5.79094 },
  duskfall_orchard: { shatter: 11.277, crystalBurst: 7.89387, contact: 5.63848 },
  neon_bastion: { shatter: 11.001, crystalBurst: 7.70068, contact: 5.50049 },
  verdant_catacombs: { shatter: 10.5237, crystalBurst: 7.3666, contact: 5.26186 },
  ion_citadel: { shatter: 9.62503, crystalBurst: 6.73752, contact: 4.81252 },
});
