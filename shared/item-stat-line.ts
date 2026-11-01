import { formatPercentMultiplier } from "./compact-number";

/** An item's stat line: core stats as a multiplier ("DAMAGE ×1.23"), move speed and skill chance as a percent ("MOVE SPEED +3%"). */
export function itemStatLine(label: string, percent: number, decimals = 2) {
  return label === "MOVE SPEED" || label === "SKILL CHANCE" ? `${label} +${percent}%` : `${label} ${formatPercentMultiplier(percent, decimals)}`;
}
