import { prestigeEndlessRequirement } from "../../shared/prestige";
import { PRESTIGE_ARMED_WARNING, PRESTIGE_COST, prestigeRewardLabel, submitPrestige, type PrestigeResult } from "./prestige-panel";

/** Per identity: the highest prestige level this browser has announced, or seen the account reach. */
export const PRESTIGE_UNLOCK_ANNOUNCED_KEY = "wildstat.prestigeUnlockAnnounced";
export const prestigeUnlockStorageKey = (identity: string) => `${PRESTIGE_UNLOCK_ANNOUNCED_KEY}:${identity}`;

/** Anything that owns the screen. The popup waits for all of it to clear. */
const BUSY_BODY_STATES = ".is-cutscene, .is-replaying, .is-onboarding, .is-dueling, .is-loading-game-assets";
const WINDOW_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog[open]';
/** The boss's death, its loot and the kill toasts land first; then the window. */
const SETTLE_MS = 1_200;
/**
 * The window arrives unasked, often while the player is tapping to move or
 * fire. Presses this soon after it opens are the tail of that tapping, not a
 * choice, and the second press of a reset must not be the other half of a
 * double tap.
 */
const INPUT_GRACE_MS = 700;
const CONFIRM_GAP_MS = 400;

/**
 * The level to announce, or 0 for none.
 *
 * Due when the next level's requirement is met — the campaign done, and one
 * Endless stage more than the last prestige asked for (the same rule the
 * prestige panel and the server apply) — and that level has never been
 * announced to this identity. It does not look for a transition: whichever
 * reading first meets the requirement is the moment, and the stored level
 * keeps reloads, reconnects and re-renders from saying it twice.
 */
export function prestigeLevelToAnnounce(state: {
  level: number; campaignComplete: boolean; completedEndless: number; announced: number;
}) {
  const next = Math.max(0, Math.floor(state.level)) + 1;
  if (!state.campaignComplete || state.completedEndless < prestigeEndlessRequirement(next)) return 0;
  return state.announced >= next ? 0 : next;
}

function shown(element: Element) {
  if (element.closest("[hidden]")) return false;
  const check = (element as HTMLElement).checkVisibility;
  return typeof check === "function" ? check.call(element) : true;
}

/** Whether another window, a cutscene, a duel, a replay or the death screen is up. */
export function screenIsBusy(root: Document, own?: Element) {
  if (root.body.matches(BUSY_BODY_STATES)) return true;
  const gameOver = root.getElementById("gameOver");
  if (gameOver && shown(gameOver)) return true;
  for (const window of root.querySelectorAll(WINDOW_SELECTOR)) {
    if (own?.contains(window)) continue;
    if (shown(window)) return true;
  }
  return false;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type PrestigeUnlockPopupDependencies = {
  identity: () => string;
  /**
   * The account's own rows have all arrived: its prestige row, its campaign
   * progress and its Endless count. Before then a missing prestige row reads
   * as level 0, which would announce Prestige 1 to someone long past it.
   */
  ready: () => boolean;
  /** Gameplay paused by another window, a duel: anything the DOM cannot show. */
  blocked?: () => boolean;
  level: () => number;
  campaignComplete: () => boolean;
  completedEndless: () => number;
  /** The prestige panel's own reducer call. */
  runPrestige: () => Promise<PrestigeResult>;
  showMessage?: (text: string) => void;
  pause?: (paused: boolean) => void;
  storage?: StorageLike | null;
  root?: Document;
  now?: () => number;
  settleMs?: number;
};

/**
 * "Prestige N unlocked": raised once per level per identity, the first time
 * the account meets that level's requirement with nothing else on screen.
 *
 * Built from the prestige window's own pieces — its frame, its footer, its red
 * confirm that arms before it resets — so it reads as that window's doorstep.
 * "Later" only closes it; the prestige panel in the profile stays the place to
 * do it afterwards.
 */
export function createPrestigeUnlockPopup(dependencies: PrestigeUnlockPopupDependencies) {
  const root = dependencies.root ?? document;
  const now = dependencies.now ?? (() => performance.now());
  const settleMs = dependencies.settleMs ?? SETTLE_MS;
  const storage = dependencies.storage === undefined
    ? (typeof localStorage === "undefined" ? null : localStorage)
    : dependencies.storage;
  // Also the fallback when private browsing refuses storage: remembering for
  // this session is the most that is left.
  const remembered = new Map<string, number>();

  const overlay = root.createElement("div");
  overlay.id = "prestigeUnlock";
  overlay.hidden = true;
  overlay.innerHTML = `<section class="prestige-window prestige-unlock-window" role="dialog" aria-modal="true" aria-labelledby="prestigeUnlockTitle prestigeUnlockKicker" aria-describedby="prestigeUnlockReward">
    <header class="prestige-header">
      <span class="player-prestige-badge prestige-unlock-badge" aria-hidden="true"></span>
      <h2 id="prestigeUnlockTitle" class="window-banner window-banner--blue"><span></span></h2>
      <div id="prestigeUnlockKicker" class="prestige-unlock-kicker">UNLOCKED</div>
    </header>
    <p id="prestigeUnlockReward" class="prestige-unlock-reward"></p>
    <p class="prestige-cost"></p>
    <p class="prestige-unlock-later">Not now? Prestige waits in your profile until you are ready.</p>
    <div class="prestige-status" role="status" aria-live="polite"></div>
    <footer class="prestige-footer">
      <button type="button" class="prestige-confirm prestige-unlock-confirm">Prestige now</button>
      <button type="button" class="window-back-button game-confirm-cancel prestige-unlock-later-button">Later</button>
    </footer>
  </section>`;
  root.body.append(overlay);
  const badge = overlay.querySelector<HTMLElement>(".prestige-unlock-badge")!;
  const title = overlay.querySelector<HTMLElement>("#prestigeUnlockTitle > span")!;
  const reward = overlay.querySelector<HTMLElement>(".prestige-unlock-reward")!;
  const cost = overlay.querySelector<HTMLElement>(".prestige-cost")!;
  const status = overlay.querySelector<HTMLElement>(".prestige-status")!;
  const confirmButton = overlay.querySelector<HTMLButtonElement>(".prestige-unlock-confirm")!;
  const laterButton = overlay.querySelector<HTMLButtonElement>(".prestige-unlock-later-button")!;

  let open = false, preview = false, armed = false, pending = false;
  let openedAt = 0, armedAt = 0;
  /** The level waiting to be announced and when it first became due, so the boss's own moment lands first. */
  let due: { identity: string; level: number; since: number } | null = null;

  /** Read from storage once per identity; this runs on every HUD tick. */
  function announced(identity: string) {
    let known = remembered.get(identity);
    if (known === undefined) {
      known = 0;
      try { known = Math.max(0, Number(storage?.getItem(prestigeUnlockStorageKey(identity))) || 0); } catch { /* storage refused */ }
      remembered.set(identity, known);
    }
    return known;
  }

  function markAnnounced(identity: string, level: number) {
    const highest = Math.max(level, announced(identity));
    remembered.set(identity, highest);
    try { storage?.setItem(prestigeUnlockStorageKey(identity), String(highest)); } catch { /* storage refused */ }
  }

  function disarm() {
    armed = false;
    confirmButton.textContent = "Prestige now";
    confirmButton.classList.remove("is-armed");
  }

  function show(level: number, asPreview: boolean) {
    preview = asPreview;
    disarm();
    badge.textContent = String(level);
    title.textContent = `Prestige ${level}`;
    reward.textContent = `You would earn ${prestigeRewardLabel(level - 1)}.`;
    cost.textContent = PRESTIGE_COST;
    status.textContent = "";
    confirmButton.disabled = laterButton.disabled = false;
    open = true;
    openedAt = now();
    overlay.hidden = false;
    dependencies.pause?.(true);
    // The way out, not the reset, holds focus: a stray Enter only closes it.
    laterButton.focus?.();
  }

  function close() {
    if (!open || pending) return;
    open = false;
    overlay.hidden = true;
    disarm();
    dependencies.pause?.(false);
  }

  /**
   * Safe to call on every HUD tick. The unlock reaches this client as the
   * boss's reward rows update over the subscription, so this polls for the
   * reading that first meets the requirement and then waits for the screen to
   * be free before opening, once.
   */
  function poll() {
    if (open) return;
    const identity = dependencies.identity();
    if (!identity || !dependencies.ready()) { due = null; return; }
    const current = Math.max(0, Math.floor(dependencies.level()));
    // A level already reached needs no announcing, so it counts as announced.
    // This is also the guard for a reconnect: the prestige row is dropped on
    // disconnect and can arrive after the campaign row, and for that moment
    // the account reads as level 0 with the campaign done.
    if (current > announced(identity)) markAnnounced(identity, current);
    const level = prestigeLevelToAnnounce({
      level: current,
      campaignComplete: dependencies.campaignComplete(),
      completedEndless: dependencies.completedEndless(),
      announced: announced(identity),
    });
    if (!level) { due = null; return; }
    if (due?.identity !== identity || due.level !== level) due = { identity, level, since: now() };
    if (now() - due.since < settleMs) return;
    if (dependencies.blocked?.() || screenIsBusy(root, overlay)) return;
    due = null;
    markAnnounced(identity, level);
    show(level, false);
  }

  confirmButton.addEventListener("click", async () => {
    if (!open || pending || now() - openedAt < INPUT_GRACE_MS) return;
    // The same gate the panel enforces: only the campaign, the one this client
    // can be certain of. The server owns the Endless count and says what is missing.
    if (!preview && !dependencies.campaignComplete()) {
      status.textContent = "Defeat Aegis Prime to unlock Prestige.";
      return;
    }
    // Losing every map unlock deserves a second press, not a single tap.
    if (!armed) {
      armed = true;
      armedAt = now();
      confirmButton.textContent = "Yes, prestige";
      confirmButton.classList.add("is-armed");
      status.textContent = PRESTIGE_ARMED_WARNING;
      return;
    }
    if (now() - armedAt < CONFIRM_GAP_MS) return;
    if (preview) {
      disarm();
      status.textContent = "Preview only. Nothing was reset.";
      return;
    }
    pending = true; disarm();
    confirmButton.disabled = laterButton.disabled = true;
    status.textContent = "Prestiging…";
    const outcome = await submitPrestige(dependencies.runPrestige, dependencies.level);
    pending = false;
    confirmButton.disabled = laterButton.disabled = false;
    if (outcome.ok) {
      close();
      dependencies.showMessage?.(outcome.message);
    } else {
      status.textContent = outcome.error;
    }
  });
  laterButton.addEventListener("click", () => {
    if (now() - openedAt < INPUT_GRACE_MS) return;
    close();
  });
  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  });

  return {
    poll,
    close,
    isOpen: () => open,
    /**
     * Developer preview: the window for the next level, now, whatever the
     * account's progress. It records nothing, and its confirm resets nothing.
     */
    preview() {
      if (open) return;
      show(Math.max(0, Math.floor(dependencies.level())) + 1, true);
    },
  };
}

/** The developer panel row that opens the preview. */
export function createPrestigeUnlockPreviewControl(parent: HTMLElement, dependencies: {
  allowed: () => boolean;
  preview: () => void;
}) {
  const root = parent.ownerDocument;
  const row = root.createElement("div");
  row.className = "setting-row";
  const label = root.createElement("span");
  label.textContent = "PRESTIGE UNLOCK POPUP";
  const button = root.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = "PREVIEW";
  button.setAttribute("aria-label", "Preview prestige unlock popup");
  row.append(label, button);
  parent.append(row);
  const render = () => { row.hidden = !dependencies.allowed(); };
  button.addEventListener("click", () => { if (dependencies.allowed()) dependencies.preview(); });
  render();
  return { render, element: row };
}
