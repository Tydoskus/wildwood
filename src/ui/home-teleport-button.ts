const HOME_TELEPORT_COOLDOWN_MS = 5_000;
/**
 * Time out of combat, with no blow dealt or taken, before the home teleport
 * works away from home: it is a way home, not a way out of a losing fight.
 * Going back out from home is never held.
 */
export const HOME_TELEPORT_COMBAT_LOCK_MS = 30_000;

let lastCombatAt = Number.NEGATIVE_INFINITY;
const combatListeners = new Set<() => void>();
/** A blow dealt or taken: the home teleport waits HOME_TELEPORT_COMBAT_LOCK_MS from now. */
export function noteCombat(now = performance.now()) {
  lastCombatAt = now;
  for (const listener of combatListeners) listener();
}
export function combatLockRemainingMs(now = performance.now()) {
  return Math.max(0, lastCombatAt + HOME_TELEPORT_COMBAT_LOCK_MS - now);
}

export function bindHomeTeleportButton(
  button: HTMLButtonElement,
  options: {
    beforeTeleport(): void;
    teleport(): Promise<boolean>;
    showFailure(failed: boolean): void;
    /** At home the button goes back out, which combat never holds. */
    atHome?(): boolean;
    showBlocked?(text: string): void;
  },
) {
  const cooldown = button.ownerDocument.createElement("span");
  cooldown.className = "home-teleport-cooldown";
  cooldown.hidden = true;
  cooldown.setAttribute("aria-hidden", "true");
  button.append(cooldown);
  const combatLocked = () => !options.atHome?.() && combatLockRemainingMs() > 0;

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
        showCombatLock();
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

  /**
   * The combat countdown, in the same ring as the teleport cooldown. Ticks
   * only while a lock runs, started by the first blow, so a quiet button
   * costs nothing; the teleport's own cooldown shows over it.
   */
  let combatTicking = false;
  function showCombatLock() {
    const locked = combatLocked();
    button.classList.toggle("is-home-combat", locked);
    if (button.classList.contains("is-home-cooldown")) return locked;
    if (locked) {
      const remaining = combatLockRemainingMs(), seconds = Math.ceil(remaining / 1_000);
      cooldown.hidden = false;
      cooldown.textContent = String(seconds);
      cooldown.style.setProperty("--cooldown-progress", `${remaining / HOME_TELEPORT_COMBAT_LOCK_MS * 100}%`);
      button.title = `In combat · home in ${seconds}s`;
    } else if (!cooldown.hidden) {
      cooldown.hidden = true;
      button.removeAttribute("title");
    }
    return locked;
  }
  function tickCombatLock() {
    if (showCombatLock()) setTimeout(tickCombatLock, 250);
    else combatTicking = false;
  }
  combatListeners.add(() => {
    if (combatTicking) return;
    combatTicking = true;
    tickCombatLock();
  });

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    if (combatLocked()) {
      options.showBlocked?.(`LEAVE COMBAT TO GO HOME · ${Math.ceil(combatLockRemainingMs() / 1_000)}s`);
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
