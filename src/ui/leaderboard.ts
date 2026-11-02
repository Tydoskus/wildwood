import { applyAvatarFrame } from "../app/avatar-frames";
import { appendPlayerNameTags, appendPrestigeBadge, playerPrestigeLevel } from "../app/player-name-tags";
import { LEADERBOARD_TABS, type LeaderboardBoard, type LeaderboardStat } from "../../shared/leaderboard-window";
import { formatCompactNumber } from "./number-format";
import type { LeaderboardEntry } from "../wildstat-coop";
import { appendPlayerGenderIcon } from "../game/player-gender-icon";
import { formatPlayedTime } from "./profile";

export type { LeaderboardStat };
/** What a list shows: a tab's board, or Time Played's Account Created. */
export type LeaderboardView = LeaderboardBoard;
export type LeaderboardPodiumRank = 1 | 2 | 3;

export type RenderedLeaderboardPodiumPlayer = {
  rank: LeaderboardPodiumRank;
  entry: LeaderboardEntry;
  canvas: HTMLCanvasElement;
};

type LeaderboardElements = {
  rows: HTMLElement;
  empty: HTMLElement;
  valueHeading: HTMLElement;
  tabs: Record<LeaderboardStat, HTMLElement>;
};

/** What orders a list without ranks; Rivals and Prestige rank by power within a level, so power stands in for them. */
export function leaderboardValueKey(view: LeaderboardView): "power" | "playedSeconds" {
  return view === "time" ? "playedSeconds" : "power";
}

/** When an account began, as a date: "Sep 21, 2026". */
export function formatCreatedDate(ms: number | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function leaderboardValueHeading(view: LeaderboardView) {
  return view === "time" ? "Time Played" : view === "created" ? "Created" : view === "prestige" ? "Prestige" : "Power";
}

export function sortedLeaderboardEntries(stat: LeaderboardView, entries: LeaderboardEntry[], limit = Infinity) {
  const valueKey = leaderboardValueKey(stat);
  return entries
    .filter((entry) => Number.isFinite(entry[valueKey]))
    .sort((a, b) => a.rank && b.rank ? a.rank - b.rank : b[valueKey] - a[valueKey] || a.name.localeCompare(b.name) || a.identity.localeCompare(b.identity))
    .slice(0, limit);
}

export function leaderboardValueText(stat: LeaderboardView, entry: LeaderboardEntry) {
  const valueKey = leaderboardValueKey(stat);
  return stat === "time"
    ? formatPlayedTime(entry.playedSeconds)
    : stat === "created"
      ? formatCreatedDate(entry.joinedAt)
    : stat === "prestige"
      ? String(playerPrestigeLevel(entry.identity))
      : formatCompactNumber(entry[valueKey]);
}

/** Visual order is third, first, second so the winner owns the center podium. */
export function leaderboardPodiumEntries(stat: LeaderboardView, entries: LeaderboardEntry[]) {
  const sorted = sortedLeaderboardEntries(stat, entries, 3);
  const [first, second, third] = entries.some(entry => entry.rank !== undefined)
    ? [1, 2, 3].map(rank => sorted.find(entry => entry.rank === rank)) : sorted;
  return [
    { rank: 3 as const, entry: third },
    { rank: 1 as const, entry: first },
    { rank: 2 as const, entry: second },
  ];
}

export function setLeaderboardTab(
  elements: LeaderboardElements,
  requested: string,
): LeaderboardStat {
  const stat = (LEADERBOARD_TABS as readonly string[]).includes(requested) ? requested as LeaderboardStat : "rivals";
  for (const [tab, element] of Object.entries(elements.tabs) as Array<[LeaderboardStat, HTMLElement]>) {
    const active = tab === stat;
    element.classList.toggle("is-active", active);
    element.setAttribute("aria-selected", String(active));
  }
  elements.valueHeading.textContent = leaderboardValueHeading(stat);
  return stat;
}

export function renderLeaderboardPodium(
  podium: HTMLElement,
  stat: LeaderboardView,
  entries: LeaderboardEntry[],
  actions: {
    isDeveloper: (identity: string) => boolean;
    openProfile: (identity: string, name: string) => void;
  },
) {
  const rendered: RenderedLeaderboardPodiumPlayer[] = [];
  podium.dataset.stat = stat;
  const slots = leaderboardPodiumEntries(stat, entries).map(({ rank, entry }) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `leaderboard-podium-player leaderboard-podium-rank-${rank}`;
    slot.dataset.rank = String(rank);

    const value = document.createElement("span");
    value.className = "leaderboard-podium-value";
    const name = document.createElement("span");
    name.className = "leaderboard-podium-name";
    const canvas = document.createElement("canvas");
    canvas.className = "leaderboard-podium-canvas";
    canvas.width = 120;
    canvas.height = 78;
    canvas.setAttribute("aria-hidden", "true");
    const pedestal = document.createElement("span");
    pedestal.className = "leaderboard-podium-step";
    const rankLabel = document.createElement("span");
    rankLabel.className = "leaderboard-podium-rank-label";
    rankLabel.textContent = String(rank);
    pedestal.append(rankLabel);

    if (!entry) {
      slot.classList.add("is-empty");
      slot.disabled = true;
      name.textContent = "—";
    } else {
      value.textContent = leaderboardValueText(stat, entry);
      appendPlayerNameTags(name, entry.identity, actions.isDeveloper(entry.identity));
      const nameText = document.createElement("span");
      nameText.className = "leaderboard-podium-name-text";
      nameText.textContent = entry.name;
      name.append(nameText);
      appendPrestigeBadge(name, entry.identity);
      appendPlayerGenderIcon(name, entry.gender);
      name.title = entry.name;
      slot.setAttribute("aria-label", `#${rank} ${entry.name}. ${stat}: ${value.textContent}. View profile`);
      slot.addEventListener("click", () => actions.openProfile(entry.identity, entry.name));
      rendered.push({ rank, entry, canvas });
    }
    slot.append(value, name, canvas, pedestal);
    return slot;
  });
  podium.replaceChildren(...slots);
  // The forest and podium remain visible during loading, empty results, and errors.
  podium.hidden = false;
  return rendered;
}

export function renderLeaderboard(
  elements: Pick<LeaderboardElements, "rows" | "empty">,
  stat: LeaderboardView,
  entries: LeaderboardEntry[],
  localIdentity: string,
  actions: {
    isDeveloper: (identity: string) => boolean;
    paintProfileIcon: (canvas: HTMLCanvasElement, identity: string) => void;
    openProfile: (identity: string, name: string) => void;
  },
) {
  const sorted = sortedLeaderboardEntries(stat, entries);
  elements.rows.replaceChildren();

  sorted.forEach((entry, index) => {
    const row = document.createElement("li");
    row.className = "leaderboard-row";
    row.dataset.identity = entry.identity;
    row.dataset.rank = String(entry.rank ?? index + 1);
    row.classList.toggle("is-local", entry.identity === localIdentity);
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `#${entry.rank ?? index + 1}`;

    const name = document.createElement("button");
    name.className = "leaderboard-name";
    name.type = "button";
    appendPlayerNameTags(name, entry.identity, actions.isDeveloper(entry.identity));
    const nameText = document.createElement("span");
    nameText.className = "leaderboard-name-text";
    nameText.textContent = entry.name;
    name.append(nameText);
    // After the name and before the gender icon, the way it reads everywhere
    // else. player_prestige is public and subscribed unfiltered, so every
    // player on the board resolves, not only the one holding the client.
    appendPrestigeBadge(name, entry.identity);
    appendPlayerGenderIcon(name, entry.gender);
    if (entry.isGuest) {
      const guest = document.createElement("span");
      guest.className = "leaderboard-guest";
      guest.textContent = " (guest)";
      name.appendChild(guest);
    }
    name.addEventListener("click", () => actions.openProfile(entry.identity, entry.name));

    const icon = document.createElement("canvas");
    icon.className = "leaderboard-profile-icon";
    icon.width = 64;
    icon.height = 64;
    icon.setAttribute("role", "button");
    icon.setAttribute("tabindex", "0");
    icon.setAttribute("aria-label", `View ${entry.name}'s profile`);
    const open = (event: Event) => {
      event.stopPropagation();
      actions.openProfile(entry.identity, entry.name);
    };
    icon.addEventListener("click", open);
    icon.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open(event);
    });
    actions.paintProfileIcon(icon, entry.identity);

    const value = document.createElement("span");
    value.className = "leaderboard-value";
    value.textContent = leaderboardValueText(stat, entry);
    const portrait = document.createElement("span"); portrait.className = "leaderboard-framed-portrait"; portrait.append(icon);
    applyAvatarFrame(portrait, entry.identity);
    row.append(rank, portrait, name, value);
    elements.rows.appendChild(row);
  });
  elements.empty.hidden = sorted.length > 0;
  elements.rows.hidden = sorted.length === 0;
}
