import { formatCompactNumber, formatRate } from "../../shared/compact-number";

export { formatCompactNumber, formatRate };

/** Paid-currency balances remain exact instead of using compact suffixes. */
export function formatGemAmount(value: bigint, locales?: Intl.LocalesArgument) {
  return new Intl.NumberFormat(locales, { maximumFractionDigits: 0 }).format(value);
}
