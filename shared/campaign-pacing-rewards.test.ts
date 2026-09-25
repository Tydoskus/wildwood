import { expect, it } from 'vitest';
import fixture from '../tests/fixtures/balance-revision-73.json';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { CAMPAIGN_PACING_REWARDS } from './campaign-pacing-rewards';

it('applies campaign pacing once and changes no combat, boss, drop or timer values', () => {
  const settings = defaultBalanceSettings();
  delete settings.campaignHealthVersion;
  expect(validateBalanceSettings(settings)).toEqual(settings);
  for (const map of CAMPAIGN_MAPS) for (const version of [1, 2] as const) {
    const before = resolveMapBalance(map.id, fixture.settings, 0, version);
    const after = resolveMapBalance(map.id, settings, 0, version);
    for (const [kind, row] of Object.entries(before.enemies)) {
      expect(after.enemies[kind].reward.amount).toBe(row.reward.amount * CAMPAIGN_PACING_REWARDS[map.id]);
      after.enemies[kind].reward.amount = row.reward.amount;
    }
    expect(after).toEqual(before);
  }
});

it('preserves every Endless field through the scaling cap after final-map pacing changes', () => {
  const settings = defaultBalanceSettings();
  for (let depth = 1; depth <= 1002; depth++) for (const version of [1, 2] as const) {
    const before = resolveMapBalance(`endless_${depth}`, fixture.settings, 0, version);
    const after = resolveMapBalance(`endless_${depth}`, settings, 0, version);
    for (const [lane, row] of Object.entries(before.lanes)) {
      // The inverse factor can add only floating-point multiplication round-off.
      expect(Math.abs(after.lanes[lane].reward.amount / row.reward.amount - 1)).toBeLessThan(1e-14);
      after.lanes[lane].reward.amount = row.reward.amount;
    }
    expect(after).toEqual(before);
  }
});
