import { LEADERBOARD_SKILL_VIEWS, LEADERBOARD_TIME_VIEWS, type LeaderboardBoard, type LeaderboardStat } from "../../shared/leaderboard-window";

/**
 * The control under the list. It always says where the viewer stands. On
 * Time Played it is also a dropdown between Time Played and Account Created;
 * on Rivals it names the prestige level the board is for. It keeps the look of
 * the prestige switcher it replaced.
 */
export type LeaderboardViewSwitchElements = { chips: HTMLElement; heading: HTMLElement };

const boundMenus = new WeakSet<HTMLElement>();

function setMenuOpen(elements: LeaderboardViewSwitchElements, open: boolean) {
  elements.chips.hidden = !open;
  elements.heading.setAttribute("aria-expanded", String(open));
}

function bindMenu(elements: LeaderboardViewSwitchElements) {
  if (boundMenus.has(elements.heading)) return;
  boundMenus.add(elements.heading);
  const doc = elements.heading.ownerDocument;
  elements.heading.addEventListener("click", () => {
    if (elements.heading.dataset.filter === "on") setMenuOpen(elements, elements.chips.hidden);
  });
  doc.addEventListener("pointerdown", event => {
    const target = event.target as Node | null;
    if (!elements.chips.hidden && target && !elements.chips.contains(target) && !elements.heading.contains(target)) setMenuOpen(elements, false);
  });
  doc.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.chips.hidden) { event.stopPropagation(); setMenuOpen(elements, false); }
  }, true);
}

/** What the control names on a tab with no choice to make. */
export function leaderboardScopeLabel(tab: LeaderboardStat, prestige: number | undefined) {
  if (tab !== "rivals") return "All Players";
  return prestige ? `Prestige ${prestige} Players` : "Players Without Prestige";
}

export function renderLeaderboardViewSwitch(
  elements: LeaderboardViewSwitchElements,
  state: { tab: LeaderboardStat; board: LeaderboardBoard; prestige: number | undefined; localRank: number; loading: boolean },
  onPick: (board: LeaderboardBoard) => void,
) {
  bindMenu(elements);
  const doc = elements.chips.ownerDocument;
  const views = state.tab === "skills" ? LEADERBOARD_SKILL_VIEWS : state.tab === "time" ? LEADERBOARD_TIME_VIEWS : null;
  const switchable = Boolean(views);
  const selected = views?.find(view => view.board === state.board) ?? views?.[0];
  elements.heading.dataset.filter = switchable ? "on" : "off";
  if (!switchable) setMenuOpen(elements, false);
  elements.chips.replaceChildren(...(views ?? []).map(view => {
    const chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "leaderboard-prestige-chip";
    chip.dataset.board = view.board;
    chip.setAttribute("role", "option");
    const active = view.board === selected?.board;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-selected", String(active));
    const label = doc.createElement("span");
    label.className = "leaderboard-prestige-chip-label";
    label.textContent = view.label;
    chip.append(label);
    chip.addEventListener("click", () => {
      setMenuOpen(elements, false);
      if (!active) onPick(view.board);
    });
    return chip;
  }));

  const title = doc.createElement("span");
  title.className = "leaderboard-prestige-title";
  title.textContent = switchable && selected ? selected.label : leaderboardScopeLabel(state.tab, state.prestige);
  const note = doc.createElement("span");
  note.className = "leaderboard-prestige-rank";
  note.textContent = state.loading ? "" : state.localRank > 0 ? `You're #${state.localRank}` : "Not Ranked Yet";
  note.hidden = !note.textContent;
  elements.heading.replaceChildren(title, note);
  elements.heading.toggleAttribute("aria-disabled", !switchable);
  elements.heading.setAttribute("aria-label", switchable && selected ? `${selected.label}. Change ranking` : `${title.textContent}. ${note.textContent}`);
}
