import { expect, it } from 'vitest';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';

it('never lowers matching regular/elite rewards on later maps, including after tuning', () => {
  for (const retune of [false, true]) {
    const settings = defaultBalanceSettings();
    if (retune) settings.maps.intermediate_snowlands.enemyRewards *= 10;
    const previous = new Map<string, number>();
    for (const map of CAMPAIGN_MAPS) {
      const next = new Map(previous);
      for (const enemy of Object.values(resolveMapBalance(map.id, settings, 0).enemies)) {
        const role = `${enemy.elite ? 'elite' : 'regular'}:${enemy.reward.type}`;
        expect(enemy.reward.amount).toBeGreaterThanOrEqual(previous.get(role) ?? 0);
        next.set(role, Math.max(next.get(role) ?? 0, enemy.reward.amount));
      }
      for (const [key, value] of next) previous.set(key, value);
    }
  }
});

it('only raises deficient enemy rewards: bosses, HP, damage, loot and Endless stay identical', () => {
  const afterSettings = defaultBalanceSettings();
  const beforeSettings = { ...afterSettings }; delete beforeSettings.campaignRewardVersion;
  for (const map of [...CAMPAIGN_MAPS.map(m => m.id), ...Array.from({ length: 1002 }, (_, i) => `endless_${i + 1}`)]) {
    for (const version of [1, 2] as const) {
      const before = resolveMapBalance(map, beforeSettings, 0, version);
      const after = resolveMapBalance(map, afterSettings, 0, version);
      if (!map.startsWith('endless_')) for (const [kind, enemy] of Object.entries(after.enemies)) {
        expect(enemy.reward.amount).toBeGreaterThanOrEqual(before.enemies[kind].reward.amount);
        enemy.reward.amount = before.enemies[kind].reward.amount;
      }
      expect(after).toEqual(before);
    }
  }
});

it('preserves saved revisions without the rule and round-trips enabled settings', () => {
  const settings = defaultBalanceSettings();
  expect(validateBalanceSettings(settings)).toEqual(settings);
  delete settings.campaignRewardVersion;
  expect(validateBalanceSettings(settings).campaignRewardVersion).toBeUndefined();
  expect(() => validateBalanceSettings({ ...settings, campaignRewardVersion: 2 })).toThrow('reward floor');
});
