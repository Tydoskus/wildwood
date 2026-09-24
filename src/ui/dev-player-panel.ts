import type { DevPlayerSummary } from "../../shared/dev-review";
import type { ModerationHistoryPage } from "../../shared/moderation-history";
import type { ConfirmPrompt } from "./confirm-dialog";
import { BAN_CHOICES, MUTE_CHOICES, banConsequence, isAccessDenied, remainingLabel } from "./dev-review-format";
import { renderModerationHistoryEntry } from "./moderation-history-panel";

type ActionResult = { ok?: boolean; error?: string } | undefined;

export type DevPlayerApi = {
  findPlayers: (query: string) => Promise<DevPlayerSummary[]>;
  playerHistory: (identity: string) => Promise<ModerationHistoryPage>;
  setChatMute: (identity: string, minutes: number) => Promise<ActionResult>;
  suspend: (identity: string, expectedDisplayName: string, hours: number, reason: string) => Promise<ActionResult>;
  liftSuspension: (identity: string, reason: string) => Promise<ActionResult>;
};

export type DevPlayerPanelDependencies = {
  api: () => DevPlayerApi | null;
  confirm: ConfirmPrompt;
  showMessage: (message: string, color: string) => void;
  onAccessDenied: () => void;
};

const OK_COLOR = "#72ef58";
const ERROR_COLOR = "#ff9b91";

/** Players tab: find an account by name, then mute, ban or read its history. */
export function createDevPlayerPanel(container: HTMLElement, dependencies: DevPlayerPanelDependencies) {
  const form = document.createElement("form");
  form.className = "dev-player-search";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Player name or account ID";
  input.setAttribute("aria-label", "Player name or account ID");
  input.autocomplete = "off";
  input.maxLength = 80;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "dev-review-action is-primary";
  submit.textContent = "Search";
  form.append(input, submit);
  const status = document.createElement("p");
  status.className = "dev-review-status";
  status.setAttribute("role", "status");
  const results = document.createElement("div");
  results.className = "dev-player-results";
  const cardRoot = document.createElement("section");
  cardRoot.className = "dev-player-card";
  cardRoot.hidden = true;
  container.replaceChildren(form, status, results, cardRoot);

  let generation = 0;
  let selected: DevPlayerSummary | null = null;
  let reason = "";
  let busy = false;

  function failed(error: unknown) {
    if (isAccessDenied(error)) { dependencies.onAccessDenied(); return; }
    status.textContent = error instanceof Error ? error.message : "Something went wrong. Try again.";
  }

  async function search(query: string, pick?: string) {
    const api = dependencies.api();
    if (!api) { status.textContent = "Connect to look up players."; return; }
    const request = ++generation;
    status.textContent = "Searching…";
    results.replaceChildren();
    try {
      const players = await api.findPlayers(query);
      if (request !== generation) return;
      status.textContent = players.length ? "" : "No player matches that name.";
      results.replaceChildren(...players.map(player => resultButton(player)));
      const match = players.find(player => player.identity === pick) ?? (players.length === 1 ? players[0] : null);
      if (match) void select(match);
    } catch (error) {
      if (request === generation) failed(error);
    }
  }

  function resultButton(player: DevPlayerSummary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dev-player-result";
    const name = document.createElement("strong");
    name.textContent = player.displayName;
    const meta = document.createElement("span");
    meta.textContent = [player.isGuest ? "Guest" : "Account", player.online ? "Online" : "Offline",
      player.suspendedUntilMs ? "Banned" : "", player.chatMutedUntilMs ? "Muted" : ""].filter(Boolean).join(" · ");
    button.append(name, meta);
    button.addEventListener("click", () => { void select(player); });
    return button;
  }

  async function select(player: DevPlayerSummary) {
    selected = player;
    const request = generation;
    renderCard(null);
    const api = dependencies.api();
    if (!api) return;
    try {
      const history = await api.playerHistory(player.identity);
      if (request === generation && selected?.identity === player.identity) renderCard(history);
    } catch (error) {
      if (request === generation) failed(error);
    }
  }

  function stateLine(text: string, tone: "ok" | "warn") {
    const line = document.createElement("p");
    line.className = "dev-player-state";
    line.dataset.tone = tone;
    line.textContent = text;
    return line;
  }

  function button(label: string, variant: "primary" | "plain" | "danger", run: () => void, disabled = false) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `dev-review-action is-${variant}`;
    element.textContent = label;
    element.disabled = busy || disabled;
    element.addEventListener("click", run);
    return element;
  }

  function group(title: string, ...buttons: HTMLButtonElement[]) {
    const heading = document.createElement("h4");
    heading.textContent = title;
    const row = document.createElement("div");
    row.className = "dev-review-actions";
    row.append(...buttons);
    return [heading, row];
  }

  function renderCard(history: ModerationHistoryPage | null) {
    const player = selected;
    cardRoot.hidden = !player;
    if (!player) { cardRoot.replaceChildren(); return; }
    const now = Date.now();
    const title = document.createElement("h3");
    title.textContent = player.displayName;
    const id = document.createElement("p");
    id.className = "dev-player-id";
    id.textContent = `${player.isGuest ? "Guest" : "Account"} · ${player.online ? "Online" : "Offline"} · ${player.identity}`;
    const banned = player.permanentlySuspended ? "Banned permanently"
      : player.suspendedUntilMs > now ? `Banned · ${remainingLabel(player.suspendedUntilMs, now)} left` : "Not banned";
    const muted = player.chatMutedUntilMs > now ? `Chat muted · ${remainingLabel(player.chatMutedUntilMs, now)} left` : "Can chat";
    const reasonInput = document.createElement("input");
    reasonInput.type = "text";
    reasonInput.className = "dev-review-note";
    reasonInput.placeholder = "Reason (saved in the moderation log)";
    reasonInput.setAttribute("aria-label", "Reason");
    reasonInput.maxLength = 500;
    reasonInput.value = reason;
    reasonInput.addEventListener("input", () => { reason = reasonInput.value; });
    const isBanned = player.suspendedUntilMs > now;
    const isMuted = player.chatMutedUntilMs > now;
    const historyHeading = document.createElement("h4");
    historyHeading.textContent = "Moderation history";
    const historyList = document.createElement("div");
    historyList.className = "moderation-history-rows dev-player-history";
    if (!history) historyList.textContent = "Loading…";
    else if (!history.entries.length) historyList.textContent = "Nothing recorded for this player.";
    else historyList.append(...history.entries.map(renderModerationHistoryEntry));
    cardRoot.replaceChildren(
      title, id,
      stateLine(banned, isBanned ? "warn" : "ok"),
      stateLine(muted, isMuted ? "warn" : "ok"),
      reasonInput,
      ...group("Chat",
        ...MUTE_CHOICES.map(choice => button(choice.label, "plain", () => { void mute(player, choice.minutes, choice.label); })),
        button("Unmute", "primary", () => { void mute(player, 0, "Unmute"); }, !isMuted)),
      ...group("Account",
        ...BAN_CHOICES.map(choice => button(choice.label, "danger", () => { void ban(player, choice); })),
        button("Lift ban", "primary", () => { void lift(player); }, !isBanned)),
      historyHeading, historyList,
    );
  }

  async function run(player: DevPlayerSummary, success: string, work: (api: DevPlayerApi) => Promise<ActionResult>) {
    const api = dependencies.api();
    if (!api || busy) return;
    busy = true;
    renderCard(null);
    try {
      const result = await work(api);
      if (result?.ok) { reason = ""; dependencies.showMessage(success, OK_COLOR); }
      else dependencies.showMessage(result?.error || "That didn't go through. Try again.", ERROR_COLOR);
    } finally {
      busy = false;
      // Re-read the account so the card shows the server's state, not a guess.
      await search(player.identity, player.identity);
    }
  }

  function mute(player: DevPlayerSummary, minutes: number, label: string) {
    return run(player, minutes ? `${player.displayName}: ${label.toLowerCase()}` : `${player.displayName} can chat again`,
      api => api.setChatMute(player.identity, minutes));
  }

  async function ban(player: DevPlayerSummary, choice: typeof BAN_CHOICES[number]) {
    const text = reason.trim();
    if (!text) { dependencies.showMessage("Write a reason before banning.", ERROR_COLOR); return; }
    const confirmed = await dependencies.confirm({
      message: `Ban ${player.displayName} ${choice.words}? ${banConsequence(choice.hours)}`,
      details: [{ label: "Reason", value: text, kind: "cost" }], confirmLabel: choice.label, danger: true,
    });
    if (confirmed) await run(player, `${player.displayName} banned ${choice.words}`,
      api => api.suspend(player.identity, player.displayName, choice.hours, text));
  }

  async function lift(player: DevPlayerSummary) {
    const confirmed = await dependencies.confirm({ message: `Lift ${player.displayName}'s ban now?`, confirmLabel: "Lift ban" });
    if (confirmed) await run(player, `${player.displayName} can play again`, api => api.liftSuspension(player.identity, reason.trim()));
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query) void search(query);
  });

  return {
    /** Opens a player's card straight from a report. */
    open(identity: string, displayName: string) {
      input.value = displayName;
      selected = null;
      reason = "";
      renderCard(null);
      void search(identity, identity);
    },
    clear() {
      generation++;
      selected = null; reason = ""; busy = false;
      input.value = "";
      status.textContent = "";
      results.replaceChildren();
      renderCard(null);
    },
  };
}
