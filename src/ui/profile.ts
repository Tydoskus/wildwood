import type { PlayerProfileData } from "../wildwood-coop";

export function formatPlayedTime(seconds: number) {
  const wholeMinutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(wholeMinutes / 1440);
  const hours = Math.floor(wholeMinutes % 1440 / 60);
  const minutes = wholeMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function profilePresenceText(online: boolean, lastSeenAtMs: number) {
  if (online) return "ONLINE";
  if (!Number.isFinite(lastSeenAtMs) || lastSeenAtMs <= 0) return "LAST SEEN —";
  const lastSeen = new Date(lastSeenAtMs);
  const options: Intl.DateTimeFormatOptions = lastSeen.getFullYear() === new Date().getFullYear()
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" };
  return `LAST SEEN ${lastSeen.toLocaleString([], options).toUpperCase()}`;
}

export function renderProfileStats(
  profile: PlayerProfileData,
  statGrid: HTMLElement,
  armorReduction: (armor: number) => string,
  minAttackInterval: number,
) {
  const { progress } = profile;
  const stats = [
    ["health", "MAX HP", Math.round(progress.maxHp).toLocaleString()],
    ["damage", "DAMAGE", Math.round(progress.damage).toLocaleString()],
    ["armor", "ARMOR", `${Math.round(progress.armor).toLocaleString()} (${armorReduction(progress.armor)} damage reduction)`],
    ["attack", "ATTACK SPEED", `${(1 / progress.attackRate).toFixed(2)}/s${progress.attackRate <= minAttackInterval + .0001 ? " (max attack speed)" : ""}`],
    ["range", "ATTACK RANGE", Math.round(progress.attackRange).toLocaleString()],
    ["regen", "REGEN", `${progress.regen.toFixed(1)}/s`],
    ["speed", "MOVE SPEED", Math.round(progress.speed).toLocaleString()],
  ];
  statGrid.replaceChildren();
  for (const [kind, label, value] of stats) {
    const item = document.createElement("div");
    item.className = `profile-stat-${kind}`;
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    item.append(term, detail);
    statGrid.append(item);
  }
}
