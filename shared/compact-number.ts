// The one compact formatter, shared so the server can tell when a number a
// player sees would actually change.
// Short-scale names up to vigintillion (1e63); past that the suffix form switches to scientific notation.
export const COMPACT_UNITS = ["", "k", "m", "b", "t", "qd", "qn", "sx", "sp", "oc", "no", "dc", "ud", "dd", "td", "qad", "qid", "sxd", "spd", "ocd", "nod", "vg"] as const;

export type NumberNotation = "suffix" | "scientific";
// A display preference, set only by the client. The server never sets it, so
// compactNumberChanged below always compares the suffix form.
let notation: NumberNotation = "suffix";
export function setNumberNotation(next: NumberNotation) { notation = next === "scientific" ? "scientific" : "suffix"; }

/** Formats compact values as three significant digits: 841, 5.00m, 28.1k; or 5.00e6 in scientific notation. */
export function formatCompactNumber(value: number): string {
  return notation === "scientific" ? formatScientificNumber(value) : formatSuffixNumber(value);
}

/** Three significant digits as a power of ten from 1,000 up: 841, 5.00e6, 2.81e4. */
export function formatScientificNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute < 1_000) return `${sign}${Math.round(absolute)}`;
  let exponent = Math.floor(Math.log10(absolute));
  let mantissa = Number((absolute / 10 ** exponent).toFixed(2));
  // 9.996e5 rounds to 10.00; carry it to 1.00e6.
  if (mantissa >= 10) { exponent += 1; mantissa = Number((absolute / 10 ** exponent).toFixed(2)); }
  return `${sign}${mantissa.toFixed(2)}e${exponent}`;
}

/**
 * A per-second rate with three significant digits at every size: 0.50/s,
 * 12.5/s, 841/s, then the compact form.
 */
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute >= 999.5) return formatCompactNumber(value);
  return value.toFixed(absolute >= 99.95 ? 0 : absolute >= 9.995 ? 1 : 2);
}

/** The suffix form: 841, 5.00m, 28.1k; beyond the last suffix, 1.23e66. */
export function formatSuffixNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 999.5 * 1_000 ** (COMPACT_UNITS.length - 1)) return formatScientificNumber(value);
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

/**
 * Whether a power change would show on the plate above a player. Other players
 * only ever see the compact form, so a change under its last digit is one
 * nobody can see and not worth broadcasting to everyone on the map.
 */
export function compactNumberChanged(previous: number, next: number) {
  return formatSuffixNumber(previous) !== formatSuffixNumber(next);
}

/** A multiplier as players read it, up to two decimals: ×1.23, ×1.5, ×2. */
export function formatMultiplier(factor: number, decimals = 2): string {
  if (!Number.isFinite(factor)) return "×1";
  return Math.abs(factor) >= 1_000 ? `×${formatCompactNumber(factor)}` : `×${Number(factor.toFixed(decimals))}`;
}

/** A percent bonus as the multiplier it comes to: 23.2 → ×1.23, -15 → ×0.85. */
export const formatPercentMultiplier = (percent: number, decimals = 2) => formatMultiplier(1 + percent / 100, decimals);

/** A multiplier that should not read as no change: a third decimal when two would show ×1 (×1.004). */
export function formatMultiplierChange(factor: number): string {
  const shown = formatMultiplier(factor);
  return shown === "×1" && factor !== 1 ? formatMultiplier(factor, 3) : shown;
}
