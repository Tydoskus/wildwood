import type { PlayerProfileData, PlayerResearch } from "../wildstat-coop";
import { createEmptyResearchRanks } from "../../shared/research";
import { PRESTIGE_PERKS, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { CRITICAL_DAMAGE_BASE } from "../../shared/critical-damage";
import { computePlayerStats, playerStatPower, type PlayerStatInputs } from "../../shared/player-stats";
import { itemLevelFor, slotTierFor } from "../../shared/item-level";
import { formatCompactNumber, formatMultiplier, formatMultiplierChange, formatPercentMultiplier, formatRate } from "./number-format";
import { attackSpeedLabel, critDamageLabel, type AttackCapArg } from "../../shared/stat-rating";
import { cleanSoulStats, withSoulStats, type SoulStats } from "../../shared/soul-dimension";
import { cardStatFactors, cardTotals } from "../../shared/card-effects";
import { STAT_NAMES } from "../../shared/card-text";
import { bonusesInPlay, masteryInPlayAtLevels } from "../../shared/bonuses-in-play";
import { masteryAttackRange } from "../../shared/weapon-mastery";
import { MOMENTUM_MAX, hasTechnique } from "../../shared/mastery-techniques";

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

/**
 * A profile's stats as shared/player-stats.ts takes them: the saved run, its worn gear at each slot's tier
 * and the item's refine, and the active cards. `extra` adds the soul, perks, cap and stat gain parts.
 */
export function profileStatInputs(
  progress: PlayerProfileData["progress"],
  research: PlayerResearch = createEmptyResearchRanks(),
  itemUpgradeLevels: Record<string, number> = {},
  itemRefines: Record<string, number> = {},
  activeCards: readonly string[] = [],
  extra: Partial<PlayerStatInputs> = {},
): PlayerStatInputs {
  return {
    base: { maxHp: progress.maxHp, damage: progress.damage, armor: progress.armor, regen: progress.regen, attackInterval: progress.attackRate,
      attackRange: progress.attackRange, moveSpeed: progress.speedOverride > 0 ? progress.speedOverride : progress.speed, critRating: progress.critRating },
    loadout: { head: progress.equippedHead, chest: progress.equippedChest, feet: progress.equippedFeet ?? "",
      rightHand: progress.equippedRightHand, leftHand: progress.equippedLeftHand },
    // Tiers are keyed by slot, not by item: a lookup by item id missed every time and the panel showed bare gear.
    itemLevel: itemId => itemLevelFor(itemUpgradeLevels, itemRefines, itemId),
    research, cards: cardTotals(activeCards),
    ...extra,
  };
}

/** A tier is the slot's, so resolve the item to its slot before looking up. */
export const slotUpgradeLevelFor = (itemUpgradeLevels: Record<string, number>, itemId: string) => slotTierFor(itemUpgradeLevels, itemId);

type ProfileStatRows = Partial<Pick<PlayerProfileData, "research" | "prestigePerks" | "soulStats" | "activeCards" | "bonusOff"
  | "prestigeChallenge" | "aggroChallenge" | "mastery">>;

/** A profile's research, perks, soul, cards, cap and Mastery in play, as the server reads that player's own. */
export function profileInPlay(profile: ProfileStatRows) {
  return bonusesInPlay({ research: profile.research, perks: profile.prestigePerks, soul: profile.soulStats, activeCards: profile.activeCards,
    bonusOff: profile.bonusOff, prestigeChallenge: profile.prestigeChallenge, aggroChallenge: profile.aggroChallenge, mastery: profile.mastery });
}

/**
 * Another player's soul stats in play, as combat counts them: each one not switched off in a normal run, none
 * while their challenge (Reflect Only or Aggro) is active. The local player uses the Soul Dimension runtime's own.
 */
export function profileSoulInPlay(profile: ProfileStatRows): SoulStats | null {
  return profileInPlay(profile).soul;
}

/** A profile's active cards in play: one of each type during an Aggro run, more with Card Slots perks in play. */
export function profileActiveCardIds(profile: ProfileStatRows) {
  return profileInPlay(profile).cardIds;
}

/** Another player's attack speed cap: their Reflect Only wins and Quick Draw, and the Quick Draw cards they wear. */
export function profileAttackCap(profile: ProfileStatRows) {
  return profileInPlay(profile).attackCap;
}

/** The profile's power as the server counts it: research, perks and cards in play, the soul stats in play added, crits counted. */
export function profilePower(profile: PlayerProfileData, soul: Partial<SoulStats> | null = null) {
  const inPlay = profileInPlay(profile), clean = cleanSoulStats(soul);
  const progress = withSoulStats(profile.progress, clean, inPlay.attackCap);
  return Math.round(playerStatPower(profileStatInputs(progress, inPlay.research ?? undefined, profile.itemUpgradeLevels, profile.itemRefines,
    inPlay.cardIds, { perks: inPlay.perks, soul: clean })));
}

export type ProfileStatDisplaySource = {
  label: "Tech" | "Equipment" | "Slot Upgrade" | "Refine" | "Cards" | "Prestige" | "Guild" | "Soul" | "Class Set" | "Armor" | "Boots" | "Mastery" | "Momentum";
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
  attackCap: AttackCapArg,
  research?: PlayerResearch,
  prestigeLevel = profile.prestigeLevel ?? 0,
  perks: Partial<PrestigePerkRanks> | null | undefined = profile.prestigePerks,
  guildBonus = 1,
  soulStats: Partial<SoulStats> | null = null,
) {
  // Soul stats add to the run's base before any multiplier, as combat adds them,
  // so each row's base includes them and its sources say how much was soul.
  const soul = cleanSoulStats(soulStats);
  const progress = withSoulStats(profile.progress, soul, attackCap);
  const ranks = research ?? profile.research ?? createEmptyResearchRanks();
  const statValue = (value: number) => Math.abs(value) >= 1_000_000 ? formatCompactNumber(value) : Math.round(value).toLocaleString();
  const inPlay = profileInPlay(profile);
  // Long Shot cards and Archery's range on top of the saved range, as the world adds them (progress-controller.ts addedRange).
  const masteryNow = masteryInPlayAtLevels(inPlay.mastery, progress.equippedRightHand, progress.equippedRightHand || progress.equippedLeftHand);
  const addedRange = { cards: cardStatFactors(inPlay.cards).range, mastery: masteryAttackRange(masteryNow) };
  // Swordplay's Momentum swings past the cap after hits in a row (mastery-technique-runtime.ts).
  const momentum = hasTechnique(masteryNow, "momentum") ? MOMENTUM_MAX : 0;
  const ranged = { ...progress, attackRange: progress.attackRange + addedRange.cards + addedRange.mastery };
  const inputs = profileStatInputs(ranged, ranks, profile.itemUpgradeLevels, profile.itemRefines, inPlay.cardIds, {
    soul, attackCap, prestigeLevel, guildBonus,
    // Long Shot and Fleet Foot pay outside an Aggro run, as the server pays them; the other perks show as given.
    perks: profile.aggroChallenge?.active ? { ...perks, longShot: 0, fleetFoot: 0 } : perks,
  });
  const stats = computePlayerStats(inputs);
  const from = stats.sources;
  // A card source: what the active cards multiply a stat by, a cost included (×0.96).
  const cardSource = (factor: number): ProfileStatDisplaySource[] =>
    Math.round((factor - 1) * 10000) ? [{ label: "Cards", value: formatMultiplierChange(factor) }] : [];
  const multiplierValue = (value: number) => value.toFixed(2);
  const multiplierSources = (researchPercent?: number, gear?: { equipment: number; slotUpgrade: number; refine: number }): ProfileStatDisplaySource[] => {
    const sources: ProfileStatDisplaySource[] = [];
    if (researchPercent) sources.push({ label: "Tech", value: formatPercentMultiplier(researchPercent) });
    if (!gear) return sources;
    // The gear parts add up to one factor; each line is the step its part takes it, so the lines multiply to the row.
    const bare = 1 + gear.equipment, tiered = bare + gear.slotUpgrade, refined = tiered + gear.refine;
    if (gear.equipment > 0) sources.push({ label: "Equipment", value: formatMultiplierChange(bare) });
    // What the bench has paid for, listed on its own so a slot upgrade's
    // effect shows apart from Equipment.
    if (gear.slotUpgrade > 0) sources.push({ label: "Slot Upgrade", value: formatMultiplierChange(tiered / bare) });
    // What the Smith's refines added on top, the same way.
    if (gear.refine > 0) sources.push({ label: "Refine", value: formatMultiplierChange(refined / tiered) });
    return sources;
  };
  const minAttackInterval = stats.capInterval, baseAttackInterval = stats.attackInterval;
  const baseAttackSpeed = attackSpeedLabel(1 / baseAttackInterval, 1 / minAttackInterval);
  // A bow shoots faster than the character's own speed (bow-skills.ts): its row shows the shots it fires.
  const bowSpeed = stats.weaponInterval < stats.attackInterval ? stats.attackInterval / stats.weaponInterval : 1;
  const attackSpeed = `${(stats.attackRate * bowSpeed).toFixed(2)}/s`;
  // A sword reaches its own range, with the same Tech, Long Shot, cards and Archery on top (weaponAttackRange).
  const reach = stats.range, baseRange = Math.max(1, reach - from.range.tech - from.range.prestige - addedRange.cards - addedRange.mastery);
  const rangeValue = (value: number) => `+${Math.round(value * 10) / 10} range`;
  const speed = from.moveSpeed;
  // Light armor walks faster and Heavy slower, a piece at a time (armor-class-perks.ts).
  const armorSource = (factor: number) =>
    factor !== 1 ? [{ label: "Armor" as const, value: `${factor > 1 ? "+" : ""}${Math.round((factor - 1) * 1000) / 10}%` }] : [];
  const bootsSource = (factor: number) => factor !== 1 ? [{ label: "Boots" as const, value: `+${Math.round((factor - 1) * 1000) / 10}%` }] : [];
  // Warrior Boots multiply armor, so their line reads as one.
  const armorBootsSource = (factor: number) => factor !== 1 ? [{ label: "Boots" as const, value: formatMultiplierChange(factor) }] : [];
  const rows: ProfileStatDisplayRow[] = [
    {
      kind: "health", label: "Max Hp:",
      // Saved health is the base: Vitality multiplies it live, it is not baked in.
      base: statValue(progress.maxHp),
      equationOperator: "×",
      multiplier: multiplierValue(stats.multipliers.maxHp),
      total: statValue(stats.maxHp),
      sources: [...soulSource(from.maxHp.soul, statValue), ...multiplierSources(from.maxHp.techPercent, from.maxHp), ...cardSource(from.maxHp.cards)],
    },
    {
      kind: "damage", label: "Damage:", base: statValue(progress.damage),
      equationOperator: "×",
      multiplier: multiplierValue(stats.multipliers.damage), total: statValue(stats.damage),
      sources: [...soulSource(from.damage.soul, statValue), ...multiplierSources(from.damage.techPercent, from.damage),
        ...(from.damage.classSet > 1 ? [{ label: "Class Set" as const, value: formatMultiplier(from.damage.classSet) }] : []), ...cardSource(from.damage.cards)],
    },
    {
      kind: "armor", label: "Armor:", base: statValue(progress.armor),
      equationOperator: "×",
      multiplier: multiplierValue(stats.multipliers.armor),
      expandedDetail: `(${armorReduction(stats.armor)} Block)`,
      total: statValue(stats.armor),
      sources: [...soulSource(from.armor.soul, statValue), ...multiplierSources(from.armor.techPercent), ...armorBootsSource(from.armor.boots), ...cardSource(from.armor.cards)],
    },
    {
      kind: "attack", label: "Attack Speed:", base: baseAttackSpeed,
      equationOperator: "×",
      // A bow's speed goes past the cap, so its total is never shown as the cap's Max.
      multiplier: multiplierValue(bowSpeed), total: bowSpeed > 1 ? attackSpeed : attackSpeedLabel(stats.attackRate, 1 / minAttackInterval), equationTotal: attackSpeed,
      // Attacks a second, never the rating behind them; the cap beside it shows how close the player is.
      expandedDetail: `${(1 / minAttackInterval).toFixed(2)}/s Cap${momentum ? ` · ${((1 + momentum) / minAttackInterval).toFixed(2)}/s Momentum` : ""}`,
      // The soul's own share, which adds to the run's and is kept through prestige.
      // The soul adds attacks a second flat (soulAttackSpeedBonus), so its line is that, not a rating.
      sources: [...soulSource(from.attackSpeed.soul, value => Number.isFinite(value) ? `${value.toFixed(3)}/s` : "Max"),
        ...(momentum ? [{ label: "Momentum" as const, value: `+${Math.round(momentum * 100)}%` }] : []),
        ...(bowSpeed > 1 ? [{ label: "Equipment" as const, value: `+${Math.round((bowSpeed - 1) * 100)}% (Bow)` }] : [])],
    },
    {
      kind: "range", label: "Attack Range:", base: statValue(baseRange),
      equationOperator: "×",
      multiplier: multiplierValue(reach / baseRange), total: statValue(reach),
      sources: [...(from.range.tech ? [{ label: "Tech" as const, value: `+${from.range.tech} range` }] : []),
        ...(from.range.prestige ? [{ label: "Prestige" as const, value: `+${from.range.prestige} range` }] : []),
        ...(addedRange.cards ? [{ label: "Cards" as const, value: rangeValue(addedRange.cards) }] : []),
        ...(addedRange.mastery ? [{ label: "Mastery" as const, value: rangeValue(addedRange.mastery) }] : [])],
    },
    {
      kind: "regen", label: "Regen:",
      base: `${formatRate(progress.regen)}/s`,
      equationOperator: "×",
      multiplier: multiplierValue(stats.multipliers.regen), total: `${formatRate(stats.regenPerSecond)}/s`,
      sources: [...soulSource(from.regen.soul, value => `${formatRate(value)}/s`), ...multiplierSources(from.regen.techPercent, from.regen),
        ...cardSource(from.regen.cards)],
    },
    {
      kind: "speed", label: "Move Speed:", base: statValue(inputs.base.moveSpeed),
      equationOperator: "×",
      multiplier: multiplierValue(stats.multipliers.moveSpeed),
      total: statValue(stats.moveSpeed),
      // Move speed stays in percent: small walking bonuses read better that way.
      sources: [...(speed.techPercent ? [{ label: "Tech" as const, value: `+${speed.techPercent}%` }] : []), ...(speed.techFlat > 0 ? [{ label: "Tech" as const, value: `+${speed.techFlat} speed` }] : []),
        ...(speed.prestige ? [{ label: "Prestige" as const, value: `+${Math.round(speed.prestige * 1000) / 10}%` }] : []),
        ...(speed.cards ? [{ label: "Cards" as const, value: `+${Math.round(speed.cards * 1000) / 10}%` }] : []),
        ...armorSource(speed.armor), ...bootsSource(speed.boots),
        ...(speed.blackBoots ? [{ label: "Boots" as const, value: `+${speed.blackBoots} speed` }] : [])],
    },
  ];
  // Tech and prestige multiply each other, exactly as the server pays them, so
  // the total is the product rather than the two percentages added together.
  const { tech: techGain, prestige: prestigeGain, guild: guildGain, cards: cardGain, singleStat } = from.statGain;
  const percentPoints = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;
  // Both factors have whole-percent precision. Round their integer product
  // once so half-percent ties and the expanded/collapsed totals agree.
  const gainPercent = Math.round(Math.round(techGain * 100) * Math.round(prestigeGain * 100) / 100 * Math.round(guildGain * 100) / 100 * Math.round(cardGain * 100) / 100) - 100;
  rows.push({
    kind: "stat-gain", label: "Stat Gain:", base: techGain.toFixed(2),
    equationOperator: "×", multiplier: (prestigeGain * guildGain * cardGain).toFixed(2), total: formatMultiplier((gainPercent + 100) / 100),
    hideEquation: techGain <= 1 || prestigeGain * guildGain * cardGain <= 1,
    sources: [
      ...(techGain > 1 ? [{ label: "Tech" as const, value: formatMultiplier(techGain) }] : []),
      ...(prestigeGain > 1 ? [{ label: "Prestige" as const, value: formatMultiplier(prestigeGain) }] : []),
      ...(guildGain > 1 ? [{ label: "Guild" as const, value: formatMultiplierChange(guildGain) }] : []),
      // Active cards multiply on top: all-stat ones (Gravebloom) every reward, Bounty ones a single stat's.
      ...(cardGain > 1 ? [{ label: "Cards" as const, value: formatMultiplierChange(cardGain) }] : []),
      ...singleStat.map(([stat, value]) => ({ label: "Cards" as const, value: `${formatPercentMultiplier(value)} ${STAT_NAMES[stat as keyof typeof STAT_NAMES]}` })),
    ],
  });
  // Keen Edge pays critical chance and critical damage on top of research, so
  // both rows read as combat rolls them rather than showing research alone.
  const critChance = from.critChance;
  rows.push({
    kind: "critical", label: "Critical Chance:", base: "0%", equationOperator: "+", multiplier: percentPoints(stats.critChance), total: percentPoints(stats.critChance),
    sources: [
      ...(critChance.techPercent ? [{ label: "Tech" as const, value: `+${critChance.techPercent}%` }] : []),
      ...(critChance.prestige ? [{ label: "Prestige" as const, value: `+${percentPoints(critChance.prestige)}` }] : []),
      ...(critChance.cards ? [{ label: "Cards" as const, value: `+${percentPoints(critChance.cards)}` }] : []),
      ...(critChance.weapon ? [{ label: "Equipment" as const, value: `+${percentPoints(critChance.weapon)} (Bow)` }] : []),
    ],
  });
  // A rating on a curve toward 100× (shared/stat-rating.ts): crit camps' rating, the soul's on top, then
  // research and Keen Edge, each a share closer. Combat stops at the cap (5×, 1× more a Crit Cap rank),
  // so the row does too, and says (Max) once it reads the same as the cap.
  const crit = from.critDamage;
  const shown = (value: number) => `+${value.toFixed(2)}×`;
  const bonusShare = (part: number) => crit.research + crit.perk > 0 ? crit.fromBonuses * part / (crit.research + crit.perk) : 0;
  rows.push({
    kind: "critical-damage", label: "Critical Damage:", base: `${CRITICAL_DAMAGE_BASE.toFixed(2)}×`, equationOperator: "+",
    multiplier: `${(crit.multiplier - CRITICAL_DAMAGE_BASE).toFixed(2)}×`, total: critDamageLabel(crit.multiplier, crit.cap),
    equationTotal: `${crit.multiplier.toFixed(2)}×`, expandedDetail: `${crit.cap}× Cap`,
    sources: [
      ...(crit.research ? [{ label: "Tech" as const, value: shown(bonusShare(crit.research)) }] : []),
      ...(crit.perk ? [{ label: "Prestige" as const, value: shown(bonusShare(crit.perk)) }] : []),
      // The soul adds a flat multiplier (critical-damage.ts), so its line is that, not a rating.
      ...(crit.fromSoul > 0 ? [{ label: "Soul" as const, value: shown(crit.fromSoul) }] : []),
      ...(crit.fromCards > 0 ? [{ label: "Cards" as const, value: shown(crit.fromCards) }] : []),
    ],
  });
  // The remaining perks have no research behind them, so a row only appears
  // once a point is spent or a worn card gives the chance, which combat adds to the perk's.
  const perkRow = (perk: keyof PrestigePerkRanks, kind: string, expandedDetail: string, chances: { prestige: number; cards: number }) => {
    const { prestige: chance, cards: card } = chances;
    if (!chance && !card) return;
    rows.push({
      kind, label: `${PRESTIGE_PERKS[perk].title}:`, base: "0%", equationOperator: "+", multiplier: percentPoints(chance + card),
      expandedDetail, total: percentPoints(chance + card),
      sources: [...(chance ? [{ label: "Prestige" as const, value: `+${percentPoints(chance)}` }] : []),
        ...(card ? [{ label: "Cards" as const, value: `+${percentPoints(card)}` }] : [])],
    });
  };
  perkRow("doubleStrike", "double-strike", "(Chance a hit lands twice)", from.doubleStrike);
  perkRow("splitShot", "split-shot", "(Chance to strike a second enemy)", from.splitShot);
  perkRow("riposte", "riposte", "(Reflects 100% of each hit before armor, up to half your max health; no cap in Reflect Only; half in duels)", from.reflect);
  return rows;
}

export function renderProfileStats(
  profile: PlayerProfileData,
  statGrid: HTMLElement,
  armorReduction: (armor: number) => string,
  attackCap: AttackCapArg,
  research?: PlayerResearch,
  prestigeLevel = profile.prestigeLevel ?? 0,
  perks: Partial<PrestigePerkRanks> | null | undefined = profile.prestigePerks,
  guildBonus = 1,
  soulStats: Partial<SoulStats> | null = null,
) {
  const stats = profileStatDisplayRows(profile, armorReduction, attackCap, research, prestigeLevel, perks, guildBonus, soulStats);
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
