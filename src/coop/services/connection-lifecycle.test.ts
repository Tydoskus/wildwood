import { describe, expect, it, vi } from "vitest";
import { createConnectionLifecycle } from "./connection-lifecycle";

describe("connection lifecycle", () => {
  it("times out only the currently active bounded phase", () => {
    let now = 10;
    let nextTimer = 0;
    const callbacks = new Map<number, () => void>();
    const onTimeout = vi.fn();
    const lifecycle = createConnectionLifecycle({
      now: () => now,
      scheduleTimer: (callback) => {
        nextTimer += 1;
        callbacks.set(nextTimer, callback);
        return nextTimer;
      },
      cancelTimer: (timer) => { callbacks.delete(timer); },
      onTimeout,
    });

    lifecycle.beginAttempt(15_000);
    const staleConnectingTimer = callbacks.get(1);
    now = 25;
    lifecycle.transition("preparing-session", 20_000);
    staleConnectingTimer?.();
    expect(onTimeout).not.toHaveBeenCalled();

    callbacks.get(2)?.();
    expect(onTimeout).toHaveBeenCalledWith("preparing-session");
  });

  it("records stage, attempt, and elapsed time for diagnostics", () => {
    let now = 100;
    const issues: unknown[] = [];
    const lifecycle = createConnectionLifecycle({
      now: () => now,
      scheduleTimer: () => 1,
      cancelTimer: () => {},
      onTimeout: () => {},
      onIssue: (issue) => issues.push(issue),
    });

    lifecycle.beginAttempt(15_000);
    now = 350;
    lifecycle.transition("hydrating", 20_000);
    now = 900;
    const issue = lifecycle.fail("subscription-error", "World sync failed · retrying");

    expect(issue).toMatchObject({ phase: "hydrating", attempt: 1, elapsedMs: 550 });
    expect(lifecycle.snapshot()).toMatchObject({ phase: "retrying", attempt: 1, issue });
    expect(issues).toEqual([issue]);
  });

  it("clears failures and consecutive attempt count once ready", () => {
    const lifecycle = createConnectionLifecycle({
      now: () => 0,
      scheduleTimer: () => 1,
      cancelTimer: () => {},
      onTimeout: () => {},
    });
    lifecycle.beginAttempt(100);
    lifecycle.fail("connection-error", "Unavailable");
    lifecycle.ready();
    expect(lifecycle.snapshot()).toMatchObject({ phase: "ready", attempt: 0, issue: null });
  });
});
