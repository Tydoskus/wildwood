import { afterEach, expect, it } from "vitest";
import { compactNumberChanged, formatCompactNumber, formatRate, formatScientificNumber, setNumberNotation } from "./compact-number";

afterEach(() => setNumberNotation("suffix"));

it("writes three significant digits as a power of ten, carrying a rounded 10.00", () => {
  expect(formatScientificNumber(841)).toBe("841");
  expect(formatScientificNumber(28_100)).toBe("2.81e4");
  expect(formatScientificNumber(999_600)).toBe("1.00e6");
  expect(formatScientificNumber(-6.43e25)).toBe("-6.43e25");
  expect(formatScientificNumber(Infinity)).toBe("0");
});

it("follows the notation setting, while the server's change check stays on suffixes", () => {
  setNumberNotation("scientific");
  expect(formatCompactNumber(1.73e14)).toBe("1.73e14");
  expect(compactNumberChanged(1_000_000, 1_001_000)).toBe(false);
  expect(compactNumberChanged(1_000_000, 1_010_000)).toBe(true);
});

it("gives a rate three significant digits at every size", () => {
  expect(formatRate(0.5)).toBe("0.50");
  expect(formatRate(12.54)).toBe("12.5");
  expect(formatRate(841.3)).toBe("841");
  expect(formatRate(523_401.3)).toBe("523k");
  expect(formatRate(2.4e7)).toBe("24.0m");
});

it("names numbers past undecillion, then falls back to scientific notation", () => {
  expect(formatCompactNumber(4.2e39)).toBe("4.20dd");
  expect(formatCompactNumber(1.5e63)).toBe("1.50vg");
  expect(formatCompactNumber(2.5e70)).toBe("2.50e70");
  expect(formatCompactNumber(1e300)).toBe("1.00e300");
});
