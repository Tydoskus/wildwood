import { describe, expect, it } from 'vitest';
import {
  AUTO_FARM_CHOICE_KEY, AUTO_FARM_WEIGHTS_KEY, AUTO_SWITCH_MARGIN, bestFarmCandidate, rankFarmCandidates, decodeFarmPlan, encodeFarmPlan, farmWeight,
  readFarmChoice, routeChoice, shareFarmKey, writeFarmChoice, type FarmEvaluation, type FarmReward,
} from './auto-farm-plan';
import { SOUL_MAP_ID } from '../../../shared/soul-dimension';

const build = (power: number): FarmEvaluation => ({ power });

describe('autofarm planning', () => {
  it('without an expected build, farms the most power per second of killing', () => {
    const candidates = [
      { key: 'stat:health', alive: 3, reward: { type: 'health', amount: 10 } as FarmReward, secondsPerKill: 2 },
      { key: 'stat:damage', alive: 3, reward: { type: 'damage', amount: 1 } as FarmReward, secondsPerKill: 2 },
    ];
    const evaluate = (reward?: FarmReward) => build(100 + (reward?.amount ?? 0) * 5);
    expect(bestFarmCandidate(candidates, evaluate)).toBe('stat:health');
    // A slow kill is worth less per second.
    expect(bestFarmCandidate([{ ...candidates[0], secondsPerKill: 30 }, candidates[1]], evaluate)).toBe('stat:damage');
  });

  it('keeps the current camp unless another is better by the switch margin, and skips empty camps', () => {
    const value = { 'stat:health': 1, 'stat:armor': AUTO_SWITCH_MARGIN * .99 };
    const evaluate = (reward?: FarmReward) => build(reward ? value[`stat:${reward.type}` as keyof typeof value] : 0);
    const candidates = [
      { key: 'stat:health', alive: 1, reward: { type: 'health', amount: 1 } as FarmReward, secondsPerKill: 1 },
      { key: 'stat:armor', alive: 1, reward: { type: 'armor', amount: 1 } as FarmReward, secondsPerKill: 1 },
    ];
    expect(bestFarmCandidate(candidates, evaluate, 'stat:health')).toBe('stat:health');
    expect(bestFarmCandidate(candidates, evaluate, null)).toBe('stat:armor');
    expect(bestFarmCandidate([{ ...candidates[0], alive: 0 }, candidates[1]], evaluate, 'stat:health')).toBe('stat:armor');
  });

  it('never farms a stat that can no longer grow while another camp helps, even waiting for that one to respawn', () => {
    // Attack speed at its cap: a kill there adds nothing.
    const evaluate = (reward?: FarmReward) => build(10 + (reward && reward.type !== 'speed' ? reward.amount : 0));
    const candidates = [
      { key: 'stat:speed', alive: 4, reward: { type: 'speed', amount: 1 } as FarmReward, secondsPerKill: 1 },
      { key: 'stat:health', alive: 0, reward: { type: 'health', amount: 1 } as FarmReward, secondsPerKill: 1 },
    ];
    expect(bestFarmCandidate(candidates, evaluate)).toBe('stat:health');
    expect(rankFarmCandidates(candidates, evaluate).map(entry => entry.key)).toEqual(['stat:health']);
    // With nothing better on the map, it still farms something.
    expect(bestFarmCandidate([candidates[0]], evaluate)).toBe('stat:speed');
  });

  it('farms the group furthest behind its share, only where enemies are alive, and never a 0% one', () => {
    const groups = [{ key: 'a', weight: 200, alive: 3 }, { key: 'b', weight: 25, alive: 3 }, { key: 'c', weight: 0, alive: 3 }];
    // Nothing farmed yet: the largest slider.
    expect(shareFarmKey(groups, () => 0)).toBe('a');
    // 'a' has had all 10 seconds: 'b' is 10 * 25 / 225 behind.
    expect(shareFarmKey(groups, key => key === 'a' ? 10 : 0)).toBe('b');
    // 'b' empty: the next one behind that has enemies.
    expect(shareFarmKey([groups[0], { ...groups[1], alive: 0 }, groups[2]], key => key === 'a' ? 10 : 0)).toBe('a');
    // Every group empty: it waits at the one furthest behind.
    expect(shareFarmKey(groups.map(group => ({ ...group, alive: 0 })), key => key === 'a' ? 10 : 0)).toBe('b');
    expect(shareFarmKey([{ key: 'c', weight: 0, alive: 3 }], () => 0)).toBeNull();
  });

  it('splits farming time as the sliders say: 200 / 25 / 25 is about 80 / 10 / 10, all equal is even', () => {
    for (const [weights, expected] of [[[200, 25, 25], [.8, .1, .1]], [[100, 100, 100], [1 / 3, 1 / 3, 1 / 3]]] as const) {
      const spent = new Map<string, number>(), keys = ['a', 'b', 'c'];
      // Twenty-second stints, as the controller looks again, for two hours.
      for (let step = 0; step < 360; step++) {
        const key = shareFarmKey(keys.map((group, index) => ({ key: group, weight: weights[index], alive: 1 })), group => spent.get(group) ?? 0)!;
        spent.set(key, (spent.get(key) ?? 0) + 20);
      }
      keys.forEach((key, index) => expect((spent.get(key) ?? 0) / 7_200).toBeCloseTo(expected[index], 2));
    }
  });

  it('reads an old route as sliders: picked 100%, a pip more 100% more up to 200%, the rest 0%; an empty one is Auto', () => {
    expect(routeChoice([])).toEqual({ auto: true, weights: {} });
    const { auto, weights } = routeChoice(['stat:damage*2', 'stat:health', 'stat:armor*3']);
    expect(auto).toBe(false);
    expect([farmWeight(weights, 'stat:damage'), farmWeight(weights, 'stat:health'), farmWeight(weights, 'stat:armor')]).toEqual([200, 100, 200]);
    expect([farmWeight(weights, 'stat:regen'), farmWeight(weights, 'soul:critDamage')]).toEqual([0, 0]);
    // A slider never set is at the default.
    expect(farmWeight({}, 'stat:regen')).toBe(100);
  });

  it('round-trips a plan through the resume store, and still reads an old route there', () => {
    expect(decodeFarmPlan(encodeFarmPlan(null))).toBeNull();
    expect(decodeFarmPlan(encodeFarmPlan({ 'stat:health': 200, 'stat:armor': 25 }))).toEqual({ 'stat:health': 200, 'stat:armor': 25 });
    expect(farmWeight(decodeFarmPlan('Bramble')!, 'Bramble')).toBe(100);
    expect(farmWeight(decodeFarmPlan('stat:health\u001fstat:armor*2')!, 'stat:armor')).toBe(200);
  });

  it("migrates the saved route once, keeping the campaign's and the Soul Dimension's apart", () => {
    const values = new Map<string, string>();
    const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
    expect(readFarmChoice('forest', storage)).toEqual({ auto: true, weights: {} });
    values.set(AUTO_FARM_CHOICE_KEY, JSON.stringify(['stat:speed*2']));
    expect(farmWeight(readFarmChoice('forest', storage).weights, 'stat:speed')).toBe(200);
    // The Soul Dimension carries the campaign's choice until it has its own.
    expect(readFarmChoice(SOUL_MAP_ID, storage).auto).toBe(false);
    writeFarmChoice({ auto: true, weights: { 'soul:armor': 25 } }, storage, SOUL_MAP_ID);
    expect(readFarmChoice(SOUL_MAP_ID, storage)).toEqual({ auto: true, weights: { 'soul:armor': 25 } });
    writeFarmChoice({ auto: false, weights: { 'stat:damage': 200 } }, storage, 'forest');
    expect(readFarmChoice('forest', storage)).toEqual({ auto: false, weights: { 'stat:damage': 200 } });
    expect(JSON.parse(values.get(AUTO_FARM_WEIGHTS_KEY)!)).toEqual({ auto: false, weights: { 'stat:damage': 200 } });
  });
});
