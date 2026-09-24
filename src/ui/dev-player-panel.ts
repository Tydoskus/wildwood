import type { DevPlayerSummary } from "../../shared/dev-review";
import { CUSTOM_BAN_MAX_HOURS, CUSTOM_MUTE_MAX_MINUTES, WARNING_MAX_LENGTH, type DevPlayerCard } from "../../shared/dev-console";
import type { ConfirmPrompt } from "./confirm-dialog";
import { BAN_CHOICES, MUTE_CHOICES, banConsequence, isAccessDenied, relativeTime, remainingLabel } from "./dev-review-format";
import { renderModerationHistoryEntry } from "./moderation-history-panel";

type ActionResult = { ok?: boolean; error?: string } | undefined;

export type DevPlayerApi = {
  findPlayers: (query: string) => Promise<DevPlayerSummary[]>;
  playerCard: (identity: string) => Promise<DevPlayerCard>;
  setChatMute: (identity: string, minutes: number) => Promise<ActionResult>;
  suspend: (identity: string, expectedDisplayName: string, hours: number, reason: string) => Promise<ActionResult>;
  liftSuspension: (identity: string, reason: string) => Promise<ActionResult>;
  warn: (identity: string, message: string) => Promise<ActionResult>;
  resetDisplayName: (identity: string, expectedDisplayName: string, reason: string) => Promise<ActionResult>;
};

export type DevPlayerPanelDependencies = {
  api: () => DevPlayerApi | null;
  confirm: ConfirmPrompt;
  showMessage: (message: string, color: string) => void;
  onAccessDenied: () => void;
};

const OK_COLOR = "#72ef58";
const ERROR_COLOR = "#ff9b91";

/**
 * Players tab: find an account, then everything about it on one card —
 * standing, names, reports, history and recent chat — with mute, ban, warn
 * and rename. Every other tab opens this card when a name is tapped.
 */
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
  let selected: { identity: string; displayName: string } | null = null;
  let card: DevPlayerCard | null = null;
  let reason = "";
  let warning = "";
  let busy = false;
  let clockOffsetMs = 0;

  function failed(error: unknown) {
    if (isAccessDenied(error)) { dependencies.onAccessDenied(); return; }
    status.textContent = error instanceof Error ? error.message : "Something went wrong. Try again.";
  }

  async function search(query: string) {
    const api = dependencies.api();
    if (!api) { status.textContent = "Connect to look up players."; return; }
    const request = ++generation;
    status.textContent = "Searching…";
    results.replaceChildren();
    try {
      const players = await api.findPlayers(query);
      if (request !== generation) return;
      status.textContent = players.length ? "" : "No player matches that name.";
      results.replaceChildren(...players.map(resultButton));
      if (players.length === 1) void select(players[0].identity, players[0].displayName);
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
    button.addEventListener("click", () => { void select(player.identity, player.displayName); });
    return button;
  }

  async function select(identity: string, displayName: string) {
    const changed = selected?.identity !== identity;
    selected = { identity, displayName };
    if (changed) { card = null; reason = ""; warning = ""; }
    const request = ++generation;
    renderCard();
    const api = dependencies.api();
    if (!api) return;
    try {
      const next = await api.playerCard(identity);
      if (request !== generation || selected?.identity !== identity) return;
      card = next;
      clockOffsetMs = next.serverNowMs - Date.now();
      selected = { identity, displayName: next.summary.displayName };
      renderCard();
    } catch (error) {
      if (request === generation) failed(error);
    }
  }

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function stateLine(text: string, tone: "ok" | "warn") {
    const line = element("p", "dev-player-state", text);
    line.dataset.tone = tone;
    return line;
  }

  function button(label: string, variant: "primary" | "plain" | "danger", run: () => void, disabled = false) {
    const node = element("button", `dev-review-action is-${variant}`, label);
    node.type = "button";
    node.disabled = busy || disabled;
    node.addEventListener("click", run);
    return node;
  }

  function group(title: string, ...children: HTMLElement[]) {
    const row = element("div", "dev-review-actions");
    row.append(...children);
    return [element("h4", "", title), row];
  }

  function numberInput(label: string, max: number) {
    const node = element("input", "dev-review-note dev-player-custom");
    node.type = "number";
    node.min = "1";
    node.max = String(max);
    node.inputMode = "numeric";
    node.placeholder = label;
    node.setAttribute("aria-label", label);
    return node;
  }

  function textInput(placeholder: string, value: string, max: number, onInput: (value: string) => void) {
    const node = element("input", "dev-review-note");
    node.type = "text";
    node.placeholder = placeholder;
    node.setAttribute("aria-label", placeholder);
    node.maxLength = max;
    node.value = value;
    node.addEventListener("input", () => onInput(node.value));
    return node;
  }

  function renderCard() {
    cardRoot.hidden = !selected;
    if (!selected) { cardRoot.replaceChildren(); return; }
    const player = selected;
    const title = element("h3", "", player.displayName);
    if (!card) {
      cardRoot.replaceChildren(title, element("p", "dev-review-status", "Loading…"));
      return;
    }
    const { summary } = card;
    const now = Date.now() + clockOffsetMs;
    const isBanned = summary.suspendedUntilMs > now;
    const isMuted = summary.chatMutedUntilMs > now;
    const facts = element("dl", "dev-player-facts");
    for (const [label, value] of [
      ["Account", summary.isGuest ? "Guest" : "Signed-in account"],
      ["Status", summary.online ? "Online" : "Offline"],
      ["Prestige", String(card.prestigeLevel)],
      ["Power", String(card.power)],
      ["Joined", card.joinedAtMs ? new Date(card.joinedAtMs).toLocaleDateString() : "—"],
      ["Strikes", `${card.strikes} · ${card.muteCount} mutes so far`],
      ["Reports", `${card.reportsAgainst} against · ${card.reportsFiled} filed`],
      ["Past names", card.pastNames.join(", ") || "—"],
      ["Account ID", summary.identity],
    ]) {
      const row = element("div", "");
      row.append(element("dt", "", label), element("dd", "", value));
      facts.append(row);
    }
    const custom = { mute: numberInput("Minutes", CUSTOM_MUTE_MAX_MINUTES), ban: numberInput("Hours", CUSTOM_BAN_MAX_HOURS) };
    const history = element("div", "moderation-history-rows dev-player-history");
    if (card.history.length) history.append(...card.history.map(renderModerationHistoryEntry));
    else history.textContent = "Nothing recorded for this player.";
    const chat = element("details", "dev-player-chat");
    chat.append(element("summary", "", `Recent chat (${card.recentChat.length})`));
    const lines = element("ol", "dev-review-context");
    for (const line of card.recentChat) {
      const item = element("li", line.moderated ? "is-reported" : "");
      item.append(element("strong", "", line.where), document.createTextNode(` ${line.text} `), element("time", "", relativeTime(line.sentAtMs, now)));
      lines.append(item);
    }
    if (!card.recentChat.length) lines.append(element("li", "", "No messages in retained chat."));
    chat.append(lines);
    cardRoot.replaceChildren(
      title, facts,
      stateLine(summary.permanentlySuspended ? "Banned permanently" : isBanned ? `Banned · ${remainingLabel(summary.suspendedUntilMs, now)} left` : "Not banned", isBanned ? "warn" : "ok"),
      stateLine(isMuted ? `Chat muted · ${remainingLabel(summary.chatMutedUntilMs, now)} left` : "Can chat", isMuted ? "warn" : "ok"),
      textInput("Reason (saved in the moderation log)", reason, 300, value => { reason = value; }),
      ...group("Chat",
        ...MUTE_CHOICES.map(choice => button(choice.label, "plain", () => { void mute(choice.minutes, choice.label); })),
        custom.mute,
        button("Mute", "plain", () => {
          const minutes = Math.floor(Number(custom.mute.value));
          if (minutes >= 1 && minutes <= CUSTOM_MUTE_MAX_MINUTES) void mute(minutes, `Mute ${minutes}m`);
          else dependencies.showMessage(`Enter 1 to ${CUSTOM_MUTE_MAX_MINUTES} minutes.`, ERROR_COLOR);
        }),
        button("Unmute", "primary", () => { void unmute(); }, !isMuted)),
      ...group("Account",
        ...BAN_CHOICES.map(choice => button(choice.label, "danger", () => { void ban(choice.hours, choice.label, choice.words); })),
        custom.ban,
        button("Ban", "danger", () => {
          const hours = Number(custom.ban.value);
          if (hours > 0 && hours <= CUSTOM_BAN_MAX_HOURS) void ban(hours, `Ban ${hours}h`, `for ${hours} hours`);
          else dependencies.showMessage(`Enter 1 to ${CUSTOM_BAN_MAX_HOURS} hours.`, ERROR_COLOR);
        }),
        button("Unban", "primary", () => { void lift(); }, !isBanned)),
      ...group("Warn and rename",
        textInput("Warning letter to the player", warning, WARNING_MAX_LENGTH, value => { warning = value; }),
        button("Send warning", "plain", () => { void warn(); }),
        button("Reset name", "danger", () => { void resetName(); })),
      element("h4", "", "Moderation history"), history,
      chat,
    );
  }

  async function run(success: string, work: (api: DevPlayerApi) => Promise<ActionResult>) {
    const api = dependencies.api();
    if (!api || busy || !selected) return;
    const { identity, displayName } = selected;
    busy = true;
    renderCard();
    try {
      const result = await work(api);
      if (result?.ok) { reason = ""; dependencies.showMessage(success, OK_COLOR); }
      else dependencies.showMessage(result?.error || "That didn't go through. Try again.", ERROR_COLOR);
    } finally {
      busy = false;
      // Re-read the card so it shows the server's state, not a guess.
      await select(identity, displayName);
    }
  }

  const name = () => selected?.displayName ?? "this player";

  function mute(minutes: number, label: string) {
    const identity = selected?.identity;
    if (!identity) return;
    return run(`${name()}: ${label.toLowerCase()}`, api => api.setChatMute(identity, minutes));
  }

  async function unmute() {
    const identity = selected?.identity;
    if (!identity || !await dependencies.confirm({ message: `Unmute ${name()} now?`, confirmLabel: "Unmute" })) return;
    await run(`${name()} can chat again`, api => api.setChatMute(identity, 0));
  }

  async function ban(hours: number, label: string, words: string) {
    const target = selected;
    const text = reason.trim();
    if (!target) return;
    if (!text) { dependencies.showMessage("Write a reason before banning.", ERROR_COLOR); return; }
    const confirmed = await dependencies.confirm({
      message: `Ban ${target.displayName} ${words}? ${banConsequence(hours)}`,
      details: [{ label: "Reason", value: text, kind: "cost" }], confirmLabel: label, danger: true,
    });
    if (confirmed) await run(`${target.displayName} banned ${words}`, api => api.suspend(target.identity, target.displayName, hours, text));
  }

  async function lift() {
    const identity = selected?.identity;
    if (!identity || !await dependencies.confirm({ message: `Lift ${name()}'s ban now?`, confirmLabel: "Unban" })) return;
    await run(`${name()} can play again`, api => api.liftSuspension(identity, reason.trim()));
  }

  async function warn() {
    const identity = selected?.identity;
    const text = warning.trim();
    if (!identity) return;
    if (!text) { dependencies.showMessage("Write the warning first.", ERROR_COLOR); return; }
    const confirmed = await dependencies.confirm({
      message: `Send ${name()} this warning by mail? It is logged, and does not count as a chat strike.`,
      details: [{ label: "Warning", value: text }], confirmLabel: "Send warning",
    });
    if (!confirmed) return;
    await run(`Warning sent to ${name()}`, async api => {
      const result = await api.warn(identity, text);
      if (result?.ok) warning = "";
      return result;
    });
  }

  async function resetName() {
    const target = selected;
    if (!target) return;
    const confirmed = await dependencies.confirm({
      message: `Reset ${target.displayName}'s name to a generated one? They can pick a new name straight away, for free.`,
      details: [{ label: "Reason", value: reason.trim() || "Reset by the developer", kind: "cost" }], confirmLabel: "Reset name", danger: true,
    });
    if (confirmed) await run(`${target.displayName}'s name was reset`, api => api.resetDisplayName(target.identity, target.displayName, reason.trim()));
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query) void search(query);
  });

  return {
    /** Opens a player's card straight from any other tab. */
    open(identity: string, displayName: string) {
      input.value = displayName;
      results.replaceChildren();
      status.textContent = "";
      void select(identity, displayName);
    },
    clear() {
      generation++;
      selected = null; card = null; reason = ""; warning = ""; busy = false;
      input.value = "";
      status.textContent = "";
      results.replaceChildren();
      renderCard();
    },
  };
}
