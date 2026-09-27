import { expect, it, vi } from "vitest";
import { createRegularEnemyLootQueue, DRAIN_EXTRA_BATCHES, ENEMY_DEFEAT_BATCH_TIMEOUT_MS, ORPHAN_QUEUE_AFTER_MS, type EnemyLootRequest } from "./regular-enemy-loot-queue";
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key), get length() { return data.size; }, key: (index: number) => [...data.keys()][index] ?? null } as unknown as Storage;
  let identity = "alice";
  const send = vi.fn(async (_request: EnemyLootRequest) => true);
  const options = { identity: () => identity, tabId: () => "tab", storage, send };
  const queue = createRegularEnemyLootQueue(options);
  return { queue, send, options, identity: (value: string) => { identity = value; } };
}
it("combines kills, keeps source maps separate, and bounds batches", async () => {
  const f = fixture();
  for (let i = 0; i < 25; i++) f.queue.record("cloudspire", "Spitter");
  f.queue.record("moonfen", "Spitter");
  expect(f.send).not.toHaveBeenCalled();
  await f.queue.flush();
  expect(f.send.mock.calls.map(([r]) => [r.mapId, r.count, r.sequence])).toEqual([["cloudspire", 25, 1n], ["moonfen", 1, 2n]]);
  for (let i = 0; i < 205; i++) f.queue.record("cloudspire", "Spitter");
  await f.queue.flush(true);
  expect(f.send.mock.calls.slice(2).map(([r]) => r.count)).toEqual([100, 100, 5]);
});
it("keeps manual and Auto Farm kills in separate retryable batches", async () => {
  const f = fixture();
  f.queue.record("cloudspire", "Spitter", false);
  f.queue.record("cloudspire", "Spitter", true);
  f.queue.record("cloudspire", "Spitter", true);
  f.queue.record("cloudspire", "Spitter", false);
  await f.queue.flush(true);
  expect(f.send.mock.calls.map(([request]) => [request.autoFarm, request.count]))
    .toEqual([[false, 1], [true, 2], [false, 1]]);
});
it("persists an unacknowledged batch and never adds kills to a retry", async () => {
  const f = fixture(); f.send.mockResolvedValue(false);
  f.queue.record("water_reach", "Spitter");
  expect(await f.queue.flush()).toBe(false);
  const original = { ...f.send.mock.calls[0][0] };
  f.queue.record("water_reach", "Spitter");
  const reload = createRegularEnemyLootQueue(f.options);
  reload.begin(); f.send.mockResolvedValue(true);
  await reload.flush();
  expect(f.send.mock.calls[1][0]).toEqual(original);
  expect(f.send.mock.calls[2][0]).toMatchObject({ count: 1, sequence: 2n });
});
it("does not let an old identity's acknowledgement consume another player's queue", async () => {
  const f = fixture();
  let finish!: (value: boolean) => void;
  f.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  f.queue.record("water_reach", "Spitter"); const old = f.queue.flush();
  f.identity("bob"); f.queue.begin(); f.queue.record("moonfen", "Spitter");
  finish(true); expect(await old).toBe(false);
  await f.queue.flush();
  expect(f.send.mock.calls[1][0]).toMatchObject({ mapId: "moonfen", count: 1, sequence: 1n });
});
it("bounds a stalled acknowledgement and retries its unchanged sequence", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    f.send.mockImplementationOnce(() => new Promise(() => {}));
    f.queue.record("cloudspire", "Spitter"); const pending = f.queue.flush();
    await vi.advanceTimersByTimeAsync(ENEMY_DEFEAT_BATCH_TIMEOUT_MS + 1);
    expect(await pending).toBe(false);
    await f.queue.flush();
    expect(f.send.mock.calls[1][0]).toEqual(f.send.mock.calls[0][0]);
  } finally { vi.useRealTimers(); }
});

it("waits for the next interval for kills arriving during an ordinary flush", async () => {
  const f = fixture(); let finish!: (ok: boolean) => void;
  f.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  f.queue.record("water_reach", "Spitter"); const pending = f.queue.flush();
  for (let i = 0; i < 20; i++) f.queue.record("water_reach", "Spitter");
  finish(true); await pending;
  expect(f.send).toHaveBeenCalledTimes(1);
  await f.queue.flush();
  expect(f.send.mock.calls[1][0]).toMatchObject({ count: 20, sequence: 2n });
});

it("a portal drain includes kills queued during an existing ordinary request", async () => {
  const f = fixture(); let finish!: (ok: boolean) => void;
  f.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  f.queue.record("water_reach", "Spitter"); void f.queue.flush();
  f.queue.record("water_reach", "Spitter"); const drain = f.queue.flush(true);
  finish(true); expect(await drain).toBe(true);
  expect(f.send).toHaveBeenCalledTimes(2);
});

it("sends species counts without any client stat totals, including maps without loot", async () => {
  const f = fixture();
  f.queue.record("endless_40", "site:0");
  f.queue.record("endless_40", "site:0");
  f.queue.record("endless_40", "site:7");
  await f.queue.flush();
  expect(f.send.mock.calls[0][0]).toMatchObject({ enemies: [{ enemy: "site:0", count: 2 }, { enemy: "site:7", count: 1 }] });
  expect(f.send.mock.calls[0][0]).not.toHaveProperty("progress");
});

it("does not let a rejected old-map report block current-map kills", async () => {
  const f = fixture();
  const requests: EnemyLootRequest[] = [];
  const queue = createRegularEnemyLootQueue({ ...f.options, send: async request => {
    requests.push(request);
    return request.mapId === "water_reach" ? "discard" : true;
  } });
  queue.record("water_reach", "old-species");
  queue.record("endless_40", "site:0");
  expect(await queue.flush(true)).toBe(true);
  expect(requests[1].sequence).toBe(1n);
  expect(requests[1].streamId).not.toBe(requests[0].streamId);
  expect(queue.hasPending()).toBe(false);
});

it('persists a throttle across refreshes and ignores repeated forced drains until retry is due', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const send = vi.fn(async (_r: EnemyLootRequest): Promise<boolean | 'throttled'> => 'throttled');
    let queue = createRegularEnemyLootQueue({ ...f.options, send });
    queue.record('water_reach', 'Spitter'); await queue.flush(true);
    const original = send.mock.calls[0][0];
    for (let i = 0; i < 10; i++) {
      queue = createRegularEnemyLootQueue({ ...f.options, send }); queue.begin();
      expect(await queue.flush(true)).toBe(false);
    }
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); send.mockResolvedValue(true);
    expect(await queue.flush(true)).toBe(true);
    expect(send.mock.calls[1][0]).toEqual(original);
  } finally { vi.useRealTimers(); }
});

it('holds full batches for the periodic save instead of sending during combat', async () => {
  const f = fixture();
  for (let i = 0; i < 250; i++) f.queue.record('water_reach', 'Spitter');
  expect(f.send).not.toHaveBeenCalled();
  await f.queue.flush();
  expect(f.send.mock.calls.map(([r]) => r.count)).toEqual([100, 100, 50]);
});

it('retries a boss reward after a failed send without another kill or periodic save', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    f.send.mockResolvedValueOnce(false);
    f.queue.record('tutorial_forest', 'boss');
    expect(await f.queue.flush(true)).toBe(false);
    const first = f.send.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls[1][0]).toEqual(first);
    expect(f.queue.hasPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(f.send).toHaveBeenCalledTimes(2);
  } finally { f.queue.clear(); vi.useRealTimers(); }
});

it('retries a boss queued behind a failed ordinary batch in sequence', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    let finish!: (ok: boolean) => void;
    f.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.queue.record('tutorial_forest', 'Cindermaw'); const regular = f.queue.flush();
    f.queue.record('tutorial_forest', 'boss'); const boss = f.queue.flush(true);
    finish(false); await regular; expect(await boss).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.send.mock.calls.map(([r]) => r.sequence)).toEqual([1n, 1n, 2n]);
    expect(f.send.mock.calls[2][0].enemies).toEqual([{ enemy: 'boss', count: 1 }]);
    expect(f.queue.hasPending()).toBe(false);
  } finally { f.queue.clear(); vi.useRealTimers(); }
});

it('restores pending boss retries, backs off while offline, and cancels on sign-out', async () => {
  vi.useFakeTimers();
  const f = fixture(); let reload = f.queue;
  try {
    f.send.mockResolvedValue(false);
    f.queue.record('tutorial_forest', 'boss'); await f.queue.flush(true);
    f.queue.clear(); reload = createRegularEnemyLootQueue(f.options); reload.begin();
    await vi.advanceTimersByTimeAsync(2_000); expect(f.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999); expect(f.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(f.send).toHaveBeenCalledTimes(3);
    reload.clear(); await vi.advanceTimersByTimeAsync(300_000);
    expect(f.send).toHaveBeenCalledTimes(3);
  } finally { reload.clear(); vi.useRealTimers(); }
});

it("adopts a closed tab's untouched queue as its own stream and forgets it once sent", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const old = createRegularEnemyLootQueue({ ...f.options, tabId: () => "closed-tab", send: async () => false });
    old.record("water_reach", "Spitter"); old.record("water_reach", "Spitter");
    await old.flush();                                   // sealed, sent, never acknowledged
    const orphan = f.send.mock.calls.length;             // (the old tab used its own send)
    vi.advanceTimersByTime(ORPHAN_QUEUE_AFTER_MS + 1);
    const fresh = createRegularEnemyLootQueue(f.options); fresh.begin();
    expect(fresh.hasPending()).toBe(true);
    expect(await fresh.flush(true)).toBe(true);
    const sent = f.send.mock.calls.slice(orphan).map(([r]) => r);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ mapId: "water_reach", count: 2, sequence: 1n });
    expect(sent[0].streamId).not.toBe("");             // sent under the closed tab's own stream
    expect((f.options.storage as Storage).getItem("wildstat-enemy-defeats-v2:alice:closed-tab")).toBeNull();
    expect(fresh.hasPending()).toBe(false);
  } finally { vi.useRealTimers(); }
});
it("leaves a sibling queue alone while another tab is still touching it", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const live = createRegularEnemyLootQueue({ ...f.options, tabId: () => "other-live-tab", send: async () => false });
    live.record("water_reach", "Spitter"); await live.flush();
    vi.advanceTimersByTime(ORPHAN_QUEUE_AFTER_MS - 1);
    const fresh = createRegularEnemyLootQueue(f.options); fresh.begin();
    expect(fresh.hasPending()).toBe(false);
    expect(await fresh.flush(true)).toBe(true);
    expect(f.send).not.toHaveBeenCalled();
    expect((f.options.storage as Storage).getItem("wildstat-enemy-defeats-v2:alice:other-live-tab")).not.toBeNull();
  } finally { vi.useRealTimers(); }
});

it("charges each sealed report the game time simulated since the previous one", async () => {
  const f = fixture(); let simulated = 0;
  const queue = createRegularEnemyLootQueue({ ...f.options, simulatedSeconds: () => simulated });
  queue.begin();
  simulated = 10; queue.record("cloudspire", "Spitter");
  simulated = 30; await queue.flush();
  simulated = 45; queue.record("cloudspire", "Spitter");
  queue.begin();                                       // a reconnect keeps the unsealed batch's time
  simulated = 60; await queue.flush();
  // One flush sealing several batches splits the interval where the time went:
  // all 150 kills landed at 60 s, so the first hundred cover none of it and the
  // last batch the thirty idle seconds after.
  for (let i = 0; i < 150; i++) queue.record("cloudspire", "Spitter");
  simulated = 90.0004; await queue.flush(true);
  expect(f.send.mock.calls.map(([request]) => [request.count, request.simulatedMillis])).toEqual([[1, 30_000], [1, 30_000], [100, 0], [50, 30_000]]);
});
it("seals every pending batch of a flush together, so the ones behind the first are not sent on the round trip", async () => {
  const f = fixture(); let simulated = 0;
  // Each reply takes half a second of game time to come back.
  const send = vi.fn(async (_request: EnemyLootRequest) => { simulated += .5; return true as const; });
  const queue = createRegularEnemyLootQueue({ ...f.options, send, simulatedSeconds: () => simulated });
  queue.begin();
  // A fast client: 100 kills over the first 20 s, 50 more over the next 10.
  for (let i = 1; i <= 100; i++) { simulated = i * .2; queue.record("cloudspire", "Spitter"); }
  for (let i = 1; i <= 50; i++) { simulated = 20 + i * .2; queue.record("cloudspire", "Spitter"); }
  await queue.flush(true);
  // The second batch keeps its own ten seconds, not the half second it waited behind the first.
  expect(send.mock.calls.map(([request]) => [request.count, request.simulatedMillis])).toEqual([[100, 20_000], [50, 10_000]]);
});
it("keeps a reloaded page's unsent kills on the time the earlier page recorded", async () => {
  const f = fixture(); let simulated = 0;
  const closed = createRegularEnemyLootQueue({ ...f.options, send: async () => false, simulatedSeconds: () => simulated });
  closed.begin();
  simulated = 5; closed.record("cloudspire", "Spitter");
  simulated = 20; await closed.flush();                // sealed at 20 s, never acknowledged
  simulated = 32; closed.record("cloudspire", "Spitter");
  simulated = 40; closed.record("moonfen", "Spitter"); // a second unsealed batch holds only its own share
  simulated = 3;                                       // the reloaded page's clock starts again
  const reload = createRegularEnemyLootQueue({ ...f.options, simulatedSeconds: () => simulated });
  reload.begin();
  simulated = 4; reload.record("cloudspire", "Spitter");
  simulated = 13; await reload.flush(true);
  expect(f.send.mock.calls.map(([request]) => [request.mapId, request.count, request.simulatedMillis])).toEqual([
    ["cloudspire", 1, 20_000], ["cloudspire", 1, 12_000], ["moonfen", 1, 8_000], ["cloudspire", 1, 10_000],
  ]);
});
it("reads batches saved before simulated time existed as unknown and rejects a corrupt one", async () => {
  const f = fixture(); const storage = f.options.storage as Storage;
  const key = "wildstat-enemy-defeats-v2:alice:tab";
  const legacy = { sequence: 1, mapId: "cloudspire", count: 1, sealed: true, enemies: [{ enemy: "Spitter", count: 1 }] };
  storage.setItem(key, JSON.stringify({ streamId: "legacy", nextSequence: 2, batches: [legacy] }));
  const queue = createRegularEnemyLootQueue({ ...f.options, simulatedSeconds: () => 50 });
  queue.begin(); await queue.flush();
  expect(f.send.mock.calls[0][0]).toMatchObject({ streamId: "legacy", simulatedMillis: 0 });
  storage.setItem(key, JSON.stringify({ streamId: "corrupt", nextSequence: 2, batches: [{ ...legacy, simulatedMillis: -1 }] }));
  const corrupt = createRegularEnemyLootQueue(f.options);
  corrupt.begin();
  expect(corrupt.hasPending()).toBe(false);
});
it("sends an adopted orphan with its own page's time, leaving this page's clock alone", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(); let simulated = 0;
    const old = createRegularEnemyLootQueue({ ...f.options, tabId: () => "closed-tab", send: async () => false, simulatedSeconds: () => simulated });
    old.begin();
    simulated = 7; old.record("water_reach", "Spitter");
    vi.advanceTimersByTime(ORPHAN_QUEUE_AFTER_MS + 1);
    simulated = 2;
    const fresh = createRegularEnemyLootQueue({ ...f.options, simulatedSeconds: () => simulated });
    fresh.begin();
    simulated = 6; fresh.record("moonfen", "Spitter");
    await fresh.flush(true);
    expect(f.send.mock.calls.map(([request]) => [request.mapId, request.simulatedMillis])).toEqual([["water_reach", 7_000], ["moonfen", 4_000]]);
  } finally { vi.useRealTimers(); }
});
it("does not charge a report for game time with no kills in it", async () => {
  const f = fixture(); let simulated = 0;
  const queue = createRegularEnemyLootQueue({ ...f.options, simulatedSeconds: () => simulated });
  queue.begin();
  // Ten minutes in menus and at Home, or waiting while another device held
  // the session: the game ran the whole time and no kill was made.
  simulated = 600; queue.record("cloudspire", "Spitter");
  simulated = 610; queue.record("cloudspire", "Spitter");
  simulated = 630; await queue.flush(true);
  // Charged from half a minute before the first kill, not from the page's start.
  simulated = 1_500; queue.record("cloudspire", "Spitter");
  simulated = 1_510; await queue.flush(true);
  expect(f.send.mock.calls.map(([request]) => request.simulatedMillis)).toEqual([60_000, 40_000]);
});
it("starts a character's report time at its own begin, not at another character's last report", async () => {
  const f = fixture(); let simulated = 0;
  const queue = createRegularEnemyLootQueue({ ...f.options, simulatedSeconds: () => simulated });
  queue.begin();
  simulated = 5; queue.record("cloudspire", "Spitter");
  simulated = 10; await queue.flush(true);
  simulated = 200; f.identity("bob"); queue.begin();
  simulated = 205; queue.record("cloudspire", "Spitter");
  simulated = 206; await queue.flush(true);
  expect(f.send.mock.calls.map(([request]) => request.simulatedMillis)).toEqual([10_000, 6_000]);
});
it("stops a drain a couple of batches past where it started, however fast kills keep landing", async () => {
  const f = fixture();
  // Every report's round trip sees another kill land, as on a fast farm.
  let queue!: ReturnType<typeof createRegularEnemyLootQueue>;
  const send = vi.fn(async (_request: EnemyLootRequest) => { queue.record("cloudspire", "Spitter"); return true as const; });
  queue = createRegularEnemyLootQueue({ ...f.options, send });
  queue.begin();
  queue.record("cloudspire", "Spitter");
  expect(await queue.flush(true)).toBe(true);
  expect(send).toHaveBeenCalledTimes(1 + DRAIN_EXTRA_BATCHES);
  expect(queue.hasPending()).toBe(true);   // the latest kill waits for the next report
});
