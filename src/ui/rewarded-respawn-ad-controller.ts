import {
  NATIVE_REWARDED_ADS_CHANGED_EVENTS,
  REGULAR_ENEMY_RESPAWN_AD_PLACEMENT,
  rewardedAdWasEarned,
  supportedNativeBridge,
} from "../app/native-ads";

type RewardedRespawnAdElements = {
  button: HTMLButtonElement;
  status: HTMLElement;
  bankButton: HTMLButtonElement;
  bankTimer: HTMLElement;
  prompt: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  browserAd: HTMLElement;
  browserAdTimer: HTMLElement;
};

type RewardedRespawnAdDependencies = {
  getNativeBridge: () => unknown;
  /** A Patreon supporter is not shown ads: the bank is theirs for the tap. */
  isSupporter?: () => boolean;
  /** Deposits a full bank. False when it is already full. */
  grantBoost: () => boolean;
  toggleBoost: () => boolean;
  isBoostEnabled: () => boolean;
  boostRemainingMs: () => number;
  setPromptActive: (active: boolean) => void;
  setAdPlaybackActive: (active: boolean) => void;
  showMessage: (text: string, color?: string) => void;
};

type ButtonState = "browser" | "checking" | "ready" | "waiting" | "showing";
const BROWSER_REWARDED_AD_SECONDS = 30;

export function formatRespawnBoostRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Presents one ad entry point on every platform. Browsers run a 30-second
 * placeholder; native apps delegate reward truth to their ad SDK bridge.
 *
 * The reward is a thirty-minute bank rather than a countdown, so once it holds
 * time the ad button gives way to a switch: the player decides when the faster
 * respawns are worth spending, and what is left survives a break.
 */
export function createRewardedRespawnAdController(
  elements: RewardedRespawnAdElements,
  dependencies: RewardedRespawnAdDependencies,
) {
  let refreshGeneration = 0;
  let showingAd = false;
  let promptOpen = false;
  let browserTimer: number | null = null;
  let bankCountdownTimer: number | null = null;

  function closePrompt(restoreFocus = true) {
    if (!promptOpen) return;
    promptOpen = false;
    elements.prompt.hidden = true;
    elements.button.setAttribute("aria-expanded", "false");
    dependencies.setPromptActive(false);
    if (restoreFocus && !elements.button.hidden && !elements.button.disabled) {
      window.requestAnimationFrame(() => elements.button.focus());
    }
  }

  function grantSupporterBank() {
    dependencies.grantBoost();
    renderBank();
    dependencies.showMessage("SUPPORTER · 30 MIN OF 2× RESPAWN BANKED", "#72ef58");
  }

  function openPrompt() {
    if (promptOpen || showingAd || elements.button.disabled || dependencies.boostRemainingMs() > 0) return;
    if (dependencies.isSupporter?.()) { grantSupporterBank(); return; }
    promptOpen = true;
    elements.prompt.hidden = false;
    elements.button.setAttribute("aria-expanded", "true");
    dependencies.setPromptActive(true);
    window.requestAnimationFrame(() => elements.confirmButton.focus());
  }

  function stopBankCountdown() {
    if (bankCountdownTimer !== null) window.clearTimeout(bankCountdownTimer);
    bankCountdownTimer = null;
  }

  function render(state: ButtonState, status: string, disabled: boolean) {
    stopBankCountdown();
    elements.bankButton.hidden = true;
    elements.button.hidden = false;
    elements.button.dataset.state = state;
    elements.button.disabled = disabled;
    elements.status.textContent = status;
    elements.confirmButton.textContent = state === "waiting" ? "Retry Ad" : "Watch Ad";
    elements.button.setAttribute("aria-busy", state === "checking" || state === "showing" ? "true" : "false");
  }

  function updateBankCountdown() {
    bankCountdownTimer = null;
    const remaining = dependencies.boostRemainingMs();
    if (remaining <= 0) {
      void refreshAvailability();
      return;
    }
    const enabled = dependencies.isBoostEnabled();
    elements.bankTimer.textContent = formatRespawnBoostRemaining(remaining);
    elements.bankButton.dataset.state = enabled ? "on" : "off";
    elements.bankButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    elements.bankButton.title = enabled
      ? "2× enemy respawn is on. Tap to save the rest of your bank for later."
      : "Tap to spend your banked time on 2× enemy respawn.";
    // An idle bank cannot run out on its own, so only a spending one is polled.
    if (enabled) bankCountdownTimer = window.setTimeout(updateBankCountdown, Math.min(1_000, remaining));
  }

  function renderBank() {
    closePrompt(false);
    stopBankCountdown();
    elements.button.hidden = true;
    elements.bankButton.hidden = false;
    updateBankCountdown();
  }

  async function refreshAvailability() {
    const generation = ++refreshGeneration;
    if (showingAd) return;
    if (dependencies.boostRemainingMs() > 0) {
      renderBank();
      return;
    }

    if (dependencies.isSupporter?.()) {
      render("ready", "BOOST", false);
      elements.button.title = "Supporters bank 30 minutes of 2× enemy respawn without watching an ad";
      return;
    }

    const bridge = supportedNativeBridge(dependencies.getNativeBridge());
    if (!bridge) {
      render("browser", "WATCH AD", false);
      elements.button.title = "Watch a 30-second ad to bank 30 minutes of 2× enemy respawn";
      return;
    }

    render("checking", "AD LOADING", true);
    elements.button.title = "Watch an ad to bank 30 minutes of 2× enemy respawn";
    try {
      const ready = bridge.rewardedAds.isReady
        ? await bridge.rewardedAds.isReady(REGULAR_ENEMY_RESPAWN_AD_PLACEMENT)
        : true;
      if (generation !== refreshGeneration || showingAd) return;
      render(ready ? "ready" : "waiting", ready ? "WATCH AD" : "RETRY AD", false);
    } catch {
      if (generation !== refreshGeneration || showingAd) return;
      render("waiting", "RETRY AD", false);
      elements.button.title = "Ad could not load. Tap to retry after checking your connection.";
    }
  }

  function finishBrowserAd() {
    if (browserTimer !== null) window.clearTimeout(browserTimer);
    browserTimer = null;
    elements.browserAd.hidden = true;
    showingAd = false;
    dependencies.setAdPlaybackActive(false);
    dependencies.grantBoost();
    renderBank();
    dependencies.showMessage("30 MIN OF 2× RESPAWN BANKED", "#72ef58");
  }

  function startBrowserAd() {
    showingAd = true;
    ++refreshGeneration;
    render("showing", "PLAYING AD", true);
    dependencies.setAdPlaybackActive(true);
    elements.browserAd.hidden = false;
    const endsAt = Date.now() + BROWSER_REWARDED_AD_SECONDS * 1_000;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000));
      elements.browserAdTimer.textContent = `0:${String(secondsLeft).padStart(2, "0")}`;
      if (secondsLeft <= 0) {
        finishBrowserAd();
        return;
      }
      browserTimer = window.setTimeout(tick, 250);
    };
    tick();
  }

  async function showRewardedAd() {
    if (showingAd || dependencies.boostRemainingMs() > 0) return;
    const bridge = supportedNativeBridge(dependencies.getNativeBridge());
    if (!bridge) {
      startBrowserAd();
      return;
    }

    showingAd = true;
    ++refreshGeneration;
    render("showing", "PLAYING AD", true);
    dependencies.setAdPlaybackActive(true);
    let earned = false;
    try {
      const result = await bridge.rewardedAds.show(REGULAR_ENEMY_RESPAWN_AD_PLACEMENT);
      if (rewardedAdWasEarned(result)) {
        dependencies.grantBoost();
        earned = true;
        renderBank();
        dependencies.showMessage("30 MIN OF 2× RESPAWN BANKED", "#72ef58");
      } else {
        render("ready", "WATCH AD", false);
        dependencies.showMessage("AD NOT COMPLETED", "#ffcf66");
      }
    } catch {
      render("waiting", "RETRY AD", false);
      dependencies.showMessage("AD UNAVAILABLE", "#ff9b91");
    } finally {
      showingAd = false;
      dependencies.setAdPlaybackActive(false);
      if (!earned) void refreshAvailability();
    }
  }

  function onConfirmClick() {
    closePrompt(false);
    void showRewardedAd();
  }

  function onCancelClick() {
    closePrompt();
  }

  function onPromptClick(event: MouseEvent) {
    if (event.target === elements.prompt) closePrompt();
  }

  function onBankClick() {
    if (dependencies.boostRemainingMs() <= 0) { void refreshAvailability(); return; }
    const enabled = dependencies.toggleBoost();
    renderBank();
    dependencies.showMessage(enabled ? "2× ENEMY RESPAWN ON" : "2× ENEMY RESPAWN PAUSED", enabled ? "#72ef58" : "#ffcf66");
  }

  function init() {
    elements.button.addEventListener("click", openPrompt);
    elements.bankButton.addEventListener("click", onBankClick);
    elements.confirmButton.addEventListener("click", onConfirmClick);
    elements.cancelButton.addEventListener("click", onCancelClick);
    elements.prompt.addEventListener("click", onPromptClick);
    for (const event of NATIVE_REWARDED_ADS_CHANGED_EVENTS) window.addEventListener(event, refreshAvailability);
    window.addEventListener("online", refreshAvailability);
    void refreshAvailability();
  }

  function destroy() {
    if (browserTimer !== null) window.clearTimeout(browserTimer);
    browserTimer = null;
    stopBankCountdown();
    closePrompt(false);
    if (showingAd) dependencies.setAdPlaybackActive(false);
    showingAd = false;
    elements.browserAd.hidden = true;
    elements.button.removeEventListener("click", openPrompt);
    elements.bankButton.removeEventListener("click", onBankClick);
    elements.confirmButton.removeEventListener("click", onConfirmClick);
    elements.cancelButton.removeEventListener("click", onCancelClick);
    elements.prompt.removeEventListener("click", onPromptClick);
    for (const event of NATIVE_REWARDED_ADS_CHANGED_EVENTS) window.removeEventListener(event, refreshAvailability);
    window.removeEventListener("online", refreshAvailability);
  }

  return { init, refreshAvailability, destroy, isPromptOpen: () => promptOpen, closePrompt };
}
