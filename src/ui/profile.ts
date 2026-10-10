import type { PlayerProfileData, PlayerResearch } from "../wildstat-coop";
import { createEmptyResearchRanks, researchStatRewardMultiplier, utilityMovementSpeedBonus } from "../../shared/research";
import { prestigeStatMultiplier } from "../../shared/prestige";
import { PRESTIGE_PERKS, prestigePerkValue, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { CRITICAL_DAMAGE_BASE, criticalDamage } from "../../shared/critical-damage";
import { effectivePlayerPower, effectivePlayerPowerStats } from "../../shared/player-power";
import { equipmentDamageMultiplierBonus, equipmentMaxHealthMultiplierBonus, equipmentRegenerationMultiplierBonus } from "../../shared/items";
import { formatCompactNumber, formatRate } from "./number-format";
import { paysSpeedRating } from "../game/combat";
import { speedFromAttacksPerSecond } from "../../shared/attack-speed-rating";
import { upgradeSlotForItem } from "../../shared/slot-upgrades";
import { cleanSoulStats, withSoulStats, type SoulStats } from "../../shared/soul-dimension";
import { challengeMinimumInterval } from "../../shared/prestige-challenge";

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
  // The levels are keyed by slot, not by item: a tier belongs to the slot and
  // whatever is in it inherits the tier. Looking one up by item id missed
  // every time, so the panel showed the gear with no upgrades behind it.
  const slotUpgradeLevel = (itemId: string) => slotUpgradeLevelFor(itemUpgradeLevels, itemId);
  const headUpgradeLevel = slotUpgradeLevel(progress.equippedHead);
  const chestUpgradeLevel = slotUpgradeLevel(progress.equippedChest);
  const weaponUpgradeLevel = slotUpgradeLevel(weaponItem);
  const healthEquipmentBonus = equipmentMaxHealthMultiplierBonus(progress.equippedHead, progress.equippedChest, headUpgradeLevel, chestUpgradeLevel);
  // The same gear with no slot tiers behind it. The difference is what the
  // bench has paid for, which is otherwise invisible inside one Equipment line.
  const bareHealthBonus = equipmentMaxHealthMultiplierBonus(progress.equippedHead, progress.equippedChest, 0, 0);
  const damageResearchMultiplier = multiplier(research.warcraft, 2);
  const damageEquipmentBonus = equipmentDamageMultiplierBonus(weaponItem, progress.equippedHead, progress.equippedChest, weaponUpgradeLevel, headUpgradeLevel, chestUpgradeLevel);
  const bareDamageBonus = equipmentDamageMultiplierBonus(weaponItem, progress.equippedHead, progress.equippedChest, 0, 0, 0);
  const armorMultiplier = multiplier(research.precision, 2);
  const regenResearchMultiplier = multiplier(research.regeneration, 2);
  const regenEquipmentBonus = equipmentRegenerationMultiplierBonus(progress.equippedHead, progress.equippedChest, headUpgradeLevel, chestUpgradeLevel);
  const bareRegenBonus = equipmentRegenerationMultiplierBonus(progress.equippedHead, progress.equippedChest, 0, 0);
  const speedMultiplier = multiplier(research.moveSpeed, 2);
  const baseSpeed = progress.speedOverride > 0 ? progress.speedOverride : progress.speed;
  const utilitySpeed = utilityMovementSpeedBonus(research.utilityMoveSpeed);
  const powerStats = effectivePlayerPowerStats(progress, research, slotUpgradeLevel);
  return {
    ...powerStats,
    speed: baseSpeed * speedMultiplier + utilitySpeed,
    equipment: { health: healthEquipmentBonus, damage: damageEquipmentBonus, regen: regenEquipmentBonus },
    gear: { health: bareHealthBonus, damage: bareDamageBonus, regen: bareRegenBonus },
    slotTiers: {
      health: Math.max(0, healthEquipmentBonus - bareHealthBonus),
      damage: Math.max(0, damageEquipmentBonus - bareDamageBonus),
      regen: Math.max(0, regenEquipmentBonus - bareRegenBonus),
    },
    multipliers: {
      healthResearch: healthResearchMultiplier,
      damageResearch: damageResearchMultiplier,
      attackSpeed: 1,
      armor: armorMultiplier,
      regenResearch: regenResearchMultiplier,
      speed: speedMultiplier + utilitySpeed / Math.max(1, baseSpeed),
    },
  };
}

/** A tier is the slot's, so resolve the item to its slot before looking up. */
export function slotUpgradeLevelFor(itemUpgradeLevels: Record<string, number>, itemId: string) {
  return itemUpgradeLevels[upgradeSlotForItem(itemId) ?? ""] ?? 0;
}

/**
 * Another player's soul stats in play, as combat counts them: all of them in a normal run, none while
 * their challenge (Reflect Only or Aggro) is active. The local player uses the Soul Dimension runtime's own.
 */
export function profileSoulInPlay(profile: PlayerProfileData): SoulStats | null {
  return profile.prestigeChallenge?.active || profile.aggroChallenge?.active ? null : profile.soulStats ?? null;
}

/** The profile's power, with the soul stats in play added as combat adds them. */
export function profilePower(profile: PlayerProfileData, soul: Partial<SoulStats> | null = null) {
  return effectivePlayerPower(
    withSoulStats(profile.progress, cleanSoulStats(soul), challengeMinimumInterval(profile.prestigeChallenge)),
    profile.research,
    (itemId) => slotUpgradeLevelFor(profile.itemUpgradeLevels, itemId),
  );
}

export type ProfileStatDisplaySource = {
  label: "Tech" | "Equipment" | "Slot Upgrade" | "Prestige" | "Guild" | "Soul";
  value: string;
};

export type ProfileStatDisplayRow = {
  kind: string;
  label: string;
  base: string;
  equationOperator?: "×" | "+";
  equationTotal?: string;
  hideEquation?: boolean;
  multiplier: string;
  expandedDetail?: string;
  total: string;
  sources: ProfileStatDisplaySource[];
};

/** A row's soul share, as a source line, once there is one. */
const soulSource = (amount: number, format: (value: number) => string): ProfileStatDisplaySource[] =>
  amount > 0 ? [{ label: "Soul", value: `+${format(amount)}` }] : [];

export function profileStatDisplayRows(
  profile: PlayerProfileData,
  armorReduction: (armor: number) => string,
  minAttackInterval: number,
  research?: PlayerResearch,
  prestigeLevel = profile.prestigeLevel ?? 0,
  perks: Partial<PrestigePerkRanks> | null | undefined = profile.prestigePerks,
  guildBonus = 1,
  soulStats: Partial<SoulStats> | null = null,
) {
  // Soul stats add to the run's base before any multiplier, as combat adds them,
  // so each row's base includes them and its sources say how much was soul.
  const soul = cleanSoulStats(soulStats);
  const progress = withSoulStats(profile.progress, soul, minAttackInterval);
  // What soul attack speed adds once the cap is counted: all of it, or what fits under the cap.
  const soulAttackSpeed = soul.attackSpeed > 0
    ? 1 / Math.max(minAttackInterval, progress.attackRate) - 1 / Math.max(minAttackInterval, profile.progress.attackRate) : 0;
  const ranks = research ?? profile.research ?? createEmptyResearchRanks();
  const statValue = (value: number) => Math.abs(value) >= 1_000_000 ? formatCompactNumber(value) : Math.round(value).toLocaleString();
  const effective = effectiveProfileStats({ ...progress, attackRate: Math.max(minAttackInterval, progress.attackRate) }, ranks, profile.itemUpgradeLevels);
  const researchBonus = (rank = 0, percentPerRank = 0) => rank * percentPerRank;
  const multiplierValue = (value: number) => value.toFixed(2);
  const equipmentBonusValue = (value: number) => `+${Math.round(value * 10000) / 100}%`;
  const multiplierSources = (researchPercent?: number, equipmentBonus?: number, slotTierBonus?: number): ProfileStatDisplaySource[] => {
    const sources: ProfileStatDisplaySource[] = [];
    if (researchPercent) sources.push({ label: "Tech", value: `+${researchPercent}%` });
    if (equipmentBonus !== undefined && equipmentBonus > 0) {
      sources.push({ label: "Equipment", value: equipmentBonusValue(equipmentBonus) });
    }
    // What the bench has paid for, listed on its own. Folded into Equipment it
    // was impossible to tell a slot upgrade had done anything at all.
    if (slotTierBonus !== undefined && slotTierBonus > 0) {
      sources.push({ label: "Slot Upgrade", value: equipmentBonusValue(slotTierBonus) });
    }
    return sources;
  };
  const baseAttackInterval = Math.max(minAttackInterval, progress.attackRate);
  // On the curve Attack Speed is a rating that never reaches the cap; the
  // expanded line names the rating behind the rate, as Armor names its Block.
  const speedRating = paysSpeedRating() ? speedFromAttacksPerSecond(1 / baseAttackInterval) : null;
  const attackSpeedMaxed = speedRating === null && baseAttackInterval <= minAttackInterval + .0001;
  const baseAttackSpeed = `${(1 / baseAttackInterval).toFixed(2)}/s${attackSpeedMaxed ? " (Max)" : ""}`;
  const attackSpeed = `${(1 / effective.attackRate).toFixed(2)}/s`;
  const regen = `${formatRate(effective.regen)}/s`;
  const healthResearchBonus = researchBonus(ranks.vitality, 2);
  const damageResearchBonus = researchBonus(ranks.warcraft, 2);
  const armorResearchBonus = researchBonus(ranks.precision, 2);
  const regenResearchBonus = researchBonus(ranks.regeneration, 2);
  const speedResearchBonus = researchBonus(ranks.moveSpeed, 2);
  const rangeResearchBonus = Math.min(5, Math.max(0, ranks.utilityAttackRange ?? 0)) * 10;
  const baseRange = Math.max(1, progress.attackRange - rangeResearchBonus);
  const stats: ProfileStatDisplayRow[] = [
    {
      kind: "health", label: "Max Hp:",
      // Saved health is the base: Vitality multiplies it live (0.883), it is not baked in.
      base: statValue(progress.maxHp),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.healthResearch * (1 + effective.equipment.health)),
      total: statValue(effective.maxHp),
      sources: [...soulSource(soul.maxHp, statValue), ...multiplierSources(healthResearchBonus, effective.gear.health, effective.slotTiers.health)],
    },
    {
      kind: "damage", label: "Damage:", base: statValue(progress.damage),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.damageResearch * (1 + effective.equipment.damage)), total: statValue(effective.damage),
      sources: [...soulSource(soul.damage, statValue), ...multiplierSources(damageResearchBonus, effective.gear.damage, effective.slotTiers.damage)],
    },
    {
      kind: "armor", label: "Armor:", base: statValue(progress.armor),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.armor),
      expandedDetail: `(${armorReduction(effective.armor)} Block)`,
      total: statValue(effective.armor),
      sources: [...soulSource(soul.armor, statValue), ...multiplierSources(armorResearchBonus)],
    },
    {
      kind: "attack", label: "Attack Speed:", base: baseAttackSpeed,
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.attackSpeed), total: attackSpeed,
      ...(speedRating === null ? {} : { expandedDetail: `(${speedRating >= 1_000 ? formatCompactNumber(speedRating) : Number(speedRating.toPrecision(3))} Attack Speed)` }),
      // At the cap already, soul attack speed has no room: say so rather than "+0.000/s".
      sources: soul.attackSpeed > 0 && soulAttackSpeed < .0005 ? [{ label: "Soul", value: "Already At Max" }]
        : soulSource(soulAttackSpeed, value => `${value.toFixed(3)}/s${soulAttackSpeed < soul.attackSpeed - 1e-6 ? " (Max)" : ""}`),
    },
    {
      kind: "range", label: "Attack Range:", base: statValue(baseRange),
      equationOperator: "×",
      multiplier: multiplierValue(progress.attackRange / baseRange), total: statValue(progress.attackRange),
      sources: rangeResearchBonus ? [{ label: "Tech", value: `+${rangeResearchBonus} range` }] : [],
    },
    {
      kind: "regen", label: "Regen:",
      base: `${formatRate(progress.regen)}/s`,
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.regenResearch * (1 + effective.equipment.regen)), total: regen,
      sources: [...soulSource(soul.regen, value => `${formatRate(value)}/s`), ...multiplierSources(regenResearchBonus, effective.gear.regen, effective.slotTiers.regen)],
    },
    {
      kind: "speed", label: "Move Speed:", base: statValue(progress.speedOverride > 0 ? progress.speedOverride : progress.speed),
      equationOperator: "×",
      multiplier: multiplierValue(effective.multipliers.speed), total: statValue(effective.speed),
      sources: [...multiplierSources(speedResearchBonus), ...(ranks.utilityMoveSpeed > 0 ? [{ label: "Tech" as const, value: `+${utilityMovementSpeedBonus(ranks.utilityMoveSpeed)} speed` }] : [])],
    },
  ];
  // Tech and prestige multiply each other, exactly as the server pays them, so
  // the total is the product rather than the two percentages added together.
  const techGain = researchStatRewardMultiplier(ranks), prestigeGain = prestigeStatMultiplier(prestigeLevel);
  // The guild's daily quest bonus multiplies in last, as the server pays it.
  const guildGain = Math.max(1, Number.isFinite(guildBonus) ? guildBonus : 1);
  const percentPoints = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;
  // Both factors have whole-percent precision. Round their integer product
  // once so half-percent ties and the expanded/collapsed totals agree.
  const gainPercent = Math.round(Math.round(techGain * 100) * Math.round(prestigeGain * 100) / 100 * Math.round(guildGain * 100) / 100) - 100;
  const statGain = `+${gainPercent}%`;
  stats.push({
    kind: "stat-gain", label: "Stat Gain:", base: techGain.toFixed(2),
    equationOperator: "×", multiplier: (prestigeGain * guildGain).toFixed(2), total: statGain,
    equationTotal: `${((gainPercent + 100) / 100).toFixed(2)}×`,
    hideEquation: techGain <= 1 || prestigeGain * guildGain <= 1,
    sources: [
      ...(techGain > 1 ? [{ label: "Tech" as const, value: `${techGain.toFixed(2)}×` }] : []),
      ...(prestigeGain > 1 ? [{ label: "Prestige" as const, value: `${prestigeGain.toFixed(2)}×` }] : []),
      ...(guildGain > 1 ? [{ label: "Guild" as const, value: `${guildGain.toFixed(2)}×` }] : []),
    ],
  });
  // Keen Edge pays critical chance and critical damage on top of research, so
  // both rows read as combat rolls them rather than showing research alone.
  const perkCritical = prestigePerkValue(perks, "keenEdge");
  const criticalChance = ranks.criticalChance * .01 + perkCritical;
  stats.push({
    kind: "critical", label: "Critical Chance:", base: "0%", equationOperator: "+", multiplier: percentPoints(criticalChance), total: percentPoints(criticalChance),
    sources: [
      ...(ranks.criticalChance ? [{ label: "Tech" as const, value: `+${ranks.criticalChance}%` }] : []),
      ...(perkCritical ? [{ label: "Prestige" as const, value: `+${percentPoints(perkCritical)}` }] : []),
    ],
  });
  // Combat stops at the cap (50×, 10× more a Crit Cap rank), so the row does
  // too. Research and Keen Edge never reach it; what the soul adds past it is
  // still stored and counts again as the cap rises, so its line says (Max).
  const crit = criticalDamage({ researchRank: ranks.criticalDamage, perks, soul: soul.critDamage, capRank: ranks.critCap });
  const soulCritical = crit.capped ? Math.max(0, crit.cap - CRITICAL_DAMAGE_BASE - crit.research - crit.perk) : crit.soul;
  stats.push({
    kind: "critical-damage", label: "Critical Damage:", base: `${CRITICAL_DAMAGE_BASE.toFixed(2)}×`, equationOperator: "+",
    multiplier: `${(crit.multiplier - CRITICAL_DAMAGE_BASE).toFixed(2)}×`, total: `${crit.multiplier.toFixed(2)}×${crit.capped ? " (Max)" : ""}`,
    equationTotal: `${crit.multiplier.toFixed(2)}×`, expandedDetail: `(${crit.cap}× Cap)`,
    sources: [
      ...(crit.research ? [{ label: "Tech" as const, value: `+${crit.research.toFixed(2)}×` }] : []),
      ...(crit.perk ? [{ label: "Prestige" as const, value: `+${crit.perk.toFixed(2)}×` }] : []),
      ...soulSource(soulCritical, value => `${value.toFixed(2)}×${crit.capped ? " (Max)" : ""}`),
    ],
  });
  // The remaining perks have no research behind them, so a row only appears
  // once a point is spent rather than sitting at zero for every player.
  const perkRow = (perk: keyof PrestigePerkRanks, kind: string, expandedDetail: string) => {
    const chance = prestigePerkValue(perks, perk);
    if (!chance) return;
    stats.push({
      kind, label: `${PRESTIGE_PERKS[perk].title}:`, base: "0%", equationOperator: "+", multiplier: percentPoints(chance),
      expandedDetail, total: percentPoints(chance),
      sources: [{ label: "Prestige", value: `+${percentPoints(chance)}` }],
    });
  };
  perkRow("doubleStrike", "double-strike", "(Chance a hit lands twice)");
  perkRow("splitShot", "split-shot", "(Chance to strike a second enemy)");
  perkRow("riposte", "riposte", "(Reflects 100% of each hit before armor, up to your max health; no cap in Reflect Only; half in duels)");
  return stats;
}

export function renderProfileStats(
  profile: PlayerProfileData,
  statGrid: HTMLElement,
  armorReduction: (armor: number) => string,
  minAttackInterval: number,
  research?: PlayerResearch,
  prestigeLevel = profile.prestigeLevel ?? 0,
  perks: Partial<PrestigePerkRanks> | null | undefined = profile.prestigePerks,
  guildBonus = 1,
  soulStats: Partial<SoulStats> | null = null,
) {
  const stats = profileStatDisplayRows(profile, armorReduction, minAttackInterval, research, prestigeLevel, perks, guildBonus, soulStats);
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
    detailedTotal.textContent = stat.equationTotal ?? stat.total;
    equation.append(base, multiplyOperator, multiplier, equalsOperator, detailedTotal);
    if (!stat.hideEquation) sources.append(equation);
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
    const summaryText = stat.hideEquation ? `${stat.label} ${stat.total}.` : `${stat.label} Base ${stat.base}. Calculation ${stat.base} ${stat.equationOperator ?? ""} ${stat.multiplier}. Total ${stat.equationTotal ?? stat.total}.`;
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
