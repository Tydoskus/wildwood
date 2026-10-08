import { describe, expect, it } from 'vitest';
import {
  AUTO_FARM_CHOICE_KEY, AUTO_FARM_SHARES_KEY, AUTO_FARM_SOUL_SHARES_KEY, AUTO_FARM_WEIGHTS_KEY, decodeFarmPlan, encodeFarmPlan, evenShares, legacyShares,
  AUTO_FARM_ADVANCE_KEY, AUTO_FARM_BOSSES_KEY, AUTO_FARM_BOSS_POWER_KEY, AUTO_FARM_MOVE_POWER_KEY, powerStep, readBossPower, writeBossPower, readMovePower, writeMovePower, readFightBosses, writeFightBosses, readSavedShares, rebalanceShares, shareFarmKey, shareLabel, sharesForGroups, writeSavedShares,
} from './auto-farm-plan';
import { SOUL_MAP_ID } from '../../../shared/soul-dimension';

const total = (shares: Readonly<Record<string, number>>) => Object.values(shares).reduce((sum, value) => sum + value, 0);
const groups = ['stat:damage', 'stat:health', 'stat:armor', 'stat:regen'];
function memory() {
  const values = new Map<string, string>();
  return { values, storage: () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }) };
}

describe('autofarm sliders', () => {
  it('splits evenly in whole percents that add up to 100', () => {
    expect(evenShares(groups)).toEqual({ 'stat:damage': 25, 'stat:health': 25, 'stat:armor': 25, 'stat:regen': 25 });
    const three = evenShares(['a', 'b', 'c']);
    expect(total(three)).toBe(100);
    expect(Object.values(three).sort()).toEqual([33, 33, 34]);
    expect(evenShares(['a'])).toEqual({ a: 100 });
  });

  it('moves the others in proportion when one slider moves, keeping 100%', () => {
    // 50 / 25 / 25: damage to 80 leaves 20 for the others, still 1:1.
    const start = { a: 50, b: 25, c: 25 };
    expect(rebalanceShares(start, ['a', 'b', 'c'], 'a', 80)).toEqual({ a: 80, b: 10, c: 10 });
    // Proportions kept: 60 / 30 / 10, the last two to 40 between them (3:1).
    expect(rebalanceShares({ a: 60, b: 30, c: 10 }, ['a', 'b', 'c'], 'a', 60)).toEqual({ a: 60, b: 30, c: 10 });
    expect(rebalanceShares({ a: 40, b: 45, c: 15 }, ['a', 'b', 'c'], 'a', 60)).toEqual({ a: 60, b: 30, c: 10 });
    // 100% alone is allowed: the others go to 0.
    const alone = rebalanceShares(start, ['a', 'b', 'c'], 'b', 100);
    expect(alone).toEqual({ a: 0, b: 100, c: 0 });
    // From there, with the others all at 0, what one gives up is spread evenly.
    expect(rebalanceShares(alone, ['a', 'b', 'c'], 'b', 60)).toEqual({ a: 20, b: 60, c: 20 });
    // Whole percents, always adding up to 100.
    for (const value of [0, 1, 33, 50.4, 99, 100, 140, -5]) {
      const next = rebalanceShares({ a: 33, b: 33, c: 34 }, ['a', 'b', 'c'], 'c', value);
      expect(total(next)).toBe(100);
      expect(Object.values(next).every(share => Number.isInteger(share) && share >= 0)).toBe(true);
    }
    // One group is always 100%.
    expect(rebalanceShares({ a: 100 }, ['a'], 'a', 20)).toEqual({ a: 100 });
    expect(shareLabel(25)).toBe('25%');
  });

  it("reads this map's sliders from what is saved: unset groups 0%, nothing saved an even split", () => {
    expect(sharesForGroups(null, groups)).toEqual(evenShares(groups));
    expect(sharesForGroups({ 'stat:damage': 100 }, groups)).toEqual({ 'stat:damage': 100, 'stat:health': 0, 'stat:armor': 0, 'stat:regen': 0 });
    expect(sharesForGroups({ 'stat:damage': 50, 'stat:health': 50, 'stat:speed': 80 }, groups)).toEqual({ 'stat:damage': 50, 'stat:health': 50, 'stat:armor': 0, 'stat:regen': 0 });
    // Another map's stats only: an even split here.
    expect(sharesForGroups({ 'stat:speed': 100 }, groups)).toEqual(evenShares(groups));
  });

  it('migrates the old 0-200% sliders by bringing them to 100%, and an old Auto to an even split', () => {
    const { values, storage } = memory();
    // Nothing saved: an even split.
    expect(legacyShares(groups, 'forest', storage)).toBeNull();
    // 200 / 50 / 0, regen never set (it was at 100%): 200 / 50 / 0 / 100 of 350.
    values.set(AUTO_FARM_WEIGHTS_KEY, JSON.stringify({ auto: false, weights: { 'stat:damage': 200, 'stat:health': 50, 'stat:armor': 0 } }));
    expect(sharesForGroups(legacyShares(groups, 'forest', storage), groups)).toEqual({ 'stat:damage': 57, 'stat:health': 14, 'stat:armor': 0, 'stat:regen': 29 });
    // Auto saved: an even split, whatever its sliders were.
    values.set(AUTO_FARM_WEIGHTS_KEY, JSON.stringify({ auto: true, weights: { 'stat:damage': 200 } }));
    expect(legacyShares(groups, 'forest', storage)).toBeNull();
    // An older route: picked stats only.
    values.delete(AUTO_FARM_WEIGHTS_KEY);
    values.set(AUTO_FARM_CHOICE_KEY, JSON.stringify(['stat:damage*2', 'stat:health']));
    expect(sharesForGroups(legacyShares(groups, 'forest', storage), groups)).toEqual({ 'stat:damage': 67, 'stat:health': 33, 'stat:armor': 0, 'stat:regen': 0 });
    // Storage that throws reads as nothing saved.
    expect(legacyShares(groups, 'forest', () => { throw new Error('blocked'); })).toBeNull();
  });

  it("saves the sliders once for every map, keeping the campaign's and the Soul Dimension's apart", () => {
    const { values, storage } = memory();
    expect(readSavedShares('forest', storage)).toBeNull();
    writeSavedShares({ 'stat:damage': 100, 'stat:health': 0 }, 'forest', storage);
    expect(readSavedShares('forest', storage)).toEqual({ 'stat:damage': 100, 'stat:health': 0 });
    // The last set is the record: another map reads what it has of it.
    writeSavedShares({ 'stat:speed': 50, 'stat:health': 50 }, 'beginner_desert', storage);
    expect(readSavedShares('forest', storage)).toEqual({ 'stat:speed': 50, 'stat:health': 50 });
    expect(JSON.parse(values.get(AUTO_FARM_SHARES_KEY)!)).toEqual({ 'stat:speed': 50, 'stat:health': 50 });
    // The Soul Dimension reads the campaign's until it has its own.
    expect(readSavedShares(SOUL_MAP_ID, storage)).toEqual(readSavedShares('forest', storage));
    writeSavedShares({ 'soul:armor': 100 }, SOUL_MAP_ID, storage);
    expect(readSavedShares(SOUL_MAP_ID, storage)).toEqual({ 'soul:armor': 100 });
    expect(values.has(AUTO_FARM_SOUL_SHARES_KEY)).toBe(true);
    expect(readSavedShares('forest', storage)).not.toHaveProperty('soul:armor');
  });

  it('round-trips the sliders through the resume store; an old "auto" there is an even split', () => {
    expect(decodeFarmPlan(encodeFarmPlan({ 'stat:health': 75, 'stat:armor': 25 }))).toEqual({ 'stat:health': 75, 'stat:armor': 25 });
    expect(decodeFarmPlan('auto')).toBeNull();
  });

  it('farms the group furthest behind its share, only where enemies are alive, and never a 0% one', () => {
    const shares = [{ key: 'a', weight: 80, alive: 3 }, { key: 'b', weight: 20, alive: 3 }, { key: 'c', weight: 0, alive: 3 }];
    // Nothing farmed yet: the largest share.
    expect(shareFarmKey(shares, () => 0)).toBe('a');
    // 'a' has had all 10 seconds: 'b' is 2 seconds behind.
    expect(shareFarmKey(shares, key => key === 'a' ? 10 : 0)).toBe('b');
    // 'b' empty: the next one behind that has enemies.
    expect(shareFarmKey([shares[0], { ...shares[1], alive: 0 }, shares[2]], key => key === 'a' ? 10 : 0)).toBe('a');
    // Every group empty: it waits at the one furthest behind.
    expect(shareFarmKey(shares.map(group => ({ ...group, alive: 0 })), key => key === 'a' ? 10 : 0)).toBe('b');
    expect(shareFarmKey([{ key: 'c', weight: 0, alive: 3 }], () => 0)).toBeNull();
  });

  it('splits farming time as the sliders say: 80 / 10 / 10, and an even split is even', () => {
    for (const [weights, expected] of [[[80, 10, 10], [.8, .1, .1]], [[34, 33, 33], [.34, .33, .33]]] as const) {
      const spent = new Map<string, number>(), keys = ['a', 'b', 'c'];
      // Twenty-second stints, as the controller looks again, for two hours.
      for (let step = 0; step < 360; step++) {
        const key = shareFarmKey(keys.map((group, index) => ({ key: group, weight: weights[index], alive: 1 })), group => spent.get(group) ?? 0)!;
        spent.set(key, (spent.get(key) ?? 0) + 20);
      }
      keys.forEach((key, index) => expect((spent.get(key) ?? 0) / 7_200).toBeCloseTo(expected[index], 2));
    }
  });
});

it('Fight Bosses, never set, starts as Move On is, so a farm that moved on keeps beating bosses; once set it is its own', () => {
  const off = memory();
  expect(readFightBosses(off.storage)).toBe(false);
  const on = memory();
  on.values.set(AUTO_FARM_ADVANCE_KEY, '1');
  expect(readFightBosses(on.storage)).toBe(true);
  writeFightBosses(false, on.storage);
  expect(on.values.get(AUTO_FARM_BOSSES_KEY)).toBe('0');
  expect(readFightBosses(on.storage)).toBe(false);
});

it('Fight At is 1x until set, snaps anything to the nearest step, and survives a bad saved value', () => {
  const m = memory();
  expect(readBossPower(m.storage)).toBe(1);
  writeBossPower(.5, m.storage);
  expect(readBossPower(m.storage)).toBe(.5);
  expect(powerStep(.9)).toBe(1);
  expect(powerStep(7)).toBe(5);
  expect(powerStep(50)).toBe(10);
  expect(powerStep(.01)).toBe(.1);
  m.values.set(AUTO_FARM_BOSS_POWER_KEY, 'nope');
  expect(readBossPower(m.storage)).toBe(1);
  // Move At is its own slider, kept apart.
  expect(readMovePower(m.storage)).toBe(1);
  writeMovePower(3, m.storage);
  expect(m.values.get(AUTO_FARM_MOVE_POWER_KEY)).toBe('3');
  expect(readBossPower(m.storage)).toBe(1);
});
