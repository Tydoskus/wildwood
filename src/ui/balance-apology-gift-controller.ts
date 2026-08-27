type AcknowledgeResult = { ok: boolean; error?: string } | undefined;

type BalanceApologyGiftElements = {
  overlay: HTMLElement;
  title: HTMLElement;
  continueButton: HTMLButtonElement;
};

type BalanceApologyGiftHooks = {
  canShow: () => boolean;
  amount: () => bigint;
  acknowledge: () => Promise<AcknowledgeResult>;
  setPaused: (paused: boolean) => void;
  showMessage: (message: string, color: string) => void;
  afterDismiss: () => void;
};

export function balanceApologyGiftShouldShow(canShow: boolean, amount: bigint, dismissed = false) {
  return canShow && amount > 0n && !dismissed;
}

/** Presents the already-credited one-time apology until the player acknowledges it. */
export function createBalanceApologyGiftController(elements: BalanceApologyGiftElements, hooks: BalanceApologyGiftHooks) {
  let pending = false;
  let dismissed = false;
  let visible = false;

  function refresh() {
    const amount = hooks.amount();
    if (amount <= 0n && !pending) dismissed = false;
    const nextVisible = balanceApologyGiftShouldShow(hooks.canShow(), amount, dismissed);
    elements.overlay.hidden = !nextVisible;
    elements.overlay.setAttribute("aria-busy", String(pending));
    elements.title.textContent = `+${amount.toString()} GEMS`;
    elements.continueButton.disabled = pending;
    elements.continueButton.textContent = pending ? "CLOSING…" : "CONTINUE";
    hooks.setPaused(nextVisible);
    if (nextVisible && !visible) requestAnimationFrame(() => elements.continueButton.focus());
    visible = nextVisible;
  }

  async function acknowledge() {
    if (pending || dismissed || hooks.amount() <= 0n) return;
    pending = true;
    refresh();
    const result = await hooks.acknowledge();
    pending = false;
    if (!result?.ok) {
      hooks.showMessage(result?.error ?? "GIFT UNAVAILABLE", "#ff9b91");
      refresh();
      return;
    }
    dismissed = true;
    refresh();
    hooks.afterDismiss();
  }

  elements.continueButton.addEventListener("click", () => { void acknowledge(); });
  refresh();

  return {
    refresh,
    isOpen: () => visible,
  };
}
