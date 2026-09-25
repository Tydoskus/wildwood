import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import fixture from '../tests/fixtures/balance-revision-73.json';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';
import { BAKED_ENEMY_REWARD_FACTORS } from './balance-baseline';

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
}

it('matches every field of all 2,034 pre-bake campaign and Endless snapshots exactly', () => {
  for (const [mapId, version, expected] of fixture.snapshots) {
    const snapshot = resolveMapBalance(String(mapId), fixture.settings, 73, version as 1 | 2);
    const actual = createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
    expect(actual, `${mapId} wire ${version}`).toBe(expected);
  }
});

it('converts saved reward multipliers once independently of intentional pacing defaults', () => {
  const settings = validateBalanceSettings(fixture.settings);
  const neutral = defaultBalanceSettings();
  delete neutral.campaignHealthVersion;
  for (const factors of Object.values(neutral.maps)) factors.enemyRewards = 1;
  expect(settings).toEqual(neutral);
  expect(validateBalanceSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  for (const [mapId] of Object.entries(BAKED_ENEMY_REWARD_FACTORS)) {
    const edited = structuredClone(settings);
    edited.maps[mapId].enemyRewards = 1.5;
    const before = resolveMapBalance(mapId, settings, 73);
    const after = resolveMapBalance(mapId, validateBalanceSettings(edited), 74);
    for (const [kind, row] of Object.entries(before.enemies)) {
      expect(after.enemies[kind].reward.amount).toBe(row.reward.amount * 1.5);
      expect(after.enemies[kind].hp).toBe(row.hp);
      expect(after.enemies[kind].damage).toBe(row.damage);
    }
  }
});

it('rejects unknown baseline versions rather than applying another conversion', () => {
  expect(() => validateBalanceSettings({ ...fixture.settings, baselineVersion: 999 })).toThrow('baseline');
});
