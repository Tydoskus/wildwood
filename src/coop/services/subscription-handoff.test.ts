import { describe, expect, it, vi } from "vitest";
import {
  startAfterSubscriptionEnds,
  unsubscribeIfActive,
  type ActiveSubscription,
} from "./subscription-handoff";

function subscription(active = true, ended = false) {
  let onEnd: (() => void) | null = null;
  const handle: ActiveSubscription = {
    unsubscribe: vi.fn(),
    unsubscribeThen: vi.fn((callback) => { onEnd = () => callback(undefined); }),
    isActive: () => active,
    isEnded: () => ended,
  };
  return { handle, end: () => onEnd?.() };
}

describe("subscription handoff", () => {
  it("does not start the replacement until unsubscribe is applied", () => {
    const previous = subscription();
    const start = vi.fn();
    const fail = vi.fn();

    startAfterSubscriptionEnds(previous.handle, start, fail);

    expect(previous.handle.unsubscribeThen).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    previous.end();
    expect(start).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
  });

  it("starts immediately when no previous subscription exists", () => {
    const start = vi.fn();
    startAfterSubscriptionEnds(null, start, vi.fn());
    expect(start).toHaveBeenCalledOnce();
  });

  it("only unsubscribes active handles", () => {
    const active = subscription(true, false);
    const pending = subscription(false, false);
    const ended = subscription(false, true);

    expect(unsubscribeIfActive(active.handle)).toBe(true);
    expect(unsubscribeIfActive(pending.handle)).toBe(false);
    expect(unsubscribeIfActive(ended.handle)).toBe(false);
    expect(active.handle.unsubscribe).toHaveBeenCalledOnce();
    expect(pending.handle.unsubscribe).not.toHaveBeenCalled();
    expect(ended.handle.unsubscribe).not.toHaveBeenCalled();
  });
});
