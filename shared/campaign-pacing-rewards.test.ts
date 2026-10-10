import revision75 from '../tests/fixtures/balance-revision-75.json';
import { expect, it } from 'vitest';
import fixture from '../tests/fixtures/balance-revision-73.json';
import { ENDLESS_STEPS, defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { CAMPAIGN_PACING_REWARDS } from './campaign-pacing-rewards';

it('applies campaign pacing once and changes no combat, boss, drop or timer values', () => {
  const settings = validateBalanceSettings(revision75);
  delete settings.campaignHealthVersion;
  delete settings.campaignRewardVersion;
  expect(validateBalanceSettings(settings)).toEqual(settings);
  for (const map of CAMPAIGN_MAPS) for (const version of [1, 2] as const) {
    const before = resolveMapBalance(map.id, fixture.settings, 0, version, { ratingHealth: false });
    const after = resolveMapBalance(map.id, settings, 0, version, { ratingHealth: false });
    for (const [kind, row] of Object.entries(before.enemies)) {
      // Rating rewards (attack speed, crit) are the map's own, whatever its reward factor.
      if (row.reward.type !== 'speed' && row.reward.type !== 'crit') expect(after.enemies[kind].reward.amount / (row.reward.amount * CAMPAIGN_PACING_REWARDS[map.id])).toBeCloseTo(1, 12);
      after.enemies[kind].reward.amount = row.reward.amount;
    }
    expect(after).toEqual(before);
  }
});

it('carries final-map pacing into Endless, which carries on from map 15', () => {
  const damageCamp = (snapshot: ReturnType<typeof resolveMapBalance>) => Object.values(snapshot.enemies).find(row => row.reward.type === 'damage' && !row.elite)!;
  for (const settings of [fixture.settings, defaultBalanceSettings()]) {
    const map15 = damageCamp(resolveMapBalance('ion_citadel', settings, 0)).reward.amount;
    for (const depth of [1, 2, 10, 40]) {
      const lane = resolveMapBalance(`endless_${depth}`, settings, 0).lanes.Cindermaw.reward.amount;
      expect(lane / map15 / ENDLESS_STEPS.reward ** (depth - 1)).toBeCloseTo(1, 9);
    }
  }
});
