import { expect, it } from 'vitest';
import { createStatTrackerSource } from './stat-tracker-source';
import { MIN_ATTACK_INTERVAL } from '../../shared/rules';
import { attackIntervalForRating } from '../../shared/stat-rating';

it('names the run the build belongs to and its base power, gear left out', () => {
  let aggro = false, reflect = false;
  const player = { baseMaxHp: 100, damage: 10, attackRate: 1, armor: 0, regen: 1 };
  const read = createStatTrackerSource({
    coop: () => ({ localIdentity: () => 'alice', isConnected: () => true, accountState: () => ({ signedIn: true }),
      prestige: () => ({ level: 2 }), aggroChallenge: () => ({ active: aggro }), prestigeChallenge: () => ({ active: reflect }) }),
    hasStarted: () => true, isLoadedFor: () => true, inTutorial: () => false, player, inventory: {},
    displayedProgress: stats => stats, researchRanks: () => ({}) as never, kills: () => 5,
    attackCap: () => MIN_ATTACK_INTERVAL, critParts: () => ({ rating: 100 }),
  });
  const first = read()!;
  expect(first.build.run).toBe('main');
  reflect = true;
  expect(read()!.build.run).toBe('reflect');
  aggro = true; reflect = false;
  expect(read()!.build.run).toBe('aggro');
  player.damage = 20;
  expect(read()!.build.basePower).toBeGreaterThan(first.build.basePower);
});

it('reads attack speed and crit damage like armor: their number, and what it gives beside it', () => {
  const player = { baseMaxHp: 100, damage: 10, attackRate: attackIntervalForRating(300), armor: 0, regen: 1 };
  const read = createStatTrackerSource({
    coop: () => ({ localIdentity: () => 'alice', isConnected: () => true, accountState: () => ({ signedIn: true }), prestige: () => ({ level: 0 }) }),
    hasStarted: () => true, isLoadedFor: () => true, inTutorial: () => false, player, inventory: {},
    displayedProgress: stats => stats, researchRanks: () => ({}) as never, kills: () => 0,
    attackCap: () => MIN_ATTACK_INTERVAL, critParts: () => ({ rating: 100, soul: 50 }),
  });
  const snapshot = read()!;
  expect(snapshot.values.attackSpeed).toBeCloseTo(300, 6);
  expect(snapshot.values.critDamage).toBe(150);
  expect(snapshot.details.attackSpeed).toMatch(/^\d+\.\d{2}\/s$/);
  expect(snapshot.details.critDamage).toMatch(/^\d+\.\d{2}×$/);
});
