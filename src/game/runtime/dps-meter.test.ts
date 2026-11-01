import { expect, it } from 'vitest';
import { createDpsMeter, playerDps, statTrackerDps } from './dps-meter';

it('resets breakdown independently of the HUD DPS and accepts new hits immediately', () => {
  let now = 0;
  const meter = createDpsMeter(() => now);
  meter.record(100, 'staff-direct');
  now = 1000;
  meter.record(50, 'staff-splash');
  const hud = meter.perSecond();
  meter.resetBreakdown();
  expect(meter.breakdown()).toEqual([]);
  expect(meter.perSecond()).toBe(hud);
  meter.record(30, 'staff-chain');
  expect(meter.breakdown()).toEqual([{ source: 'staff-chain', perSecond: 30 }]);
});

it('tracks a boss beyond 20 seconds, excludes adds, and freezes on death', () => {
  let now = 0;
  const meter = createDpsMeter(() => now);
  const boss = { hp: 100, dead: false, encounter: 1n };
  meter.record(100, 'staff-direct', boss);
  now = 30_000;
  meter.record(50, 'staff-splash', boss);
  meter.record(1000, 'card-burn');
  expect(meter.autoBossSnapshot()!.rows).toEqual([
    { source: 'staff-direct', perSecond: 100 / 30 }, { source: 'staff-splash', perSecond: 50 / 30 },
  ]);
  boss.hp = 0; boss.dead = true;
  meter.tickBoss();
  const result = meter.autoBossSnapshot();
  now = 90_000;
  meter.record(999, 'reflect');
  expect(meter.autoBossSnapshot()).toEqual(result);
  expect(result).toMatchObject({ finished: true, interrupted: false, elapsedMs: 30_000 });
  expect(meter.breakdown()).toEqual([{ source: 'reflect', perSecond: 999 }]);
});

it('dismisses a pinned result without clearing normal history and starts the next boss fresh', () => {
  let now = 0;
  const meter = createDpsMeter(() => now);
  const boss = { hp: 10, dead: false, encounter: 1n };
  meter.record(10, 'bow-hit', boss);
  now = 1000; boss.hp = 0; boss.dead = true; meter.tickBoss();
  meter.record(20, 'staff-direct');
  const normal = meter.breakdown();
  meter.dismissBoss();
  expect(meter.autoBossSnapshot()).toBeNull();
  expect(meter.breakdown()).toEqual(normal);
  boss.dead = false; boss.hp = 100; boss.encounter = 2n;
  meter.record(30, 'staff-chain', boss);
  expect(meter.autoBossSnapshot()).toMatchObject({ finished: false, elapsedMs: 0,
    rows: [{ source: 'staff-chain', perSecond: 30 }] });
});

it('distinguishes interrupted encounters and replaces them on the next boss', () => {
  let now = 0;
  const meter = createDpsMeter(() => now);
  const boss = { hp: 100, dead: false, encounter: 1n };
  meter.record(50, 'bow-hit', boss);
  now = 5000; boss.dead = true; meter.tickBoss();
  expect(meter.autoBossSnapshot()).toMatchObject({ interrupted: true, finished: false, elapsedMs: 5000 });
  const next = { hp: 100, dead: false };
  meter.record(20, 'sword-hit', next);
  expect(meter.autoBossSnapshot()!.rows).toEqual([{ source: 'sword-hit', perSecond: 20 }]);
  next.dead = true; next.hp = 0; meter.tickBoss();
  expect(meter.autoBossSnapshot()!.finished).toBe(true);
});

it('separates boss resets from the normal DPS timer and resets normal time on the next hit', () => {
  let now = 0;
  const meter = createDpsMeter(() => now);
  meter.record(10, 'bow-hit');
  now = 2000;
  meter.record(20, 'staff-direct', { hp: 100, dead: false });
  now = 7000;
  expect(meter.elapsedMs()).toBe(7000);
  expect(meter.autoBossSnapshot()!.elapsedMs).toBe(5000);
  meter.resetBoss();
  expect(meter.autoBossSnapshot()).toBeNull();
  expect(meter.elapsedMs()).toBe(7000);
  meter.resetBreakdown();
  expect(meter.elapsedMs()).toBe(0);
  now = 9000; meter.record(5, 'bow-hit');
  now = 10_000; expect(meter.elapsedMs()).toBe(1000);
});

it('keeps the exported standalone history independent of integrated resets and boss controls', () => {
  playerDps.resetBreakdown(); statTrackerDps.resetBreakdown(); statTrackerDps.resetBoss();
  playerDps.record(60, 'bow-hit');
  statTrackerDps.record(60, 'bow-hit', { hp: 100, dead: false });
  const before = playerDps.breakdown();
  statTrackerDps.resetBoss(); statTrackerDps.dismissBoss(); statTrackerDps.resetBreakdown();
  expect(playerDps.breakdown()).toEqual(before);
  expect(statTrackerDps.breakdown()).toEqual([]);
  expect(playerDps.autoBossSnapshot()).toBeNull();
  playerDps.resetBreakdown();
});
