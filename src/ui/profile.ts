import type { PlayerProfileData, PlayerResearch } from "../wildstat-coop";
import { createEmptyResearchRanks } from "../../shared/research";
import { effectivePlayerPower, effectivePlayerPowerStats } from "../../shared/player-power";
import { equipmentDamageMultiplier, equipmentMaxHealthMultiplier, equipmentRegenerationMultiplier, weaponAttackSpeedMultiplier } from "../../shared/items";
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
  if (online) return "Online";
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
  const headUpgradeLevel = itemUpgradeLevels[progress.equippedHead] ?? 0;
  const chestUpgradeLevel = itemUpgradeLevels[progress.equippedChest] ?? 0;
  const weaponUpgradeLevel = itemUpgradeLevels[weaponItem] ?? 0;
  const healthEquipmentMultiplier = equipmentMaxHealthMultiplier(
    progress.equippedHead,
    progress.equippedChest,
    1,
    headUpgradeLevel,
    chestUpgradeLevel,
  );
  const damageResearchMultiplier = multiplier(research.warcraft, 2);
  const damageEquipmentMultiplier = equipmentDamageMultiplier(
    weaponItem,
    progress.equippedHead,
    progress.equippedChest,
    1,
    weaponUpgradeLevel,
    headUpgradeLevel,
    chestUpgradeLevel,
  );
  const damageTotalMultiplier = equipmentDamageMultiplier(
    weaponItem,
    progress.equippedHead,
    progress.equippedChest,
    damageResearchMultiplier,
    weaponUpgradeLevel,
    headUpgradeLevel,
    chestUpgradeLevel,
  );
  const attackSpeedMultiplier = weaponAttackSpeedMultiplier(weaponItem, 1, weaponUpgradeLevel);
  const armorMultiplier = multiplier(research.precision, 2);
  const regenResearchMultiplier = multiplier(research.regeneration, 2);
  const regenEquipmentMultiplier = equipmentRegenerationMultiplier(
    progress.equippedHead,
    progress.equippedChest,
    1,
    headUpgradeLevel,
    chestUpgradeLevel,
  );
  const regenTotalMultiplier = equipmentRegenerationMultiplier(
    progress.equippedHead,
    progress.equippedChest,
    regenResearchMultiplier,
    headUpgradeLevel,
    chestUpgradeLevel,
  );
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

export type ProfileStatDisplaySource = {
  label: "Tech" | "Equipment";
  value: string;
};

export type ProfileStatDisplayRow = {
  kind: string;
  label: string;
  base: string;
  equationOperator?: "×";
  multiplier: string;
  expandedDetail?: string;
  total: string;
  sources: ProfileStatDisplaySource[];
};

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
  const multiplierValue = (value: number) => value.toFixed(2);
  const equipmentBonusValue = (value: number) => `+${((value - 1) * 100).toFixed(0)}%`;
  const multiplierSources = (researchPercent?: number, equipmentMultiplier?: number): ProfileStatDisplaySource[] => {
    const sources: ProfileStatDisplaySource[] = [];
    if (researchPercent) sources.push({ label: "Tech", value: `+${researchPercent}%` });
    if (equipmentMultiplier !== undefined && Math.abs(equipmentMultiplier - 1) > .0001) {
      sources.push({ label: "Equipment", value: equipmentBonusValue(equipmentMultiplier) });
    }
    return sources;
  };
  const baseAttackInterval = Math.max(minAttackInterval, progress.attackRate);
  const attackSpeedMaxed = baseAttackInterval <= minAttackInterval + .0001;
  const baseAttackSpeed = `${(1 / baseAttackInterval).toFixed(2)}/s${attackSpeedMaxed ? " (Max)" : ""}`;
  const attackSpeed = `${(1 / effective.attackRate).toFixed(2)}/s`;
  const regen = `${effective.regen >= 1_000_000 ? formatCompactNumber(effective.regen) : effective.regen.toFixed(1)}/s`;
  const healthResearchBonus = researchBonus(ranks.vitality, 2);
  const damageResearchBonus = researchBonus(ranks.warcraft, 2);
  const armorResearchBonus = researchBonus(ranks.precision, 2);
  const regenResearchBonus = researchBonus(ranks.regeneration, 2);
  const speedResearchBonus = researchBonus(ranks.moveSpeed, 2);
  const stats: ProfileStatDisplayRow[] = [
    {
      kind: "health", label: "Max Hp:",
      base: statValue(progress.maxHp / effective.multipliers.healthResearch),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.healthResearch * effective.multipliers.healthEquipment),
      total: statValue(effective.maxHp),
      sources: multiplierSources(healthResearchBonus, effective.multipliers.healthEquipment),
    },
    {
      kind: "damage", label: "Damage:", base: statValue(progress.damage),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.damageTotal), total: statValue(effective.damage),
      sources: multiplierSources(damageResearchBonus, effective.multipliers.damageEquipment),
    },
    {
      kind: "armor", label: "Armor:", base: statValue(progress.armor),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.armor),
      expandedDetail: `(${armorReduction(effective.armor)} Block)`,
      total: statValue(effective.armor),
      sources: multiplierSources(armorResearchBonus),
    },
    {
      kind: "attack", label: "Attack Speed:", base: baseAttackSpeed,
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.attackSpeed), total: attackSpeed,
      sources: multiplierSources(undefined, effective.multipliers.attackSpeed),
    },
    {
      kind: "range", label: "Attack Range:", base: Math.round(progress.attackRange).toLocaleString(),
      equationOperator: "×",
      multiplier: multiplierValue(1), total: Math.round(progress.attackRange).toLocaleString(), sources: [],
    },
    {
      kind: "regen", label: "Regen:",
      base: progress.regen >= 1_000_000 ? `${formatCompactNumber(progress.regen)}/s` : `${progress.regen.toFixed(1)}/s`,
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.regenTotal), total: regen,
      sources: multiplierSources(regenResearchBonus, effective.multipliers.regenEquipment),
    },
    {
      kind: "speed", label: "Move Speed:", base: statValue(progress.speedOverride > 0 ? progress.speedOverride : progress.speed),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.speed), total: statValue(effective.speed),
      sources: multiplierSources(speedResearchBonus),
    },
  ];
  const statGain = ranks.foraging + ranks.prosperity * 2;
  stats.push({
    kind: "stat-gain", label: "Stat Gain:", base: "0%", multiplier: `+${statGain}%`, total: `+${statGain}%`,
    sources: statGain ? [{ label: "Tech", value: `+${statGain}%` }] : [],
  });
  stats.push({
    kind: "critical", label: "Critical Chance:", base: "0%", multiplier: `+${ranks.criticalChance}%`, total: `${ranks.criticalChance}%`,
    sources: ranks.criticalChance ? [{ label: "Tech", value: `+${ranks.criticalChance}%` }] : [],
  });
  const criticalDamage = 1.05 + ranks.criticalDamage * .05;
  const criticalDamageBonus = ranks.criticalDamage * .05;
  stats.push({
    kind: "critical-damage", label: "Critical Damage:", base: "1.05×", multiplier: `+${criticalDamageBonus.toFixed(2)}×`, total: `${criticalDamage.toFixed(2)}×`,
    sources: criticalDamageBonus ? [{ label: "Tech", value: `+${criticalDamageBonus.toFixed(2)}×` }] : [],
  });
  return stats;
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
    item.className = `profile-stat-row profile-stat-${stat.kind}`;
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-expanded", "false");
    const term = document.createElement("dt");
    const summary = document.createElement("dd");
    const base = document.createElement("span");
    const multiplyOperator = document.createElement("span");
    const multiplier = document.createElement("span");
    const equalsOperator = document.createElement("span");
    const totalGroup = document.createElement("span");
    const total = document.createElement("span");
    const sources = document.createElement("dd");
    term.textContent = stat.label;
    summary.className = "profile-stat-summary";
    base.className = "profile-stat-base";
    multiplyOperator.className = "profile-stat-equation-operator profile-stat-multiply";
    multiplier.className = "profile-stat-multiplier";
    equalsOperator.className = "profile-stat-equation-operator profile-stat-equals";
    totalGroup.className = "profile-stat-total-group";
    total.className = "profile-stat-total";
    base.textContent = stat.base;
    multiplyOperator.textContent = stat.equationOperator ?? "";
    multiplyOperator.setAttribute("aria-hidden", "true");
    multiplier.textContent = stat.multiplier;
    equalsOperator.textContent = "=";
    equalsOperator.setAttribute("aria-hidden", "true");
    total.textContent = stat.total;
    totalGroup.append(total);
    summary.append(base, multiplyOperator, multiplier, equalsOperator, totalGroup);
    sources.className = "profile-stat-sources";
    sources.hidden = true;
    if (stat.sources.length === 0 && !stat.expandedDetail) {
      const empty = document.createElement("span");
      empty.className = "profile-stat-source-empty";
      empty.textContent = "No bonus multipliers";
      sources.append(empty);
    } else {
      stat.sources.forEach((source, index) => {
        if (index > 0) {
          const operator = document.createElement("span");
          operator.className = "profile-stat-source-operator";
          operator.setAttribute("aria-hidden", "true");
          operator.textContent = "×";
          sources.append(operator);
        }
        const sourceElement = document.createElement("span");
        sourceElement.className = "profile-stat-source";
        const sourceLabel = document.createElement("strong");
        sourceLabel.textContent = `${source.label}:`;
        sourceElement.append(sourceLabel, ` ${source.value}`);
        sources.append(sourceElement);
      });
      if (stat.expandedDetail && stat.sources.length > 0) {
        const separator = document.createElement("span");
        separator.className = "profile-stat-source-operator";
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = "·";
        sources.append(separator);
      }
    }
    if (stat.expandedDetail) {
      const detail = document.createElement("span");
      detail.className = "profile-stat-expanded-detail";
      detail.textContent = stat.expandedDetail;
      sources.append(detail);
    }
    const sourceText = stat.sources.length > 0
      ? stat.sources.map((source) => `${source.label}: ${source.value}`).join(" multiplied by ")
      : "No bonus multipliers";
    const breakdownText = [stat.sources.length > 0 ? sourceText : "", stat.expandedDetail ?? ""]
      .filter(Boolean)
      .join(". ") || sourceText;
    const multiplierText = stat.equationOperator === "×" ? `${stat.multiplier} times` : stat.multiplier;
    const summaryText = `${stat.label} Base ${stat.base}. Combined multiplier ${multiplierText}. Total ${stat.total}.`;
    const setExpanded = (expanded: boolean) => {
      item.classList.toggle("is-expanded", expanded);
      item.setAttribute("aria-expanded", String(expanded));
      item.setAttribute("aria-label", expanded
        ? `${summaryText} Breakdown: ${breakdownText}. Activate to collapse.`
        : `${summaryText} Activate to show bonus sources.`);
      sources.hidden = !expanded;
    };
    item.addEventListener("click", () => setExpanded(item.getAttribute("aria-expanded") !== "true"));
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setExpanded(item.getAttribute("aria-expanded") !== "true");
    });
    setExpanded(false);
    item.append(term, summary, sources);
    statGrid.append(item);
  }
}
