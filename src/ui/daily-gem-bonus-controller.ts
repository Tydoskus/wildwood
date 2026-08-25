type ClaimResult = { ok: boolean; error?: string } | undefined;

type DailyGemBonusElements = {
  overlay: HTMLElement;
  claimButton: HTMLButtonElement;
};

type DailyGemBonusHooks = {
  canShow: () => boolean;
  claimable: () => boolean;
  claim: () => Promise<ClaimResult>;
  setPaused: (paused: boolean) => void;
  showMessage: (message: string, color: string) => void;
};

export function dailyGemBonusShouldShow(canShow: boolean, claimable: boolean, pending = false, celebrating = false) {
  return canShow && (claimable || pending || celebrating);
}

/** Blocking daily-reward presentation; eligibility and credit remain server-owned. */
export function createDailyGemBonusController(elements: DailyGemBonusElements, hooks: DailyGemBonusHooks) {
  let pending = false;
  let celebrating = false;
  let visible = false;
  let celebrationTimer: number | null = null;

  function refresh() {
    const nextVisible = dailyGemBonusShouldShow(hooks.canShow(), hooks.claimable(), pending, celebrating);
    elements.overlay.hidden = !nextVisible;
    elements.overlay.setAttribute("aria-busy", String(pending));
    elements.claimButton.disabled = pending || celebrating;
    elements.claimButton.textContent = celebrating ? "CLAIMED!" : pending ? "CLAIMING…" : "CLAIM";
    hooks.setPaused(nextVisible);
    if (nextVisible && !visible) requestAnimationFrame(() => elements.claimButton.focus());
    visible = nextVisible;
  }

  async function claim() {
    if (pending || celebrating || !hooks.claimable()) return;
    pending = true;
    refresh();
    const result = await hooks.claim();
    pending = false;
    if (!result?.ok) {
      hooks.showMessage(result?.error ?? "DAILY GEMS UNAVAILABLE", "#ff9b91");
      refresh();
      return;
    }

    celebrating = true;
    elements.overlay.classList.add("is-claimed");
    hooks.showMessage("DAILY GEMS CLAIMED · +7", "#ff9fd2");
    refresh();
    if (celebrationTimer !== null) window.clearTimeout(celebrationTimer);
    celebrationTimer = window.setTimeout(() => {
      celebrationTimer = null;
      celebrating = false;
      elements.overlay.classList.remove("is-claimed");
      refresh();
    }, 900);
  }

  elements.claimButton.addEventListener("click", () => { void claim(); });
  refresh();

  return {
    refresh,
    isOpen: () => visible,
  };
}
