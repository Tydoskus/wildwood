import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeathScreenController, formatDeathCountdown } from "./death-screen-controller";

describe("death screen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses lowercase return-to-spawn copy", () => {
    expect(formatDeathCountdown(5_000)).toBe("returning to spawn in 5");
    expect(formatDeathCountdown(1)).toBe("returning to spawn in 1");
    expect(formatDeathCountdown(0)).toBe("returning to spawn");
  });

  it("returns to spawn automatically after five seconds", () => {
    const screen = { hidden: true } as HTMLElement;
    const countdown = { textContent: "" } as HTMLElement;
    const onRespawn = vi.fn();
    const controller = createDeathScreenController({
      screen,
      countdown,
      onRespawn,
      clock: {
        now: () => Date.now(),
        setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
        clearTimeout: (timer) => globalThis.clearTimeout(timer),
      },
    });

    controller.show();
    expect(screen.hidden).toBe(false);
    expect(countdown.textContent).toBe("returning to spawn in 5");

    vi.advanceTimersByTime(1_000);
    expect(countdown.textContent).toBe("returning to spawn in 4");
    expect(onRespawn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4_000);
    expect(onRespawn).toHaveBeenCalledOnce();
  });

  it("cancels automatic respawn when hidden", () => {
    const screen = { hidden: true } as HTMLElement;
    const onRespawn = vi.fn();
    const controller = createDeathScreenController({
      screen,
      countdown: { textContent: "" } as HTMLElement,
      onRespawn,
      clock: {
        now: () => Date.now(),
        setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
        clearTimeout: (timer) => globalThis.clearTimeout(timer),
      },
    });

    controller.show();
    controller.hide();
    vi.advanceTimersByTime(5_000);

    expect(screen.hidden).toBe(true);
    expect(onRespawn).not.toHaveBeenCalled();
  });
});
