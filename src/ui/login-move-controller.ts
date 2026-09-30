type Hooks = {
  signedIn: () => boolean;
  /** Leaves a one-time code on this login and opens the sign-in page; resolves only if that failed. */
  move: () => Promise<{ ok: boolean; error?: string } | undefined>;
};

/**
 * Settings → Account: move this character to a Google sign-in.
 *
 * Each SpacetimeAuth user is its own login with its own character, so a player
 * on an email link who signs in with Google lands on an empty one. This moves
 * the character over instead (spacetimedb/src/account-transfer.ts). Signed-in
 * accounts only: a guest's "Sign in" already takes the guest save along.
 */
export function installLoginMove(doc: Document, hooks: Hooks) {
  const account = doc.getElementById("settings-account-panel");
  if (!account || doc.getElementById("moveToGoogleButton")) return;
  // Shares Delete Account's look (mailbox.css), so no stylesheet change.
  const row = doc.createElement("div"); row.className = "setting-row setting-delete-account setting-login-move";
  const button = doc.createElement("button"); button.id = "moveToGoogleButton";
  button.type = "button"; button.className = "window-back-button"; button.textContent = "Move to Google Sign-In";
  row.append(button);
  const deletion = doc.getElementById("deleteAccountButton")?.parentElement;
  if (deletion?.parentElement === account) account.insertBefore(row, deletion); else account.append(row);
  const dialog = doc.createElement("dialog"); dialog.className = "game-mailbox account-deletion-dialog login-move-dialog";
  dialog.setAttribute("aria-labelledby", "loginMoveTitle");
  dialog.innerHTML = `<div class="mailbox-scroll"><h2 id="loginMoveTitle">Move to Google Sign-In?</h2>
    <p>You'll go to the sign-in page. Choose <strong>Google</strong>, and your character moves to that Google account. From then on, sign in with Google.</p>
    <p>Use a Google account that hasn't played WildStat, and close WildStat in your other tabs and devices first.</p>
    <p>Nothing is deleted. Your old sign-in keeps an empty character.</p>
    <p class="account-deletion-status login-move-status" role="status" aria-live="polite"></p></div>
    <footer class="window-back-footer"><button type="button" class="daily-gem-claim-button" data-move-confirm>Continue to Sign-In</button>
    <button type="button" class="window-back-button" data-move-cancel>Cancel</button></footer>`;
  doc.body.append(dialog);
  const confirm = dialog.querySelector<HTMLButtonElement>("[data-move-confirm]")!;
  const cancel = dialog.querySelector<HTMLButtonElement>("[data-move-cancel]")!;
  const status = dialog.querySelector<HTMLElement>(".login-move-status")!;
  let pending = false;

  // The button is only reachable by tapping into Settings, so each tap is a fresh enough look.
  const refresh = () => { const hidden = !hooks.signedIn(); if (row.hidden !== hidden) row.hidden = hidden; };
  refresh();
  doc.addEventListener("click", refresh, true);

  button.addEventListener("click", () => {
    if (pending) return;
    confirm.disabled = false; cancel.disabled = false; status.textContent = "";
    dialog.showModal(); cancel.focus();
  });
  confirm.addEventListener("click", () => {
    if (pending) return;
    if (!hooks.signedIn()) { status.textContent = "Sign in to your character first."; return; }
    pending = true; confirm.disabled = true; cancel.disabled = true; status.textContent = "Saving and opening sign-in…";
    const failed = (message?: string) => {
      status.textContent = message ?? "Couldn't start the move. Please try again.";
      pending = false; confirm.disabled = false; cancel.disabled = false;
    };
    // On the web the page is already leaving for the sign-in page; the app opens it in a sheet.
    void hooks.move().then(result => {
      if (!result?.ok) { failed(result?.error); return; }
      status.textContent = "Choose Google on the sign-in page.";
      pending = false; cancel.disabled = false;
    }, () => failed());
  });
  const close = () => { if (!pending) dialog.close(); };
  cancel.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
}
