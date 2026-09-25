// Intentional campaign pacing, separate from the neutral revision 73 bake.
// Fitted with campaignHealthVersion 1 across five seeded scenarios.
// Complete factors relative to the baked rewards; applied once.
// See docs/campaign-health-smoothing.md and docs/balance-pacing.md.
export const CAMPAIGN_PACING_REWARDS: Readonly<Record<string, number>> = {
  "tutorial_forest": 1,
  "beginner_desert": 0.1547802349604861,
  "intermediate_snowlands": 0.8884648207019775,
  "advanced_lava_wastes": 0.4160690355702666,
  "infernal_depths": 0.5700738434109066,
  "water_reach": 0.9503247126768545,
  "samurai_garden": 1.231538574080839,
  "cloudspire": 0.9697212891647715,
  "moonfen": 1.7971073203063148,
  "crystal_hollows": 1.8776611561272654,
  "clockwork_ruins": 1.8386383073645474,
  "duskfall_orchard": 1.721275272800606,
  "neon_bastion": 1.495516656951592,
  "verdant_catacombs": 1.1764278320172443,
  "ion_citadel": 0.6531711385820651
};
