import {
  NATIVE_REWARDED_ADS_CHANGED_EVENTS,
  REGULAR_ENEMY_RESPAWN_AD_PLACEMENT,
  rewardedAdWasEarned,
  supportedNativeBridge,
} from "../app/native-ads";
import {
  AD_GEM_REWARD,
  adGemRefusal,
  adGemRewardStatus,
  formatAdGemWait,
  utcDayKey,
  type AdGemRewardRecord,
  type AdGemRewardStatus,
} from "../../shared/ad-gem-reward";

type RewardedGemAdElements = {
  button: HTMLButtonElement;
  status: HTMLElement;
  /** The visible wait inside the button while the next ad is not ready. */
  countdown: HTMLElement;
  prompt: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  browserAd: HTMLElement;
  browserAdTimer: HTMLElement;
};

type RewardedGemAdDependencies = {
  getNativeBridge: () => unknown;
  /** A Patreon supporter is not shown ads: the Gems are theirs for the tap. */
  isSupporter?: () => boolean;
  /** This account's last claim and today's count, from the server's view. */
  adGemReward: () => AdGemRewardRecord | null;
  claimAdGems: () => Promise<{ ok: boolean; error?: string }>;
  /** The game's gem-gain reveal, the one kill gems use. */
  showGemReward?: (amount: number) => void;
  setPromptActive: (active: boolean) => void;
  setAdPlaybackActive: (active: boolean) => void;
  showMessage: (text: string, color?: string) => void;
  /** Whether the button stays up to count down to the next ad. When not, it is hidden until an ad is ready. */
  showWaitTimer?: () => boolean;
  now?: () => number;
};

type ButtonState = "browser" | "checking" | "ready" | "waiting" | "showing" | "claiming" | "cooldown" | "limit";
type WaitStatus = Extract<AdGemRewardStatus, { kind: "cooldown" | "limit" }>;
const BROWSER_REWARDED_AD_SECONDS = 30;
const WATCH_LABEL = `Watch ad · +${AD_GEM_REWARD} Gems`;
const GEM_COLOR = "#7fd7ff";

/**
 * Presents one ad entry point on every platform. Browsers run a 30-second
 * placeholder; native apps delegate reward truth to their ad SDK bridge.
 *
 * A watched ad pays Gems through claim_ad_gems, and the server holds the
 * limits: thirty minutes apart, four a UTC day. The button reads the same
 * rules from the account's row only to show the wait, so a player is never
 * sent through an ad the server would then refuse to pay for.
 */
export function createRewardedGemAdController(
  elements: RewardedGemAdElements,
  dependencies: RewardedGemAdDependencies,
) {
  const now = dependencies.now ?? Date.now;
  let refreshGeneration = 0;
  /** An ad is playing or its claim is in flight. */
  let busy = false;
  let promptOpen = false;
  let browserTimer: number | null = null;
  let state: ButtonState | null = null;
  /** The server row the button last rendered from; a new one means re-render. */
  let renderedRecord: AdGemRewardRecord | null | undefined;
  /**
   * The claim this tab just made, held until the server's row catches up, so
   * the button goes straight to its cooldown instead of flashing ready.
   */
  let optimistic: { basis: AdGemRewardRecord | null; record: AdGemRewardRecord } | null = null;
  /** An ad was earned but its claim failed; the next tap claims without another. */
  let earnedUnclaimed = false;

  function currentRecord() {
    const server = dependencies.adGemReward();
    if (optimistic && optimistic.basis === server) return optimistic.record;
    optimistic = null;
    return server;
  }

  function currentStatus() {
    return adGemRewardStatus(currentRecord(), now());
  }

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

  function render(next: ButtonState, status: string, disabled: boolean, label = WATCH_LABEL) {
    state = next;
    renderedRecord = dependencies.adGemReward();
    elements.button.hidden = false;
    elements.button.dataset.state = next;
    elements.button.disabled = disabled;
    elements.status.textContent = status;
    elements.countdown.hidden = true;
    elements.confirmButton.textContent = next === "waiting" ? "Retry Ad" : "Watch Ad";
    elements.button.title = label;
    elements.button.setAttribute("aria-label", label);
    elements.button.setAttribute("aria-busy", next === "checking" || next === "showing" || next === "claiming" ? "true" : "false");
  }

  /** Cooldown or spent day: the button counts down and cannot be pressed. */
  function renderWait(status: WaitStatus) {
    closePrompt(false);
    const wait = formatAdGemWait(status.waitMs);
    render(status.kind, `NEXT AD IN ${wait}`, true, adGemRefusal(status) ?? WATCH_LABEL);
    elements.countdown.hidden = false;
    elements.countdown.textContent = `Ad in ${wait}\n${status.claimsLeft} left today`;
    if (!(dependencies.showWaitTimer?.() ?? true)) elements.button.hidden = true;
  }

  function readyLabel(claimsLeft: number) {
    return `${WATCH_LABEL} · ${claimsLeft} left today`;
  }

  async function refreshAvailability() {
    const generation = ++refreshGeneration;
    if (busy) return;
    const status = currentStatus();
    if (status.kind !== "ready") {
      renderWait(status);
      return;
    }

    if (earnedUnclaimed || dependencies.isSupporter?.()) {
      render("ready", `CLAIM +${AD_GEM_REWARD} GEMS`, false, earnedUnclaimed
        ? `Your ad is watched · tap to claim ${AD_GEM_REWARD} Gems`
        : `Supporter · claim ${AD_GEM_REWARD} Gems without an ad · ${status.claimsLeft} left today`);
      return;
    }

    const bridge = supportedNativeBridge(dependencies.getNativeBridge());
    if (!bridge) {
      render("browser", "WATCH AD", false, readyLabel(status.claimsLeft));
      return;
    }

    render("checking", "AD LOADING", true, readyLabel(status.claimsLeft));
    try {
      const ready = bridge.rewardedAds.isReady
        ? await bridge.rewardedAds.isReady(REGULAR_ENEMY_RESPAWN_AD_PLACEMENT)
        : true;
      if (generation !== refreshGeneration || busy) return;
      render(ready ? "ready" : "waiting", ready ? "WATCH AD" : "RETRY AD", false, readyLabel(status.claimsLeft));
    } catch {
      if (generation !== refreshGeneration || busy) return;
      render("waiting", "RETRY AD", false, "Ad could not load. Tap to retry after checking your connection.");
    }
  }

  /**
   * Once a second while the HUD is visible. It only touches the button when
   * there is a wait to count down or the server's row has changed, so a ready
   * button costs a comparison.
   */
  function sync() {
    if (busy || (typeof document !== "undefined" && document.hidden)) return;
    const counting = state === "cooldown" || state === "limit";
    if (!counting && dependencies.adGemReward() === renderedRecord) return;
    const status = currentStatus();
    if (status.kind !== "ready") renderWait(status);
    else void refreshAvailability();
  }

  async function claimReward() {
    busy = true;
    ++refreshGeneration;
    render("claiming", "CLAIMING", true);
    const before = dependencies.adGemReward();
    const claimedAt = now();
    const previous = currentStatus();
    let result: { ok: boolean; error?: string };
    try {
      result = await dependencies.claimAdGems();
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    busy = false;
    if (result.ok) {
      earnedUnclaimed = false;
      const dayKey = utcDayKey(claimedAt);
      const claimsToday = previous.kind === "ready" && previous.dayKey === dayKey ? previous.claimsToday + 1 : 1;
      optimistic = { basis: before, record: { lastClaimAtMs: claimedAt, dayKey, claimsToday } };
      dependencies.showMessage(`+${AD_GEM_REWARD} GEMS`, GEM_COLOR);
      dependencies.showGemReward?.(AD_GEM_REWARD);
    } else {
      dependencies.showMessage((result.error || "AD REWARD FAILED").toUpperCase(), "#ff9b91");
    }
    void refreshAvailability();
  }

  function openPrompt() {
    if (promptOpen || busy || elements.button.disabled) return;
    const status = currentStatus();
    if (status.kind !== "ready") { renderWait(status); return; }
    if (earnedUnclaimed || dependencies.isSupporter?.()) { void claimReward(); return; }
    promptOpen = true;
    elements.prompt.hidden = false;
    elements.button.setAttribute("aria-expanded", "true");
    dependencies.setPromptActive(true);
    window.requestAnimationFrame(() => elements.confirmButton.focus());
  }

  function adEarned() {
    earnedUnclaimed = true;
    void claimReward();
  }

  function finishBrowserAd() {
    if (browserTimer !== null) window.clearTimeout(browserTimer);
    browserTimer = null;
    elements.browserAd.hidden = true;
    busy = false;
    dependencies.setAdPlaybackActive(false);
    adEarned();
  }

  function startBrowserAd() {
    busy = true;
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
    if (busy || currentStatus().kind !== "ready") return;
    const bridge = supportedNativeBridge(dependencies.getNativeBridge());
    if (!bridge) {
      startBrowserAd();
      return;
    }

    busy = true;
    ++refreshGeneration;
    render("showing", "PLAYING AD", true);
    dependencies.setAdPlaybackActive(true);
    let earned = false;
    try {
      const result = await bridge.rewardedAds.show(REGULAR_ENEMY_RESPAWN_AD_PLACEMENT);
      earned = rewardedAdWasEarned(result);
      if (!earned) {
        render("ready", "WATCH AD", false);
        dependencies.showMessage("AD NOT COMPLETED", "#ffcf66");
      }
    } catch {
      render("waiting", "RETRY AD", false);
      dependencies.showMessage("AD UNAVAILABLE", "#ff9b91");
    } finally {
      busy = false;
      dependencies.setAdPlaybackActive(false);
      if (earned) adEarned();
      else void refreshAvailability();
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

  function init() {
    elements.button.addEventListener("click", openPrompt);
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
    closePrompt(false);
    if (busy) dependencies.setAdPlaybackActive(false);
    busy = false;
    elements.browserAd.hidden = true;
    elements.button.removeEventListener("click", openPrompt);
    elements.confirmButton.removeEventListener("click", onConfirmClick);
    elements.cancelButton.removeEventListener("click", onCancelClick);
    elements.prompt.removeEventListener("click", onPromptClick);
    for (const event of NATIVE_REWARDED_ADS_CHANGED_EVENTS) window.removeEventListener(event, refreshAvailability);
    window.removeEventListener("online", refreshAvailability);
  }

  return { init, refreshAvailability, sync, destroy, isPromptOpen: () => promptOpen, closePrompt };
}
