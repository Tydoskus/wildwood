import { describe, expect, it } from 'vitest';
import { createStatTrackerModel, RUN_SETTLE_MS, type TrackerValues } from './stat-tracker-model';

const values: TrackerValues = { power: 1000, hp: 500, damage: 100, armor: 20, regen: 5, kills: 50 };
function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  let time = 1000;
  return { storage, now: () => time, advance: (ms: number) => { time += ms; } };
}
describe('native stat tracker sessions', () => {
  it('uses exact fractional stats and calculates hourly gains', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', values);
    env.advance(1_800_000);
    const result = tracker.update('alice', { ...values, damage: 100.25, kills: 60 })!;
    expect(result.rows.find(row => row.stat === 'damage')).toMatchObject({ gain: .25, perHour: .5 });
    expect(result.rows.find(row => row.stat === 'kills')).toMatchObject({ gain: 10, perHour: 20 });
  });
  it('persists across reloads and keeps different characters separate', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', values);
    env.advance(1000);
    tracker.update('alice', { ...values, power: 1100 });
    expect(tracker.update('bob', { ...values, power: 9000 })!.rows[0].gain).toBe(0);
    const restored = createStatTrackerModel(env.storage, env.now);
    expect(restored.update('alice', { ...values, power: 1100 })!.rows[0].gain).toBe(100);
  });
  it('resets only tracker baselines and reports no loss from equipment changes', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', values);
    env.advance(1000);
    expect(tracker.update('alice', { ...values, power: 900 })!.rows[0]).toMatchObject({ current: 900, gain: 0 });
    tracker.reset();
    expect(tracker.update('alice', { ...values, power: 900 })!.rows[0]).toMatchObject({ current: 900, gain: 0, perHour: 0 });
    expect(values.power).toBe(1000);
  });
  it('starts fresh after character progress reset and tolerates invalid saved data', () => {
    const env = setup();
    env.storage.setItem('wildstat-native-stat-tracker-v1:alice', '{broken');
    const tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', values);
    env.advance(1000);
    expect(tracker.update('alice', { ...values, kills: 0 })!.rows.every(row => row.gain === 0)).toBe(true);
    expect(tracker.update('alice', { ...values, damage: NaN })).toBeNull();
  });
  it('still works when browser storage is unavailable', () => {
    const tracker = createStatTrackerModel({ getItem() { throw Error(); }, setItem() { throw Error(); } });
    expect(tracker.update('alice', values)!.rows[0].current).toBe(1000);
    expect(() => tracker.save()).not.toThrow();
  });

  it('reports no gain when a stat drops below the session baseline', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    const row = (result: any, stat: string) => result.rows.find((entry: any) => entry.stat === stat);
    tracker.update('alice', values);
    env.advance(60_000);
    // Swapping to weaker gear must not read as negative progress.
    const weaker = tracker.update('alice', { ...values, damage: 90, power: 900 })!;
    expect(row(weaker, 'damage')).toMatchObject({ current: 90, gain: 0, perHour: 0 });
    expect(row(weaker, 'power')).toMatchObject({ current: 900, gain: 0, perHour: 0 });
    // Climbing past the baseline again still counts from the baseline.
    const better = tracker.update('alice', { ...values, damage: 120 })!;
    expect(row(better, 'damage')).toMatchObject({ current: 120, gain: 20 });
  });
});

it("resets for prestige, ignores a loading zero, and persists the new baseline", () => {
  const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
  tracker.update('alice', values, 1);
  env.advance(60_000);
  expect(tracker.update('alice', { ...values, damage: 120 }, 0)!.rows.find(r => r.stat === 'damage')!.gain).toBe(20);
  const reset = tracker.update('alice', { ...values, damage: 4 }, 2)!;
  expect(reset.elapsedMs).toBe(0);
  expect(reset.rows.every(r => r.gain === 0)).toBe(true);
  const restored = createStatTrackerModel(env.storage, env.now);
  expect(restored.update('alice', { ...values, damage: 5 }, 2)!.rows.find(r => r.stat === 'damage')!.gain).toBe(1);
});

it("migrates old sessions once and preserves the prestige level on manual reset", () => {
  const env = setup();
  env.storage.setItem('wildstat-native-stat-tracker-v1:alice', JSON.stringify({ startedAt: 0, baseline: values, lastKills: 50 }));
  const tracker = createStatTrackerModel(env.storage, env.now);
  expect(tracker.update('alice', { ...values, damage: 4 }, 2)!.rows.every(r => r.gain === 0)).toBe(true);
  tracker.update('alice', { ...values, damage: 5 }, 0);
  tracker.reset(); env.advance(1000);
  expect(tracker.update('alice', { ...values, damage: 6 }, 2)!.rows.find(r => r.stat === 'damage')!.gain).toBe(1);
});

describe('a run change starts the session over', () => {
  const main = { run: 'main', basePower: 900 };
  const gain = (result: any, stat = 'power') => result.rows.find((row: any) => row.stat === stat).gain;

  it('starts over when a challenge starts, once the change has held', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', values, 3, main);
    env.advance(3_600_000);
    tracker.update('alice', { ...values, power: 1500, kills: 80 }, 3, main);
    // Reflect Only: starting stats, same prestige level, lifetime kills kept.
    const fresh = { ...values, power: 50, hp: 30, damage: 2, armor: 0, regen: 1, kills: 80 };
    const settling = tracker.update('alice', fresh, 3, { run: 'reflect', basePower: 40 })!;
    expect(settling.elapsedMs).toBe(3_600_000);
    env.advance(RUN_SETTLE_MS);
    const started = tracker.update('alice', fresh, 3, { run: 'reflect', basePower: 40 })!;
    expect(started.elapsedMs).toBe(0);
    expect(started.rows.every(row => row.gain === 0)).toBe(true);
    env.advance(60_000);
    expect(gain(tracker.update('alice', { ...fresh, power: 70 }, 3, { run: 'reflect', basePower: 55 }))).toBe(20);
  });

  it('starts over when a challenge ends and the main run comes back', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', { ...values, power: 50 }, 3, { run: 'aggro', basePower: 40 });
    env.advance(600_000);
    tracker.update('alice', { ...values, power: 2000 }, 3, main);
    env.advance(RUN_SETTLE_MS);
    const back = tracker.update('alice', { ...values, power: 2000 }, 3, main)!;
    expect(back.elapsedMs).toBe(0);
    expect(gain(back)).toBe(0);
  });

  it('starts over when an Aggro run starts again after a death', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    tracker.update('alice', { ...values, power: 50 }, 3, { run: 'aggro', basePower: 40 });
    env.advance(600_000);
    tracker.update('alice', { ...values, power: 400 }, 3, { run: 'aggro', basePower: 300 });
    tracker.update('alice', { ...values, power: 50 }, 3, { run: 'aggro', basePower: 40 });
    env.advance(RUN_SETTLE_MS);
    const restarted = tracker.update('alice', { ...values, power: 50 }, 3, { run: 'aggro', basePower: 40 })!;
    expect(restarted.elapsedMs).toBe(0);
    env.advance(1000);
    expect(gain(tracker.update('alice', { ...values, power: 60 }, 3, { run: 'aggro', basePower: 48 }))).toBe(10);
  });

  it('keeps the session through a reconnect that briefly reads no challenge, and through a gear swap', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    const aggro = { run: 'aggro', basePower: 300 };
    tracker.update('alice', values, 3, aggro);
    env.advance(60_000);
    tracker.update('alice', { ...values, power: 800 }, 3, { run: 'main', basePower: 300 });
    env.advance(RUN_SETTLE_MS - 1);
    tracker.update('alice', values, 3, aggro);
    env.advance(RUN_SETTLE_MS);
    // Weaker gear lowers power, not the stats kills raise.
    const swapped = tracker.update('alice', { ...values, power: 500 }, 3, aggro)!;
    expect(swapped.elapsedMs).toBe(60_000 + RUN_SETTLE_MS * 2 - 1);
  });

  it('remembers the run across a reload and adopts it for an older session', () => {
    const env = setup();
    env.storage.setItem('wildstat-native-stat-tracker-v1:alice', JSON.stringify({ startedAt: 0, baseline: values, lastKills: 50, prestigeLevel: 3 }));
    const tracker = createStatTrackerModel(env.storage, env.now);
    expect(tracker.update('alice', values, 3, main)!.elapsedMs).toBe(1000);
    tracker.save();
    const restored = createStatTrackerModel(env.storage, env.now);
    restored.update('alice', values, 3, { run: 'reflect', basePower: 40 });
    env.advance(RUN_SETTLE_MS);
    expect(restored.update('alice', values, 3, { run: 'reflect', basePower: 40 })!.elapsedMs).toBe(0);
  });
});
