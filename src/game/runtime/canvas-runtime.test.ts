import { describe, expect, it } from "vitest";
import { gameplayBottomInset } from "./canvas-runtime";

describe("gameplay canvas bottom inset", () => {
  it("reserves only the toolbar so compact chat overlays the world", () => {
    expect(gameplayBottomInset(64)).toBe(64);
  });
});
