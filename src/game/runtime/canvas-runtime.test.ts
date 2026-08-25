import { describe, expect, it } from "vitest";
import { gameplayBottomInset } from "./canvas-runtime";

describe("gameplay canvas bottom inset", () => {
  it("reserves the fixed compact chat height above the toolbar", () => {
    expect(gameplayBottomInset(64, 82, true)).toBe(146);
  });

  it("does not reserve chat space while chat is hidden or fullscreen", () => {
    expect(gameplayBottomInset(64, 82, false)).toBe(64);
  });
});
