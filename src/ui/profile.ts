import type { PlayerProfileData, PlayerResearch } from "../wildstat-coop";
import { createEmptyResearchRanks, researchStatRewardMultiplier } from "../../shared/research";
import { prestigeStatMultiplier } from "../../shared/prestige";
import { effectivePlayerPower, effectivePlayerPowerStats } from "../../shared/player-power";
import { equipmentDamageMultiplierBonus, equipmentMaxHealthMultiplierBonus, equipmentRegenerationMultiplierBonus } from "../../shared/items";
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
  const healthEquipmentBonus = equipmentMaxHealthMultiplierBonus(progress.equippedHead, progress.equippedChest, headUpgradeLevel, chestUpgradeLevel);
  const damageResearchMultiplier = multiplier(research.warcraft, 2);
  const damageEquipmentBonus = equipmentDamageMultiplierBonus(weaponItem, progress.equippedHead, progress.equippedChest, weaponUpgradeLevel, headUpgradeLevel, chestUpgradeLevel);
  const armorMultiplier = multiplier(research.precision, 2);
  const regenResearchMultiplier = multiplier(research.regeneration, 2);
  const regenEquipmentBonus = equipmentRegenerationMultiplierBonus(progress.equippedHead, progress.equippedChest, headUpgradeLevel, chestUpgradeLevel);
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
    equipment: { health: healthEquipmentBonus, damage: damageEquipmentBonus, regen: regenEquipmentBonus },
    multipliers: {
      healthResearch: healthResearchMultiplier,
      damageResearch: damageResearchMultiplier,
      attackSpeed: 1,
      armor: armorMultiplier,
      regenResearch: regenResearchMultiplier,
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
  label: "Tech" | "Equipment" | "Prestige";
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
  prestigeLevel = 0,
) {
  const { progress } = profile;
  const ranks = research ?? profile.research ?? createEmptyResearchRanks();
  const statValue = (value: number) => Math.abs(value) >= 1_000_000 ? formatCompactNumber(value) : Math.round(value).toLocaleString();
  const effective = effectiveProfileStats(progress, ranks, profile.itemUpgradeLevels);
  const researchBonus = (rank = 0, percentPerRank = 0) => rank * percentPerRank;
  const multiplierValue = (value: number) => value.toFixed(2);
  const equipmentBonusValue = (value: number) => `+${Math.round(value * 10000) / 100}%`;
  const multiplierSources = (researchPercent?: number, equipmentBonus?: number): ProfileStatDisplaySource[] => {
    const sources: ProfileStatDisplaySource[] = [];
    if (researchPercent) sources.push({ label: "Tech", value: `+${researchPercent}%` });
    if (equipmentBonus !== undefined && equipmentBonus > 0) {
      sources.push({ label: "Equipment", value: equipmentBonusValue(equipmentBonus) });
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
      multiplier: multiplierValue(effective.multipliers.healthResearch * (1 + effective.equipment.health)),
      total: statValue(effective.maxHp),
      sources: multiplierSources(healthResearchBonus, effective.equipment.health),
    },
    {
      kind: "damage", label: "Damage:", base: statValue(progress.damage),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.damageResearch * (1 + effective.equipment.damage)), total: statValue(effective.damage),
      sources: multiplierSources(damageResearchBonus, effective.equipment.damage),
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
      sources: [],
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
      multiplier: multiplierValue(effective.multipliers.regenResearch * (1 + effective.equipment.regen)), total: regen,
      sources: multiplierSources(regenResearchBonus, effective.equipment.regen),
    },
    {
      kind: "speed", label: "Move Speed:", base: statValue(progress.speedOverride > 0 ? progress.speedOverride : progress.speed),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.speed), total: statValue(effective.speed),
      sources: multiplierSources(speedResearchBonus),
    },
  ];
  // Tech and prestige multiply each other, exactly as the server pays them, so
  // the total is the product rather than the two percentages added together.
  const techGain = researchStatRewardMultiplier(ranks), prestigeGain = prestigeStatMultiplier(prestigeLevel);
  const percent = (multiplier: number) => `+${Math.round((multiplier - 1) * 100)}%`;
  const statGain = percent(techGain * prestigeGain);
  stats.push({
    kind: "stat-gain", label: "Stat Gain:", base: "0%", multiplier: statGain, total: statGain,
    sources: [
      ...(techGain > 1 ? [{ label: "Tech" as const, value: percent(techGain) }] : []),
      ...(prestigeGain > 1 ? [{ label: "Prestige" as const, value: percent(prestigeGain) }] : []),
    ],
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
  prestigeLevel = 0,
) {
  const stats = profileStatDisplayRows(profile, armorReduction, minAttackInterval, research, prestigeLevel);
  const expandedKinds = statGrid.dataset.identity === profile.identity
    ? new Set([...statGrid.querySelectorAll<HTMLElement>('[aria-expanded="true"]')].map((row) => row.dataset.stat))
    : new Set<string>();
  statGrid.dataset.identity = profile.identity;
  statGrid.replaceChildren();
  const columns = [0, 1].map(() => {
    const column = document.createElement("dl");
    column.className = "profile-grid profile-stat-column";
    statGrid.append(column);
    return column;
  });
  for (const [index, stat] of stats.entries()) {
    const item = document.createElement("div");
    item.className = `profile-stat-row profile-stat-${stat.kind}`;
    item.dataset.stat = stat.kind;
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
    summary.append(totalGroup);
    sources.className = "profile-stat-sources";
    sources.hidden = true;
    const equation = document.createElement("span");
    equation.className = "profile-stat-equation";
    const detailedTotal = document.createElement("span");
    detailedTotal.textContent = stat.total;
    equation.append(base, multiplyOperator, multiplier, equalsOperator, detailedTotal);
    sources.append(equation);
    if (stat.sources.length === 0 && !stat.expandedDetail) {
      const empty = document.createElement("span");
      empty.className = "profile-stat-source-empty";
      empty.textContent = "No bonuses";
      sources.append(empty);
    } else {
      stat.sources.forEach((source, index) => {
        if (index > 0) {
          const operator = document.createElement("span");
          operator.className = "profile-stat-source-operator";
          operator.setAttribute("aria-hidden", "true");
          operator.textContent = "·";
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
      ? stat.sources.map((source) => `${source.label}: ${source.value}`).join("; ")
      : "No bonuses";
    const breakdownText = [stat.sources.length > 0 ? sourceText : "", stat.expandedDetail ?? ""]
      .filter(Boolean)
      .join(". ") || sourceText;
    const summaryText = `${stat.label} Base ${stat.base}. Calculation ${stat.base} ${stat.equationOperator ?? ""} ${stat.multiplier}. Total ${stat.total}.`;
    const setExpanded = (expanded: boolean) => {
      item.classList.toggle("is-expanded", expanded);
      item.setAttribute("aria-expanded", String(expanded));
      item.setAttribute("aria-label", expanded
        ? `${summaryText} Breakdown: ${breakdownText}. Activate to collapse.`
        : `${stat.label} ${stat.total}. Activate to show detailed stats.`);
      sources.hidden = !expanded;
    };
    item.addEventListener("click", () => setExpanded(item.getAttribute("aria-expanded") !== "true"));
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setExpanded(item.getAttribute("aria-expanded") !== "true");
    });
    setExpanded(expandedKinds.has(stat.kind));
    item.append(term, summary, sources);
    columns[index % columns.length].append(item);
  }
}
