import { describe, expect, it } from "vitest";
import { connectionGateState } from "./connection-gate-state";

describe("connection gate state", () => {
  it("labels a transient mobile disconnect as reconnecting, not updating", () => {
    expect(connectionGateState(false, false, true)).toEqual({
      updating: false,
      reconnecting: true,
      quiet: false,
    });
  });

  it("keeps the gate up but quiet for a phone that returns within the window", () => {
    expect(connectionGateState(false, false, true, true)).toMatchObject({ reconnecting: true, quiet: true });
    expect(connectionGateState(false, false, false, true)).toMatchObject({ reconnecting: false, quiet: false });
  });

  it("reserves the updating gate for a confirmed protocol mismatch", () => {
    expect(connectionGateState(true, true, true)).toEqual({
      updating: true,
      reconnecting: false,
      quiet: false,
    });
  });
});
