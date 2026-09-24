import type { ModerationHistoryEntry, ModerationHistoryPage } from "../../shared/moderation-history";

export type ModerationHistoryLoader = (beforeId: string) => Promise<ModerationHistoryPage>;

/** Evidence stays out of the DOM until the developer opens this tab. */
export function createModerationHistoryPanel(container: HTMLElement, load: ModerationHistoryLoader) {
  const toolbar = document.createElement("div"); toolbar.className = "moderation-history-toolbar";
  const title = document.createElement("strong"); title.textContent = "Moderation history";
  const refresh = document.createElement("button"); refresh.type = "button";
  refresh.className = "secondary-button"; refresh.textContent = "Refresh";
  toolbar.append(title, refresh);
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const rows = document.createElement("div"); rows.className = "moderation-history-rows";
  const older = document.createElement("button"); older.type = "button";
  older.className = "secondary-button"; older.textContent = "Load older"; older.hidden = true;
  container.append(toolbar, status, rows, older);
  let generation = 0, busy = false, beforeId = "0";

  async function fetchPage(reset: boolean) {
    if (busy) return;
    const request = ++generation;
    busy = true; refresh.disabled = true; older.disabled = true;
    status.textContent = "Loading…";
    try {
      const page = await load(reset ? "0" : beforeId);
      if (request !== generation) return;
      if (reset) rows.replaceChildren();
      for (const entry of page.entries) rows.append(renderModerationHistoryEntry(entry));
      beforeId = page.beforeId; older.hidden = !page.hasMore;
      status.textContent = rows.childElementCount ? "" : "No moderation actions recorded yet.";
    } catch (error) {
      if (request === generation) status.textContent = error instanceof Error ? error.message : "Couldn’t load moderation history. Try again.";
    } finally {
      if (request === generation) { busy = false; refresh.disabled = false; older.disabled = false; }
    }
  }
  function clear() {
    generation++; busy = false; beforeId = "0";
    rows.replaceChildren(); status.textContent = ""; older.hidden = true;
    refresh.disabled = false; older.disabled = false;
  }
  refresh.addEventListener("click", () => { void fetchPage(true); });
  older.addEventListener("click", () => { void fetchPage(false); });
  return { open: () => { clear(); void fetchPage(true); }, clear };
}

/** One action, collapsed to who/what/why; the evidence opens underneath. */
export function renderModerationHistoryEntry(entry: ModerationHistoryEntry) {
  const details = document.createElement("details"); details.className = "moderation-history-entry";
  const summary = document.createElement("summary");
  const heading = document.createElement("strong"); heading.textContent = `${entry.targetName} · ${entry.action}`;
  const meta = document.createElement("span"); meta.className = "moderation-history-meta";
  const channel = ({ world: "World", dm: "Private chat", guild: "Guild chat", profile: "Profile", account: "Account", game: "Game" } as Record<string, string>)[entry.channel] ?? entry.channel;
  meta.textContent = `${new Date(entry.recordedAtMs).toLocaleString()} · ${channel} · ${entry.actorType === "automatic" ? "Automatic" : entry.actorName}`;
  const reason = document.createElement("span"); reason.textContent = entry.reason;
  summary.append(heading, meta, reason); details.append(summary);
  for (const [label, value] of [["Before", entry.before], ["After", entry.after]]) {
    const caption = document.createElement("strong"); caption.textContent = label;
    const evidence = document.createElement("pre"); evidence.textContent = value || "—";
    details.append(caption, evidence);
  }
  const identifiers = document.createElement("p"); identifiers.className = "moderation-history-meta";
  identifiers.textContent = [`Action #${entry.id}`, `Account: ${entry.targetIdentity}`,
    entry.messageId && `Message: ${entry.messageId}`, entry.actorIdentity && `Moderator: ${entry.actorIdentity}`,
    entry.rule && `Rule: ${entry.rule}`, entry.reportId && `Report: ${entry.reportTable} / ${entry.reportId}`].filter(Boolean).join("\n");
  details.append(identifiers);
  return details;
}
