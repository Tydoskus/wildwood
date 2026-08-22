import type { PlayerProfileData, PlayerResearch } from "../wildwood-coop";
import { createEmptyResearchRanks } from "../../shared/research";
import { itemMaxHealthMultiplier, itemRegenerationMultiplier, weaponAttackSpeedMultiplier, weaponDamageMultiplier } from "../../shared/items";
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

export function effectiveProfileStats(
  progress: PlayerProfileData["progress"],
  research: PlayerResearch = createEmptyResearchRanks(),
  itemUpgradeLevels: Record<string, number> = {},
) {
  const multiplier = (rank = 0, percentPerRank = 0) => 1 + rank * percentPerRank / 100;
  const weaponItem = progress.equippedRightHand || progress.equippedLeftHand;
  const healthResearchMultiplier = multiplier(research.vitality, 2);
  const chestUpgradeLevel = itemUpgradeLevels[progress.equippedChest] ?? 0;
  const weaponUpgradeLevel = itemUpgradeLevels[weaponItem] ?? 0;
  const healthEquipmentMultiplier = itemMaxHealthMultiplier(progress.equippedChest, 1, chestUpgradeLevel);
  const damageResearchMultiplier = multiplier(research.warcraft, 2);
  const damageEquipmentMultiplier = weaponDamageMultiplier(weaponItem, 1, weaponUpgradeLevel);
  const damageTotalMultiplier = weaponDamageMultiplier(weaponItem, damageResearchMultiplier, weaponUpgradeLevel);
  const attackSpeedMultiplier = weaponAttackSpeedMultiplier(weaponItem, 1, weaponUpgradeLevel);
  const armorMultiplier = multiplier(research.precision, 2);
  const regenResearchMultiplier = multiplier(research.regeneration, 2);
  const regenEquipmentMultiplier = itemRegenerationMultiplier(progress.equippedChest, 1, chestUpgradeLevel);
  const regenTotalMultiplier = itemRegenerationMultiplier(progress.equippedChest, regenResearchMultiplier, chestUpgradeLevel);
  const speedMultiplier = multiplier(research.moveSpeed, 2);
  const baseSpeed = progress.speedOverride > 0 ? progress.speedOverride : progress.speed;
  return {
    maxHp: progress.maxHp * healthEquipmentMultiplier,
    damage: progress.damage * damageTotalMultiplier,
    attackRate: progress.attackRate / attackSpeedMultiplier,
    armor: progress.armor * armorMultiplier,
    regen: progress.regen * regenTotalMultiplier,
    speed: baseSpeed * speedMultiplier,
    multipliers: {
      healthResearch: healthResearchMultiplier,
      healthEquipment: healthEquipmentMultiplier,
      damageResearch: damageResearchMultiplier,
      damageEquipment: damageEquipmentMultiplier,
      damageTotal: damageTotalMultiplier,
      attackSpeed: attackSpeedMultiplier,
      armor: armorMultiplier,
      regen: regenTotalMultiplier,
      regenResearch: regenResearchMultiplier,
      regenEquipment: regenEquipmentMultiplier,
      regenTotal: regenTotalMultiplier,
      speed: speedMultiplier,
    },
  };
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
  const effective = effectiveProfileStats(progress, ranks, profile.itemUpgradeLevels);
  const equipmentModifier = (equipmentMultiplier: number, totalMultiplier: number) => equipmentMultiplier > 1
    ? ` · EQUIPMENT +${(equipmentMultiplier - 1).toFixed(2)}× · TOTAL ×${totalMultiplier.toFixed(2)}`
    : "";
  const stats: Array<{ kind: string; label: string; value: string; modifier?: string }> = [
    { kind: "health", label: "MAX HP", value: statValue(effective.maxHp), modifier: `${modifier(progress.maxHp / effective.multipliers.healthResearch, ranks.vitality, 2)}${equipmentModifier(effective.multipliers.healthEquipment, effective.multipliers.healthResearch * effective.multipliers.healthEquipment)}` },
    { kind: "damage", label: "DAMAGE", value: statValue(effective.damage), modifier: `${modifier(progress.damage, ranks.warcraft, 2)}${equipmentModifier(effective.multipliers.damageEquipment, effective.multipliers.damageTotal)}` },
    { kind: "armor", label: "ARMOR", value: `${statValue(effective.armor)} (${armorReduction(effective.armor)} damage reduction)`, modifier: modifier(progress.armor, ranks.precision, 2) },
    { kind: "attack", label: "ATTACK SPEED", value: `${(1 / effective.attackRate).toFixed(2)}/s${effective.attackRate <= minAttackInterval + .0001 ? " (max attack speed)" : ""}`, modifier: `BASE: ${(1 / progress.attackRate).toFixed(2)}/s${equipmentModifier(effective.multipliers.attackSpeed, effective.multipliers.attackSpeed)}` },
    { kind: "range", label: "ATTACK RANGE", value: Math.round(progress.attackRange).toLocaleString(), modifier: modifier(progress.attackRange) },
    { kind: "regen", label: "REGEN", value: `${effective.regen >= 1_000_000 ? formatCompactNumber(effective.regen) : effective.regen.toFixed(1)}/s`, modifier: `${modifier(progress.regen, ranks.regeneration, 2)}${equipmentModifier(effective.multipliers.regenEquipment, effective.multipliers.regenTotal)}` },
    { kind: "speed", label: "MOVE SPEED", value: Math.round(effective.speed).toLocaleString(), modifier: modifier(progress.speedOverride > 0 ? progress.speedOverride : progress.speed, ranks.moveSpeed, 2) },
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
