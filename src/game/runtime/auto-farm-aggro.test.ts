import { describe, expect, it } from 'vitest';
import { createGameBootstrap } from './game-bootstrap';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { createAutoFarmController } from './auto-farm-controller';
import { aggroForcedCamps, aggroPullCamps } from '../../../shared/aggro-challenge';
import { ENEMY_TYPES, type EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';

function setup(options: { pullCamps?: number; forced?: string[]; needed?: number } = {}) {
  const state = createGameBootstrap();
  state.enemies.length = 0; state.spawnSites.length = 0;
  Object.assign(state.player, { x: 500, y: 500, attackRange: 200, speed: 300 });
  let map = 'forest', now = 0, forced: { groups: string[]; needed: number } | null = options.forced ? { groups: options.forced, needed: options.needed ?? options.forced.length } : null;
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
    pullCamps: () => options.pullCamps ?? 1, forcedGroups: () => forced });
  return { ...state, farm, add, setMap: (value: string) => { map = value; }, advance: (ms: number) => { now += ms; }, setForced: (value: string[] | null, needed = value?.length ?? 0) => { forced = value ? { groups: value, needed } : null; } };
}
const health = `stat:${ENEMY_TYPES.Bramble.reward.type}`, speed = `stat:${ENEMY_TYPES.Needle.reward.type}`;

describe('Aggro challenge on the client', () => {
  it('counts camps: one more chasing each run, one more pulled each win', () => {
    expect(aggroForcedCamps({ active: false, completed: 2 })).toBe(0);
    expect([0, 1, 3].map(completed => aggroForcedCamps({ active: true, completed }))).toEqual([1, 2, 4]);
    expect([0, 1, 4, 9].map(completed => aggroPullCamps({ active: false, completed }))).toEqual([1, 2, 5, 5]);
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

  it("on Auto, Pull's extra camps per win are Auto's next best, not none", () => {
    const s = setup({ pullCamps: 2 });
    const bramble = s.add('Bramble', 700, 500, 'near'), needle = s.add('Needle', 1200, 900, 'needle'), moss = s.add('Mossback', 1500, 500, 'moss');
    s.farm.setPullAll(true);
    s.farm.start([]);
    const pulled = [bramble, needle, moss].filter(enemy => s.farm.pulls(enemy));
    expect(pulled).toHaveLength(2);
  });

  it("stands and lets a pulled group come instead of stepping out to it after each kill", () => {
    const s = setup();
    s.add('Bramble', 900, 500, 'near');
    s.farm.setPullAll(true);
    s.farm.start([health]);
    // Pulled but not yet chasing: before, it took a step toward it for a frame.
    expect(s.farm.movement({ x: 0, y: 0, source: 'none' }, 1 / 60)).toMatchObject({ x: 0, y: 0 });
    expect(s.farm.state().status).toBe('Pulling');
  });

  it("with Pull covering every farmed group, it stands and fights instead of walking to camps or switching", () => {
    const s = setup({ pullCamps: 2 });
    const bramble = s.add('Bramble', 1500, 500, 'far'), needle = s.add('Needle', 500, 1500, 'needle');
    s.farm.setPullAll(true);
    s.farm.start([health, speed]);
    const still = { x: 0, y: 0, source: 'none' as const };
    expect(s.farm.movement(still, 1 / 60)).toMatchObject({ x: 0, y: 0 });
    expect(s.farm.state().status).toBe('Pulling');
    // Combat aims at whatever is nearest, not only the selected camp.
    expect(s.farm.attackType()).toBeNull();
    // A whole group dying does not send it to another camp.
    const before = s.farm.state().selected;
    bramble.dead = true;
    for (let i = 0; i < 5; i++) s.farm.movement(still, 1 / 60);
    expect(s.farm.state().selected).toBe(before);
    expect(s.farm.movement(still, 1 / 60)).toMatchObject({ x: 0, y: 0 });
    // One pulled group short of the route: it farms as before.
    const t = setup({ pullCamps: 1 });
    t.add('Bramble', 1500, 500, 'far'); t.add('Needle', 500, 1500, 'needle');
    t.farm.setPullAll(true);
    t.farm.start([health, speed]);
    expect(t.farm.attackType()).toBe(health);
    void needle;
  });

  it("an Aggro run's picked groups chase from arrival, farming or not, and only those", () => {
    const s = setup({ forced: [health] });
    const kinds: EnemyKind[] = ['Bramble', 'Bramble', 'Needle', 'Mossback'];
    const enemies = kinds.map((type, index) => s.add(type, 600 + index * 300, 500, `${type}${index}`));
    const chased = () => enemies.filter(enemy => s.farm.forced(enemy)).map(enemy => enemy.type);
    // Every Bramble spot (one stat group) chases; nothing else does.
    expect(chased()).toEqual(['Bramble', 'Bramble']);
    s.setForced([health, speed]); s.advance(1_000);
    expect(chased()).toEqual(['Bramble', 'Bramble', 'Needle']);
    // A death keeps the picks: nothing is chosen at random.
    s.farm.defeated(); s.advance(1_000);
    expect(chased()).toEqual(['Bramble', 'Bramble', 'Needle']);
    s.setForced(null); s.advance(1_000);
    expect(chased()).toEqual([]);
  });

  it("always chases with the run's full count: picks missing here, or none at all, are filled from this map's groups", () => {
    const s = setup({ forced: [`stat:${ENEMY_TYPES.Spitter.reward.type}`], needed: 1 });
    // No Spitters on this map: another group chases instead of none.
    const enemies = (['Bramble', 'Needle'] as EnemyKind[]).map((type, index) => s.add(type, 600 + index * 300, 500, `${type}${index}`));
    const chasing = () => enemies.filter(enemy => s.farm.forced(enemy)).length;
    expect(chasing()).toBe(1);
    // A picker left open with nothing picked still leaves the run's count chasing.
    s.setForced([], 2); s.advance(1_000);
    expect(chasing()).toBe(2);
  });

  it("saves the picks per account and asks for one more each run", async () => {
    const { readAggroPicks, writeAggroPicks, aggroPicksNeeded, forcedAggroGroups } = await import('./aggro-picks');
    const values = new Map<string, string>();
    const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
    writeAggroPicks('me', ['regen', 'damage'], storage);
    expect(readAggroPicks('me', storage)).toEqual(['damage', 'regen']);
    expect(readAggroPicks('someone else', storage)).toEqual([]);
    expect([0, 1, 3].map(completed => aggroPicksNeeded({ active: false, completed }))).toEqual([1, 2, 4]);
    expect(forcedAggroGroups({ active: false, completed: 0 }, 'me', storage)).toBeNull();
    expect(forcedAggroGroups({ active: true, completed: 0 }, 'me', storage)).toEqual({ groups: ['stat:damage', 'stat:regen'], needed: 1 });
    expect(forcedAggroGroups({ active: true, completed: 1 }, 'me', storage)).toEqual({ groups: ['stat:damage', 'stat:regen'], needed: 2 });
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
