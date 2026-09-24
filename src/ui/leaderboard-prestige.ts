/**
 * The leaderboard's prestige switcher. Every board is ranked within one
 * prestige level, and a player sees their own level's board unless they pick
 * another: a Prestige 2 player opens on Prestige 2, a player who has never
 * prestiged opens on No prestige.
 */

/** Chip text: level 0 is the players who have never prestiged. */
export function leaderboardPrestigeLabel(level: number) {
  return level > 0 ? `P${level}` : "No prestige";
}

/** The line under the chips naming the board on screen. */
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

/**
 * Draws the chip row and the heading. The row scrolls sideways inside itself,
 * so the selected chip is brought into its view without moving the page.
 */
export function renderLeaderboardPrestige(
  elements: LeaderboardPrestigeElements,
  state: { levels: readonly number[]; selected: number; own: number; localRank: number; loading: boolean },
  onPick: (level: number) => void,
) {
  const doc = elements.chips.ownerDocument;
  const chips = state.levels.map(level => {
    const chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "leaderboard-prestige-chip";
    chip.dataset.prestige = String(level);
    chip.setAttribute("role", "tab");
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
    chip.addEventListener("click", () => { if (level !== state.selected) onPick(level); });
    return chip;
  });
  elements.chips.replaceChildren(...chips);
  const selected = chips[state.levels.indexOf(state.selected)];
  if (selected) {
    const row = elements.chips;
    const left = selected.offsetLeft, right = left + selected.offsetWidth;
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, left - (row.clientWidth - selected.offsetWidth) / 2);
    }
  }

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
}
