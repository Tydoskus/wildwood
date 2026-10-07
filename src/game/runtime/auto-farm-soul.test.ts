import { describe, expect, it } from 'vitest';
import { createGameBootstrap } from './game-bootstrap';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { createAutoFarmController } from './auto-farm-controller';
import { createFarmEvaluator } from './auto-farm-build';
import { AUTO_FARM_CHOICE_KEY, AUTO_FARM_SOUL_CHOICE_KEY, type FarmReward } from './auto-farm-plan';
import { carryFarmGroup, farmGroupMatches, farmGroupRewardType, soulFarmReward } from './auto-farm-priority';
import { ENEMY_TYPES, type EnemyKind } from '../enemies';
import { soulCampName, SOUL_ENEMY_SPECIES } from '../soul-world';
import { SOUL_MAP_ID, type SoulStatId } from '../../../shared/soul-dimension';
import type { SpawnSite } from '../world';
import type { Movement } from './player-input-controller';

const idle: Movement = { x: 0, y: 0, source: 'none' };
/** Every soul enemy is built paying no run stat: what made them all one "Damage +0" choice. */
const soulDefinition = (stat: SoulStatId) => ({ ...ENEMY_TYPES[SOUL_ENEMY_SPECIES[stat]], reward: { type: 'damage' as const, amount: 0 } });

function setup(extra: Partial<Parameters<typeof createAutoFarmController>[0]> = {}) {
  const state = createGameBootstrap();
  state.enemies.length = 0; state.spawnSites.length = 0;
  Object.assign(state.player, { x: 500, y: 500, attackRange: 200, speed: 300 });
  let map: string = SOUL_MAP_ID;
  const values = new Map<string, string>();
  const memory = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
  const site = (type: EnemyKind, x: number, y: number, campName: string, definition?: SpawnSite['definition']) => {
    const entry: SpawnSite = { id: state.spawnSites.length, type, x, y, campName, leashRange: 500, alive: false, respawnAt: 0, definition };
    state.spawnSites.push(entry); lifecycle.spawnFromSite(entry);
    return state.enemies[state.enemies.length - 1];
  };
  const soul = (stat: SoulStatId, x: number, y: number, camp = 0) =>
    site(SOUL_ENEMY_SPECIES[stat], x, y, soulCampName(stat, { key: `forest:${camp}` }), soulDefinition(stat));
  const farm = createAutoFarmController({ ...state, mapId: () => map, unavailable: () => null, paused: () => false,
    speed: () => 300, obstacles: () => [], localIdentity: () => 'me', priorityStorage: () => memory, farmDps: () => 1e9, ...extra });
  return { ...state, farm, soul, site, values, tick: () => farm.movement(idle, 1 / 60), setMap: (value: string) => { map = value; } };
}

describe('autofarm in the Soul Dimension', () => {
  it('offers one choice per soul stat the tier has woken, each paying its flat soul reward', () => {
    const s = setup();
    s.soul('damage', 900, 500, 0); s.soul('damage', 950, 520, 0); s.soul('armor', 500, 900, 1); s.soul('critDamage', 100, 500, 2);
    const choices = s.farm.choices();
    expect(choices.map(choice => choice.key).sort()).toEqual(['soul:armor', 'soul:critDamage', 'soul:damage']);
    const damage = choices.find(choice => choice.key === 'soul:damage')!;
    expect(damage).toMatchObject({ soul: 'damage', total: 2, label: 'Soul Damage', reward: { type: 'damage', amount: 1, flat: true } });
    expect(choices.find(choice => choice.key === 'soul:armor')).toMatchObject({ soul: 'armor', label: 'Soul Armor', reward: { type: 'armor', amount: 1 } });
    // Crit damage adds no power: priced at nothing.
    expect(choices.find(choice => choice.key === 'soul:critDamage')!.reward.amount).toBe(0);
  });

  it('farms only the picked soul stat, and combat aims at it alone', () => {
    const s = setup();
    const damage = s.soul('damage', 1400, 500), armor = s.soul('armor', 700, 500, 1);
    expect(s.farm.start('soul:armor')).toBe(true);
    expect(s.farm.targetType()).toBe('soul:armor');
    expect(s.tick().x).toBeGreaterThan(0);
    expect(farmGroupMatches(armor, 'soul:armor')).toBe(true);
    expect(farmGroupMatches(damage, 'soul:armor')).toBe(false);
    // A run-stat group never takes a soul enemy: they pay no run stat.
    expect(farmGroupMatches(damage, 'stat:damage')).toBe(false);
  });

  it("pulls and forces soul groups by their soul stat; an Aggro run's run-stat picks are their soul stats here", () => {
    const s = setup({ forcedGroups: () => ({ groups: ['stat:armor'], needed: 1 }) });
    const damage = s.soul('damage', 1400, 500), armor = s.soul('armor', 700, 500, 1);
    expect(s.farm.forced(armor)).toBe(true);
    expect(s.farm.forced(damage)).toBe(false);
    s.farm.setPullAll(true);
    s.farm.start('soul:damage');
    s.tick();
    expect(s.farm.pulls(damage)).toBe(true);
    expect(s.farm.pulls(armor)).toBe(false);
  });

  it('Auto prices a soul kill as the stat it adds, and leaves Crit Damage to routes', () => {
    // Health is worth the most here; crit damage would be worth nothing.
    const evaluate = (reward?: FarmReward) => ({ power: 100 + (reward?.type === 'health' ? 5 : reward?.amount ? 1 : 0) });
    const s = setup({ evaluate });
    s.soul('damage', 600, 500); s.soul('health', 600, 450, 1); s.soul('critDamage', 520, 500, 2);
    expect(s.farm.start([])).toBe(true);
    expect(s.farm.state().selected).toBe('soul:health');
    // With only crit damage worth anything to the route, it is farmed when picked.
    expect(s.farm.start(['soul:critDamage'])).toBe(true);
    expect(s.farm.state().selected).toBe('soul:critDamage');
    // And Auto never takes it while another soul stat stands.
    const only = setup({ evaluate: () => ({ power: 100 }) });
    only.soul('critDamage', 520, 500); only.soul('regen', 1600, 500, 1);
    only.farm.start([]);
    expect(only.farm.state().selected).toBe('soul:regen');
  });

  it("never farms for the boss there: there is none, so Auto says Best Gain", () => {
    const s = setup({ evaluate: () => ({ power: 1 }) });
    s.soul('damage', 560, 500);
    s.farm.start([]);
    expect(s.farm.bossStatus()).toBe('');
    for (let frame = 0; frame < 5; frame++) s.tick();
    expect(s.farm.state().status).toContain('Best Gain');
  });

  it("carries the campaign's pick into the Soul Dimension as its soul stats, and keeps soul picks apart from it", () => {
    const s = setup();
    s.soul('damage', 900, 500); s.soul('attackSpeed', 500, 900, 1); s.soul('critDamage', 100, 500, 2);
    s.values.set(AUTO_FARM_CHOICE_KEY, JSON.stringify(['stat:speed*2', 'stat:damage', 'stat:health']));
    // Shown as soul stats (the panel drops what this tier lacks), and started from as the panel would.
    expect(s.farm.savedPlan()).toEqual(['soul:attackSpeed*2', 'soul:damage', 'soul:health']);
    expect(s.farm.start(s.farm.savedPlan())).toBe(true);
    expect(s.farm.state().plan).toEqual(['soul:attackSpeed*2', 'soul:damage']);
    // A soul pick is the Soul Dimension's own: the campaign's pick stands.
    expect(JSON.parse(s.values.get(AUTO_FARM_SOUL_CHOICE_KEY)!)).toEqual(['soul:attackSpeed*2', 'soul:damage']);
    expect(JSON.parse(s.values.get(AUTO_FARM_CHOICE_KEY)!)).toEqual(['stat:speed*2', 'stat:damage', 'stat:health']);
    s.farm.start(['soul:critDamage']);
    expect(s.farm.savedPlan()).toEqual(['soul:critDamage']);
    s.farm.stop();
    s.setMap('forest');
    expect(s.farm.savedPlan()).toEqual(['stat:speed*2', 'stat:damage', 'stat:health']);
  });

  it('a soul pick reaching a campaign map is its run stat there, and Crit Damage is simply absent', () => {
    const s = setup();
    s.setMap('forest');
    s.site('Bramble', 900, 500, 'Bramble');
    const health = `stat:${ENEMY_TYPES.Bramble.reward.type}`;
    expect(s.farm.choices().map(choice => choice.key)).toEqual([health]);
    expect(s.farm.start(['soul:critDamage', `soul:${ENEMY_TYPES.Bramble.reward.type}`])).toBe(true);
    expect(s.farm.state().plan).toEqual([health]);
    expect(s.farm.start(['soul:critDamage'])).toBe(false);
  });
});

describe('soul farm groups', () => {
  it('map run stats and soul stats both ways, Atk Speed to Attack Speed', () => {
    expect(carryFarmGroup('stat:speed', true)).toBe('soul:attackSpeed');
    expect(carryFarmGroup('stat:health', true)).toBe('soul:health');
    expect(carryFarmGroup('soul:regen', true)).toBe('soul:regen');
    expect(carryFarmGroup('soul:attackSpeed', false)).toBe('stat:speed');
    expect(carryFarmGroup('soul:critDamage', false)).toBe('soul:critDamage');
    expect(carryFarmGroup('stat:armor', false)).toBe('stat:armor');
    expect(farmGroupRewardType('soul:attackSpeed')).toBe('speed');
    expect(farmGroupRewardType('soul:critDamage')).toBeNull();
    expect(farmGroupRewardType('stat:regen')).toBe('regen');
  });

  it('prices a soul reward flat: research and prestige never grow it', () => {
    const base = { maxHp: 1_000, damage: 100, armor: 0, regen: 0, attackRate: 1 };
    const evaluator = createFarmEvaluator({ base: () => base, research: () => null, upgradeLevel: () => 0, rewardMultiplier: () => 10,
      equipment: () => ({ equippedHead: '', equippedChest: '', equippedRightHand: '', equippedLeftHand: '' }) as never,
      minAttackInterval: () => .2, criticalChance: () => 0, criticalMultiplier: () => 1 });
    const now = evaluator.evaluate().power;
    expect(evaluator.evaluate(soulFarmReward('health')).power).toBeCloseTo(now + 1);
    expect(evaluator.evaluate({ type: 'health', amount: 1 }).power).toBeCloseTo(now + 10);
    expect(evaluator.evaluate(soulFarmReward('critDamage')).power).toBeCloseTo(now);
    expect(evaluator.evaluate(soulFarmReward('attackSpeed')).stats!.attackRate).toBeCloseTo(1 / 1.001);
  });
});
