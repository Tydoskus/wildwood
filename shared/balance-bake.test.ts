import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import fixture from '../tests/fixtures/balance-revision-73.json';
import { defaultBalanceSettings, resolveMapBalance, validateBalanceSettings } from './map-balance';
import { BAKED_ENEMY_REWARD_FACTORS } from './balance-baseline';

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
}

it('rejects unknown baseline versions rather than applying another conversion', () => {
  expect(() => validateBalanceSettings({ ...fixture.settings, baselineVersion: 999 })).toThrow('baseline');
});
