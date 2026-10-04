import { describe, expect, it } from 'vitest';
import { createGameBootstrap } from './game-bootstrap';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { createAutoFarmController } from './auto-farm-controller';
import { aggroForcedCamps, aggroPullCamps, pickForcedCamps } from '../../../shared/aggro-challenge';
import { ENEMY_TYPES, type EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';

function setup(options: { pullCamps?: number; forcedCamps?: number } = {}) {
  const state = createGameBootstrap();
  state.enemies.length = 0; state.spawnSites.length = 0;
  Object.assign(state.player, { x: 500, y: 500, attackRange: 200, speed: 300 });
  let map = 'forest', now = 0, forced = options.forcedCamps ?? 0;
  const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
  const add = (type: EnemyKind, x: number, y: number, campName: string) => {
    const site: SpawnSite = { id: state.spawnSites.length, type, x, y, campName, leashRange: 500, alive: false, respawnAt: 0 };
    state.spawnSites.push(site); lifecycle.spawnFromSite(site);
    return state.enemies[state.enemies.length - 1];
  };
  const values = new Map<string, string>();
  const farm = createAutoFarmController({ ...state, mapId: () => map, unavailable: () => null, paused: () => false,
    speed: () => 300, obstacles: () => [], localIdentity: () => 'me', now: () => now,
    priorityStorage: () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }),
    pullCamps: () => options.pullCamps ?? 1, forcedCamps: () => forced });
  return { ...state, farm, add, setMap: (value: string) => { map = value; }, advance: (ms: number) => { now += ms; }, setForced: (value: number) => { forced = value; } };
}
const health = `stat:${ENEMY_TYPES.Bramble.reward.type}`, speed = `stat:${ENEMY_TYPES.Needle.reward.type}`;

describe('Aggro challenge on the client', () => {
  it('counts camps: one more chasing each run, one more pulled each win', () => {
    expect(aggroForcedCamps({ active: false, completed: 2 })).toBe(0);
    expect([0, 1, 3].map(completed => aggroForcedCamps({ active: true, completed }))).toEqual([1, 2, 4]);
    expect([0, 1, 4, 9].map(completed => aggroPullCamps({ active: false, completed }))).toEqual([1, 2, 5, 5]);
    expect(pickForcedCamps(['a', 'b', 'a', 'c'], 2, () => 0)).toHaveLength(2);
    expect(new Set(pickForcedCamps(['a', 'b', 'c'], 5))).toEqual(new Set(['a', 'b', 'c']));
  });

  it("Pull brings every enemy of the farmed stat, the route's next stat per win, and nothing during a run", () => {
    for (const [pullCamps, expected] of [[1, ['near', 'far']], [2, ['near', 'far', 'needle']], [0, []]] as const) {
      const s = setup({ pullCamps });
      const near = s.add('Bramble', 700, 500, 'near'), far = s.add('Bramble', 2400, 500, 'far'), needle = s.add('Needle', 1200, 900, 'needle');
      s.farm.setPullAll(true);
      s.farm.start([health, speed]);
      expect([near, far, needle].filter(enemy => s.farm.pulls(enemy)).map(enemy => enemy.campName), `pull ${pullCamps}`).toEqual(expected);
      expect(s.farm.pullAvailable()).toBe(pullCamps > 0);
    }
  });

  it("an Aggro run's camps chase from arrival, farming or not, and are picked again on each new map", () => {
    const s = setup({ forcedCamps: 1 });
    // A camp is a stat group: both Bramble spots chase together.
    const kinds: EnemyKind[] = ['Bramble', 'Bramble', 'Needle', 'Mossback', 'Spitter'];
    const enemies = kinds.map((type, index) => s.add(type, 600 + index * 300, 500, `${type}${index}`));
    const groups = () => new Set(enemies.filter(enemy => s.farm.forced(enemy)).map(enemy => enemy.reward.type));
    const chased = () => [...groups()].sort();
    expect(chased()).toHaveLength(1);
    if (groups().has(ENEMY_TYPES.Bramble.reward.type)) expect(enemies.slice(0, 2).every(enemy => s.farm.forced(enemy))).toBe(true);
    const first = chased();
    // Same map: the same camp keeps chasing.
    s.advance(5_000);
    expect(chased()).toEqual(first);
    // Two runs in, two camps.
    s.setForced(2);
    s.advance(1_000);
    expect(chased()).toHaveLength(2);
    // A death is a new arrival: the camps are picked again.
    let changed = false;
    for (let attempt = 0; attempt < 20 && !changed; attempt++) {
      const before = chased().join();
      s.farm.defeated(); s.advance(1_000);
      changed = chased().join() !== before;
    }
    expect(changed).toBe(true);
    // Outside a run nothing is forced.
    s.setForced(0);
    expect(chased()).toEqual([]);
  });
});

describe('Aggro goal', () => {
  it("is a first prestige's for everyone: the campaign's last boss", async () => {
    const { aggroGoal, aggroGoalMet } = await import('../../../shared/aggro-challenge');
    const { BOSS_REWARD_CLAIM_BITS } = await import('../../../shared/rules');
    expect(aggroGoal().label).toBe('Defeat Aegis Prime (map 15)');
    expect(aggroGoalMet(0)).toBe(false);
    expect(aggroGoalMet(BOSS_REWARD_CLAIM_BITS.aegisPrime)).toBe(true);
  });
});
