import { describe, expect, it } from 'vitest';
import { createStatTrackerModel, type TrackerValues } from './stat-tracker-model';

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

  it('starts a fresh session when the prestige level rises, but not when it reads lower while loading', () => {
    const env = setup(), tracker = createStatTrackerModel(env.storage, env.now);
    const row = (result: any, stat: string) => result.rows.find((entry: any) => entry.stat === stat);
    tracker.update('alice', { ...values, power: 5_000 }, 2);
    env.advance(60_000);
    const loading = tracker.update('alice', { ...values, power: 5_200 }, 0)!;
    expect(row(loading, 'power')).toMatchObject({ current: 5_200, gain: 200 });
    const prestiged = tracker.update('alice', { ...values, power: 100, kills: 60 }, 3)!;
    expect(prestiged.elapsedMs).toBe(0);
    expect(prestiged.rows.every(entry => entry.gain === 0)).toBe(true);
    env.advance(60_000);
    expect(row(tracker.update('alice', { ...values, power: 150, kills: 70 }, 3), 'power')).toMatchObject({ current: 150, gain: 50 });
  });
});
