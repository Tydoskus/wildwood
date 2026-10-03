import { expect, it } from 'vitest';
import { createDamageMeter, DAMAGE_METER_WINDOW_MS } from './damage-meter';

it('measures damage per second while fighting, not while walking between camps', () => {
  let now = 0;
  const meter = createDamageMeter(() => now);
  // Ten hits of 100 a second apart, a 30-second walk, then ten more.
  for (let hit = 0; hit < 10; hit++) { meter.record(100); now += 1_000; }
  now += 30_000;
  for (let hit = 0; hit < 10; hit++) { meter.record(100); now += 1_000; }
  // 19 hits paid for by 18 one-second gaps and one walk counted as 2.5 s.
  expect(meter.dps()).toBeCloseTo(1_900 / 20.5);
});

it('says nothing on too little, and forgets hits older than a minute', () => {
  let now = 0;
  const meter = createDamageMeter(() => now);
  for (let hit = 0; hit < 3; hit++) { meter.record(50); now += 1_000; }
  expect(meter.dps()).toBeNull();
  for (let hit = 0; hit < 10; hit++) { meter.record(50); now += 1_000; }
  expect(meter.dps()).toBeCloseTo(50);
  now += DAMAGE_METER_WINDOW_MS + 1;
  expect(meter.dps()).toBeNull();
});
