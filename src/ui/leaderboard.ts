import { formatCompactNumber } from "./number-format";
import type { LeaderboardEntry } from "../wildstat-coop";
import { appendPlayerGenderIcon } from "./player-gender";

export type LeaderboardStat = "power" | "damage" | "health" | "armor" | "regen" | "time";
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

export function formatPlayedTime(seconds: number) {
  const wholeMinutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(wholeMinutes / 1440);
  const hours = Math.floor(wholeMinutes % 1440 / 60);
  const minutes = wholeMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function leaderboardValueKey(stat: LeaderboardStat): "power" | "damage" | "maxHp" | "armor" | "regen" | "playedSeconds" {
  return stat === "health" ? "maxHp" : stat === "time" ? "playedSeconds" : stat;
}

export function sortedLeaderboardEntries(stat: LeaderboardStat, entries: LeaderboardEntry[], limit = 100) {
  const valueKey = leaderboardValueKey(stat);
  return entries
    .filter((entry) => Number.isFinite(entry[valueKey]))
    .sort((a, b) => b[valueKey] - a[valueKey] || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function leaderboardValueText(stat: LeaderboardStat, entry: LeaderboardEntry) {
  const valueKey = leaderboardValueKey(stat);
  return stat === "time"
    ? formatPlayedTime(entry.playedSeconds)
    : stat === "regen"
      ? `${entry.regen < 1_000 ? Number(entry.regen.toFixed(2)) : formatCompactNumber(entry.regen)}/s`
      : formatCompactNumber(entry[valueKey]);
}

/** Visual order is third, first, second so the winner owns the center podium. */
export function leaderboardPodiumEntries(stat: LeaderboardStat, entries: LeaderboardEntry[]) {
  const [first, second, third] = sortedLeaderboardEntries(stat, entries, 3);
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
  const stat = (["power", "damage", "health", "armor", "regen", "time"] as const)
    .includes(requested as LeaderboardStat)
    ? requested as LeaderboardStat
    : "power";
  for (const [tab, element] of Object.entries(elements.tabs) as Array<[LeaderboardStat, HTMLElement]>) {
    const active = tab === stat;
    element.classList.toggle("is-active", active);
    element.setAttribute("aria-selected", String(active));
  }
  elements.valueHeading.textContent = stat === "health"
    ? "HEALTH"
    : stat === "time"
      ? "TIME PLAYED"
      : stat.toUpperCase();
  return stat;
}

export function renderLeaderboardPodium(
  podium: HTMLElement,
  stat: LeaderboardStat,
  entries: LeaderboardEntry[],
  actions: {
    isDeveloper: (identity: string) => boolean;
    openProfile: (identity: string, name: string) => void;
  },
) {
  const rendered: RenderedLeaderboardPodiumPlayer[] = [];
  const slots = leaderboardPodiumEntries(stat, entries).map(({ rank, entry }) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `leaderboard-podium-player leaderboard-podium-rank-${rank}`;
    slot.dataset.rank = String(rank);

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
    rankLabel.textContent = `#${rank}`;
    pedestal.append(rankLabel);

    if (!entry) {
      slot.classList.add("is-empty");
      slot.disabled = true;
      name.textContent = "—";
    } else {
      if (actions.isDeveloper(entry.identity)) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = "[dev] ";
        name.append(badge);
      }
      const nameText = document.createElement("span");
      nameText.className = "leaderboard-podium-name-text";
      nameText.textContent = entry.name;
      name.append(nameText);
      appendPlayerGenderIcon(name, entry.gender);
      name.title = entry.name;
      slot.setAttribute("aria-label", `#${rank} ${entry.name}. View profile`);
      slot.addEventListener("click", () => actions.openProfile(entry.identity, entry.name));
      rendered.push({ rank, entry, canvas });
    }
    slot.append(name, canvas, pedestal);
    return slot;
  });
  podium.replaceChildren(...slots);
  podium.hidden = rendered.length === 0;
  return rendered;
}

export function renderLeaderboard(
  elements: Pick<LeaderboardElements, "rows" | "empty">,
  stat: LeaderboardStat,
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
    row.classList.toggle("is-local", entry.identity === localIdentity);
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `#${index + 1}`;

    const name = document.createElement("button");
    name.className = "leaderboard-name";
    name.type = "button";
    if (actions.isDeveloper(entry.identity)) {
      const badge = document.createElement("span");
      badge.className = "dev-badge";
      badge.textContent = "[dev] ";
      name.appendChild(badge);
    }
    const nameText = document.createElement("span");
    nameText.className = "leaderboard-name-text";
    nameText.textContent = entry.name;
    name.append(nameText);
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
    row.append(rank, icon, name, value);
    elements.rows.appendChild(row);
  });
  elements.empty.hidden = sorted.length > 0;
  elements.rows.hidden = sorted.length === 0;
}
