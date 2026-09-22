/**
 * The game's own yes/no prompt.
 *
 * `window.confirm` blocks the whole page, cannot be styled, and on mobile
 * arrives as a browser sheet naming the host rather than the game — which made
 * destroying an item or spending gems look like it came from somewhere else.
 * This is built from the same overlay and `.modal` frame every other window
 * uses, so a confirmation reads as part of WildStat.
 *
 * Callers await it. One prompt is open at a time: opening a second answers the
 * first with "no", which is what dismissing it would have done anyway.
 */
export type ConfirmDetail = {
  label: string;
  value: string;
  /** Colours the value: what it costs, what is left, what it leaves behind. */
  kind?: "cost" | "balance" | "after";
};

export type ConfirmRequest = {
  message: string;
  /** Rows under the question — a gem cost against the balance it comes out of. */
  details?: readonly ConfirmDetail[];
  /** The affirmative button's words. Defaults to "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Irreversible, so the frame reads red and the keyboard starts on Cancel.
   * Destroying an item is the case this exists for.
   */
  danger?: boolean;
};

/** What a controller accepts in place of the shared prompt, so tests can answer it. */
export type ConfirmPrompt = (request: ConfirmRequest) => boolean | Promise<boolean>;

export type ConfirmDialog = {
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  destroy: () => void;
};

export function createConfirmDialog(root: Document = document): ConfirmDialog {
  const overlay = root.createElement("div");
  overlay.id = "gameConfirm";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal game-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="gameConfirmMessage">
    <p id="gameConfirmMessage" class="game-confirm-message"></p>
    <div class="game-confirm-details"></div>
    <div class="game-confirm-actions">
      <button type="button" class="window-back-button game-confirm-cancel"></button>
      <button type="button" class="window-back-button game-confirm-accept"></button>
    </div>
  </div>`;
  root.body.append(overlay);
  const frame = overlay.querySelector<HTMLElement>(".game-confirm-modal")!;
  const message = overlay.querySelector<HTMLParagraphElement>(".game-confirm-message")!;
  const details = overlay.querySelector<HTMLElement>(".game-confirm-details")!;
  const cancelButton = overlay.querySelector<HTMLButtonElement>(".game-confirm-cancel")!;
  const acceptButton = overlay.querySelector<HTMLButtonElement>(".game-confirm-accept")!;

  let settle: ((answer: boolean) => void) | null = null;

  function close(answer: boolean) {
    const resolve = settle;
    settle = null;
    overlay.hidden = true;
    resolve?.(answer);
  }

  function detailRow(detail: ConfirmDetail) {
    const row = root.createElement("div");
    row.className = "game-confirm-detail";
    if (detail.kind) row.dataset.detailKind = detail.kind;
    const label = root.createElement("span");
    label.className = "game-confirm-detail-label";
    label.textContent = detail.label;
    const value = root.createElement("span");
    value.className = "game-confirm-detail-value";
    value.textContent = detail.value;
    row.append(label, value);
    return row;
  }

  cancelButton.addEventListener("click", () => close(false));
  acceptButton.addEventListener("click", () => close(true));
  // Clicking the darkened surround is a dismissal, the same as Cancel. A click
  // inside the frame must not count, so only the overlay itself answers.
  overlay.addEventListener("click", event => { if (event.target === overlay) close(false); });
  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.stopPropagation(); close(false); }
  });

  return {
    confirm(request) {
      close(false);
      const { message: text, details: rows = [], confirmLabel = "OK", cancelLabel = "Cancel", danger = false } = request;
      message.textContent = text;
      details.replaceChildren(...rows.map(detailRow));
      acceptButton.textContent = confirmLabel;
      cancelButton.textContent = cancelLabel;
      frame.classList.toggle("is-danger", danger);
      overlay.hidden = false;
      // Something irreversible starts on the way out, so a stray Enter or a tap
      // where the last prompt left focus cannot destroy anything.
      (danger ? cancelButton : acceptButton).focus?.();
      return new Promise<boolean>(resolve => { settle = resolve; });
    },
    destroy() {
      close(false);
      overlay.remove();
    },
  };
}

let shared: ConfirmDialog | null = null;
/** The one prompt the game shares, created the first time something asks. */
export function gameConfirm(request: ConfirmRequest) {
  shared ??= createConfirmDialog();
  return shared.confirm(request);
}
