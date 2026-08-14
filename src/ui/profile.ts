import type { PlayerProfileData, PlayerResearch } from "../wildwood-coop";

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
  research?: PlayerResearch,
) {
  const { progress } = profile;
  const techBonus = (base: number, rank: number, percentPerRank: number) => rank > 0
    ? `BASE: ${Math.round(base).toLocaleString()} · +${rank * percentPerRank}%`
    : undefined;
  const stats: Array<{ kind: string; label: string; value: string; modifier?: string }> = [
    { kind: "health", label: "MAX HP", value: Math.round(progress.maxHp).toLocaleString(), modifier: research ? techBonus(progress.maxHp, research.vitality, 2) : undefined },
    { kind: "damage", label: "DAMAGE", value: Math.round(progress.damage).toLocaleString(), modifier: research ? techBonus(progress.damage, research.warcraft, 2) : undefined },
    { kind: "armor", label: "ARMOR", value: `${Math.round(progress.armor).toLocaleString()} (${armorReduction(progress.armor)} damage reduction)`, modifier: research ? techBonus(progress.armor, research.precision, 2) : undefined },
    { kind: "attack", label: "ATTACK SPEED", value: `${(1 / progress.attackRate).toFixed(2)}/s${progress.attackRate <= minAttackInterval + .0001 ? " (max attack speed)" : ""}` },
    { kind: "range", label: "ATTACK RANGE", value: Math.round(progress.attackRange).toLocaleString() },
    { kind: "regen", label: "REGEN", value: `${progress.regen.toFixed(1)}/s` },
    { kind: "speed", label: "MOVE SPEED", value: Math.round(progress.speed).toLocaleString() },
  ];
  if (research?.foraging) stats.push({ kind: "stat-gain", label: "STAT GAIN", value: `+${research.foraging}%`, modifier: `BASE: 0% · +${research.foraging}%` });
  if (research?.criticalChance) stats.push({ kind: "critical", label: "CRITICAL CHANCE", value: `${research.criticalChance}%`, modifier: `BASE: 0% · +${research.criticalChance}%` });
  statGrid.replaceChildren();
  for (const stat of stats) {
    const item = document.createElement("div");
    item.className = `profile-stat-${stat.kind}`;
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = stat.label;
    detail.textContent = stat.value;
    item.append(term, detail);
    if (stat.modifier) {
      const modifier = document.createElement("small");
      modifier.className = "profile-stat-modifier";
      modifier.textContent = stat.modifier;
      item.append(modifier);
    }
    statGrid.append(item);
  }
}
