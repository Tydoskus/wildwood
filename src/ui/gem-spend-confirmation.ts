import type { ConfirmRequest } from "./confirm-dialog";

/** Consistent exact-cost copy for every player-initiated Gem debit. */
export function gemSpendConfirmationText(action: string, cost: bigint) {
  const currency = cost === 1n ? "Gem" : "Gems";
  return `Spend ${cost} ${currency} to ${action}?`;
}

const gems = (amount: bigint) => `${amount} ${amount === 1n ? "Gem" : "Gems"}`;

/**
 * The question plus the arithmetic behind it. A player deciding whether to
 * spend should not have to close the prompt to find out what they hold, so the
 * balance and what the spend leaves are on the prompt itself.
 */
export function gemSpendConfirmation(action: string, cost: bigint, balance: bigint): ConfirmRequest {
  return {
    message: gemSpendConfirmationText(action, cost),
    details: [
      { label: "Cost", value: gems(cost), kind: "cost" },
      { label: "Your Gems", value: gems(balance), kind: "balance" },
      { label: "After", value: gems(balance - cost < 0n ? 0n : balance - cost), kind: "after" },
    ],
  };
}
