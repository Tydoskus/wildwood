import type { PlayerProfileData, PlayerResearch } from "../wildwood-coop";
import { createEmptyResearchRanks } from "../../shared/research";
import { formatCompactNumber } from "./number-format";

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
  const ranks = research ?? profile.research ?? createEmptyResearchRanks();
  const multiplier = (rank = 0, percentPerRank = 0) => 1 + rank * percentPerRank / 100;
  const statValue = (value: number) => Math.abs(value) >= 1_000_000 ? formatCompactNumber(value) : Math.round(value).toLocaleString();
  const modifier = (base: number, rank = 0, percentPerRank = 0) => `BASE: ${statValue(base)} · +${rank * percentPerRank}% · ×${multiplier(rank, percentPerRank).toFixed(2)}`;
  const healthMultiplier = multiplier(ranks.vitality, 2);
  const damageMultiplier = multiplier(ranks.warcraft, 2);
  const armorMultiplier = multiplier(ranks.precision, 2);
  const speedMultiplier = multiplier(ranks.moveSpeed, 2);
  const regenMultiplier = multiplier(ranks.regeneration, 2);
  const stats: Array<{ kind: string; label: string; value: string; modifier?: string }> = [
    { kind: "health", label: "MAX HP", value: statValue(progress.maxHp), modifier: modifier(progress.maxHp / healthMultiplier, ranks.vitality, 2) },
    { kind: "damage", label: "DAMAGE", value: statValue(progress.damage * damageMultiplier), modifier: modifier(progress.damage, ranks.warcraft, 2) },
    { kind: "armor", label: "ARMOR", value: `${statValue(progress.armor * armorMultiplier)} (${armorReduction(progress.armor * armorMultiplier)} damage reduction)`, modifier: modifier(progress.armor, ranks.precision, 2) },
    { kind: "attack", label: "ATTACK SPEED", value: `${(1 / progress.attackRate).toFixed(2)}/s${progress.attackRate <= minAttackInterval + .0001 ? " (max attack speed)" : ""}`, modifier: modifier(1 / progress.attackRate) },
    { kind: "range", label: "ATTACK RANGE", value: Math.round(progress.attackRange).toLocaleString(), modifier: modifier(progress.attackRange) },
    { kind: "regen", label: "REGEN", value: `${progress.regen * regenMultiplier >= 1_000_000 ? formatCompactNumber(progress.regen * regenMultiplier) : (progress.regen * regenMultiplier).toFixed(1)}/s`, modifier: modifier(progress.regen, ranks.regeneration, 2) },
    { kind: "speed", label: "MOVE SPEED", value: Math.round(progress.speed * speedMultiplier).toLocaleString(), modifier: modifier(progress.speed, ranks.moveSpeed, 2) },
  ];
  const statGain = ranks.foraging + ranks.prosperity * 2;
  stats.push({ kind: "stat-gain", label: "STAT GAIN", value: `+${statGain}%`, modifier: `BASE: 0% · +${statGain}% · ×${multiplier(statGain, 1).toFixed(2)}` });
  stats.push({ kind: "critical", label: "CRITICAL CHANCE", value: `${ranks.criticalChance}%`, modifier: `BASE: 0% · +${ranks.criticalChance}% · ×1.00` });
  const criticalDamage = 1.05 + ranks.criticalDamage * .05;
  stats.push({ kind: "critical-damage", label: "CRITICAL DAMAGE", value: `×${criticalDamage.toFixed(2)}`, modifier: `BASE: ×1.05 · +${(ranks.criticalDamage * .05).toFixed(2)}` });
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
