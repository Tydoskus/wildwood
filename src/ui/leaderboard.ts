import { formatCompactNumber } from "./number-format";
import type { LeaderboardEntry } from "../wildwood-coop";

export type LeaderboardStat = "power" | "damage" | "health" | "armor" | "regen" | "time";

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
  const valueKey: "power" | "damage" | "maxHp" | "armor" | "regen" | "playedSeconds" = stat === "health"
    ? "maxHp"
    : stat === "time"
      ? "playedSeconds"
      : stat;
  const sorted = entries
    .filter((entry) => Number.isFinite(entry[valueKey]))
    .sort((a, b) => b[valueKey] - a[valueKey] || a.name.localeCompare(b.name))
    .slice(0, 100);
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
    name.append(document.createTextNode(entry.name));
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
    value.textContent = stat === "time"
      ? formatPlayedTime(entry.playedSeconds)
      : stat === "regen"
        ? `${entry.regen < 1_000 ? Number(entry.regen.toFixed(2)) : formatCompactNumber(entry.regen)}/s`
        : formatCompactNumber(entry[valueKey]);
    row.append(rank, icon, name, value);
    elements.rows.appendChild(row);
  });
  elements.empty.hidden = sorted.length > 0;
  elements.rows.hidden = sorted.length === 0;
}
