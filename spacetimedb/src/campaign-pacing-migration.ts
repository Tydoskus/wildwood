import { CAMPAIGN_MAPS, CAMPAIGN_ENDPOINT } from '../../shared/campaign-registry';
import { CAMPAIGN_PACING_REWARDS } from '../../shared/campaign-pacing-rewards';
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
