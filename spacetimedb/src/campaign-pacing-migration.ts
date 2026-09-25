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
