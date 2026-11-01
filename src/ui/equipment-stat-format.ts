import { formatCompactNumber } from "./number-format";

/** At most one decimal, so small upgrades stay visible (+5 → +5.4); abbreviate large map-tier amounts. */
export function formatEquipmentAmount(value: number) {
  return Math.abs(value) < 1000 ? `${Number(value.toFixed(1))}` : formatCompactNumber(value);
}

/** A stat line's amount, with or without its percent sign ("Move Speed +3.04%" → "Move Speed +3%"); a multiplier ("Damage ×1.23") stays as it is. */
export function formatEquipmentStat(stat: string) {
  return stat.replace(/\+([\d.]+)(%?)$/, (_, value: string, sign: string) => `+${formatEquipmentAmount(Number(value))}${sign}`);
}
