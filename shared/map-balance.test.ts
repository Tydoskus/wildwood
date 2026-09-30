import { describe, it, expect, afterEach } from 'vitest';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings, BALANCE_MAPS } from './map-balance';
import { bossRegenFractionFor } from './boss-regeneration';
import { enemyDefeatDefinition } from './enemy-defeats';
import { personalBossDefinition } from './personal-bosses';
import { installMapBalance } from './map-balance-runtime';
import { generatedBossStats, generateMap } from './procedural-maps';
afterEach(() => installMapBalance(null));
describe('server map balance snapshots', () => {
  it('preserves campaign bases and the explicit procedural reference curve', () => {
    for (const [map] of [...BALANCE_MAPS.slice(0, -1), ['endless_1'], ['endless_40']] as string[][]) {
      const settings = defaultBalanceSettings();
      for (const factors of Object.values(settings.maps)) factors.bossHealth = 1;
      settings.endless = { rewardMultiplier: .1, statStep: .2, enduranceStep: .1, enduranceExponent: 6, rewardPerHealth: 1 };
      const snapshot = resolveMapBalance(map, settings, 2);
      expect(snapshot.boss!.hp).toBeCloseTo(personalBossDefinition(map)!.hp, -1);
      if (map.startsWith('endless')) expect(Object.values(snapshot.boss!.rewards)).toEqual(generatedBossStats(generateMap(map as `endless_${number}`)).rewards.map(row => row.amount));
    }
  });
  it('uses identical regular rewards in presentation and validation', () => {
    const settings = defaultBalanceSettings(); settings.maps.tutorial_forest.enemyRewards = 2.4;
    const snapshot = resolveMapBalance('tutorial_forest', settings, 3);
    expect(enemyDefeatDefinition('tutorial_forest', 'Spitter', snapshot)!.reward).toEqual(snapshot.enemies.Spitter.reward);
    expect(snapshot.enemies.Spitter.reward.amount).toBeCloseTo(enemyDefeatDefinition('tutorial_forest', 'Spitter')!.reward.amount * 2.4);
  });
  it('uses identical Endless site rewards, boss HP and payouts', () => {
    const settings = defaultBalanceSettings(); settings.maps.endless.bossHealth = 2; settings.maps.endless.enemyRewards = 3; settings.endless.rewardMultiplier = .2;
    const snapshot = resolveMapBalance('endless_7', settings, 4);
    installMapBalance(snapshot);
    expect(personalBossDefinition('endless_7')!.hp).toBe(snapshot.boss!.hp);
    const map = generateMap('endless_7');
    expect(enemyDefeatDefinition('endless_7', 'site:0', snapshot)!.reward).toEqual(snapshot.lanes[map.camps[0].lane].reward);
    expect(generatedBossStats(map).rewards.map(r => r.amount)).toEqual(Object.values(snapshot.boss!.rewards));
  });
  it('rejects nonfinite, missing, negative and excessive settings', () => {
    for (const n of [NaN, Infinity, -1, 0, 101]) {
      const settings = defaultBalanceSettings(); settings.maps.tutorial_forest.enemyHealth = n;
      expect(() => validateBalanceSettings(settings)).toThrow();
    }
    expect(() => validateBalanceSettings({})).toThrow();
  });
});

it('version 2 carries resolved respawn, regeneration and loot while legacy clients retain their timers', () => {
  const settings = defaultBalanceSettings();
  Object.assign(settings.maps.tutorial_forest, { enemyRespawn: 2, bossRespawn: 3, bossRegen: .5, enemyDrops: 2 });
  const legacy = resolveMapBalance('tutorial_forest', settings, 4, 1);
  const current = resolveMapBalance('tutorial_forest', settings, 4, 2);
  expect(legacy.regularRespawnSeconds).toBeUndefined(); expect(legacy.loot).toBeUndefined();
  expect(current.regularRespawnSeconds).toBe(20); expect(current.regularRespawnBaseSeconds).toBe(10);
  expect(current.boss!.respawnSeconds).toBe(legacy.boss!.respawnSeconds * 3);
  expect(current.boss!.regenFraction).toBe(bossRegenFractionFor('tutorial_forest') * .5);
  const base = resolveMapBalance('tutorial_forest', defaultBalanceSettings(), 0);
  expect(current.loot!.map(d => d.wins / d.outcomes)).toEqual(base.loot!.map(d => d.wins / d.outcomes * 2));
  installMapBalance(current);
  expect(personalBossDefinition('tutorial_forest')!.respawnSeconds).toBe(current.boss!.respawnSeconds);
});
it('upgrades stored old settings without changing their existing values and allows disabling drops/regen', () => {
  const old = defaultBalanceSettings();
  for (const map of Object.values(old.maps)) for (const key of ['enemyRespawn', 'bossRespawn', 'bossRegen', 'enemyDrops']) delete (map as any)[key];
  const next = validateBalanceSettings(old); expect(next.maps.tutorial_forest.enemyRespawn).toBe(1);
  next.maps.tutorial_forest.enemyDrops = 0; next.maps.tutorial_forest.bossRegen = 0;
  const snapshot = resolveMapBalance('tutorial_forest', validateBalanceSettings(next), 1);
  expect(snapshot.loot!.every(d => d.wins === 0)).toBe(true); expect(snapshot.boss!.regenFraction).toBe(0);
});

it('carries the final campaign tuning into Endless while earlier map tuning stays local', () => {
  const settings = defaultBalanceSettings();
  const baseline = resolveMapBalance('endless_1', settings, 0);
  const last = BALANCE_MAPS[BALANCE_MAPS.length - 2][0];
  settings.maps[last].enemyHealth = 2;
  settings.maps[last].enemyDamage = 3;
  settings.maps[last].enemyRewards *= 4;
  settings.maps[last].bossHealth = 5;
  settings.maps[last].bossDamage = 6;
  settings.maps[last].bossRewards = 7;
  const changed = resolveMapBalance('endless_1', settings, 1);
  expect(changed.lanes.Cindermaw.hp).toBeCloseTo(baseline.lanes.Cindermaw.hp * 2, -1);
  expect(changed.lanes.Cindermaw.damage).toBeCloseTo(baseline.lanes.Cindermaw.damage * 3, -1);
  expect(changed.lanes.Cindermaw.reward.amount).toBeCloseTo(baseline.lanes.Cindermaw.reward.amount * 4, -1);
  expect(changed.boss!.hp).toBeCloseTo(baseline.boss!.hp * 5, -1);
  expect(changed.boss!.damage).toBeCloseTo(baseline.boss!.damage * 6, -1);
  expect(changed.boss!.rewards.damage).toBeCloseTo(baseline.boss!.rewards.damage * 7, -1);
  settings.maps.tutorial_forest.bossHealth = 9;
  expect(resolveMapBalance('endless_1', settings, 1).boss!.hp).toBe(changed.boss!.hp);
});
