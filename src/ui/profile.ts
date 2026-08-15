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
  const ranks = research ?? profile.research ?? { warcraft: 0, moveSpeed: 0, foraging: 0, vitality: 0, precision: 0, criticalChance: 0, prosperity: 0 };
  const multiplier = (rank = 0, percentPerRank = 0) => 1 + rank * percentPerRank / 100;
  const modifier = (base: number, rank = 0, percentPerRank = 0) => `BASE: ${Math.round(base).toLocaleString()} · +${rank * percentPerRank}% · ×${multiplier(rank, percentPerRank).toFixed(2)}`;
  const healthMultiplier = multiplier(ranks.vitality, 2);
  const damageMultiplier = multiplier(ranks.warcraft, 2);
  const armorMultiplier = multiplier(ranks.precision, 2);
  const speedMultiplier = multiplier(ranks.moveSpeed, 2);
  const stats: Array<{ kind: string; label: string; value: string; modifier?: string }> = [
    { kind: "health", label: "MAX HP", value: Math.round(progress.maxHp).toLocaleString(), modifier: modifier(progress.maxHp / healthMultiplier, ranks.vitality, 2) },
    { kind: "damage", label: "DAMAGE", value: Math.round(progress.damage * damageMultiplier).toLocaleString(), modifier: modifier(progress.damage, ranks.warcraft, 2) },
    { kind: "armor", label: "ARMOR", value: `${Math.round(progress.armor * armorMultiplier).toLocaleString()} (${armorReduction(progress.armor * armorMultiplier)} damage reduction)`, modifier: modifier(progress.armor, ranks.precision, 2) },
    { kind: "attack", label: "ATTACK SPEED", value: `${(1 / progress.attackRate).toFixed(2)}/s${progress.attackRate <= minAttackInterval + .0001 ? " (max attack speed)" : ""}`, modifier: modifier(1 / progress.attackRate) },
    { kind: "range", label: "ATTACK RANGE", value: Math.round(progress.attackRange).toLocaleString(), modifier: modifier(progress.attackRange) },
    { kind: "regen", label: "REGEN", value: `${progress.regen.toFixed(1)}/s`, modifier: modifier(progress.regen) },
    { kind: "speed", label: "MOVE SPEED", value: Math.round(progress.speed * speedMultiplier).toLocaleString(), modifier: modifier(progress.speed, ranks.moveSpeed, 2) },
  ];
  const statGain = ranks.foraging + ranks.prosperity * 2;
  stats.push({ kind: "stat-gain", label: "STAT GAIN", value: `+${statGain}%`, modifier: `BASE: 0% · +${statGain}% · ×${multiplier(statGain, 1).toFixed(2)}` });
  stats.push({ kind: "critical", label: "CRITICAL CHANCE", value: `${ranks.criticalChance}%`, modifier: `BASE: 0% · +${ranks.criticalChance}% · ×1.00` });
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
