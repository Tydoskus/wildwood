import { afterEach, expect, it, vi } from "vitest";
import { createWakeRecovery, TAB_AWAY_GRACE_MS } from "./wake-recovery";
function fixture() {
  vi.useFakeTimers();
  const conn = { isActive: true, reducers: { resumeSession: vi.fn(async () => {}) } };
  const options = { now: () => Date.now(), hidden: () => false, blocked: () => false, connecting: () => false,
    connection: () => conn, activityAge: () => 100000,
    refreshWatchdog: vi.fn(), clearOverlay: vi.fn(), clearNetworkOverlay: vi.fn(), changed: vi.fn(), touchActivity: vi.fn(),
    restart: vi.fn(), failure: vi.fn(), diagnostic: vi.fn(),
    schedule: (callback: () => void, delay: number) => setTimeout(callback, delay) as unknown as number,
    cancelTimer: (timer: number) => clearTimeout(timer) };
  return { conn, options, recovery: createWakeRecovery(options) };
}
afterEach(() => vi.useRealTimers());
it("keeps a quiet but connected session for brief switches and duplicate focus events", async () => {
  const f = fixture();
  f.recovery.resume(false, 4000); f.recovery.resume();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.conn.reducers.resumeSession).not.toHaveBeenCalled(); expect(f.options.restart).not.toHaveBeenCalled();
  expect(f.options.diagnostic).toHaveBeenCalledWith("wake-resume", "short-return-kept-connection", 4000);
});
it("grace never delays recovery for a genuinely closed socket", () => {
  const f = fixture(); f.conn.isActive = false; f.recovery.resume(false, 1000);
  expect(f.options.restart).toHaveBeenCalledOnce();
});
it("checks a long absence once and keeps the connection when its session responds", async () => {
  const f = fixture(); f.recovery.resume(false, TAB_AWAY_GRACE_MS); f.recovery.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(f.conn.reducers.resumeSession).toHaveBeenCalledOnce(); expect(f.options.restart).not.toHaveBeenCalled();
  expect(f.options.touchActivity).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("allows a few seconds for a waking session, then bounds recovery", async () => {
  const f = fixture(); f.conn.reducers.resumeSession.mockImplementation(() => new Promise(() => {}));
  f.recovery.resume(false, 30000); await vi.advanceTimersByTimeAsync(3000);
  expect(f.options.restart).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(2000);
  expect(f.options.restart).toHaveBeenCalledOnce();
  expect(f.options.diagnostic).toHaveBeenLastCalledWith("wake-reconnect", "resume-check-timeout", 30000);
});
it("does not let a superseded probe restart a replacement connection", async () => {
  const f = fixture(); let reject!: (e: Error) => void;
  f.conn.reducers.resumeSession.mockImplementation(() => new Promise((_, no) => { reject = no; }));
  f.recovery.resume(false, 30000); await vi.advanceTimersByTimeAsync(0); f.recovery.cancel();
  reject(new Error("old failure")); await vi.advanceTimersByTimeAsync(6000);
  expect(f.options.restart).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("respects a real account conflict without looping reconnects", async () => {
  const f = fixture(); f.conn.reducers.resumeSession.mockRejectedValue(new Error("Wildstat is active in another tab."));
  f.recovery.resume(false, 30000); await vi.advanceTimersByTimeAsync(0);
  expect(f.options.failure).toHaveBeenCalledOnce(); expect(f.options.restart).not.toHaveBeenCalled();
});
it("still repairs back-forward-cache restores even within the grace period", () => {
  const f = fixture(); f.recovery.resume(true, 1000);
  expect(f.options.restart).toHaveBeenCalledOnce(); expect(f.conn.reducers.resumeSession).not.toHaveBeenCalled();
});
it("does not perform wake work while hidden or blocked", () => {
  const f = fixture(); f.options.hidden = () => true; f.recovery.resume(false, 30000);
  expect(f.options.restart).not.toHaveBeenCalled(); expect(f.conn.reducers.resumeSession).not.toHaveBeenCalled();
  f.options.blocked = () => true; f.recovery.resume(); expect(f.options.clearOverlay).toHaveBeenCalledOnce();
});
