import { expect, it, vi } from "vitest";
import { createRegularEnemyLootQueue, ENEMY_DEFEAT_BATCH_TIMEOUT_MS, ORPHAN_QUEUE_AFTER_MS, type EnemyLootRequest } from "./regular-enemy-loot-queue";
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
