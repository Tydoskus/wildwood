import { describe, expect, it } from "vitest";
import { researchDurationMs } from "./research";

describe("research timer curve", () => {
  it("starts short and caps at seventy-two hours", () => {
    expect(researchDurationMs(0)).toBe(15_000);
    expect(researchDurationMs(10)).toBeGreaterThan(60 * 60 * 1_000);
    expect(researchDurationMs(50)).toBe(72 * 60 * 60 * 1_000);
  });
});
