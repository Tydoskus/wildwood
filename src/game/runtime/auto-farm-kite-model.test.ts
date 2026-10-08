import { describe, expect, it } from 'vitest';
import { chaseDamage, contactCapacity, kitedHitInterval, perkFightLoss, tankableCount, type ChaserThreat } from './auto-farm-kite-model';
import { createEnemySimulation } from './enemy-simulation';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { WORLD } from '../constants';
import { enemyChaseSpeed } from '../../../shared/rules';
import type { SpawnSite } from '../world';
import type { EnemyState, PlayerState } from './types';

/** One Bramble chasing a player who stands, or runs straight on at `speed`: the seconds between its blows, from the real chase. */
function blows(speed: number, run: boolean, seconds = 90) {
  WORLD.w = 40_000; WORLD.h = 4_000;
  const enemies: EnemyState[] = [], sites: SpawnSite[] = [{ id: 0, x: 600, y: 2_000, campName: 'c', type: 'Bramble', leashRange: 40_000, alive: false, respawnAt: 0 }];
  const lifecycle = createEnemyLifecycle(enemies, sites, () => {});
  lifecycle.spawnFromSite(sites[0]);
  const player = { x: 500, y: 2_000, r: 17, attackRange: 200 } as PlayerState;
  const at: number[] = [];
  let clock = 1e12, time = 0, hurt = 0;
  const simulation = createEnemySimulation(enemies, () => {}, player, () => ({ width: 1_280, height: 720, zoom: 1 }), lifecycle.engageEnemy,
    () => { if (hurt > 0) return false; hurt = .1; at.push(time); return true; }, { serverNowMs: () => clock, playerMovementSpeed: () => speed, pullAggro: () => true });
  for (let frame = 0; frame < seconds * 60; frame++) {
    hurt = Math.max(0, hurt - 1 / 60);
    if (run) player.x += speed / 60;
    simulation.update(1 / 60);
    clock += 1_000 / 60; time += 1 / 60;
  }
  const gaps = at.slice(1).map((value, index) => value - at[index]);
  return gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length);
}

describe('kite model', () => {
  it('a chaser runs at the player\'s speed + 25: stood still it lands a blow every 1 / attackSpeed; run from, one per ramp and catch-up', () => {
    expect(enemyChaseSpeed(205, 200)).toBe(225);
    // Stood still, a Bramble (attack speed 1) lands one a second.
    expect(blows(200, false, 30)).toBeCloseTo(1, 1);
    // Run straight from, it stops on each blow, ramps back over 1.5 s and closes 25 a second: the model's interval, as the real chase runs it.
    for (const speed of [200, 260]) {
      const model = kitedHitInterval(speed, speed + 25), measured = blows(speed, true);
      expect(Math.abs(measured - model) / model, `${speed}: model ${model.toFixed(2)} s, measured ${measured.toFixed(2)} s`).toBeLessThan(.1);
    }
    // At 200 it is about eight seconds: an eighth of the blows standing takes from an enemy attacking once a second.
    expect(kitedHitInterval(200, 225)).toBeGreaterThan(7.5);
    expect(kitedHitInterval(200, 225)).toBeLessThan(9);
    expect(kitedHitInterval(260, 285)).toBeGreaterThan(kitedHitInterval(200, 225));
  });

  it('weighs standing against kiting: none kited on a circle that holds, one blow a cycle each otherwise; standing as many as fit round', () => {
    const chaser: ChaserThreat = { damage: 10, attackSpeed: 1, hp: 100, r: 14 };
    expect(contactCapacity(17, 14)).toBe(6);
    expect(contactCapacity(17, 38)).toBe(4);
    const few = chaseDamage({ chasers: [chaser, chaser], speed: 200, chaseSpeed: 225, playerR: 17, holds: true });
    expect(few).toMatchObject({ standing: 20, kited: 0 });
    const loose = chaseDamage({ chasers: [chaser, chaser], speed: 200, chaseSpeed: 225, playerR: 17, holds: false });
    expect(loose.kited).toBeCloseTo(20 / kitedHitInterval(200, 225));
    // Ten round a player who fits six: standing takes six's worth; kited, all ten land theirs, a cycle apart.
    const mob = chaseDamage({ chasers: Array(10).fill(chaser), speed: 200, chaseSpeed: 225, playerR: 17, holds: false });
    expect(mob.standing).toBe(60);
    expect(mob.kited).toBeCloseTo(100 / kitedHitInterval(200, 225));
  });

  it('Pull Whole Group pulls only as many as the build farms standing without falling below the reserve', () => {
    const chaser: ChaserThreat = { damage: 10, attackSpeed: 1, hp: 100, r: 14 };
    const mob = Array(12).fill(chaser);
    // Health lost: (damage a second - regeneration) while each is killed, the blows thinning as the crowd does:
    // both hitting for the first kill's 2 seconds, one for the second's, which regeneration covers.
    const lost = (damagePerSecond: number, regen: number, chasers: ChaserThreat[]) => perkFightLoss({ damagePerSecond, hitsPerSecond: chasers.length, chasers, maxHp: 1_000, regen, dps: 50 });
    expect(lost(20, 10, [chaser, chaser])).toBeCloseTo(20);
    expect(lost(5, 10, [chaser])).toBe(0);
    const weak = tankableCount({ chasers: mob, playerR: 17, maxHp: 300, regen: 0, dps: 50 });
    const strong = tankableCount({ chasers: mob, playerR: 17, maxHp: 3_000, regen: 20, dps: 200 });
    expect(weak).toBeGreaterThanOrEqual(1);
    expect(weak).toBeLessThan(4);
    expect(strong).toBe(12);
    // One it cannot even stand through still comes alone, to be kited.
    expect(tankableCount({ chasers: mob, playerR: 17, maxHp: 10, regen: 0, dps: 1 })).toBe(1);
  });

  it('counts Reflect and Second Wind in what a build can stand: its hits kill, and its kills heal', () => {
    // Weak arrows, and hits that Reflect throws back hard: the mob dies to its own blows.
    const brute: ChaserThreat = { damage: 20, raw: 40, attackSpeed: 1, hp: 200, r: 14 };
    const mob = Array(8).fill(brute);
    const plain = tankableCount({ chasers: mob, playerR: 17, maxHp: 600, regen: 0, dps: 10 });
    const reflecting = tankableCount({ chasers: mob, playerR: 17, maxHp: 600, regen: 0, dps: 10, perks: { reflect: 1, secondWind: 0 } });
    expect(plain).toBeLessThan(3);
    expect(reflecting).toBeGreaterThan(plain);
    // Second Wind pays health back for each kill.
    const lost = (secondWind: number) => perkFightLoss({ damagePerSecond: 40, hitsPerSecond: 2, chasers: [brute, brute], maxHp: 600, regen: 0, dps: 20, perks: { reflect: 0, secondWind } });
    expect(lost(.1)).toBeLessThan(lost(0));
  });
});
