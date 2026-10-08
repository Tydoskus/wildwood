type Hooks = {
  identity: () => string;
  request: () => Promise<{ ok: boolean; error?: string } | undefined>;
};

/** A cancelable grace period precedes the authenticated request; nothing is deleted client-side. */
export function installAccountDeletion(doc: Document, hooks: Hooks) {
  const account = doc.getElementById("settings-account-panel");
  if (!account || doc.getElementById("deleteAccountButton")) return;
  const row = doc.createElement("div"); row.className = "setting-row setting-delete-account";
  const button = doc.createElement("button"); button.id = "deleteAccountButton";
  button.type = "button"; button.className = "window-back-button"; button.textContent = "Delete Account";
  row.append(button); account.append(row);
  const dialog = doc.createElement("dialog"); dialog.className = "game-mailbox account-deletion-dialog";
  dialog.setAttribute("aria-labelledby", "accountDeletionTitle");
  dialog.innerHTML = `<div class="mailbox-scroll"><h2 id="accountDeletionTitle">Delete Account?</h2>
    <p>This permanently removes your WildStat character, progress, items, gems and associated account data.</p>
    <p>You have 10 seconds to cancel before the request is sent. Full deletion is processed within 30 days. Limited records may be retained for legal or unresolved safety reasons, as described in our privacy policy.</p>
    <p>Patreon subscriptions must be canceled separately on Patreon. This does not delete your Google account.</p>
    <p class="account-deletion-status" role="status" aria-live="polite"></p></div>
    <footer class="window-back-footer"><button type="button" class="daily-gem-claim-button" data-delete-confirm>Request Deletion</button>
    <button type="button" class="window-back-button" data-delete-cancel>Cancel</button></footer>`;
  doc.body.append(dialog);
  const confirm = dialog.querySelector<HTMLButtonElement>("[data-delete-confirm]")!;
  const cancel = dialog.querySelector<HTMLButtonElement>("[data-delete-cancel]")!;
  const status = dialog.querySelector<HTMLElement>(".account-deletion-status")!;
  let timer: ReturnType<typeof setInterval> | undefined;
  let owner = "", pending = false;
  function clear() { if (timer !== undefined) clearInterval(timer); timer = undefined; }
  function close() { if (pending) return; clear(); dialog.close(); }
  button.addEventListener("click", () => {
    owner = hooks.identity(); clear(); pending = false;
    confirm.hidden = false; confirm.disabled = false; confirm.textContent = "Request Deletion";
    cancel.disabled = false; cancel.textContent = "Cancel"; status.textContent = "";
    dialog.showModal(); cancel.focus();
  });
  confirm.addEventListener("click", () => {
    if (timer !== undefined || pending) return;
    if (!owner || owner !== hooks.identity()) { status.textContent = "Reconnect to your character first."; return; }
    const deadline = Date.now() + 10_000;
    confirm.disabled = true;
    const tick = () => {
      if (owner !== hooks.identity()) { clear(); status.textContent = "Account changed. Request canceled."; confirm.hidden = true; return; }
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
      status.textContent = `Sending deletion request in ${left}s. You can still cancel.`;
      if (left > 0) return;
      clear(); pending = true; cancel.disabled = true; status.textContent = "Sending request…";
      void hooks.request().then(result => {
        if (result?.ok) {
          status.textContent = "Deletion requested. Your full WildStat account and data deletion will be processed within 30 days. Contact support@wildstatmmo.com with any questions.";
          confirm.hidden = true; cancel.textContent = "Close";
        } else { status.textContent = result?.error ?? "Couldn't send the request. Please try again."; confirm.disabled = false; }
      }).catch(() => { status.textContent = "Couldn't send the request. Please try again."; confirm.disabled = false; })
        .finally(() => { pending = false; cancel.disabled = false; });
    };
    timer = setInterval(tick, 250); tick();
  });
  cancel.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("close", clear);
}
