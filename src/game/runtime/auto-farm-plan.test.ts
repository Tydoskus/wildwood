import { describe, expect, it } from 'vitest';
import { AUTO_SWITCH_MARGIN, bestFarmCandidate, rankFarmCandidates, decodeFarmPlan, encodeFarmPlan, nextRouteKey, routeEntry, routeEntryText, type FarmEvaluation, type FarmReward } from './auto-farm-plan';

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

  it('reads and writes route pips, three at most', () => {
    expect(routeEntry('stat:damage')).toEqual({ key: 'stat:damage', weight: 1 });
    expect(routeEntry('stat:damage*2')).toEqual({ key: 'stat:damage', weight: 2 });
    expect(routeEntry('stat:damage*9').weight).toBe(3);
    expect(routeEntryText('stat:damage', 1)).toBe('stat:damage');
    expect(routeEntryText('stat:damage', 2)).toBe('stat:damage*2');
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
