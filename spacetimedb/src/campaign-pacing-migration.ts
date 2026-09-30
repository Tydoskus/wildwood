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
 * Migration 46: campaign enemies hit as hard as the desert's. Measured in the
 * Balance Lab on live revision 76 (2026-09-30), a regular's hit took 7.7% of a
 * typical arriving player's health on the desert and 0.7–1.6% on every later
 * map, so health, armor and regen stopped mattering past map 2. Each map's
 * enemy damage is multiplied so a regular hit takes about 7.7% again; elites
 * rise with it. Map 1 and the desert stay as they are, and Endless follows map
 * 15. Every other factor stays as the live revision has it.
 */
export const CAMPAIGN_ENEMY_HIT_MULTIPLIERS: Readonly<Record<string, number>> = Object.freeze({
  intermediate_snowlands: 5.22, advanced_lava_wastes: 7.83, infernal_depths: 5.48, water_reach: 4.68, samurai_garden: 5.55,
  cloudspire: 7.24, moonfen: 8.9, crystal_hollows: 10.17, clockwork_ruins: 11.2, duskfall_orchard: 11.04,
  neon_bastion: 10.72, verdant_catacombs: 10.02, ion_citadel: 9.52,
});
export function raiseCampaignEnemyHits(ctx: Parameters<typeof saveMapBalance>[0]) {
  if (!ctx.db.mapBalanceHead.id.find(0)) return; // A fresh database has no live revision to raise.
  const { revision, settings } = balanceEditorState(ctx);
  const next = { ...settings, maps: Object.fromEntries(Object.entries(settings.maps).map(([id, factors]) => [id, { ...factors }])) };
  for (const [id, multiplier] of Object.entries(CAMPAIGN_ENEMY_HIT_MULTIPLIERS)) {
    const factors = next.maps[id];
    if (factors) factors.enemyDamage = Math.min(100, Math.round(factors.enemyDamage * multiplier * 100) / 100);
  }
  saveMapBalance(ctx, revision, JSON.stringify(next));
}
