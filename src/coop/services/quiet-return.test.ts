import { afterEach, expect, it, vi } from "vitest";
import { createQuietReturn, QUIET_RETURN_ABSENCE_MS, QUIET_RETURN_BUDGET_MS } from "./quiet-return";

function fixture() {
  vi.useFakeTimers();
  const changed = vi.fn();
  const quiet = createQuietReturn({
    now: () => Date.now(), changed,
    schedule: (callback, delay) => setTimeout(callback, delay) as unknown as number,
    cancelTimer: timer => clearTimeout(timer),
  });
  return { quiet, changed };
}
afterEach(() => vi.useRealTimers());

it("is not quiet for a disconnect while the player is watching", () => {
  expect(fixture().quiet.active()).toBe(false);
});

it("covers a phone that closed the socket in the background, and the reconnect after it", () => {
  const f = fixture();
  f.quiet.hide();
  vi.advanceTimersByTime(QUIET_RETURN_ABSENCE_MS - 1_000);
  expect(f.quiet.active()).toBe(true);
  f.quiet.show();
  expect(f.quiet.active()).toBe(true);
  vi.advanceTimersByTime(QUIET_RETURN_BUDGET_MS - 1);
  expect(f.quiet.active()).toBe(true);
});

it("shows the full overlay once a quiet reconnect runs past its budget", () => {
  const f = fixture();
  f.quiet.hide(); vi.advanceTimersByTime(5_000); f.quiet.show();
  vi.advanceTimersByTime(QUIET_RETURN_BUDGET_MS);
  expect(f.quiet.active()).toBe(false);
  expect(f.changed).toHaveBeenCalledOnce();
});

it("treats an absence past the window as a long one, while away and on return", () => {
  const f = fixture();
  f.quiet.hide(); vi.advanceTimersByTime(QUIET_RETURN_ABSENCE_MS);
  expect(f.quiet.active()).toBe(false);
  f.quiet.show();
  expect(f.quiet.active()).toBe(false);
});

it("settles once the session is back, so a later drop is not hidden", () => {
  const f = fixture();
  f.quiet.hide(); f.quiet.show(); f.quiet.settle();
  expect(f.quiet.active()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the first hide time through duplicate hide and show events", () => {
  const f = fixture();
  f.quiet.hide(); vi.advanceTimersByTime(QUIET_RETURN_ABSENCE_MS - 1_000);
  f.quiet.hide(); vi.advanceTimersByTime(2_000);
  expect(f.quiet.active()).toBe(false);
  f.quiet.show(); f.quiet.show();
  expect(f.quiet.active()).toBe(false);
});
