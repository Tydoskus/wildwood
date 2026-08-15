import { renderLeaderboard, setLeaderboardTab, type LeaderboardStat } from "./leaderboard";
import type { LeaderboardEntry } from "../wildwood-coop";

export type LeaderboardControllerElements = {
  button: HTMLElement;
  overlay: HTMLElement;
  closeButton: HTMLElement;
  tabs: Record<LeaderboardStat, HTMLElement>;
  valueHeading: HTMLElement;
  rows: HTMLElement;
  loading: HTMLElement;
  empty: HTMLElement;
};

export type LeaderboardControllerHooks = {
  entries: () => LeaderboardEntry[];
  loadSnapshot: () => Promise<LeaderboardEntry[]>;
  localIdentity: () => string;
  isDeveloper: (identity: string) => boolean;
  paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => void;
  openProfile: (identity: string, name: string) => void;
  beforeOpen: () => void;
};

export function createLeaderboardController(elements: LeaderboardControllerElements, hooks: LeaderboardControllerHooks) {
  let stat: LeaderboardStat = "power";
  let snapshot: LeaderboardEntry[] = [];
  let loading = false;

  function render() {
    if (loading) {
      elements.rows.hidden = true;
      elements.empty.hidden = true;
      elements.loading.hidden = false;
      return;
    }
    elements.loading.hidden = true;
    renderLeaderboard({ rows: elements.rows, empty: elements.empty }, stat, snapshot, hooks.localIdentity(), {
      isDeveloper: hooks.isDeveloper,
      paintProfileIcon: hooks.paintProfileIcon,
      openProfile(identity, name) {
        close();
        hooks.openProfile(identity, name);
      },
    });
  }

  function select(requested: string) {
    stat = setLeaderboardTab({
      tabs: elements.tabs,
      rows: elements.rows,
      empty: elements.empty,
      valueHeading: elements.valueHeading,
    }, requested);
    render();
  }

  async function open() {
    hooks.beforeOpen();
    elements.overlay.hidden = false;
    elements.button.setAttribute("aria-expanded", "true");
    snapshot = [];
    loading = true;
    select(stat);
    try {
      snapshot = await hooks.loadSnapshot();
    } finally {
      loading = false;
      if (!elements.overlay.hidden) render();
    }
  }

  function close() {
    elements.overlay.hidden = true;
    elements.button.setAttribute("aria-expanded", "false");
  }

  elements.button.addEventListener("click", () => { void open(); });
  elements.closeButton.addEventListener("click", close);
  for (const [name, tab] of Object.entries(elements.tabs) as Array<[LeaderboardStat, HTMLElement]>) {
    tab.addEventListener("click", () => select(name));
  }

  return { close, open, render, select, isOpen: () => !elements.overlay.hidden };
}
