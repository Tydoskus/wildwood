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
  it("keeps the account screen lightweight and hands over to gameplay once", () => {
    const s = setup();
    s.controller.refresh(false);
    expect(s.requests.map(r => r.scope)).toEqual(["account"]);
    s.requests[0].applied();
    expect(s.ready).toHaveBeenCalledTimes(1);
    s.controller.refresh(true);
    expect(s.requests.map(r => r.scope)).toEqual(["account"]);
    s.requests[0].end();
    expect(s.requests[1].scope).toBe("game");
    s.requests[1].applied();
    expect(s.ready).toHaveBeenCalledTimes(2);
    expect(s.loading).toHaveBeenCalledTimes(2);
    s.controller.refresh(true);
    expect(s.requests).toHaveLength(2);
  });

  it("ignores late hydration after a disconnect", () => {
    const s = setup();
    s.controller.refresh(false);
    s.disconnect();
    s.requests[0].applied();
    expect(s.ready).not.toHaveBeenCalled();
    expect(s.hydrate).not.toHaveBeenCalled();
  });
});
