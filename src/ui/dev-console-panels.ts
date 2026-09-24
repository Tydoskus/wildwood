import { CUSTOM_MUTE_MAX_MINUTES, type DevBannedPlayer, type DevConsole, type DevConsoleOverview, type DevMutedPlayer } from "../../shared/dev-console";
import type { ConfirmPrompt } from "./confirm-dialog";
import { isAccessDenied, relativeTime, remainingLabel } from "./dev-review-format";

type ActionResult = { ok?: boolean; error?: string } | undefined;

export type DevConsoleApi = {
  console: () => Promise<DevConsole>;
  serverNow: () => number;
  setChatMute: (identity: string, minutes: number) => Promise<ActionResult>;
  suspend: (identity: string, expectedDisplayName: string, hours: number, reason: string) => Promise<ActionResult>;
  liftSuspension: (identity: string, reason: string) => Promise<ActionResult>;
};

export type DevConsolePanelDependencies = {
  api: () => DevConsoleApi | null;
  confirm: ConfirmPrompt;
  showMessage: (message: string, color: string) => void;
  openPlayer: (identity: string, displayName: string) => void;
  onOverview: (overview: DevConsoleOverview) => void;
  onAccessDenied: () => void;
};

const OK_COLOR = "#72ef58";
const ERROR_COLOR = "#ff9b91";
/** While a Muted or Banned tab is showing, re-read the lists this often; countdowns tick locally in between. */
const POLL_MS = 15_000;

/**
 * The Muted and Banned tabs. Both list soonest-to-end first, so what is about
 * to lapse is at the top; permanent bans sit last. Rows count down every
 * second and drop out on their own when they expire.
 */
export function createDevConsolePanels(containers: { muted: HTMLElement; banned: HTMLElement }, dependencies: DevConsolePanelDependencies) {
  let current: DevConsole | null = null;
  let generation = 0;
  let poll: number | null = null;
  let tick: number | null = null;
  const busy = new Set<string>();
  const status = { muted: statusLine(containers.muted), banned: statusLine(containers.banned) };
  const lists = { muted: listRoot(containers.muted), banned: listRoot(containers.banned) };

  function statusLine(container: HTMLElement) {
    const line = document.createElement("p");
    line.className = "dev-review-status";
    line.setAttribute("role", "status");
    container.replaceChildren(line);
    return line;
  }

  function listRoot(container: HTMLElement) {
    const list = document.createElement("div");
    list.className = "dev-review-list";
    container.append(list);
    return list;
  }

  const now = () => dependencies.api()?.serverNow() ?? Date.now();

  async function load() {
    const api = dependencies.api();
    if (!api) return;
    const request = ++generation;
    try {
      const next = await api.console();
      if (request !== generation) return;
      current = next;
      render();
    } catch (error) {
      if (request !== generation) return;
      if (isAccessDenied(error)) { dependencies.onAccessDenied(); return; }
      status.muted.textContent = status.banned.textContent = error instanceof Error ? error.message : "Couldn't load. Try again.";
    }
  }

  function live<T extends { mutedUntilMs?: number; bannedUntilMs?: number; permanent?: boolean }>(rows: T[]) {
    const at = now();
    return rows.filter(row => row.permanent || (row.mutedUntilMs ?? row.bannedUntilMs ?? 0) > at);
  }

  function render() {
    if (!current) return;
    const muted = live(current.muted), banned = live(current.banned);
    dependencies.onOverview({ ...current.overview, muted: muted.length, banned: banned.length });
    status.muted.textContent = muted.length ? `${muted.length} muted · soonest to end first` : "Nobody is muted.";
    status.banned.textContent = banned.length ? `${banned.length} banned · soonest to end first` : "Nobody is banned.";
    lists.muted.replaceChildren(...muted.map(mutedCard));
    lists.banned.replaceChildren(...banned.map(bannedCard));
  }

  /** Once a second: move every countdown on, and redraw only when a row has run out. */
  function tickCountdowns() {
    if (!current) return;
    const at = now();
    const expired = current.muted.some(row => row.mutedUntilMs <= at) || current.banned.some(row => !row.permanent && row.bannedUntilMs <= at);
    if (expired) {
      current = { ...current, muted: live(current.muted), banned: live(current.banned) };
      render();
      return;
    }
    for (const element of [...lists.muted.querySelectorAll<HTMLElement>("[data-until]"), ...lists.banned.querySelectorAll<HTMLElement>("[data-until]")]) {
      element.textContent = `${remainingLabel(Number(element.dataset.until), at)} left`;
    }
  }

  function action(label: string, variant: "primary" | "plain" | "danger", run: () => void, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dev-review-action is-${variant}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", run);
    return button;
  }

  function row(key: string, name: string, pill: string, pillStatus: string, countdown: HTMLElement, details: string[], buttons: HTMLButtonElement[]) {
    const article = document.createElement("article");
    article.className = "dev-review-card";
    article.dataset.status = "open";
    if (busy.has(key)) article.classList.add("is-busy");
    const header = document.createElement("header");
    header.className = "dev-review-card-head";
    const badge = document.createElement("span");
    badge.className = "dev-review-pill";
    badge.dataset.status = pillStatus;
    badge.textContent = pill;
    const who = document.createElement("strong");
    who.className = "dev-console-name";
    who.textContent = name || "Unknown player";
    header.append(badge, who, countdown);
    const meta = document.createElement("p");
    meta.className = "dev-review-who";
    meta.textContent = details.filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "dev-review-actions";
    actions.append(...buttons);
    article.append(header, meta, actions);
    return article;
  }

  function countdown(untilMs: number | null) {
    const time = document.createElement("time");
    if (untilMs === null) time.textContent = "Permanent";
    else {
      time.dataset.until = String(untilMs);
      time.textContent = `${remainingLabel(untilMs, now())} left`;
    }
    return time;
  }

  async function run(key: string, success: string, work: (api: DevConsoleApi) => Promise<ActionResult>) {
    const api = dependencies.api();
    if (!api || busy.has(key)) return;
    busy.add(key);
    render();
    try {
      const result = await work(api);
      dependencies.showMessage(result?.ok ? success : result?.error || "That didn't go through. Try again.", result?.ok ? OK_COLOR : ERROR_COLOR);
    } finally {
      busy.delete(key);
      await load();
    }
  }

  function mutedCard(entry: DevMutedPlayer) {
    const key = `mute:${entry.identity}`;
    const extend = (minutes: number) => run(key, `${entry.displayName}'s mute extended`, api => api.setChatMute(entry.identity,
      Math.min(CUSTOM_MUTE_MAX_MINUTES, Math.ceil((entry.mutedUntilMs - now()) / 60_000) + minutes)));
    const source = entry.source === "automatic" ? "Automatic" : entry.source ? "By developer" : "Muted";
    return row(key, entry.displayName, source, entry.source === "automatic" ? "dismissed" : "open", countdown(entry.mutedUntilMs),
      [`mute #${entry.muteCount}`, entry.startedAtMs ? `started ${relativeTime(entry.startedAtMs, now())}` : "", entry.reason], [
        action("Unmute", "primary", async () => {
          if (await dependencies.confirm({ message: `Unmute ${entry.displayName} now?`, confirmLabel: "Unmute" })) {
            void run(key, `${entry.displayName} can chat again`, api => api.setChatMute(entry.identity, 0));
          }
        }),
        action("+1h", "plain", () => { void extend(60); }),
        action("+24h", "plain", () => { void extend(1_440); }),
        action("Player", "plain", () => dependencies.openPlayer(entry.identity, entry.displayName)),
      ]);
  }

  function bannedCard(entry: DevBannedPlayer) {
    const key = `ban:${entry.identity}`;
    return row(key, entry.displayName, "Banned", "open", countdown(entry.permanent ? null : entry.bannedUntilMs),
      [entry.by ? `by ${entry.by}` : "", entry.startedAtMs ? `started ${relativeTime(entry.startedAtMs, now())}` : "", entry.reason], [
        action("Unban", "primary", async () => {
          if (await dependencies.confirm({ message: `Lift ${entry.displayName}'s ban now? They can sign straight back in.`, confirmLabel: "Unban" })) {
            void run(key, `${entry.displayName} can play again`, api => api.liftSuspension(entry.identity, "Unbanned from developer tools"));
          }
        }),
        action("+24h", "plain", () => {
          void run(key, `${entry.displayName}'s ban extended`, api => api.suspend(entry.identity, entry.displayName,
            (entry.bannedUntilMs - now()) / 3_600_000 + 24, entry.reason || "Extended from developer tools"));
        }, entry.permanent),
        action("Player", "plain", () => dependencies.openPlayer(entry.identity, entry.displayName)),
      ]);
  }

  function stop() {
    if (poll !== null) window.clearInterval(poll);
    if (tick !== null) window.clearInterval(tick);
    poll = tick = null;
  }

  return {
    load,
    /** Poll and tick only while a Muted or Banned tab is on screen. */
    setActive(active: boolean) {
      stop();
      if (!active) return;
      void load();
      poll = window.setInterval(() => { void load(); }, POLL_MS);
      tick = window.setInterval(tickCountdowns, 1_000);
    },
    clear() {
      stop();
      generation++;
      current = null;
      busy.clear();
      lists.muted.replaceChildren(); lists.banned.replaceChildren();
      status.muted.textContent = status.banned.textContent = "";
    },
  };
}
