import { expect, it } from 'vitest';
import { createStatTrackerSource } from './stat-tracker-source';

it('names the run the build belongs to and its base power, gear left out', () => {
  let aggro = false, reflect = false;
  const player = { baseMaxHp: 100, damage: 10, attackRate: 1, armor: 0, regen: 1 };
  const read = createStatTrackerSource({
    coop: () => ({ localIdentity: () => 'alice', isConnected: () => true, accountState: () => ({ signedIn: true }),
      prestige: () => ({ level: 2 }), aggroChallenge: () => ({ active: aggro }), prestigeChallenge: () => ({ active: reflect }) }),
    hasStarted: () => true, isLoadedFor: () => true, inTutorial: () => false, player, inventory: {},
    displayedProgress: stats => stats, researchRanks: () => ({}) as never, kills: () => 5,
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
