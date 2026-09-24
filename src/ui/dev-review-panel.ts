import { REVIEW_NOTE_MAX_LENGTH, type DevBugEntry, type DevReportContextLine, type DevReportEntry, type DevReviewDecision, type DevReviewQueue } from "../../shared/dev-review";
import type { ConfirmPrompt } from "./confirm-dialog";
import { BAN_CHOICES, MUTE_CHOICES, banConsequence, channelLabel, decisionLabel, isAccessDenied, relativeTime, statusLabel } from "./dev-review-format";

type ActionResult = { ok?: boolean; error?: string } | undefined;

export type DevReviewApi = {
  reviewQueue: () => Promise<DevReviewQueue>;
  reviewReport: (reportKey: string, decision: string, note: string, mailReporter: boolean) => Promise<ActionResult>;
  reviewBug: (id: string, decision: string, note: string, mailReporter: boolean) => Promise<ActionResult>;
  setChatMute: (identity: string, minutes: number) => Promise<ActionResult>;
  suspend: (identity: string, expectedDisplayName: string, hours: number, reason: string) => Promise<ActionResult>;
};

export type DevReviewPanelDependencies = {
  api: () => DevReviewApi | null;
  deleteBug: (id: bigint) => Promise<ActionResult> | ActionResult;
  confirm: ConfirmPrompt;
  showMessage: (message: string, color: string) => void;
  onCounts: (counts: { reports: number; bugs: number }) => void;
  openPlayer: (identity: string, displayName: string) => void;
};

export type DevReviewLoad = { state: "ok" } | { state: "denied" } | { state: "failed"; error: string };

const OK_COLOR = "#72ef58";
const ERROR_COLOR = "#ff9b91";

type ListSection = { root: HTMLElement; openOnly: HTMLInputElement; count: HTMLElement; status: HTMLElement; list: HTMLElement };

function listSection(container: HTMLElement, kind: string, reload: () => void, rerender: () => void): ListSection {
  const toolbar = document.createElement("div");
  toolbar.className = "dev-review-toolbar";
  const filter = document.createElement("label");
  filter.className = "dev-review-filter";
  const openOnly = document.createElement("input");
  openOnly.type = "checkbox";
  openOnly.checked = true;
  filter.append(openOnly, document.createTextNode("Open only"));
  const count = document.createElement("span");
  count.className = "dev-review-count";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "secondary-button dev-review-refresh";
  refresh.textContent = "Refresh";
  refresh.setAttribute("aria-label", `Refresh ${kind}`);
  toolbar.append(filter, count, refresh);
  const status = document.createElement("p");
  status.className = "dev-review-status";
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "dev-review-list";
  container.replaceChildren(toolbar, status, list);
  openOnly.addEventListener("change", rerender);
  refresh.addEventListener("click", reload);
  return { root: container, openOnly, count, status, list };
}

/**
 * The Reports and Bugs tabs. Pending items come first, oldest first, so the
 * first thing on screen is what still needs a decision; reviewed items follow,
 * newest first, with who decided what and when.
 */
export function createDevReviewPanel(containers: { reports: HTMLElement; bugs: HTMLElement }, dependencies: DevReviewPanelDependencies) {
  let queue: DevReviewQueue | null = null;
  let clockOffsetMs = 0;
  let generation = 0;
  const notes = new Map<string, string>();
  const expanded = new Set<string>();
  const banOpen = new Set<string>();
  /** Cards where "Mail the reporter" was unticked; it starts ticked. */
  const noMail = new Set<string>();
  const busy = new Set<string>();
  const reports = listSection(containers.reports, "reports", () => { void load(); }, () => renderReports());
  const bugs = listSection(containers.bugs, "bugs", () => { void load(); }, () => renderBugs());

  const now = () => Date.now() + clockOffsetMs;

  async function load(): Promise<DevReviewLoad> {
    const api = dependencies.api();
    const request = ++generation;
    if (!api) {
      const error = "Connect to load reports.";
      reports.status.textContent = bugs.status.textContent = error;
      return { state: "failed", error };
    }
    if (!queue) reports.status.textContent = bugs.status.textContent = "Loading…";
    try {
      const next = await api.reviewQueue();
      if (request !== generation) return { state: "ok" };
      queue = next;
      clockOffsetMs = next.serverNowMs - Date.now();
      render();
      dependencies.onCounts({ reports: next.openReports, bugs: next.openBugs });
      return { state: "ok" };
    } catch (error) {
      if (isAccessDenied(error)) return { state: "denied" };
      const message = error instanceof Error ? error.message : "Couldn't load the queue. Try again.";
      if (request === generation) reports.status.textContent = bugs.status.textContent = message;
      return { state: "failed", error: message };
    }
  }

  function render() {
    renderReports();
    renderBugs();
  }

  function renderReports() {
    const entries = (queue?.reports ?? []).filter(entry => !reports.openOnly.checked || entry.status === "open");
    reports.count.textContent = queue ? `${queue.openReports} open · oldest first` : "";
    reports.status.textContent = !queue ? "" : entries.length ? ""
      : reports.openOnly.checked ? "No open reports." : "No reports yet.";
    reports.list.replaceChildren(...entries.map(reportCard));
  }

  function renderBugs() {
    const entries = (queue?.bugs ?? []).filter(entry => !bugs.openOnly.checked || entry.status === "open");
    bugs.count.textContent = queue ? `${queue.openBugs} open · oldest first` : "";
    bugs.status.textContent = !queue ? "" : entries.length ? ""
      : bugs.openOnly.checked ? "No open bug reports." : "No bug reports yet.";
    bugs.list.replaceChildren(...entries.map(bugCard));
  }

  function card(key: string, status: string) {
    const article = document.createElement("article");
    article.className = "dev-review-card";
    article.dataset.status = status;
    article.dataset.key = key;
    if (busy.has(key)) article.classList.add("is-busy");
    return article;
  }

  function head(status: string, label: string, atMs: number) {
    const header = document.createElement("header");
    header.className = "dev-review-card-head";
    const pill = document.createElement("span");
    pill.className = "dev-review-pill";
    pill.dataset.status = status;
    pill.textContent = statusLabel(status);
    const channel = document.createElement("span");
    channel.className = "dev-review-channel";
    channel.textContent = label;
    const time = document.createElement("time");
    time.dateTime = new Date(atMs).toISOString();
    time.title = new Date(atMs).toLocaleString();
    time.textContent = relativeTime(atMs, now());
    header.append(pill, channel, time);
    return header;
  }

  /** The reported text, clamped; a tap expands it and shows the conversation around it. */
  function textBlock(key: string, text: string, context: DevReportContextLine[] = []) {
    const block = document.createElement("div");
    block.className = "dev-review-text-block";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dev-review-text";
    const open = expanded.has(key);
    button.classList.toggle("is-expanded", open);
    button.setAttribute("aria-expanded", String(open));
    // The clamp sits on the inner span so the button's padding cannot show a
    // sliver of the fourth line.
    const body = document.createElement("span");
    body.textContent = text || "(no text)";
    button.append(body);
    block.append(button);
    let thread: HTMLOListElement | null = null;
    if (context.length > 1) {
      thread = document.createElement("ol");
      thread.className = "dev-review-context";
      thread.setAttribute("aria-label", "Messages around the reported one");
      thread.hidden = !open;
      for (const line of context) {
        const item = document.createElement("li");
        item.classList.toggle("is-reported", line.reported);
        const who = document.createElement("strong");
        who.textContent = line.senderName || "Player";
        const time = document.createElement("time");
        time.textContent = relativeTime(line.sentAtMs, now());
        item.append(who, document.createTextNode(` ${line.text} `), time);
        thread.append(item);
      }
      block.append(thread);
    }
    button.addEventListener("click", () => {
      const next = !expanded.has(key);
      if (next) expanded.add(key); else expanded.delete(key);
      button.classList.toggle("is-expanded", next);
      button.setAttribute("aria-expanded", String(next));
      if (thread) thread.hidden = !next;
    });
    return block;
  }

  function decisionList(decisions: DevReviewDecision[]) {
    const list = document.createElement("ul");
    list.className = "dev-review-decisions";
    for (const decision of decisions) {
      const item = document.createElement("li");
      item.textContent = `${decisionLabel(decision.decision)} · ${decision.reviewerName} · ${relativeTime(decision.reviewedAtMs, now())}${decision.mailed ? " · reporter mailed" : ""}${decision.note ? ` — ${decision.note}` : ""}`;
      list.append(item);
    }
    return list;
  }

  function noteInput(key: string) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "dev-review-note";
    input.maxLength = REVIEW_NOTE_MAX_LENGTH;
    input.placeholder = "Note (optional, also goes in the letter)";
    input.setAttribute("aria-label", "Decision note, included in the reporter's letter");
    input.value = notes.get(key) ?? "";
    input.addEventListener("input", () => { notes.set(key, input.value); });
    const mail = document.createElement("label");
    mail.className = "dev-review-filter dev-review-mail";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !noMail.has(key);
    box.addEventListener("change", () => { if (box.checked) noMail.delete(key); else noMail.add(key); });
    mail.append(box, document.createTextNode("Mail the reporter"));
    const row = document.createElement("div");
    row.className = "dev-review-note-row";
    row.append(input, mail);
    return row;
  }

  function action(label: string, variant: "primary" | "plain" | "danger", run: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dev-review-action is-${variant}`;
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  function actionRow(...buttons: HTMLButtonElement[]) {
    const row = document.createElement("div");
    row.className = "dev-review-actions";
    row.append(...buttons);
    return row;
  }

  /** Runs one decision with the card locked, then reloads the queue. */
  async function act(key: string, success: string, work: () => Promise<ActionResult>) {
    if (busy.has(key)) return;
    busy.add(key);
    render();
    try {
      const result = await work();
      if (!result?.ok) {
        dependencies.showMessage(result?.error || "That didn't go through. Try again.", ERROR_COLOR);
        return;
      }
      notes.delete(key);
      banOpen.delete(key);
      noMail.delete(key);
      dependencies.showMessage(success, OK_COLOR);
    } finally {
      busy.delete(key);
      await load();
      render();
    }
  }

  const note = (key: string) => (notes.get(key) ?? "").trim();
  const mailing = (key: string) => !noMail.has(key);

  function reportCard(entry: DevReportEntry) {
    const article = card(entry.key, entry.status);
    const who = document.createElement("p");
    who.className = "dev-review-who";
    const target = document.createElement("strong");
    target.textContent = entry.targetName || "Unknown player";
    who.append(target, document.createTextNode(` reported by ${entry.reporterName} · ${entry.reason}`));
    article.append(head(entry.status, channelLabel(entry.channel), entry.reportedAtMs), who);
    if (entry.where || entry.sentAtMs) {
      const where = document.createElement("p");
      where.className = "dev-review-where";
      where.textContent = [entry.where, entry.sentAtMs ? `sent ${relativeTime(entry.sentAtMs, now())}` : ""].filter(Boolean).join(" · ");
      article.append(where);
    }
    article.append(textBlock(entry.key, entry.text, entry.context));
    if (entry.messageRemoved) {
      const removed = document.createElement("p");
      removed.className = "dev-review-flag";
      removed.textContent = "Message already removed from chat";
      article.append(removed);
    }
    if (entry.decisions.length) article.append(decisionList(entry.decisions));
    article.append(noteInput(entry.key));
    const api = dependencies.api();
    const review = (decision: string, success: string) => act(entry.key, success,
      async () => api ? api.reviewReport(entry.key, decision, note(entry.key), mailing(entry.key)) : { ok: false, error: "Not connected." });
    const history = action("History", "plain", () => dependencies.openPlayer(entry.targetIdentity, entry.targetName));
    if (entry.status !== "open") {
      article.append(actionRow(action("Reopen", "plain", () => { void review("reopened", "Report reopened"); }), history));
      return article;
    }
    const buttons: HTMLButtonElement[] = [];
    if (entry.canRemoveMessage) buttons.push(action("Remove message", "primary", () => { void review("removed", "Message removed"); }));
    buttons.push(action("Dismiss", "plain", () => { void review("dismissed", "Report dismissed"); }));
    for (const choice of MUTE_CHOICES) buttons.push(action(choice.label, "plain", () => {
      void act(entry.key, `${entry.targetName} muted`, async () => {
        if (!api) return { ok: false, error: "Not connected." };
        const muted = await api.setChatMute(entry.targetIdentity, choice.minutes);
        return muted?.ok ? api.reviewReport(entry.key, choice.decision, note(entry.key), mailing(entry.key)) : muted;
      });
    }));
    buttons.push(action(banOpen.has(entry.key) ? "Cancel ban" : "Ban…", "danger", () => {
      if (banOpen.has(entry.key)) banOpen.delete(entry.key); else banOpen.add(entry.key);
      renderReports();
    }));
    buttons.push(history);
    article.append(actionRow(...buttons));
    if (banOpen.has(entry.key)) article.append(banRow(entry, api));
    return article;
  }

  function banRow(entry: DevReportEntry, api: DevReviewApi | null) {
    const row = actionRow(...BAN_CHOICES.map(choice => action(choice.label, "danger", async () => {
      const confirmed = await dependencies.confirm({
        message: `Ban ${entry.targetName} ${choice.words}? ${banConsequence(choice.hours)}`,
        details: [{ label: "Reason", value: note(entry.key) || entry.reason, kind: "cost" }],
        confirmLabel: choice.label, danger: true,
      });
      if (!confirmed) return;
      void act(entry.key, `${entry.targetName} banned ${choice.words}`, async () => {
        if (!api) return { ok: false, error: "Not connected." };
        const reason = note(entry.key) || `${choice.label} from report ${entry.key}: ${entry.reason}`;
        const banned = await api.suspend(entry.targetIdentity, entry.targetName, choice.hours, reason);
        // The ban's label is the log note, never the letter: a reporter learns only that action was taken.
        return banned?.ok ? api.reviewReport(entry.key, "banned", note(entry.key), mailing(entry.key)) : banned;
      });
    })));
    row.classList.add("dev-review-ban-choices");
    return row;
  }

  function bugCard(entry: DevBugEntry) {
    const key = `bug:${entry.id}`;
    const article = card(key, entry.status);
    const who = document.createElement("p");
    who.className = "dev-review-who";
    const reporter = document.createElement("strong");
    reporter.textContent = entry.reporterName || "Unknown player";
    who.append(reporter, document.createTextNode(` · protocol ${entry.protocolVersion} · #${entry.id}`));
    article.append(head(entry.status, "Bug report", entry.reportedAtMs), who, textBlock(key, entry.message));
    if (entry.decisions.length) article.append(decisionList(entry.decisions));
    article.append(noteInput(key));
    const api = dependencies.api();
    const review = (decision: string, success: string) => act(key, success,
      async () => api ? api.reviewBug(entry.id, decision, note(key), mailing(key)) : { ok: false, error: "Not connected." });
    const copy = action("Copy text", "plain", () => { void copyText(entry); });
    const remove = action("Delete", "danger", async () => {
      const confirmed = await dependencies.confirm({
        message: "Delete this bug report? Use this for spam only; the decision log keeps a line saying you deleted it.",
        confirmLabel: "Delete", danger: true,
      });
      if (confirmed) void act(key, "Bug report deleted", async () => await dependencies.deleteBug(BigInt(entry.id)));
    });
    if (entry.status === "open") {
      article.append(actionRow(
        action("Resolved", "primary", () => { void review("resolved", "Bug marked resolved"); }),
        action("Won't fix", "plain", () => { void review("wont_fix", "Bug marked won't fix"); }),
        action("Duplicate", "plain", () => { void review("duplicate", "Bug marked duplicate"); }),
        copy, remove,
      ));
    } else {
      article.append(actionRow(action("Reopen", "plain", () => { void review("reopened", "Bug reopened"); }), copy, remove));
    }
    return article;
  }

  async function copyText(entry: DevBugEntry) {
    const text = `${entry.message}\n\n— ${entry.reporterName} (${entry.reporterIdentity}) · protocol ${entry.protocolVersion} · ${new Date(entry.reportedAtMs).toISOString()}`;
    try {
      await navigator.clipboard.writeText(text);
      dependencies.showMessage("Bug report copied", OK_COLOR);
    } catch {
      dependencies.showMessage("Copy isn't available here. Tap the text to expand it and select it.", ERROR_COLOR);
    }
  }

  return {
    load,
    render,
    clear() {
      generation++;
      queue = null;
      notes.clear(); expanded.clear(); banOpen.clear(); busy.clear(); noMail.clear();
      reports.list.replaceChildren(); bugs.list.replaceChildren();
      reports.status.textContent = bugs.status.textContent = "";
      reports.count.textContent = bugs.count.textContent = "";
    },
  };
}
