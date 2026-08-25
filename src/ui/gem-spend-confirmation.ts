/** Consistent exact-cost copy for every player-initiated Gem debit. */
export function gemSpendConfirmationText(action: string, cost: bigint) {
  const currency = cost === 1n ? "Gem" : "Gems";
  return `Spend ${cost} ${currency} to ${action}?`;
}
