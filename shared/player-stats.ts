/**
 * The player's final stats, in one place. Every client view reads them from
 * here (docs/player-stats.md says which one passes what). Pure: callers pass
 * the run's stats, the loadout and the bonuses in play as plain data.
 */
import { armorMoveSpeedFactor, armorSkillChanceFactor } from "./armor-class-perks";
import { bowCritChanceBonus } from "./bow-skills";
import { cardChance, cardValue, NO_CARDS, type CardTotals } from "./card-effects";
import { armorDamageReduction } from "./combat";
import { criticalDamage } from "./critical-damage";
import {
  BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS, bootMoveSpeedFactor, bootSkillChanceFactor, classSetDamageMultiplier,
  equipmentDamageMultiplierBonus, equipmentMaxHealthMultiplierBonus, equipmentRegenerationMultiplierBonus, itemDefinition, itemLevelParts, type ItemLevel,
} from "./items";
import { luckMultiplier } from "./luck-research";
import { applyPlayerStatFactors, playerStatFactors, unroundedPlayerPower } from "./player-power";
import { prestigeStatMultiplier } from "./prestige";
import { CHALLENGE_ABSOLUTE_MIN_INTERVAL } from "./prestige-challenge";
import { prestigePerkValue, type PrestigePerkRanks } from "./prestige-perks";
import { createEmptyResearchRanks, researchStatRewardMultiplier, utilityMovementSpeedBonus, type ResearchRanks } from "./research";
import { DEFAULT_ATTACK_RANGE, movementSpeedMultiplier } from "./rules";
import { weaponSchool } from "./weapon-mastery";
import { cleanSoulStats, soulAttackSpeedBonus, type SoulStats } from "./soul-dimension";
import { weaponAttackInterval } from "./staff-skills";
import { attackCapInterval, type AttackCapArg } from "./stat-rating";

export type PlayerStatLoadout = { head: string; chest: string; feet: string; rightHand: string; leftHand: string };

export type PlayerStatInputs = {
  /**
   * The run's earned stats with the soul's share already added (soul-dimension.ts withSoulStats).
   * attackInterval is seconds a shot; attackRange is the range before the weapon, research and Long Shot inside.
   */
  base: { maxHp: number; damage: number; armor: number; regen: number; attackInterval: number; attackRange: number; moveSpeed: number; critRating?: number };
  loadout: PlayerStatLoadout;
  /** A worn item's slot tier and refine (item-level.ts itemLevelFor); none without. */
  itemLevel?: (itemId: string) => ItemLevel;
  /** Research ranks in play (bonus toggles applied). */
  research?: Partial<ResearchRanks> | null;
  /** Prestige perk ranks in play (none during an Aggro run). */
  perks?: Partial<PrestigePerkRanks> | null;
  /** The active cards in play, added up (card-effects.ts cardTotals). */
  cards?: CardTotals | null;
  /** The soul's stats in play: its crit damage counts here, the rest is already in `base` and only listed as a source. */
  soul?: Partial<SoulStats> | null;
  attackCap?: AttackCapArg;
  /** Prestige level for stat gain (0 while prestige stat gain is off), and the guild's daily quest bonus. */
  prestigeLevel?: number;
  guildBonus?: number;
  /** The Gold Luck research rank (stored as gearLuck). */
  goldLuckRank?: number;
  /** Live combat only: Swordplay's Tailwind share now. */
  tailwind?: number;
  /** Duels keep their own footing: Black Boots do not count. */
  dueling?: boolean;
};

const EMPTY_RANKS = createEmptyResearchRanks();
const ranksOf = (inputs: PlayerStatInputs) => ({ ...EMPTY_RANKS, ...inputs.research });
const levelOf = (inputs: PlayerStatInputs) => inputs.itemLevel ?? (() => 0);
const weaponOf = (loadout: PlayerStatLoadout) => loadout.rightHand || loadout.leftHand;

/** Black Boots' flat move speed: on outside duels. */
export const blackBootsSpeed = (feet: string, dueling = false) => feet === BLACK_BOOTS && !dueling ? BLACK_BOOTS_SPEED_BONUS : 0;

/** A sword reaches its own range plus what the run added past the default; a bow or staff shoots the range itself. */
/** What a bow adds to the ranged reach: archers outrange staves. */
export const BOW_RANGE_BONUS = 50;

export function weaponAttackRange(itemId: string | undefined, rangedRange: number) {
  const weapon = itemDefinition(itemId)?.weapon;
  if (weapon?.mode === "MELEE") return (weapon.range ?? 75) + Math.max(0, rangedRange - DEFAULT_ATTACK_RANGE);
  return weaponSchool(itemId) === "archery" ? rangedRange + BOW_RANGE_BONUS : rangedRange;
}

/** What armor classes and boots multiply move speed by (Tailwind aside). */
export const gearMoveSpeedFactor = (head: string, chest: string, feet: string | undefined, feetLevel: ItemLevel) =>
  armorMoveSpeedFactor(head, chest) * bootMoveSpeedFactor(feet, feetLevel);

/** What Magic armor and Mystic Boots multiply weapon skill chances by. */
export const skillChanceFactor = (head: string, chest: string, feet: string | undefined, feetLevel: ItemLevel) =>
  armorSkillChanceFactor(head, chest) * bootSkillChanceFactor(feet, feetLevel);

/** Crit chance (0–1): Critical Chance research, Keen Edge, crit cards and a bow's own. */
export const critChanceFor = (research: Partial<ResearchRanks> | null | undefined, perks: Partial<PrestigePerkRanks> | null | undefined, cardCritChance = 0,
  weapon?: unknown) => (research?.criticalChance ?? 0) * .01 + prestigePerkValue(perks, "keenEdge") + cardCritChance + bowCritChanceBonus(weapon);

/** A perk's proc chance with the worn cards of the same name added. */
export const procChance = (perkChance: number, cards: CardTotals, effect: "doubleStrike" | "splitShot" | "reflect") =>
  perkChance + cardChance(cards, effect) / 100;

/** Max health, damage, armor and regen: base × gear × research × cards (player-power.ts). */
export function playerCoreStats(inputs: PlayerStatInputs) {
  const { base, loadout } = inputs;
  const factors = playerStatFactors({ equippedHead: loadout.head, equippedChest: loadout.chest, equippedFeet: loadout.feet,
    equippedRightHand: loadout.rightHand, equippedLeftHand: loadout.leftHand }, inputs.research, levelOf(inputs), inputs.cards ?? NO_CARDS);
  return { factors, stats: applyPlayerStatFactors(factors, { ...base, attackRate: base.attackInterval }) };
}

/**
 * Power as the server writes it (spacetimedb/src/player-power.ts powerFieldsForProgress), unrounded: the core
 * stats at the run's own attack speed, with crits counted (critPowerFactor).
 */
export function playerStatPower(inputs: PlayerStatInputs) {
  const { factors, stats } = playerCoreStats(inputs), ranks = ranksOf(inputs), perks = inputs.perks ?? null;
  const critMultiplier = criticalDamage({ researchRank: ranks.criticalDamage, perks, soul: cleanSoulStats(inputs.soul).critDamage,
    rating: inputs.base.critRating, capRank: ranks.critCap, card: factors.cards.critDamage }).multiplier;
  return unroundedPlayerPower({ ...stats, critChance: critChanceFor(ranks, perks, factors.cards.critChance, weaponOf(inputs.loadout)), critMultiplier });
}

/** Move speed: (base × research + Utility) × (Fleet Foot + cards), plus Black Boots, × armor class × boots × Tailwind. */
export function playerMoveSpeed(inputs: PlayerStatInputs) {
  const { base, loadout } = inputs, ranks = ranksOf(inputs);
  const research = base.moveSpeed * movementSpeedMultiplier(ranks.moveSpeed) + utilityMovementSpeedBonus(ranks.utilityMoveSpeed);
  const bonus = 1 + prestigePerkValue(inputs.perks, "fleetFoot") + Math.max(0, cardValue(inputs.cards ?? NO_CARDS, "fleetFoot")) / 100;
  const flat = blackBootsSpeed(loadout.feet, inputs.dueling);
  const gear = gearMoveSpeedFactor(loadout.head, loadout.chest, loadout.feet, levelOf(inputs)(loadout.feet));
  return (research * bonus + flat) * gear * (1 + (inputs.tailwind ?? 0));
}

/** The final stats and where each comes from. */
export function computePlayerStats(inputs: PlayerStatInputs) {
  const { base, loadout } = inputs;
  const ranks = ranksOf(inputs), perks = inputs.perks ?? null, cardTotals = inputs.cards ?? NO_CARDS;
  const itemLevel = levelOf(inputs), weapon = weaponOf(loadout), soul = cleanSoulStats(inputs.soul);
  const { factors, stats: core } = playerCoreStats(inputs);
  const { gear, research, cards } = factors;
  const capInterval = attackCapInterval(inputs.attackCap);
  const attackInterval = Math.max(CHALLENGE_ABSOLUTE_MIN_INTERVAL, capInterval, base.attackInterval);
  const critChance = critChanceFor(ranks, perks, cards.critChance, weapon);
  const critDamage = criticalDamage({ researchRank: ranks.criticalDamage, perks, soul: soul.critDamage, rating: base.critRating, capRank: ranks.critCap,
    card: cards.critDamage });
  const moveSpeed = playerMoveSpeed(inputs);
  const range = weaponAttackRange(weapon, base.attackRange);
  const statGain = researchStatRewardMultiplier(ranks) * prestigeStatMultiplier(inputs.prestigeLevel ?? 0) * guildGain(inputs.guildBonus);
  return {
    maxHp: core.maxHp,
    damage: core.damage,
    armor: core.armor,
    /** The share of a hit armor blocks, by the default rule (a map may install its own: map-balance-runtime.ts). */
    armorReduction: armorDamageReduction(core.armor),
    regenPerSecond: core.regen,
    moveSpeed,
    /** Seconds between attacks, never under the cap; attackRate is attacks a second. */
    attackInterval,
    attackRate: 1 / attackInterval,
    /** What the weapon fires at: a staff casts slower, a bow shoots faster (staff-skills.ts). */
    weaponInterval: weaponAttackInterval(weapon, attackInterval),
    capInterval,
    range,
    critChance,
    critMultiplier: critDamage.multiplier,
    reflectChance: procChance(prestigePerkValue(perks, "riposte"), cardTotals, "reflect"),
    doubleStrikeChance: procChance(prestigePerkValue(perks, "doubleStrike"), cardTotals, "doubleStrike"),
    splitShotChance: procChance(prestigePerkValue(perks, "splitShot"), cardTotals, "splitShot"),
    skillChanceFactor: skillChanceFactor(loadout.head, loadout.chest, loadout.feet, itemLevel(loadout.feet)),
    goldChanceMultiplier: (1 + cards.treasure) * luckMultiplier("gearLuck", inputs.goldLuckRank ?? 0),
    /** What a kill's stat reward is multiplied by: Tech × Prestige × Guild (cards add per stat: card-effects.ts cardStatGainFactor). */
    statGain,
    /** What each base stat ends up multiplied by. */
    multipliers: {
      maxHp: research.maxHp * gear.maxHp * cards.maxHp,
      damage: research.damage * gear.damage * cards.damage,
      armor: research.armor * gear.armor * cards.armor,
      regen: research.regen * gear.regen * cards.regen,
      moveSpeed: moveSpeed / Math.max(1, base.moveSpeed),
    },
    sources: statSources(inputs, ranks, soul, factors, critDamage),
  };
}

const guildGain = (bonus: number | undefined) => Math.max(1, Number.isFinite(bonus) ? Number(bonus) : 1);

/**
 * Each stat's sources, as the profile lists them: soul shares are flat, Tech is percent points, gear parts
 * are fractions (bare gear, what slot tiers add, what refines add on top), card and boot entries are factors.
 */
function statSources(inputs: PlayerStatInputs, ranks: ResearchRanks, soul: SoulStats, factors: ReturnType<typeof playerStatFactors>,
  critDamage: ReturnType<typeof criticalDamage>) {
  const { loadout } = inputs, perks = inputs.perks ?? null, cardTotals = inputs.cards ?? NO_CARDS, { cards } = factors;
  const itemLevel = levelOf(inputs), weapon = weaponOf(loadout), { head, chest, feet } = loadout;
  const tier = (itemId: string) => itemLevelParts(itemLevel(itemId)).tier;
  // The same gear three ways: bare, with slot tiers, and with refines too. The steps are what each added.
  const gearParts = (bonus: (level: (itemId: string) => ItemLevel) => number) => {
    const bare = bonus(() => 0), tiered = bonus(tier), full = bonus(itemLevel);
    return { equipment: bare, slotUpgrade: Math.max(0, tiered - bare), refine: Math.max(0, full - tiered) };
  };
  const health = gearParts(level => equipmentMaxHealthMultiplierBonus(head, chest, level(head), level(chest)));
  const damage = gearParts(level => equipmentDamageMultiplierBonus(weapon, head, chest, level(weapon), level(head), level(chest)));
  const regen = gearParts(level => equipmentRegenerationMultiplierBonus(head, chest, level(head), level(chest)));
  return {
    maxHp: { soul: soul.maxHp, techPercent: ranks.vitality * 2, ...health, cards: cards.maxHp },
    damage: { soul: soul.damage, techPercent: ranks.warcraft * 2, ...damage, classSet: classSetDamageMultiplier(weapon, head, chest), cards: cards.damage },
    armor: { soul: soul.armor, techPercent: ranks.precision * 2, boots: factors.gear.armor, cards: cards.armor },
    regen: { soul: soul.regen, techPercent: ranks.regeneration * 2, ...regen, cards: cards.regen },
    /** The soul adds attacks a second flat. */
    attackSpeed: { soul: soulAttackSpeedBonus(soul.attackSpeed) },
    /** Inside the saved range already: Utility research and Long Shot. */
    range: { tech: Math.min(5, Math.max(0, ranks.utilityAttackRange ?? 0)) * 10, prestige: prestigePerkValue(perks, "longShot") },
    moveSpeed: {
      techPercent: ranks.moveSpeed * 2, techFlat: ranks.utilityMoveSpeed > 0 ? utilityMovementSpeedBonus(ranks.utilityMoveSpeed) : 0,
      /** The research share alone: base × Move Speed research + Utility. */
      research: inputs.base.moveSpeed * movementSpeedMultiplier(ranks.moveSpeed) + utilityMovementSpeedBonus(ranks.utilityMoveSpeed),
      prestige: prestigePerkValue(perks, "fleetFoot"), cards: cards.moveSpeed,
      armor: armorMoveSpeedFactor(head, chest), boots: bootMoveSpeedFactor(feet, itemLevel(feet)),
      blackBoots: blackBootsSpeed(feet, inputs.dueling), tailwind: inputs.tailwind ?? 0,
    },
    statGain: {
      tech: researchStatRewardMultiplier(ranks), prestige: prestigeStatMultiplier(inputs.prestigeLevel ?? 0), guild: guildGain(inputs.guildBonus),
      cards: 1 + Math.max(0, cardValue(cardTotals, "allStatGain")) / 100,
      /** Bounty cards: one stat's gain, in percent. */
      singleStat: Object.entries(cardTotals.statGain).filter(([, value]) => (value ?? 0) > 0) as [string, number][],
    },
    critChance: { techPercent: ranks.criticalChance, prestige: prestigePerkValue(perks, "keenEdge"), cards: cards.critChance, weapon: bowCritChanceBonus(weapon) },
    critDamage,
    reflect: { prestige: prestigePerkValue(perks, "riposte"), cards: cardChance(cardTotals, "reflect") / 100 },
    doubleStrike: { prestige: prestigePerkValue(perks, "doubleStrike"), cards: cardChance(cardTotals, "doubleStrike") / 100 },
    splitShot: { prestige: prestigePerkValue(perks, "splitShot"), cards: cardChance(cardTotals, "splitShot") / 100 },
  };
}
