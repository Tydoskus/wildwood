import { describe, expect, it } from 'vitest';
import {
  AUTO_FARM_PUSH_KEY, AUTO_FARM_RETRY_KEY, BUILD_CHANGE, FARM_PUSHES, GAIN_MIN_MS, PROBATION_MS, bossFightLosing, createPowerGainMeter, createRetryMemory,
  bossFightMargin, probationVerdict, readFarmPush, shouldLeaveBoss, writeFarmPush,
} from './auto-farm-brain';
import { armorDamageReduction } from '../combat';

function memory() {
  const values = new Map<string, string>();
  return { values, storage: () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }) };
}
describe('autofarm boss fight', () => {
  const fight = { seconds: 10, bossStart: 1, boss: .9, playerStart: 1, player: .45 };
  it('walks away from a fight being lost once under half health, never before 3 seconds or above half', () => {
    // The boss loses 1% a second (90 s to go); the player 5.5% (8 s to go).
    expect(bossFightLosing(fight)).toBe(true);
    expect(shouldLeaveBoss(fight)).toBe(true);
    expect(shouldLeaveBoss({ ...fight, seconds: 2.9 })).toBe(false);
    expect(shouldLeaveBoss({ ...fight, player: .55, playerStart: 1.1 })).toBe(false);
  });
  it('stays in a fight it is winning, or one where the player is not losing health', () => {
    expect(shouldLeaveBoss({ ...fight, boss: .1 })).toBe(false);
    expect(shouldLeaveBoss({ ...fight, playerStart: .45 })).toBe(false);
    // The boss healing faster than it is hit is a fight that cannot be won.
    expect(shouldLeaveBoss({ ...fight, boss: 1 })).toBe(true);
  });
});

describe('autofarm farming for a lost boss fight', () => {
  const stats = { damage: 100, attackRate: 1, maxHp: 1_000, armor: 0, regen: 0 };
  // The boss lost 1% a second, the player 2%: the player lasted half as long as the boss would have.
  const fight = { mapId: 'forest', boss: .01, player: .02, stats };
  it('rescales the measured fight by what a build changes', () => {
    expect(bossFightMargin(fight, stats)).toBeCloseTo(.5);
    expect(bossFightMargin(fight, { ...stats, damage: 200 })).toBeCloseTo(1);
    expect(bossFightMargin(fight, { ...stats, attackRate: .5 })).toBeCloseTo(1);
    expect(bossFightMargin(fight, { ...stats, maxHp: 2_000 })).toBeCloseTo(1);
    // 10 health a second back on 1,000: half of the 2% a second lost.
    expect(bossFightMargin(fight, { ...stats, regen: 10 })).toBeCloseTo(1);
    expect(bossFightMargin(fight, { ...stats, armor: 100 })).toBeCloseTo(.5 / (1 - armorDamageReduction(100)));
  });
  it('caps a fight the player would never lose', () => {
    expect(bossFightMargin(fight, { ...stats, regen: 1_000 })).toBe(10);
  });
});

describe('autofarm probation', () => {
  const start = { since: 0, previousRate: 100 };
  it.each(['safe', 'normal', 'bold'] as const)('judges a new map by its gain only, at the end of probation, as the %s push allows', push => {
    const keep = FARM_PUSHES[push].keep;
    expect(probationVerdict(start, PROBATION_MS - 1, 0, push)).toBe('pending');
    expect(probationVerdict(start, PROBATION_MS, 100 * keep, push)).toBe('stay');
    expect(probationVerdict(start, PROBATION_MS, 100 * keep - 1, push)).toBe('back');
  });
  it('keeps a map whose rate, or the one before it, is not known', () => {
    expect(probationVerdict({ ...start, previousRate: null }, PROBATION_MS, 0, 'safe')).toBe('stay');
    expect(probationVerdict(start, PROBATION_MS, null, 'safe')).toBe('stay');
  });
});

describe('autofarm power gain', () => {
  it('measures power per minute over the last ten minutes, and nothing under five', () => {
    const meter = createPowerGainMeter();
    for (let minute = 0; minute <= 4; minute++) meter.sample(minute * 60_000, 1_000 + minute * 10, 'forest');
    expect(meter.rate(4 * 60_000, 'forest')).toBeNull();
    meter.sample(GAIN_MIN_MS, 1_050, 'forest');
    expect(meter.rate(GAIN_MIN_MS, 'forest')).toBeCloseTo(10);
    // Only the last ten minutes count: a faster recent stretch shows.
    for (let minute = 6; minute <= 20; minute++) meter.sample(minute * 60_000, 1_050 + (minute - 5) * 30, 'forest');
    expect(meter.rate(20 * 60_000, 'forest')).toBeCloseTo(30);
    expect(meter.rate(20 * 60_000, 'desert')).toBeNull();
  });
  it('starts over on another map or when the build falls (a run started)', () => {
    const meter = createPowerGainMeter();
    for (let minute = 0; minute <= 6; minute++) meter.sample(minute * 60_000, 1_000 + minute * 10, 'forest');
    meter.sample(7 * 60_000, 10, 'forest');
    expect(meter.rate(7 * 60_000, 'forest')).toBeNull();
    for (let minute = 0; minute <= 6; minute++) meter.sample(minute * 60_000, 1_000 + minute * 10, 'forest');
    meter.sample(7 * 60_000, 2_000, 'desert');
    expect(meter.rate(7 * 60_000, 'forest')).toBeNull();
  });
});

describe('autofarm retry', () => {
  const minute = 60_000;
  it('asks for more power after each failure than the last try asked, and waits twice as long each time', () => {
    let now = 0;
    const retries = createRetryMemory(memory().storage, () => now);
    expect(retries.get('me', 'desert', 1_000)).toEqual({ power: 0, at: 0 });
    expect(retries.raise('me', 'desert', 1_000, 1.2, 10 * minute)).toEqual({ power: 1_200, at: 10 * minute });
    // A build that fell below the last try's power still needs more than it.
    expect(retries.raise('me', 'desert', 900, 1.2, 10 * minute).power).toBeCloseTo(1_440);
    expect(retries.get('me', 'desert', 900).at).toBe(20 * minute);
    now = 30 * minute;
    expect(retries.raise('me', 'desert', 2_000, 1.2, 10 * minute)).toEqual({ power: 2_400, at: 70 * minute });
  });

  it('cannot bounce between two maps all night: tries get rarer, however fast the build grows', () => {
    let now = 0, power = 1_000, tries = 0;
    const retries = createRetryMemory(memory().storage, () => now);
    // A map that always beats the build, and a farm that grows 3% a minute, a night long.
    for (let step = 0; step < 10 * 60; step++, now += minute, power *= 1.03) {
      const gate = retries.get('me', 'desert', power);
      if (power < gate.power || now < gate.at) continue;
      tries++;
      retries.raise('me', 'desert', power, FARM_PUSHES.normal.retry, FARM_PUSHES.normal.waitMinutes * minute);
    }
    // 10, 20, 40, 80, 160, 320 minutes apart: six tries in ten hours.
    expect(tries).toBeLessThanOrEqual(6);
  });

  it('round-trips through storage per character and map, survives a reload, and reads the older two-number entries', () => {
    const { storage, values } = memory();
    createRetryMemory(storage, () => 0).raise('me', 'desert', 1_000, 1.2, minute);
    createRetryMemory(storage, () => 0).raise('me', 'boss:forest', 500, 2, minute / 2);
    const reloaded = createRetryMemory(storage);
    expect(reloaded.get('me', 'desert', 1_000)).toEqual({ power: 1_200, at: minute });
    expect(reloaded.get('me', 'boss:forest', 1_000)).toEqual({ power: 1_000, at: minute / 2 });
    expect(reloaded.get('someone-else', 'desert', 1_000).power).toBe(0);
    expect(JSON.parse(values.get(AUTO_FARM_RETRY_KEY)!)).toEqual({ me: { desert: [1_200, 1_000, 1, minute], 'boss:forest': [1_000, 500, 1, minute / 2] } });
    values.set(AUTO_FARM_RETRY_KEY, JSON.stringify({ me: { desert: [12, 10] } }));
    expect(createRetryMemory(storage).get('me', 'desert', 10)).toEqual({ power: 12, at: 0 });
  });

  it("ignores another build's numbers: a fresh run is not held back by the main build's tries", () => {
    const retries = createRetryMemory(memory().storage, () => 0);
    retries.raise('me', 'desert', 1e6, 1.2, minute);
    expect(retries.get('me', 'desert', 1e6 / BUILD_CHANGE).power).toBeCloseTo(1.2e6);
    expect(retries.get('me', 'desert', 1e6 / BUILD_CHANGE / 2)).toEqual({ power: 0, at: 0 });
    // And starts its own count: the first wait again.
    expect(retries.raise('me', 'desert', 100, 1.2, minute)).toEqual({ power: 120, at: minute });
  });

  it('works without storage, and ignores what it cannot read', () => {
    const broken = () => ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    const retries = createRetryMemory(broken, () => 0);
    expect(retries.get('me', 'desert', 1).power).toBe(0);
    expect(retries.raise('me', 'desert', 10, 1.2, 0).power).toBeCloseTo(12);
    expect(retries.get('me', 'desert', 10).power).toBeCloseTo(12);
    const { storage, values } = memory();
    values.set(AUTO_FARM_RETRY_KEY, JSON.stringify({ me: { desert: [12, 10, 1, 5], bad: ['x', 1], worse: [1] }, them: 4 }));
    const parsed = createRetryMemory(storage);
    expect(parsed.get('me', 'desert', 10)).toEqual({ power: 12, at: 5 });
    expect(parsed.get('me', 'bad', 10).power).toBe(0);
    values.set(AUTO_FARM_RETRY_KEY, '{not json');
    expect(createRetryMemory(storage).get('me', 'desert', 10).power).toBe(0);
  });
});

it('remembers the push setting, normal by default', () => {
  const { storage, values } = memory();
  expect(readFarmPush(storage)).toBe('normal');
  writeFarmPush('bold', storage);
  expect(values.get(AUTO_FARM_PUSH_KEY)).toBe('bold');
  expect(readFarmPush(storage)).toBe('bold');
  values.set(AUTO_FARM_PUSH_KEY, 'reckless');
  expect(readFarmPush(storage)).toBe('normal');
  expect(readFarmPush(() => { throw new Error('blocked'); })).toBe('normal');
});
