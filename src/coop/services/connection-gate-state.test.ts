import { describe, expect, it } from "vitest";
import { connectionGateState } from "./connection-gate-state";

describe("connection gate state", () => {
  it("labels a transient mobile disconnect as reconnecting, not updating", () => {
    expect(connectionGateState(false, false, true)).toEqual({
      updating: false,
      reconnecting: true,
    });
  });

  it("reserves the updating gate for a confirmed protocol mismatch", () => {
    expect(connectionGateState(true, true, true)).toEqual({
      updating: true,
      reconnecting: false,
    });
  });
});
