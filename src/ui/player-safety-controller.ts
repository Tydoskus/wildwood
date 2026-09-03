import { CHAT_REPORT_REASONS, isChatReportReason, type ChatReportReason } from "../../shared/chat-report";
import { PLAYER_REPORT_NOTE_LIMIT } from "../../shared/player-safety";

type Result = { ok: boolean; error?: string };

export function createPlayerSafetyController(elements: {
  blockedSetting: HTMLElement; blockedList: HTMLElement;
}, api: {
  localIdentity: () => string;
  isBlocked: (identity: string) => boolean;
  blockedPlayers: () => { identity: string; name: string }[];
  setBlocked: (identity: string, blocked: boolean) => Promise<Result>;
  report: (identity: string, reason: ChatReportReason, note: string) => Promise<Result>;
  showMessage: (message: string, color: string) => void;
  onChanged: () => void;
  beforeOpen: () => void;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "player-safety-dialog";
  dialog.setAttribute("aria-labelledby", "playerSafetyTitle");
  dialog.innerHTML = `<form>
    <h2 id="playerSafetyTitle"></h2><p class="player-safety-description"></p>
    <label class="player-safety-reason">Reason<select required aria-label="Report reason"></select></label>
    <label class="player-safety-note">Details (optional)<textarea maxlength="${PLAYER_REPORT_NOTE_LIMIT}" aria-label="Report details" placeholder="What happened? Please don't include passwords or payment details."></textarea></label>
    <p role="status" aria-live="polite"></p>
    <footer><button type="button">Cancel</button><button type="submit"></button></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form")!;
  const title = dialog.querySelector("h2")!;
  const description = dialog.querySelector<HTMLElement>(".player-safety-description")!;
  const reasonLabel = dialog.querySelector<HTMLElement>(".player-safety-reason")!;
  const noteLabel = dialog.querySelector<HTMLElement>(".player-safety-note")!;
  const reason = dialog.querySelector("select")!;
  const note = dialog.querySelector("textarea")!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('button[type="button"]')!;
  const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = "Choose a reason"; placeholder.disabled = true;
  reason.append(placeholder);
  for (const entry of CHAT_REPORT_REASONS) {
    const option = document.createElement("option");
    option.value = entry.value; option.textContent = entry.label; reason.append(option);
  }
  let target = "";
  let owner = "";
  let mode: "report" | "block" | "unblock" = "report";
  let pending = false;
  let revision = 0;
  let renderedBlocks = "";

  function close() { revision += 1; pending = false; dialog.close(); }
  function open(identity: string, name: string, action: "report" | "block") {
    if (!identity || identity === api.localIdentity()) return;
    if (dialog.open) close();
    api.beforeOpen();
    target = identity; owner = api.localIdentity();
    mode = action === "block" && api.isBlocked(identity) ? "unblock" : action;
    pending = false; revision += 1;
    title.textContent = `${mode === "report" ? "Report" : mode === "block" ? "Block" : "Unblock"} ${name}?`;
    description.textContent = mode === "report"
      ? "This report is private and sent to the WildStat team for review. For a specific chat message, use its Report action to include the message."
      : mode === "block"
        ? "Hide this player's chat and speech bubbles and prevent new duels between you. They will still appear in the shared world. You can unblock them in Settings."
        : "Show this player's chat again and allow new duels between you.";
    reasonLabel.hidden = noteLabel.hidden = mode !== "report";
    reason.disabled = note.disabled = mode !== "report";
    reason.value = ""; note.value = ""; status.textContent = ""; submit.disabled = false;
    submit.textContent = mode === "report" ? "Send report" : mode === "block" ? "Block player" : "Unblock player";
    dialog.showModal();
    (mode === "report" ? reason : cancel).focus();
  }
  cancel.addEventListener("click", close);
  // Keep arrow keys in the reason selector and Escape in this dialog, rather
  // than also moving the character or closing the underlying profile.
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("cancel", () => { revision += 1; pending = false; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending || owner !== api.localIdentity()) return;
    if (mode === "report" && !isChatReportReason(reason.value)) return;
    pending = true; submit.disabled = true; status.textContent = "";
    const submittedRevision = revision;
    const submittedMode = mode;
    try {
      const result = mode === "report"
        ? await api.report(target, reason.value as ChatReportReason, note.value)
        : await api.setBlocked(target, mode === "block");
      if (revision !== submittedRevision || owner !== api.localIdentity()) return;
      pending = false; submit.disabled = false;
      if (!result.ok) { status.textContent = result.error || "Could not save. Please try again."; return; }
      close(); refresh(); api.onChanged();
      api.showMessage(submittedMode === "report" ? "REPORT SENT" : submittedMode === "block" ? "PLAYER BLOCKED" : "PLAYER UNBLOCKED", "#c9f5c2");
    } catch {
      if (revision !== submittedRevision) return;
      pending = false; submit.disabled = false; status.textContent = "Connection failed. Please try again.";
    }
  });

  function refresh() {
    if (dialog.open && owner !== api.localIdentity()) close();
    const blocks = api.blockedPlayers();
    const signature = JSON.stringify([api.localIdentity(), blocks]);
    if (signature === renderedBlocks) return;
    renderedBlocks = signature;
    elements.blockedSetting.hidden = blocks.length === 0;
    elements.blockedList.replaceChildren();
    for (const block of blocks) {
      const row = document.createElement("div");
      const name = document.createElement("span"); name.textContent = block.name;
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Unblock";
      button.setAttribute("aria-label", `Unblock ${block.name}`);
      button.addEventListener("click", () => open(block.identity, block.name, "block"));
      row.append(name, button); elements.blockedList.append(row);
    }
  }
  return { open, refresh };
}
