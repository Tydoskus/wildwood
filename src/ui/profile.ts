import type { PlayerProfileData, PlayerResearch } from "../wildwood-coop";
import { createEmptyResearchRanks } from "../../shared/research";
import { effectivePlayerPower, effectivePlayerPowerStats } from "../../shared/player-power";
import { equipmentDamageMultiplier, itemMaxHealthMultiplier, itemRegenerationMultiplier, weaponAttackSpeedMultiplier } from "../../shared/items";
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
  const damageEquipmentMultiplier = equipmentDamageMultiplier(
    weaponItem,
    progress.equippedChest,
    1,
    weaponUpgradeLevel,
    chestUpgradeLevel,
  );
  const damageTotalMultiplier = equipmentDamageMultiplier(
    weaponItem,
    progress.equippedChest,
    damageResearchMultiplier,
    weaponUpgradeLevel,
    chestUpgradeLevel,
  );
  const attackSpeedMultiplier = weaponAttackSpeedMultiplier(weaponItem, 1, weaponUpgradeLevel);
  const armorMultiplier = multiplier(research.precision, 2);
  const regenResearchMultiplier = multiplier(research.regeneration, 2);
  const regenEquipmentMultiplier = itemRegenerationMultiplier(progress.equippedChest, 1, chestUpgradeLevel);
  const regenTotalMultiplier = itemRegenerationMultiplier(progress.equippedChest, regenResearchMultiplier, chestUpgradeLevel);
  const speedMultiplier = multiplier(research.moveSpeed, 2);
  const baseSpeed = progress.speedOverride > 0 ? progress.speedOverride : progress.speed;
  const powerStats = effectivePlayerPowerStats(
    progress,
    research,
    (itemId) => itemUpgradeLevels[itemId] ?? 0,
  );
  return {
    ...powerStats,
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

export function profilePower(profile: PlayerProfileData) {
  return effectivePlayerPower(
    profile.progress,
    profile.research,
    (itemId) => profile.itemUpgradeLevels[itemId] ?? 0,
  );
}

export function profileStatDisplayRows(
  profile: PlayerProfileData,
  armorReduction: (armor: number) => string,
  minAttackInterval: number,
  research?: PlayerResearch,
) {
  const { progress } = profile;
  const ranks = research ?? profile.research ?? createEmptyResearchRanks();
  const statValue = (value: number) => Math.abs(value) >= 1_000_000 ? formatCompactNumber(value) : Math.round(value).toLocaleString();
  const effective = effectiveProfileStats(progress, ranks, profile.itemUpgradeLevels);
  const researchBonus = (rank = 0, percentPerRank = 0) => rank * percentPerRank;
  const equipmentFactor = (equipmentMultiplier: number) => equipmentMultiplier > 1
    ? `  × ${equipmentMultiplier.toFixed(2)}×`
    : "";
  const equation = (base: string, finalValue: string, researchPercent?: number, equipmentMultiplier = 1) =>
    `${base}${researchPercent === undefined ? "" : `  +${researchPercent}%`}${equipmentFactor(equipmentMultiplier)}  = ${finalValue}`;
  const attackSpeed = `${(1 / effective.attackRate).toFixed(2)}/s${effective.attackRate <= minAttackInterval + .0001 ? " (Max Attack Speed)" : ""}`;
  const regen = `${effective.regen >= 1_000_000 ? formatCompactNumber(effective.regen) : effective.regen.toFixed(1)}/s`;
  const stats: Array<{ kind: string; label: string; equation: string }> = [
    { kind: "health", label: "Max Hp:", equation: equation(statValue(progress.maxHp / effective.multipliers.healthResearch), statValue(effective.maxHp), researchBonus(ranks.vitality, 2), effective.multipliers.healthEquipment) },
    { kind: "damage", label: "Damage:", equation: equation(statValue(progress.damage), statValue(effective.damage), researchBonus(ranks.warcraft, 2), effective.multipliers.damageEquipment) },
    { kind: "armor", label: "Armor:", equation: equation(statValue(progress.armor), `${statValue(effective.armor)} (${armorReduction(effective.armor)} Damage Reduction)`, researchBonus(ranks.precision, 2)) },
    { kind: "attack", label: "Attack Speed:", equation: equation(`${(1 / progress.attackRate).toFixed(2)}/s`, attackSpeed, undefined, effective.multipliers.attackSpeed) },
    { kind: "range", label: "Attack Range:", equation: equation(Math.round(progress.attackRange).toLocaleString(), Math.round(progress.attackRange).toLocaleString()) },
    { kind: "regen", label: "Regen:", equation: equation(progress.regen >= 1_000_000 ? `${formatCompactNumber(progress.regen)}/s` : `${progress.regen.toFixed(1)}/s`, regen, researchBonus(ranks.regeneration, 2), effective.multipliers.regenEquipment) },
    { kind: "speed", label: "Move Speed:", equation: equation(statValue(progress.speedOverride > 0 ? progress.speedOverride : progress.speed), statValue(effective.speed), researchBonus(ranks.moveSpeed, 2)) },
  ];
  const statGain = ranks.foraging + ranks.prosperity * 2;
  stats.push({ kind: "stat-gain", label: "Stat Gain:", equation: `0%  +${statGain}%  = +${statGain}%` });
  stats.push({ kind: "critical", label: "Critical Chance:", equation: `0%  +${ranks.criticalChance}%  = ${ranks.criticalChance}%` });
  const criticalDamage = 1.05 + ranks.criticalDamage * .05;
  stats.push({ kind: "critical-damage", label: "Critical Damage:", equation: `1.05×  +${(ranks.criticalDamage * .05).toFixed(2)}×  = ${criticalDamage.toFixed(2)}×` });
  return stats;
}

export function profileStatEquationParts(equation: string) {
  return equation.split(/\s{2,}/).filter(Boolean);
}

export function renderProfileStats(
  profile: PlayerProfileData,
  statGrid: HTMLElement,
  armorReduction: (armor: number) => string,
  minAttackInterval: number,
  research?: PlayerResearch,
) {
  const stats = profileStatDisplayRows(profile, armorReduction, minAttackInterval, research);
  statGrid.replaceChildren();
  for (const stat of stats) {
    const item = document.createElement("div");
    item.className = `profile-stat-${stat.kind}`;
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = stat.label;
    detail.className = "profile-stat-equation";
    detail.setAttribute("aria-label", stat.equation.replace(/\s+/g, " "));
    for (const equationPart of profileStatEquationParts(stat.equation)) {
      const part = document.createElement("span");
      part.className = "profile-stat-equation-part";
      part.setAttribute("aria-hidden", "true");
      part.textContent = equationPart;
      detail.append(part);
    }
    item.append(term, detail);
    statGrid.append(item);
  }
}
