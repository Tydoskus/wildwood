/**
 * "This email already has a character" window.
 *
 * SpacetimeAuth can end up with two users for one address (a Google sign-in on
 * an email-link account), and each login has its own character. The second one
 * opens a new, empty character, and a player who does not notice plays it and
 * leaves their real one behind: Vis did. The server knows which played character
 * shares this login's email (get_other_character_for_login); this window tells
 * the player before they invest in the empty one, and offers the way back.
 */

/** Per identity: the character this browser already warned about and the player chose to keep playing past. */
export const DUPLICATE_LOGIN_DISMISSED_KEY = "wildstat.duplicateLoginDismissed";
export const duplicateLoginStorageKey = (identity: string) => `${DUPLICATE_LOGIN_DISMISSED_KEY}:${identity}`;

// The tutorial is where a new character starts, so unlike the prestige window
// this one does not wait for onboarding. It still waits for a cutscene, a
// replay, a duel or another window.
const BUSY_BODY_STATES = ".is-cutscene, .is-replaying, .is-dueling";
const WINDOW_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog[open]';
/** Presses this soon after the window opens are the tail of tapping to play, not a choice. */
const INPUT_GRACE_MS = 700;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type DuplicateLoginPopupDependencies = {
  identity: () => string;
  /** Signed in, connected and in the game: the lookup only means something for a signed-in account. */
  ready: () => boolean;
  /** The played character this login's email has on another login, or "". */
  lookup: () => Promise<string>;
  signOut: () => void;
  pause?: (paused: boolean) => void;
  root?: Document;
  storage?: StorageLike | null;
  now?: () => number;
};

function busy(root: Document, own: Element) {
  if (root.body.matches(BUSY_BODY_STATES)) return true;
  for (const window of root.querySelectorAll(WINDOW_SELECTOR)) {
    if (own.contains(window) || window.closest("[hidden]")) continue;
    return true;
  }
  return false;
}

export function createDuplicateLoginPopup(dependencies: DuplicateLoginPopupDependencies) {
  const root = dependencies.root ?? document;
  const now = dependencies.now ?? (() => performance.now());
  const storage = dependencies.storage === undefined
    ? (typeof localStorage === "undefined" ? null : localStorage)
    : dependencies.storage;

  const overlay = root.createElement("div");
  overlay.id = "duplicateLoginWarning";
  overlay.hidden = true;
  // Styled inline like #prestigeUnlock, so shipping it needs no stylesheet change.
  overlay.setAttribute("style", "position:fixed;inset:0;z-index:13;display:grid;place-items:center;padding:14px;background:rgba(0,0,0,.78)");
  overlay.innerHTML = `<section class="prestige-window prestige-unlock-window" role="alertdialog" aria-modal="true" aria-labelledby="duplicateLoginTitle" aria-describedby="duplicateLoginBody">
    <header class="prestige-header">
      <h2 id="duplicateLoginTitle" class="window-banner window-banner--blue"><span>Wrong sign-in?</span></h2>
    </header>
    <p id="duplicateLoginBody" class="prestige-unlock-reward"></p>
    <p class="prestige-unlock-later"></p>
    <footer class="prestige-footer">
      <button type="button" class="prestige-confirm duplicate-login-sign-out">Sign out</button>
      <button type="button" class="window-back-button game-confirm-cancel duplicate-login-keep">Keep this character</button>
    </footer>
  </section>`;
  root.body.append(overlay);
  const body = overlay.querySelector<HTMLElement>("#duplicateLoginBody")!;
  const advice = overlay.querySelector<HTMLElement>(".prestige-unlock-later")!;
  const signOutButton = overlay.querySelector<HTMLButtonElement>(".duplicate-login-sign-out")!;
  const keepButton = overlay.querySelector<HTMLButtonElement>(".duplicate-login-keep")!;

  let open = false, openedAt = 0, shownName = "";
  /** Identities already asked about on this page; the server is asked once per sign-in. */
  const asked = new Set<string>();
  let due: { identity: string; name: string } | null = null;

  function dismissed(identity: string, name: string) {
    try { return storage?.getItem(duplicateLoginStorageKey(identity)) === name; } catch { return false; }
  }

  function show(name: string) {
    shownName = name;
    body.textContent = `This email already has a character, ${name}, under a different sign-in. You are on a new, empty character.`;
    advice.textContent = `Sign out, then sign in the way you did when you played ${name} (email link or Google). `
      + `If you still land here, message us on Discord with your email and we will move ${name} for you.`;
    open = true;
    openedAt = now();
    overlay.hidden = false;
    dependencies.pause?.(true);
    // The harmless choice holds focus: a stray Enter keeps playing, it does not sign out.
    keepButton.focus?.();
  }

  function close() {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    dependencies.pause?.(false);
  }

  /** Safe on every HUD tick: asks the server once per signed-in identity, then waits for a free screen. */
  function poll() {
    if (open) return;
    const identity = dependencies.identity();
    if (!identity || !dependencies.ready()) return;
    if (!asked.has(identity)) {
      asked.add(identity);
      void dependencies.lookup().then(name => {
        if (name && !dismissed(identity, name)) due = { identity, name };
      }).catch(() => { /* No warning is the old behaviour; never block play on it. */ });
      return;
    }
    if (!due || due.identity !== identity || busy(root, overlay)) return;
    const { name } = due;
    due = null;
    show(name);
  }

  signOutButton.addEventListener("click", () => {
    if (!open || now() - openedAt < INPUT_GRACE_MS) return;
    close();
    dependencies.signOut();
  });
  keepButton.addEventListener("click", () => {
    if (!open || now() - openedAt < INPUT_GRACE_MS) return;
    try { storage?.setItem(duplicateLoginStorageKey(dependencies.identity()), shownName); } catch { /* storage refused: asked again next sign-in */ }
    close();
  });

  return { poll, isOpen: () => open };
}
