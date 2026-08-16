import {
  NATIVE_REWARDED_ADS_CHANGED_EVENT,
  REGULAR_ENEMY_RESPAWN_AD_PLACEMENT,
  rewardedAdWasEarned,
  supportedNativeBridge,
} from "../app/native-ads";

type RewardedRespawnAdElements = {
  button: HTMLButtonElement;
  status: HTMLElement;
  activeStatus: HTMLElement;
  activeTimer: HTMLElement;
  browserAd: HTMLElement;
  browserAdTimer: HTMLElement;
};

type RewardedRespawnAdDependencies = {
  getNativeBridge: () => unknown;
  activateBoost: () => boolean;
  isBoostActive: () => boolean;
  boostRemainingMs: () => number;
  onBoostExpired: () => void;
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
 */
export function createRewardedRespawnAdController(
  elements: RewardedRespawnAdElements,
  dependencies: RewardedRespawnAdDependencies,
) {
  let refreshGeneration = 0;
  let showingAd = false;
  let browserTimer: number | null = null;
  let activeCountdownTimer: number | null = null;

  function stopActiveCountdown() {
    if (activeCountdownTimer !== null) window.clearTimeout(activeCountdownTimer);
    activeCountdownTimer = null;
  }

  function render(state: ButtonState, status: string, disabled: boolean) {
    stopActiveCountdown();
    elements.activeStatus.hidden = true;
    elements.button.hidden = false;
    elements.button.dataset.state = state;
    elements.button.disabled = disabled;
    elements.status.textContent = status;
    elements.button.setAttribute("aria-busy", state === "checking" || state === "showing" ? "true" : "false");
  }

  function updateActiveCountdown() {
    activeCountdownTimer = null;
    const remaining = dependencies.boostRemainingMs();
    if (remaining <= 0) {
      elements.activeStatus.hidden = true;
      dependencies.onBoostExpired();
      void refreshAvailability();
      return;
    }
    elements.activeTimer.textContent = formatRespawnBoostRemaining(remaining);
    activeCountdownTimer = window.setTimeout(updateActiveCountdown, Math.min(1_000, remaining));
  }

  function renderActive() {
    elements.button.hidden = true;
    elements.activeStatus.hidden = false;
    elements.activeStatus.title = "Regular enemies respawn in 15 seconds while this timer is active";
    if (activeCountdownTimer === null) updateActiveCountdown();
  }

  async function refreshAvailability() {
    const generation = ++refreshGeneration;
    if (showingAd) return;
    if (dependencies.isBoostActive()) {
      renderActive();
      return;
    }

    const bridge = supportedNativeBridge(dependencies.getNativeBridge());
    if (!bridge) {
      render("browser", "WATCH AD", false);
      elements.button.title = "Watch a 30-second ad to halve regular enemy respawn time";
      return;
    }

    render("checking", "AD LOADING", true);
    elements.button.title = "Watch an ad to halve regular enemy respawn time";
    try {
      const ready = bridge.rewardedAds.isReady
        ? await bridge.rewardedAds.isReady(REGULAR_ENEMY_RESPAWN_AD_PLACEMENT)
        : true;
      if (generation !== refreshGeneration || showingAd) return;
      render(ready ? "ready" : "waiting", ready ? "WATCH AD" : "AD LOADING", !ready);
    } catch {
      if (generation !== refreshGeneration || showingAd) return;
      render("waiting", "AD UNAVAILABLE", true);
    }
  }

  function finishBrowserAd() {
    if (browserTimer !== null) window.clearTimeout(browserTimer);
    browserTimer = null;
    elements.browserAd.hidden = true;
    showingAd = false;
    dependencies.setAdPlaybackActive(false);
    dependencies.activateBoost();
    renderActive();
    dependencies.showMessage("2× ENEMY RESPAWN ACTIVE", "#72ef58");
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

  async function onClick() {
    if (showingAd || dependencies.isBoostActive()) return;
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
        dependencies.activateBoost();
        earned = true;
        renderActive();
        dependencies.showMessage("2× ENEMY RESPAWN ACTIVE", "#72ef58");
      } else {
        render("ready", "WATCH AD", false);
        dependencies.showMessage("AD NOT COMPLETED", "#ffcf66");
      }
    } catch {
      render("waiting", "AD UNAVAILABLE", true);
      dependencies.showMessage("AD UNAVAILABLE", "#ff9b91");
    } finally {
      showingAd = false;
      dependencies.setAdPlaybackActive(false);
      if (!earned) void refreshAvailability();
    }
  }

  function init() {
    elements.button.addEventListener("click", onClick);
    window.addEventListener(NATIVE_REWARDED_ADS_CHANGED_EVENT, refreshAvailability);
    void refreshAvailability();
  }

  function destroy() {
    if (browserTimer !== null) window.clearTimeout(browserTimer);
    browserTimer = null;
    stopActiveCountdown();
    if (showingAd) dependencies.setAdPlaybackActive(false);
    showingAd = false;
    elements.browserAd.hidden = true;
    elements.button.removeEventListener("click", onClick);
    window.removeEventListener(NATIVE_REWARDED_ADS_CHANGED_EVENT, refreshAvailability);
  }

  return { init, refreshAvailability, destroy };
}
