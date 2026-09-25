import { expect, it } from 'vitest';
import fixture from '../tests/fixtures/balance-revision-73.json';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { CAMPAIGN_HEALTH_FACTORS } from './campaign-health-curve';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';

it('changes only campaign HP and preserves both endpoints exactly', () => {
  const settings = validateBalanceSettings(fixture.settings);
  const smoothed = { ...settings, campaignHealthVersion: 1 as const };
  for (const [index, map] of CAMPAIGN_MAPS.entries()) for (const version of [1, 2] as const) {
    const before = resolveMapBalance(map.id, settings, 73, version);
    const after = resolveMapBalance(map.id, smoothed, 73, version);
    for (const [kind, row] of Object.entries(before.enemies)) {
      const track = `${row.elite ? 'elite' : 'regular'}:${row.reward.type}`;
      const hp = after.enemies[kind].hp;
      expect(hp).toBe(row.hp * (CAMPAIGN_HEALTH_FACTORS[map.id][track] ?? 1));
      if (index === 0 || index === 14) expect(hp).toBe(row.hp);
      after.enemies[kind].hp = row.hp;
    }
    expect(after).toEqual(before);
  }
});

it('has growing HP with gradually decreasing growth ratios in all six tracks', () => {
  const settings = defaultBalanceSettings();
  const roles = Object.keys(CAMPAIGN_HEALTH_FACTORS[CAMPAIGN_MAPS[0].id]);
  for (const role of roles) {
    const [rank, type] = role.split(':');
    const hp = CAMPAIGN_MAPS.map((map, index) => {
      const enemies = Object.values(resolveMapBalance(map.id, settings, 0).enemies);
      let matches = enemies.filter(e => Boolean(e.elite) === (rank === 'elite') && e.reward.type === type);
      if (!matches.length && index === 0 && role === 'elite:regen') matches = enemies.filter(e => e.reward.type === 'regen');
      return Math.max(...matches.map(e => e.hp));
    });
    let previousRatio = Infinity;
    for (let i = 1; i < hp.length; i++) {
      const ratio = hp[i] / hp[i - 1];
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThanOrEqual(previousRatio + 1e-12);
      previousRatio = ratio;
    }
  }
});

it('round-trips the new settings and preserves archived settings without the curve', () => {
  const defaults = defaultBalanceSettings();
  expect(validateBalanceSettings(JSON.parse(JSON.stringify(defaults)))).toEqual(defaults);
  expect(validateBalanceSettings(fixture.settings).campaignHealthVersion).toBeUndefined();
  expect(() => validateBalanceSettings({ ...defaults, campaignHealthVersion: 2 })).toThrow('health curve');
});
