/**
 * The leaderboard's prestige switcher. Every board is ranked within one
 * prestige level, and a player sees their own level's board unless they pick
 * another: a Prestige 2 player opens on Prestige 2, a player who has never
 * prestiged opens on No prestige.
 */

/** A level's name in the dropdown: level 0 is the players who have never prestiged. */
export function leaderboardPrestigeLabel(level: number) {
  return level > 0 ? `Prestige ${level}` : "No prestige";
}

/** The dropdown button's text, naming the board on screen. */
export function leaderboardPrestigeTitle(level: number) {
  return level > 0 ? `Prestige ${level} leaderboard` : "No prestige leaderboard";
}

function wholeLevel(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
}

/**
 * One chip per level from No prestige up to the highest level anyone is on.
 * The viewer's own level and the one on screen are always included, so a
 * player who has just prestiged past everyone still finds their own chip
 * before the next ranking snapshot lists it.
 */
export function leaderboardPrestigeLevels(levelsWithPlayers: readonly number[], own: number, selected: number) {
  const highest = Math.max(0, wholeLevel(own), wholeLevel(selected), ...levelsWithPlayers.map(wholeLevel));
  return Array.from({ length: highest + 1 }, (_, level) => level);
}

/**
 * Which level the board shows. It follows the viewer's own level until they
 * pick a different one, and that pick holds for the rest of the session.
 * Picking their own level again goes back to following it, so a later
 * prestige moves the board with them.
 */
export function createLeaderboardPrestigeSelection(ownLevel: () => number | undefined) {
  let picked: number | undefined;
  const own = () => wholeLevel(ownLevel());
  return {
    own,
    level: () => picked ?? own(),
    pick(level: number) { picked = wholeLevel(level) === own() ? undefined : wholeLevel(level); },
    picked: () => picked !== undefined,
    reset() { picked = undefined; },
  };
}

export type LeaderboardPrestigeElements = { chips: HTMLElement; heading: HTMLElement };

const boundMenus = new WeakSet<HTMLElement>();

function setMenuOpen(elements: LeaderboardPrestigeElements, open: boolean) {
  elements.chips.hidden = !open;
  elements.heading.setAttribute("aria-expanded", String(open));
  if (!open) return;
  // Open on the level being shown, however far down a list of 20+ it is.
  const selected = elements.chips.querySelector<HTMLElement>(".leaderboard-prestige-chip.is-active");
  if (selected) elements.chips.scrollTop = Math.max(0, selected.offsetTop - (elements.chips.clientHeight - selected.offsetHeight) / 2);
}

/**
 * The switcher sits under the list: one button naming the board on screen
 * ("Prestige 2 leaderboard ▾") with the viewer's rank beside it. Pressing it
 * opens a list of every level above it, which scrolls inside itself, so 20
 * or more levels never crowd the window. A pick, a press outside, Escape or
 * the button again closes it.
 */
function bindMenu(elements: LeaderboardPrestigeElements) {
  if (boundMenus.has(elements.heading)) return;
  boundMenus.add(elements.heading);
  const doc = elements.heading.ownerDocument;
  elements.heading.addEventListener("click", () => setMenuOpen(elements, elements.chips.hidden));
  doc.addEventListener("pointerdown", event => {
    const target = event.target as Node | null;
    if (!elements.chips.hidden && target && !elements.chips.contains(target) && !elements.heading.contains(target)) setMenuOpen(elements, false);
  });
  doc.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.chips.hidden) { event.stopPropagation(); setMenuOpen(elements, false); }
  }, true);
}

/** Draws the dropdown's button and its list of levels. */
export function renderLeaderboardPrestige(
  elements: LeaderboardPrestigeElements,
  state: { levels: readonly number[]; selected: number; own: number; localRank: number; loading: boolean },
  onPick: (level: number) => void,
) {
  bindMenu(elements);
  const doc = elements.chips.ownerDocument;
  const chips = state.levels.map(level => {
    const chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "leaderboard-prestige-chip";
    chip.dataset.prestige = String(level);
    chip.setAttribute("role", "option");
    const active = level === state.selected;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-selected", String(active));
    const label = doc.createElement("span");
    label.className = "leaderboard-prestige-chip-label";
    label.textContent = leaderboardPrestigeLabel(level);
    chip.append(label);
    const mine = level === state.own;
    chip.classList.toggle("is-own", mine);
    if (mine) {
      const you = doc.createElement("span");
      you.className = "leaderboard-prestige-you";
      you.textContent = "You";
      chip.append(you);
    }
    chip.setAttribute("aria-label", `${leaderboardPrestigeTitle(level)}${mine ? ", your prestige" : ""}`);
    chip.addEventListener("click", () => {
      setMenuOpen(elements, false);
      if (level !== state.selected) onPick(level);
    });
    return chip;
  });
  elements.chips.replaceChildren(...chips);

  const title = doc.createElement("span");
  title.className = "leaderboard-prestige-title";
  title.textContent = leaderboardPrestigeTitle(state.selected);
  const note = doc.createElement("span");
  note.className = "leaderboard-prestige-rank";
  note.textContent = state.loading ? ""
    : state.localRank > 0 ? `You're #${state.localRank}`
      : state.selected === state.own ? "Not ranked yet" : "";
  note.hidden = !note.textContent;
  elements.heading.replaceChildren(title, note);
  elements.heading.setAttribute("aria-label", `${leaderboardPrestigeTitle(state.selected)}. Change prestige level`);
}
