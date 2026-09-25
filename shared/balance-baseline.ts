/** Revision 73 reward factors folded into enemy-base-values. Endless has its own curve. */
export const BALANCE_BASELINE_VERSION = 2;
export const BAKED_ENEMY_REWARD_FACTORS: Readonly<Record<string, number>> = {
  "intermediate_snowlands": 2,
  "advanced_lava_wastes": 2,
  "infernal_depths": 2,
  "water_reach": 2,
  "samurai_garden": 2,
  "cloudspire": 3,
  "moonfen": 3,
  "crystal_hollows": 3,
  "clockwork_ruins": 3,
  "duskfall_orchard": 3,
  "neon_bastion": 3,
  "verdant_catacombs": 3,
  "ion_citadel": 4
};
export const BAKED_ENDLESS_DEFAULTS = {
  "rewardMultiplier": 2,
  "statStep": 0.6,
  "enduranceStep": 0.06,
  "enduranceExponent": 1,
  "rewardPerHealth": 1
};
