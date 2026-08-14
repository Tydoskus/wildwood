import { describe, expect, it } from "vitest";
import { formatCompactNumber } from "./number-format";

describe("compact number formatting", () => {
  it("keeps trailing zeroes through the compact range", () => {
    expect(formatCompactNumber(5_000)).toBe("5.00k");
    expect(formatCompactNumber(5_000_000)).toBe("5.00m");
    expect(formatCompactNumber(28_100)).toBe("28.1k");
    expect(formatCompactNumber(100_000)).toBe("100k");
  });
});
