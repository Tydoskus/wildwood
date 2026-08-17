const COMPACT_UNITS = ["", "k", "m", "b", "t", "qd", "qn", "sx", "sp", "oc", "no", "dc", "ud"] as const;

/** Formats compact values as three significant digits: 841, 5.00m, 28.1k. */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute < 1_000) return `${sign}${Math.round(absolute)}`;

  let unit = Math.min(Math.floor(Math.log10(absolute) / 3), COMPACT_UNITS.length - 1);
  let scaled = absolute / 1_000 ** unit;
  let decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  let rounded = Number(scaled.toFixed(decimals));
  if (rounded >= 1_000 && unit < COMPACT_UNITS.length - 1) {
    unit += 1;
    scaled = absolute / 1_000 ** unit;
    decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    rounded = Number(scaled.toFixed(decimals));
  }
  return `${sign}${rounded.toFixed(decimals)}${COMPACT_UNITS[unit]}`;
}
