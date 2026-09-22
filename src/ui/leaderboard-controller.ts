import { playerNameTagsRevision } from "../app/player-name-tags";
import { renderLeaderboard, renderLeaderboardPodium, setLeaderboardTab, type LeaderboardStat, type RenderedLeaderboardPodiumPlayer } from "./leaderboard";
import type { LeaderboardEntry } from "../wildstat-coop";
import type { LeaderboardPage } from "../../shared/leaderboard-window";

type Direction = "above" | "below";
type Window = Omit<LeaderboardPage<LeaderboardEntry>, "entries"> & {
  loadedAt: number;
  entries: LeaderboardEntry[];
  podium: LeaderboardEntry[];
  busy?: Direction;
  error?: Direction;
};
const CACHE_MS = 60_000;
const MAX_ROWS = 501;
const EDGE_DISTANCE = 100;
export type LeaderboardControllerElements = {
  button: HTMLElement; overlay: HTMLElement; closeButton: HTMLElement;
  tabs: Record<LeaderboardStat, HTMLElement>; valueHeading: HTMLElement;
  podium: HTMLElement; rows: HTMLElement; loading: HTMLElement; empty: HTMLElement;
};
export type LeaderboardControllerHooks = {
  loadPage: (stat: LeaderboardStat, startRank?: number, count?: number) => Promise<LeaderboardPage<LeaderboardEntry>>;
  localIdentity: () => string;
  isDeveloper: (identity: string) => boolean;
  paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => void;
  podiumAssetsReady?: () => boolean;
  drawPodiumCharacter: (canvas: HTMLCanvasElement, entry: LeaderboardEntry, rank: 1 | 2 | 3) => void;
  openProfile: (identity: string, name: string) => void;
  beforeOpen: () => void;
};

export function createLeaderboardController(elements: LeaderboardControllerElements, hooks: LeaderboardControllerHooks) {
  const scroller = elements.rows.closest<HTMLElement>(".leaderboard-scroll") ?? elements.rows;
  let stat: LeaderboardStat = "power", requestGeneration = 0, snapshotIdentity = "", error = "";
  let loading = false, snapshot: Window | undefined, lastScrollTop = 0;
  const snapshots = new Map<LeaderboardStat, Window>();
  let podiumPlayers: RenderedLeaderboardPodiumPlayer[] = [], nameTagRevision = -1;
  let podiumDirty = true;
  const actions = {
    isDeveloper: hooks.isDeveloper, paintProfileIcon: hooks.paintProfileIcon,
    openProfile(identity: string, name: string) { hooks.openProfile(identity, name); },
  };
  function anchor() {
    const top = scroller.getBoundingClientRect().top;
    const row = [...elements.rows.querySelectorAll<HTMLElement>(".leaderboard-row")].find(row => row.getBoundingClientRect().bottom > top);
    return row ? { identity: row.dataset.identity, rank: row.dataset.rank, top: row.getBoundingClientRect().top } : undefined;
  }
  function restore(saved: ReturnType<typeof anchor>) {
    if (saved) {
      const rows = [...elements.rows.querySelectorAll<HTMLElement>(".leaderboard-row")];
      const row = rows.find(row => row.dataset.identity === saved.identity) ?? rows.find(row => row.dataset.rank === saved.rank);
      if (row) scroller.scrollTop += row.getBoundingClientRect().top - saved.top;
    }
    lastScrollTop = scroller.scrollTop;
  }
  function centerPlayer() {
    const row = elements.rows.querySelector<HTMLElement>(".is-local");
    if (row) {
      const list = scroller.getBoundingClientRect(), bounds = row.getBoundingClientRect();
      scroller.scrollTop += bounds.top - list.top - (scroller.clientHeight - bounds.height) / 2;
    } else scroller.scrollTop = 0;
    lastScrollTop = scroller.scrollTop;
  }
  function edge(direction: Direction) {
    const item = document.createElement("li");
    item.className = "leaderboard-page-loader";
    item.dataset.direction = direction;
    const busy = snapshot?.busy === direction;
    item.setAttribute("role", "status");
    item.setAttribute("aria-label", busy ? `Loading ${direction === "above" ? "higher" : "lower"} ranks` : "");
    if (snapshot?.error === direction) {
      const retry = document.createElement("button");
      retry.type = "button"; retry.textContent = "Retry";
      retry.setAttribute("aria-label", `Retry loading ranks ${direction}`);
      retry.addEventListener("click", () => { void loadMore(direction); });
      item.append(retry);
    } else if (busy) {
      const spinner = document.createElement("span"); spinner.className = "leaderboard-spinner";
      spinner.setAttribute("aria-hidden", "true"); item.append(spinner);
    }
    return item;
  }
  function renderRows(center = false) {
    const saved = center ? undefined : anchor();
    renderLeaderboard({ rows: elements.rows, empty: elements.empty }, stat, snapshot?.entries ?? [], hooks.localIdentity(), actions);
    if (snapshot?.entries.length) {
      if (snapshot.startRank > 1) elements.rows.prepend(edge("above"));
      if (snapshot.endRank < snapshot.total) elements.rows.append(edge("below"));
    }
    elements.rows.setAttribute("aria-busy", String(Boolean(snapshot?.busy)));
    if (center) centerPlayer(); else restore(saved);
  }
  function render(center = false) {
    nameTagRevision = playerNameTagsRevision();
    elements.podium.setAttribute("aria-busy", String(loading));
    if (loading) {
      elements.rows.hidden = true; elements.empty.hidden = true; elements.loading.hidden = false;
      return; // Preserve the podium scene while a different stat loads.
    }
    elements.loading.hidden = true;
    elements.empty.textContent = error || "NO PLAYERS YET";
    podiumPlayers = renderLeaderboardPodium(elements.podium, stat, snapshot?.podium ?? [], actions);
    podiumDirty = true;
    drawPodium();
    renderRows(center);
  }
  function drawPodium() {
    if (elements.overlay.hidden) return;
    if (snapshotIdentity !== hooks.localIdentity()) { close(); return; }
    if (nameTagRevision !== playerNameTagsRevision()) { render(); return; }
    if (!podiumDirty || hooks.podiumAssetsReady?.() === false) return;
    podiumDirty = false;
    for (const player of podiumPlayers) hooks.drawPodiumCharacter(player.canvas, player.entry, player.rank);
  }
  async function select(requested: string) {
    stat = setLeaderboardTab({ tabs: elements.tabs, rows: elements.rows, empty: elements.empty, valueHeading: elements.valueHeading }, requested);
    elements.overlay.dataset.stat = stat;
    const requestedStat = stat, generation = ++requestGeneration;
    error = ""; snapshot = snapshots.get(stat);
    if (snapshot && Date.now() - snapshot.loadedAt >= CACHE_MS) snapshot = undefined;
    // A tab always reopens at the viewer, even after its old neighborhood was evicted.
    if (snapshot?.localRank && !snapshot.entries.some(row => row.identity === hooks.localIdentity())) snapshot = undefined;
    loading = !snapshot;
    render(true);
    if (!loading) return;
    try {
      const page = await hooks.loadPage(requestedStat);
      if (generation !== requestGeneration || elements.overlay.hidden || snapshotIdentity !== hooks.localIdentity()) return;
      snapshot = { ...page, loadedAt: Date.now(), entries: page.entries.filter(row => row.rank! >= page.startRank && row.rank! <= page.endRank),
        podium: page.entries.filter(row => row.rank! <= 3) };
      snapshots.set(requestedStat, snapshot);
    } catch (failure) {
      if (generation !== requestGeneration || elements.overlay.hidden) return;
      snapshot = undefined; error = failure instanceof Error ? failure.message : "COULD NOT LOAD · SELECT A TAB TO RETRY";
    } finally {
      if (generation === requestGeneration && !elements.overlay.hidden) { loading = false; render(true); }
    }
  }
  async function loadMore(direction: Direction) {
    const state = snapshot;
    if (!state || loading || state.busy || elements.overlay.hidden || snapshotIdentity !== hooks.localIdentity()) return;
    if (direction === "above" ? state.startRank <= 1 : state.endRank >= state.total) return;
    const generation = requestGeneration, requestedStat = stat;
    const start = direction === "above" ? Math.max(1, state.startRank - 100) : state.endRank + 1;
    const count = direction === "above" ? state.startRank - start : 100;
    state.busy = direction; state.error = undefined; renderRows();
    try {
      const page = await hooks.loadPage(requestedStat, start, count);
      if (generation !== requestGeneration || elements.overlay.hidden || snapshotIdentity !== hooks.localIdentity()) return;
      const saved = anchor();
      // A periodic ranking refresh can move identities; never show someone twice.
      const received = new Set(page.entries.map(row => row.identity));
      const merged = new Map(state.entries.filter(row => !received.has(row.identity)).map(row => [row.rank!, row]));
      for (const row of page.entries) merged.set(row.rank!, row);
      let rows = [...merged.values()].filter(row => row.rank! <= page.total).sort((a, b) => a.rank! - b.rank!);
      if (rows.length > MAX_ROWS) rows = direction === "above" ? rows.slice(0, MAX_ROWS) : rows.slice(-MAX_ROWS);
      state.entries = rows; state.total = page.total;
      state.startRank = rows[0]?.rank ?? 1; state.endRank = rows.at(-1)?.rank ?? 0;
      // An empty final range must also stop further requests after population shrinks.
      if (!page.entries.length && direction === "below") state.total = Math.min(state.total, state.endRank);
      state.busy = undefined;
      renderRows(); restore(saved);
    } catch {
      if (generation === requestGeneration) state.error = direction;
    } finally {
      state.busy = undefined;
      if (snapshot === state && !elements.overlay.hidden && snapshotIdentity === hooks.localIdentity()) renderRows();
    }
  }
  function onScroll() {
    const top = scroller.scrollTop, delta = top - lastScrollTop;
    lastScrollTop = top;
    if (delta < 0 && top < EDGE_DISTANCE) void loadMore("above");
    else if (delta > 0 && scroller.scrollHeight - scroller.clientHeight - top < EDGE_DISTANCE) void loadMore("below");
  }
  async function open() {
    hooks.beforeOpen(); elements.overlay.hidden = false; elements.button.setAttribute("aria-expanded", "true");
    if (snapshotIdentity !== hooks.localIdentity()) {
      snapshots.clear(); snapshot = undefined;
      podiumPlayers = renderLeaderboardPodium(elements.podium, stat, [], actions);
    }
    snapshotIdentity = hooks.localIdentity();
    await select(stat);
  }
  function close() { requestGeneration++; elements.overlay.hidden = true; elements.button.setAttribute("aria-expanded", "false"); }
  // Keep the three canvases until their content or responsive dimensions change.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => { podiumDirty = true; }).observe(elements.podium);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => { podiumDirty = true; }, { passive: true });
  }
  scroller.addEventListener("scroll", onScroll, { passive: true });
  /**
   * The board opens at the Dragon, so the toolbar says so rather than opening
   * a window the player cannot appear in. Called whenever progress changes.
   */
  function setUnlocked(unlocked: boolean) {
    const button = elements.button as HTMLButtonElement;
    const label = button.querySelector<HTMLElement>(".toolbar-label");
    button.classList.toggle("is-locked", !unlocked);
    button.setAttribute("aria-disabled", String(!unlocked));
    button.title = unlocked ? "Leaderboard" : "Defeat the Dragon to unlock the leaderboard";
    button.setAttribute("aria-label", unlocked ? "Open leaderboard" : "Leaderboard locked until you defeat the Dragon");
    if (label) label.textContent = unlocked ? "Leaderboard" : "Locked";
    if (!unlocked && !elements.overlay.hidden) close();
  }

  elements.button.addEventListener("click", () => {
    if ((elements.button as HTMLButtonElement).getAttribute("aria-disabled") === "true") return;
    if (elements.overlay.hidden) void open(); else close();
  });
  elements.closeButton.addEventListener("click", close);
  for (const [name, tab] of Object.entries(elements.tabs)) tab.addEventListener("click", () => { void select(name); });
  return { close, drawPodium, open, render, select, loadMore, setUnlocked, isOpen: () => !elements.overlay.hidden };
}
