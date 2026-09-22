import { installMultiplayerIdle } from "./multiplayer-idle";
import { MULTIPLAYER_TOGGLE_COOLDOWN_MS as COOLDOWN_MS } from "../../shared/multiplayer";

const STORAGE_KEY = "wildstat-show-other-players";

/**
 * Multiplayer starts off, every session.
 *
 * Presence is the expensive thing the server does, and most sessions never
 * look at another player. Signing in, reconnecting and reloading all begin
 * with the eye off, and anyone who wants to be seen taps it — one tap, and it
 * stays on for as long as they keep playing.
 *
 * The one exception is finishing the tutorial: a brand new player should walk
 * out of it and see the other new players around them, so `enableForTutorial`
 * turns it on once at that moment.
 *
 * The stored preference is therefore no longer read at startup. It is still
 * written, because the idle and update paths read it to tell an explicit "off"
 * from a temporary one.
 */
export function createPlayerVisibilityToggle(options: {
  button: HTMLButtonElement;
  setVisible: (visible: boolean) => void;
  storage?: Pick<Storage, "getItem" | "setItem">;
}) {
  let enabled = false;
  let visible = false;
  /** The tutorial's one automatic switch-on, which never fires twice. */
  let tutorialEnabled = false;
  let cooldownUntil = 0;
  let suspended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { options.storage?.setItem(STORAGE_KEY, "false"); } catch { /* Storage may be unavailable. */ }
  options.button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="player-visibility-slash" d="m4 3 16 18"/></svg><span class="player-visibility-idle" aria-hidden="true"></span><span class="player-visibility-countdown" aria-hidden="true"></span>`;
  const countdown = options.button.querySelector<HTMLElement>(".player-visibility-countdown")!;
  const idleLabel = options.button.querySelector<HTMLElement>(".player-visibility-idle")!;
  const idle = installMultiplayerIdle(options.button.ownerDocument, () => {
    visible = false;
    refresh();
    options.setVisible(false);
  });
  function refresh() {
    clearTimeout(timer);
    const seconds = Math.max(0, Math.ceil((cooldownUntil - performance.now()) / 1000));
    options.button.disabled = seconds > 0;
    countdown.textContent = seconds ? String(seconds) : "";
    const idleHidden = enabled && !visible;
    idleLabel.textContent = idleHidden ? "idle" : "";
    options.button.setAttribute("aria-pressed", String(enabled));
    options.button.dataset.state = !enabled ? "off" : idleHidden ? "idle" : "on";
    const action = enabled ? (idleHidden ? "Multiplayer idle — move to resume, or turn off" : "Turn multiplayer off") : "Turn multiplayer on";
    const label = seconds ? `${action} — available in ${seconds} seconds` : action;
    options.button.setAttribute("aria-label", label);
    options.button.title = label;
    if (seconds) timer = setTimeout(refresh, Math.min(1000, cooldownUntil - performance.now()));
  }
  const click = () => {
    if (performance.now() < cooldownUntil) return;
    enabled = !enabled;
    visible = enabled;
    idle.setEnabled(visible);
    cooldownUntil = performance.now() + COOLDOWN_MS;
    try { options.storage?.setItem(STORAGE_KEY, String(visible)); } catch { /* Keep the session preference. */ }
    refresh();
    options.setVisible(visible);
  };
  options.button.addEventListener("click", click);
  refresh();
  options.setVisible(visible);
  idle.setEnabled(visible);
  return {
    /**
     * Turn multiplayer off for an update, and record it. An update reconnects
     * every client at once, so coming back visible puts that whole crowd into
     * presence in the same moment. The eye starts the next session off and the
     * player turns it back on when they want to be seen.
     */
    suspend() {
      // Holds until the reload; movement must not bring presence back for a
      // client that is on its way out.
      suspended = true;
      enabled = false;
      try { options.storage?.setItem(STORAGE_KEY, "false"); } catch { /* Keep the session preference. */ }
      if (!visible) { refresh(); return; }
      visible = false;
      idle.setEnabled(false);
      refresh();
      options.setVisible(false);
    },
    /**
     * The tutorial has just been completed. This is the only thing that turns
     * multiplayer on without the player asking, so someone stepping out of
     * their first fight sees the others doing the same.
     */
    enableForTutorial() {
      if (suspended || tutorialEnabled || enabled) return;
      tutorialEnabled = true;
      enabled = true;
      visible = true;
      try { options.storage?.setItem(STORAGE_KEY, "true"); } catch { /* Keep the session value. */ }
      idle.setEnabled(true);
      refresh();
      options.setVisible(true);
    },
    noteManualMovement() {
      if (suspended || !enabled || options.button.ownerDocument.hidden) return;
      if (!visible) {
        // Only idle hiding wakes automatically; explicit off stays off.
        if (performance.now() < cooldownUntil) return;
        visible = true;
        idle.setEnabled(true);
        cooldownUntil = performance.now() + COOLDOWN_MS;
        refresh(); options.setVisible(true);
      } else idle.noteManualMovement();
    },
    dispose() { idle.dispose(); clearTimeout(timer); options.button.removeEventListener("click", click); },
  };
}
