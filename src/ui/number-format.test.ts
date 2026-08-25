import { describe, expect, it } from "vitest";
import { formatCompactNumber, formatGemAmount } from "./number-format";

describe("compact number formatting", () => {
  it("keeps trailing zeroes through the compact range", () => {
    expect(formatCompactNumber(5_000)).toBe("5.00k");
    expect(formatCompactNumber(5_000_000)).toBe("5.00m");
    expect(formatCompactNumber(28_100)).toBe("28.1k");
    expect(formatCompactNumber(100_000)).toBe("100k");
    expect(formatCompactNumber(1e33)).toBe("1.00dc");
    expect(formatCompactNumber(1e36)).toBe("1.00ud");
  });
});

describe("Gem amount formatting", () => {
  it("keeps the complete whole-number balance", () => {
    expect(formatGemAmount(0n, "en-US")).toBe("0");
    expect(formatGemAmount(12_345_678n, "en-US")).toBe("12,345,678");
  });
});
