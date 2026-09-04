import { describe, expect, it, vi } from "vitest";
import { createSessionSubscriptions, type SessionSubscriptionScope } from "./session-subscriptions";

function setup() {
  let current = true;
  const requests: { scope: SessionSubscriptionScope; applied: () => void; end: () => void; ended: boolean }[] = [];
  const ready = vi.fn();
  const loading = vi.fn();
  const hydrate = vi.fn();
  const error = vi.fn();
  const controller = createSessionSubscriptions({
    isCurrent: () => current, ready, loading, hydrate, error,
    subscribe(scope, applied) {
      const request = { scope, applied, end: () => {}, ended: false };
      requests.push(request);
      return {
        unsubscribe: () => {}, isActive: () => true, isEnded: () => request.ended,
        unsubscribeThen(callback) { request.end = () => { request.ended = true; callback(undefined); }; },
      };
    },
  });
  return { controller, requests, ready, loading, hydrate, error, disconnect: () => { current = false; } };
}

describe("session subscription stages", () => {
  it("keeps the account screen lightweight and waits for both gameplay and boss hydration", () => {
    const s = setup();
    s.controller.refresh(false, "tutorial_forest");
    expect(s.requests.map(r => r.scope)).toEqual(["account"]);
    s.requests[0].applied();
    expect(s.ready).toHaveBeenCalledTimes(1);
    s.controller.refresh(true, "beginner_desert");
    expect(s.requests.map(r => r.scope)).toEqual(["account", "boss:beginner_desert"]);
    s.requests[0].end();
    expect(s.requests[2].scope).toBe("game");
    s.requests[2].applied();
    expect(s.ready).toHaveBeenCalledTimes(1);
    s.requests[1].applied();
    expect(s.ready).toHaveBeenCalledTimes(2);
    expect(s.loading).toHaveBeenCalledTimes(2);
  });

  it("coalesces rapid map changes and ends the previous query before subscribing again", () => {
    const s = setup();
    s.controller.refresh(true, "tutorial_forest");
    s.requests[0].applied();
    s.controller.refresh(true, "beginner_desert");
    s.controller.refresh(true, "intermediate_snowlands");
    expect(s.requests).toHaveLength(2);
    s.requests[1].applied();
    expect(s.requests).toHaveLength(2);
    s.requests[1].end();
    expect(s.requests[2].scope).toBe("boss:intermediate_snowlands");
    s.requests[2].applied();
    expect(s.ready).toHaveBeenCalledTimes(1);
    s.controller.refresh(true, "advanced_lava_wastes");
    s.requests[2].end();
    s.requests[3].applied();
    expect(s.ready).toHaveBeenCalledTimes(1);
    expect(s.loading).toHaveBeenCalledTimes(1);
  });

  it("ignores late hydration after a disconnect", () => {
    const s = setup();
    s.controller.refresh(false, "tutorial_forest");
    s.disconnect();
    s.requests[0].applied();
    expect(s.ready).not.toHaveBeenCalled();
    expect(s.hydrate).not.toHaveBeenCalled();
  });
});
