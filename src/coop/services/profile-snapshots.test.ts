import { afterEach, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { PROFILE_SNAPSHOT_MISSING_RETRY_MS, PROFILE_SNAPSHOT_REFRESH_MS, createProfileSnapshots } from "./profile-snapshots";

afterEach(() => vi.useRealTimers());
const identity = (n: number) => Identity.fromString(n.toString(16).padStart(64, "0"));
const hex = (n: number) => identity(n).toHexString();
const row = (n: number, headItem = "basic_paper_hat") =>
  ({ identity: identity(n), skinTone: 4, headItem, chestItem: "", feetItem: "", rightHandItem: "", leftHandItem: "", takenAt: 0 });

function fixture() {
  vi.useFakeTimers();
  let rows: ReturnType<typeof row>[] = [];
  const requests: { apply(): void; fail(): void; count: number; unsubscribe: ReturnType<typeof vi.fn> }[] = [];
  const changed = vi.fn();
  const connection = { isActive: true, db: { playerProfileSnapshot: { iter: () => rows } },
    subscriptionBuilder() {
      let applied = () => {}, error = () => {}, ready = false, ended = false;
      const unsubscribe = vi.fn(() => { if (!ready) throw Error("Pending subscription"); ended = true; rows = []; });
      const builder = {
        onApplied(fn: () => void) { applied = fn; return builder; },
        onError(fn: () => void) { error = fn; return builder; },
        subscribe(queries: unknown[]) {
          requests.push({ apply() { ready = true; applied(); }, fail: () => { ended = true; error(); }, count: queries.length, unsubscribe });
          return { isActive: () => ready && !ended, isEnded: () => ended, unsubscribe };
        },
      };
      return builder;
    },
  };
  const snapshots = createProfileSnapshots({ connection: () => connection, changed } as never);
  return { snapshots, requests, changed, rows(value: typeof rows) { rows = value; } };
}

it("asks once per player in one batch, keeps the looks after releasing the rows, and says when they moved", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) { expect(f.snapshots.look(hex(1))).toBeUndefined(); f.snapshots.look(hex(2)); }
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests).toHaveLength(1); expect(f.requests[0].count).toBe(2);
  f.rows([row(1)]);
  f.requests[0].apply();
  expect(f.requests[0].unsubscribe).toHaveBeenCalledOnce();
  expect(f.snapshots.look(hex(1))).toMatchObject({ skinTone: 4, headItem: "basic_paper_hat" });
  expect(f.snapshots.look(hex(2))).toBeUndefined();
  expect(f.changed).toHaveBeenCalledOnce();
  expect(f.snapshots.revision()).toBe(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests).toHaveLength(1);
});

it("bounds a batch to fifty players and fetches the rest after it", async () => {
  const f = fixture();
  for (let i = 1; i <= 61; i++) f.snapshots.look(hex(i));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests.map(request => request.count)).toEqual([50]);
  f.requests[0].apply();
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests.map(request => request.count)).toEqual([50, 11]);
});

it("checks a found look again after five minutes and a missing one after a minute, so a retake spreads", async () => {
  const f = fixture();
  f.snapshots.look(hex(1)); f.snapshots.look(hex(2));
  await vi.advanceTimersByTimeAsync(0);
  f.rows([row(1)]); f.requests[0].apply();
  await vi.advanceTimersByTimeAsync(PROFILE_SNAPSHOT_MISSING_RETRY_MS);
  f.snapshots.look(hex(1)); f.snapshots.look(hex(2));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests[1].count).toBe(1);
  f.requests[1].apply();
  await vi.advanceTimersByTimeAsync(PROFILE_SNAPSHOT_REFRESH_MS);
  expect(f.snapshots.look(hex(1))?.headItem).toBe("basic_paper_hat");
  await vi.advanceTimersByTimeAsync(0);
  f.rows([row(1, "samurai_hat")]); f.requests.at(-1)!.apply();
  expect(f.snapshots.look(hex(1))?.headItem).toBe("samurai_hat");
  expect(f.snapshots.revision()).toBe(2);
});

it("fetches the local player's again after a retake, even while an older fetch is in flight", async () => {
  const f = fixture();
  f.snapshots.look(hex(1));
  await vi.advanceTimersByTimeAsync(0);
  f.snapshots.refresh(hex(1));
  f.rows([row(1)]); f.requests[0].apply();
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests).toHaveLength(2);
  f.rows([row(1, "samurai_hat")]); f.requests[1].apply();
  expect(f.snapshots.look(hex(1))?.headItem).toBe("samurai_hat");
});

it("keeps what it knew when a fetch fails, and forgets everything with the session", async () => {
  const f = fixture();
  f.snapshots.look(hex(1));
  await vi.advanceTimersByTimeAsync(0);
  f.rows([row(1)]); f.requests[0].apply();
  f.snapshots.refresh(hex(1));
  await vi.advanceTimersByTimeAsync(0);
  f.requests[1].fail();
  expect(f.snapshots.look(hex(1))?.headItem).toBe("basic_paper_hat");
  f.snapshots.clear();
  expect(f.snapshots.revision()).toBe(2);
  f.snapshots.look(hex(1));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.requests).toHaveLength(3);
});
