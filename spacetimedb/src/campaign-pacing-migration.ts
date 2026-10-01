import { CAMPAIGN_MAPS, CAMPAIGN_ENDPOINT } from '../../shared/campaign-registry';
import { CAMPAIGN_PACING_REWARDS } from '../../shared/campaign-pacing-rewards';
import { CAMPAIGN_PROGRESSION_BOSS_HEALTH, CAMPAIGN_PROGRESSION_BOSS_REWARDS } from '../../shared/campaign-progression';
import { balanceEditorState, saveMapBalance } from './map-balance';

/** Migration 43: activate the tested campaign curve without rewriting history or visits. */
export function activateCampaignPacing(ctx: Parameters<typeof saveMapBalance>[0]) {
  if (!ctx.db.mapBalanceHead.id.find(0)) return; // Fresh databases already use these defaults.
  const { revision, settings } = balanceEditorState(ctx);
  const next = { ...settings, maps: Object.fromEntries(Object.entries(settings.maps).map(([id, factors]) => [id, { ...factors }])) };
  const previousLastReward = next.maps[CAMPAIGN_ENDPOINT.mapId].enemyRewards;
  next.campaignHealthVersion = 1;
  for (const map of CAMPAIGN_MAPS) {
    const reward = CAMPAIGN_PACING_REWARDS[map.id];
    if (reward !== undefined) next.maps[map.id].enemyRewards = reward;
  }
  // The resolver inherits final-map rewards into Endless. Offset only that change.
  next.maps.endless.enemyRewards *= previousLastReward / next.maps[CAMPAIGN_ENDPOINT.mapId].enemyRewards;
  if (JSON.stringify(next) !== JSON.stringify(settings)) saveMapBalance(ctx, revision, JSON.stringify(next));
}

/** Migration 44: enable reward floors without changing HP, bosses, or tuning. */
export function activateCampaignRewardFloor(ctx: Parameters<typeof saveMapBalance>[0]) {
  if (!ctx.db.mapBalanceHead.id.find(0)) return;
  const { revision, settings } = balanceEditorState(ctx);
  if (settings.campaignRewardVersion === 1) return;
  saveMapBalance(ctx, revision, JSON.stringify({ ...settings, campaignRewardVersion: 1 }));
}

/**
 * Migration 45: switch on the unified campaign progression curve. The curve's
 * enemy rewards replace the per-map reward multipliers, so those return to 1;
 * boss HP and rewards take the curve's factors. Endless inherits the final
 * map's reward multiplier, so it absorbs that change and pays exactly as before.
 * Every other factor, and the Endless tuning, stays as the live revision has it.
 */
export function activateCampaignProgression(ctx: Parameters<typeof saveMapBalance>[0]) {
  if (!ctx.db.mapBalanceHead.id.find(0)) return; // Fresh databases already use these defaults.
  const { revision, settings } = balanceEditorState(ctx);
  if (settings.campaignProgressionVersion === 1) return;
  const next = { ...settings, campaignProgressionVersion: 1 as const,
    maps: Object.fromEntries(Object.entries(settings.maps).map(([id, factors]) => [id, { ...factors }])) };
  const previousLastReward = next.maps[CAMPAIGN_ENDPOINT.mapId].enemyRewards;
  for (const map of CAMPAIGN_MAPS) {
    const factors = next.maps[map.id];
    if (!factors) continue;
    factors.enemyRewards = 1;
    factors.bossHealth = CAMPAIGN_PROGRESSION_BOSS_HEALTH[map.id] ?? 1;
    factors.bossRewards = CAMPAIGN_PROGRESSION_BOSS_REWARDS[map.id] ?? 1;
  }
  next.maps.endless.enemyRewards *= previousLastReward;
  saveMapBalance(ctx, revision, JSON.stringify(next));
}

/**
 * Migration 46: the campaign and Endless rebalance, tuned in the Balance Lab
 * (2026-09-30) against a typical player with research and gear, from live
 * revision 76. Ryan's rules, checked on every map:
 * - fast early: the forest about 16 minutes, the desert 26, then each map
 *   longer than the last (x1.6 early easing to x1.1 by map 15, about 7.7 h),
 *   and Endless about 20% longer a map;
 * - dangerous: a regular takes 8 hits to kill on arrival and hits for about
 *   7.5% of the player's health; elites far harder;
 * - bosses are big gates: every boss takes about 12 minutes to kill on
 *   arrival, and paying nothing, only opens the next map.
 * It sets these factors per map, and Endless's shared ones (Endless 1 from
 * map 15; ENDLESS_STEPS in shared/map-balance.ts after that). Every other
 * setting stays as the live revision has it.
 */
export const CAMPAIGN_REBALANCE: Readonly<Record<string, Readonly<Partial<Record<'enemyHealth' | 'enemyDamage' | 'enemyRewards' | 'bossHealth' | 'bossDamage', number>>>>> = Object.freeze({
  tutorial_forest: { bossHealth: 0.01996, bossDamage: 0.3 },
  beginner_desert: { enemyHealth: 0.1939, enemyDamage: 0.5404, enemyRewards: 0.2999, bossHealth: 0.0877 },
  intermediate_snowlands: { enemyHealth: 0.127, enemyDamage: 2.162, enemyRewards: 0.2237, bossHealth: 0.01908 },
  advanced_lava_wastes: { enemyHealth: 0.1129, enemyDamage: 1.682, enemyRewards: 0.08743, bossHealth: 0.02383 },
  infernal_depths: { enemyHealth: 0.1147, enemyDamage: 1.292, enemyRewards: 0.1168, bossHealth: 0.03966 },
  water_reach: { enemyHealth: 0.1044, enemyDamage: 1.193, enemyRewards: 0.1524, bossHealth: 0.06636 },
  samurai_garden: { enemyHealth: 0.09499, enemyDamage: 1.072, enemyRewards: 0.2338, bossHealth: 0.1109 },
  cloudspire: { enemyHealth: 0.09765, enemyDamage: 1.602, enemyRewards: 0.3336, bossHealth: 0.1866 },
  moonfen: { enemyHealth: 0.1141, enemyDamage: 2.544, enemyRewards: 0.4398, bossHealth: 0.3154 },
  crystal_hollows: { enemyHealth: 0.1524, enemyDamage: 3.844, enemyRewards: 0.7848, bossHealth: 0.5314 },
  clockwork_ruins: { enemyHealth: 0.2459, enemyDamage: 7.943, enemyRewards: 1.13, bossHealth: 0.8811 },
  duskfall_orchard: { enemyHealth: 0.3981, enemyDamage: 13.98, enemyRewards: 1.851, bossHealth: 1.453 },
  neon_bastion: { enemyHealth: 0.8428, enemyDamage: 24.12, enemyRewards: 3.219, bossHealth: 2.415 },
  verdant_catacombs: { enemyHealth: 1.922, enemyDamage: 38.23, enemyRewards: 5.784, bossHealth: 4.002 },
  ion_citadel: { enemyHealth: 5.251, enemyDamage: 72.18, enemyRewards: 11.04, bossHealth: 6.739 },
  endless: { enemyHealth: 4.8, enemyDamage: 4.943, enemyRewards: 3.973, bossHealth: 5.056 },
});
/**
 * Migration 48: migration 46 raised regular hits up to 72x and left boss hits
 * alone, so by map 15 a boss hit for a sixth of a regular and in Endless for 3%.
 * Every boss from the desert on now lands its heaviest attack at 11x its map's
 * regular hit, the ratio the early campaign already had. The forest dragon
 * keeps its hand-set numbers; Endless follows map 15 through ENDLESS_STEPS.hit.
 */
export const BOSS_DAMAGE_REBALANCE: typeof CAMPAIGN_REBALANCE = Object.freeze({
  beginner_desert: { bossDamage: 0.1465 }, intermediate_snowlands: { bossDamage: 0.9467 }, advanced_lava_wastes: { bossDamage: 0.8435 },
  infernal_depths: { bossDamage: 0.8381 }, water_reach: { bossDamage: 0.962 }, samurai_garden: { bossDamage: 1.031 },
  cloudspire: { bossDamage: 1.766 }, moonfen: { bossDamage: 2.969 }, crystal_hollows: { bossDamage: 4.775 },
  clockwork_ruins: { bossDamage: 10.06 }, duskfall_orchard: { bossDamage: 17.08 }, neon_bastion: { bossDamage: 28.02 },
  verdant_catacombs: { bossDamage: 40.74 }, ion_citadel: { bossDamage: 66.37 }, endless: { bossDamage: 4.943 },
});
/**
 * Migration 49 (0.845): Endless eased. From Endless 2 a regular hit for about
 * 10% of the arriving player's health, and each map took ~16% longer than the
 * last. With ENDLESS_STEPS retuned (shared/map-balance.ts) these Endless 1
 * factors give ~7.5% from Endless 2 on (Endless 1 gentler, ~5%), about 8% more
 * time a map, and the boss still a 12-minute gate whose heaviest attack is 11x
 * a regular's (bossDamage moves with enemyDamage).
 */
export const ENDLESS_EASE: typeof CAMPAIGN_REBALANCE = Object.freeze({
  endless: { enemyDamage: 3.763, enemyRewards: 3.82, bossHealth: 5.073, bossDamage: 3.763 },
});
export function applyCampaignRebalance(ctx: Parameters<typeof saveMapBalance>[0], table: typeof CAMPAIGN_REBALANCE = CAMPAIGN_REBALANCE) {
  if (!ctx.db.mapBalanceHead.id.find(0)) return; // A fresh database has no live revision to rebalance.
  const { revision, settings } = balanceEditorState(ctx);
  const next = { ...settings, maps: Object.fromEntries(Object.entries(settings.maps).map(([id, factors]) => [id, { ...factors }])) };
  for (const [id, factors] of Object.entries(table)) if (next.maps[id]) Object.assign(next.maps[id], factors);
  saveMapBalance(ctx, revision, JSON.stringify(next));
}
