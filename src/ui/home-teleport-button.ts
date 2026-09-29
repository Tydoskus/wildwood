const HOME_TELEPORT_COOLDOWN_MS = 5_000;
/**
 * After chat closes, the home teleport ignores taps this long, so the tap
 * that closes chat, or the next one, cannot send a player home by accident.
 */
export const HOME_TELEPORT_CHAT_CLOSE_HOLD_MS = 3_000;
/** Dispatched on window by chat when its expanded panel closes. */
export const CHAT_CLOSED_EVENT = "wildwood:chat-closed";

export function bindHomeTeleportButton(
  button: HTMLButtonElement,
  options: {
    beforeTeleport(): void;
    teleport(): Promise<boolean>;
    showFailure(failed: boolean): void;
    /** Says why a tap during the hold did nothing. */
    showBlocked?(text: string): void;
  },
) {
  const cooldown = button.ownerDocument.createElement("span");
  cooldown.className = "home-teleport-cooldown";
  cooldown.hidden = true;
  cooldown.setAttribute("aria-hidden", "true");
  button.append(cooldown);
  let heldUntil = 0;
  button.ownerDocument.defaultView?.addEventListener(CHAT_CLOSED_EVENT, () => {
    heldUntil = performance.now() + HOME_TELEPORT_CHAT_CLOSE_HOLD_MS;
  });

  function showCooldown() {
    const endsAt = Date.now() + HOME_TELEPORT_COOLDOWN_MS;
    cooldown.hidden = false;
    button.classList.add("is-home-cooldown");
    const update = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      if (!remaining) {
        cooldown.hidden = true;
        button.classList.remove("is-home-cooldown");
        button.removeAttribute("title");
        button.disabled = false;
        return;
      }
      const seconds = Math.ceil(remaining / 1_000);
      cooldown.textContent = String(seconds);
      cooldown.style.setProperty("--cooldown-progress", `${remaining / HOME_TELEPORT_COOLDOWN_MS * 100}%`);
      button.title = `Teleport ready in ${seconds}s`;
      setTimeout(update, Math.min(50, remaining));
    };
    update();
  }

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    const held = heldUntil - performance.now();
    if (held > 0) {
      options.showBlocked?.(`HOME READY IN ${Math.ceil(held / 1_000)}S`);
      return;
    }
    button.disabled = true;
    let changed = false;
    try {
      options.beforeTeleport();
      changed = await options.teleport();
      if (!changed) options.showFailure(false);
    } catch {
      options.showFailure(true);
    } finally {
      if (changed) {
        showCooldown();
      } else {
        button.disabled = false;
      }
    }
  });
}
