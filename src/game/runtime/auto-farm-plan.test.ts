import { describe, expect, it } from 'vitest';
import { AUTO_SWITCH_MARGIN, bestFarmCandidate, bossReady, decodeFarmPlan, encodeFarmPlan, nextRouteKey, type FarmEvaluation, type FarmReward } from './auto-farm-plan';

const build = (power: number, fightSeconds: number | null = null, hitShare: number | null = null): FarmEvaluation => ({ power, fightSeconds, hitShare });

describe('autofarm planning', () => {
  it("calls the boss ready on the simulator's gate: a fight of 90 s or less, its hardest hit at most 30% of health", () => {
    expect(bossReady(build(1, 90, .3))).toBe(true);
    expect(bossReady(build(1, 91, .1))).toBe(false);
    expect(bossReady(build(1, 30, .31))).toBe(false);
    expect(bossReady(build(1))).toBe(false);
  });

  it('farms health while the boss hits too hard, then whatever shortens the fight, then power', () => {
    const candidates = [
      { key: 'stat:health', alive: 3, reward: { type: 'health', amount: 10 } as FarmReward, secondsPerKill: 2 },
      { key: 'stat:damage', alive: 3, reward: { type: 'damage', amount: 1 } as FarmReward, secondsPerKill: 2 },
    ];
    const hardHits = (reward?: FarmReward) => build(100 + (reward?.amount ?? 0) * 5, 200 - (reward?.type === 'damage' ? 20 : 0), .5 - (reward?.type === 'health' ? .05 : 0));
    expect(bestFarmCandidate(candidates, hardHits, true)).toBe('stat:health');
    const survivable = (reward?: FarmReward) => build(100 + (reward?.amount ?? 0) * 5, 200 - (reward?.type === 'damage' ? 20 : 0), .2);
    expect(bestFarmCandidate(candidates, survivable, true)).toBe('stat:damage');
    // Without a boss to aim at, power per second decides.
    expect(bestFarmCandidate(candidates, survivable, false)).toBe('stat:health');
  });

  it('keeps the current camp unless another is better by the switch margin, and skips empty camps', () => {
    const value = { 'stat:health': 1, 'stat:armor': AUTO_SWITCH_MARGIN * .99 };
    const evaluate = (reward?: FarmReward) => build(reward ? value[`stat:${reward.type}` as keyof typeof value] : 0);
    const candidates = [
      { key: 'stat:health', alive: 1, reward: { type: 'health', amount: 1 } as FarmReward, secondsPerKill: 1 },
      { key: 'stat:armor', alive: 1, reward: { type: 'armor', amount: 1 } as FarmReward, secondsPerKill: 1 },
    ];
    expect(bestFarmCandidate(candidates, evaluate, false, 'stat:health')).toBe('stat:health');
    expect(bestFarmCandidate(candidates, evaluate, false, null)).toBe('stat:armor');
    expect(bestFarmCandidate([{ ...candidates[0], alive: 0 }, candidates[1]], evaluate, false, 'stat:health')).toBe('stat:armor');
  });

  it('walks a route in order, staying while a camp has enemies, and loops', () => {
    const alive = new Map([['a', 0], ['b', 2], ['c', 1]]);
    const count = (key: string) => alive.get(key) ?? 0;
    expect(nextRouteKey(['a', 'b', 'c'], count, null)).toBe('b');
    expect(nextRouteKey(['c', 'b'], count, null)).toBe('c');
    expect(nextRouteKey(['a', 'b', 'c'], count, 'b')).toBe('b');
    alive.set('b', 0);
    expect(nextRouteKey(['a', 'b', 'c'], count, 'b')).toBe('c');
    alive.set('c', 0); alive.set('a', 4);
    expect(nextRouteKey(['a', 'b', 'c'], count, 'c')).toBe('a');
    alive.set('a', 0);
    expect(nextRouteKey(['a', 'b', 'c'], count, 'c')).toBe('c');
  });

  it('round-trips a plan through the resume store', () => {
    expect(decodeFarmPlan(encodeFarmPlan([]))).toEqual([]);
    expect(decodeFarmPlan(encodeFarmPlan(['stat:health', 'stat:armor']))).toEqual(['stat:health', 'stat:armor']);
    expect(decodeFarmPlan('Bramble')).toEqual(['Bramble']);
  });
});
