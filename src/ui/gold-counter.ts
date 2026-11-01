import { formatGemAmount } from "./number-format";

type GoldCounterElements = { hudGoldWallet: HTMLElement; hudGoldBalance: HTMLElement };
type GemCounterElements = { hudGemWallet: HTMLElement; hudGemBalance: HTMLElement };

/** Shows the account's gold in the HUD chip beside the gems; writes only when the number changed. */
export function refreshGoldCounter(elements: GoldCounterElements, gold: bigint) {
  const text = formatGemAmount(gold);
  if (elements.hudGoldBalance.textContent === text) return;
  elements.hudGoldBalance.textContent = text;
  elements.hudGoldWallet.setAttribute("aria-label", `${text} Gold`);
}

/** The gem chip and the gold chip beside it, each written only when its number changed. */
export function refreshWalletCounters(elements: GemCounterElements & GoldCounterElements, gems: bigint, gold: bigint) {
  const text = formatGemAmount(gems);
  if (elements.hudGemBalance.textContent !== text) {
    elements.hudGemBalance.textContent = text;
    elements.hudGemWallet.setAttribute("aria-label", `${text} Gems`);
  }
  refreshGoldCounter(elements, gold);
}
