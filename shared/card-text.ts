import { CARD_CHANCE_CAP, CARD_DODGE_CAP, CARD_EFFECT_DEFAULTS, CARD_GUARD_CAP } from "./card-effects";
import { PRISM_MAX_TARGETS } from "./card-bounds";
import { type CardDefinition, type CardEffect, type CardEffectId, type CardSlot } from "./cards";
import { MAP_DISPLAY_NAMES } from "./rules";
import type { RewardType } from "./enemy-definitions";
import { formatMultiplierChange } from "./compact-number";

export const STAT_NAMES: Readonly<Record<RewardType, string>> = {
  damage: "Damage", health: "Max Health", speed: "Attack Speed", armor: "Armor", regen: "Regen", crit: "Crit Damage",
};
export const CARD_SLOT_NAMES: Readonly<Record<CardSlot, string>> = { HAND: "Weapon", HEAD: "Helmet", CHEST: "Armor" };

const number = (value: number) => `${Math.round(value * 100) / 100}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const signed = (value: number) => (value < 0 ? `-${number(-value)}` : `+${number(value)}`);
/** The Cards tab's zones that are not a map: the Warden cards and the tree cards. */
const CARD_ZONE_NAMES: Readonly<Record<string, string>> = { endless: "Endless", timberwood: "Timberwood" };
export const mapName = (mapId: string) =>
  (MAP_DISPLAY_NAMES as Record<string, string>)[mapId]?.replace(/ - \d+$/, "") ?? CARD_ZONE_NAMES[mapId] ?? mapId;

const CHANCE_CAPPED: ReadonlySet<CardEffectId> = new Set(["critChance", "doubleStrike", "splitShot", "reflect", "panicHeal", "oreFind", "logFind",
  "burn", "poison", "chill", "stun", "weaken", "knockback", "chainLightning"]);
const GUARDS: ReadonlySet<CardEffectId> = new Set(["rangedGuard", "meleeGuard", "bossGuard", "eliteGuard", "raceGuard"]);
/** The most a stacked effect does: chances and guards have caps, a web slows at most 90%, Last Stand leaves at most full health. */
const capOf = (effect: CardEffectId) => effect === "dodge" ? CARD_DODGE_CAP : GUARDS.has(effect) ? CARD_GUARD_CAP
  : CHANCE_CAPPED.has(effect) ? CARD_CHANCE_CAP : effect === "web" ? 90 : effect === "lastStand" ? 100 : Infinity;

/**
 * What one effect of a card does, as players read it, for this many copies in play: the part that stacks shows its
 * total and, in brackets, one card's share times the copies ("Crit Chance +30% [10%×3]", "Damage ×1.3 [+0.1×3]"); durations, shares and target
 * counts stay as they are, since copies add only the number. A capped total says so.
 */
export function cardEffectText(effect: CardEffect, copies = 1): string {
  const v = effect.value, n = Math.max(1, Math.floor(copies)), cap = capOf(effect.effect);
  const total = Math.sign(v * n) * Math.min(cap, Math.abs(v * n)), capped = Math.abs(v * n) > cap ? " (max)" : "";
  const each = (unit: string) => ` [${number(Math.abs(v))}${unit}×${n}]`;
  // Signed and bare forms of the stacking number.
  const sig = (unit = "%") => `${signed(total)}${unit}${capped}${each(unit)}`;
  const ab = (unit = "%") => `${number(Math.abs(total))}${unit}${capped}${each(unit)}`;
  // A core stat or damage bonus as the multiplier it comes to, each card adding its share: "×1.3 [+0.1×3]".
  const step = (share: number) => `${share < 0 ? "-" : "+"}${Math.round(Math.abs(share) * 1000) / 1000}`;
  const mul = () => `${formatMultiplierChange(1 + total / 100)}${capped} [${step(v / 100)}×${n}]`;
  const burnShare = effect.share ?? CARD_EFFECT_DEFAULTS.burn.share;
  const lines: Partial<Record<CardEffectId, () => string>> = {
    atk: () => `Damage ${mul()}`,
    critChance: () => `Crit Chance ${sig()}`,
    critDamage: () => `Crit Damage and its cap ${sig()}`,
    doubleStrike: () => `${ab()} chance a hit lands twice`,
    splitShot: () => `${ab()} chance to also hit a second nearby enemy`,
    bossSlayer: () => `Damage to bosses ${mul()}`,
    eliteSlayer: () => `Damage to elites ${mul()}`,
    raceSlayer: () => `Damage to ${mapName(effect.mapId ?? "")} enemies ${mul()}`,
    rangedSlayer: () => `Damage to ranged enemies ${mul()}`,
    execute: () => `Damage to enemies under ${percent(CARD_EFFECT_DEFAULTS.execute.below)} health ${mul()}`,
    opener: () => `Damage to enemies at full health ${mul()}`,
    berserk: () => `Damage ${mul()} while you are under ${percent(CARD_EFFECT_DEFAULTS.berserk.below)} health`,
    steady: () => `Damage ${mul()} while you stand still`,
    momentum: () => `Each kill: damage ${sig()} for ${CARD_EFFECT_DEFAULTS.momentum.seconds}s, stacks ${CARD_EFFECT_DEFAULTS.momentum.stacks} times`,
    // Burning on every hit stacks its share per copy; a chance to burn stacks the chance.
    burn: () => v >= 100
      ? `Every hit burns: ${percent(burnShare * n)} [${percent(burnShare)}×${n}] of the hit over ${effect.seconds ?? CARD_EFFECT_DEFAULTS.burn.seconds}s`
      : `${ab()} chance to burn: ${percent(burnShare)} of the hit over ${effect.seconds ?? CARD_EFFECT_DEFAULTS.burn.seconds}s`,
    poison: () => `${ab()} chance to poison: ${percent(CARD_EFFECT_DEFAULTS.poison.share)} of the hit over ${CARD_EFFECT_DEFAULTS.poison.seconds}s, and the enemy hits ${percent(CARD_EFFECT_DEFAULTS.poison.weaken)} softer`,
    chill: () => `${ab()} chance to slow an enemy ${percent(CARD_EFFECT_DEFAULTS.chill.slow)} for ${CARD_EFFECT_DEFAULTS.chill.seconds}s`,
    stun: () => `${ab()} chance to stun an enemy for ${effect.seconds ?? CARD_EFFECT_DEFAULTS.stun.seconds}s (not bosses)`,
    weaken: () => `${ab()} chance: the enemy deals ${percent(CARD_EFFECT_DEFAULTS.weaken.weaken)} less damage for ${CARD_EFFECT_DEFAULTS.weaken.seconds}s`,
    knockback: () => `${ab()} chance to knock an enemy back`,
    // A splash with a chance stacks the chance, its share stays; an always-on one stacks the share.
    splash: () => {
      if (effect.chance === undefined) return `Every hit also deals ${ab()} of its damage to enemies near the target`;
      const chance = Math.min(CARD_CHANCE_CAP, effect.chance * n);
      return `${number(chance)}%${effect.chance * n > CARD_CHANCE_CAP ? " (max)" : ""} [${number(effect.chance)}%×${n}] chance a hit also deals ${number(Math.abs(v))}% of its damage to every enemy near the target`;
    },
    chainLightning: () => `${ab()} chance to arc to ${effect.targets ?? CARD_EFFECT_DEFAULTS.chainLightning.targets} more enemies for ${percent(effect.share ?? CARD_EFFECT_DEFAULTS.chainLightning.share)}`,
    lifesteal: () => `Heal ${ab()} of the damage you deal`,
    quickDraw: () => `Attack speed cap ${sig("/s")}`,
    arrowStorm: () => `With a bow: Arrow Storm chance ${sig()}`,
    ricochet: () => `With a bow: Ricochet chance ${sig()}`,
    piercing: () => `With a bow: Piercing Shot chance ${sig()}`,
    iaido: () => "Your first hit on each enemy is always a critical",
    reap: () => `Regular enemies under ${ab()} health die at once`,
    maxHealth: () => `Max Health ${mul()}`,
    armor: () => `Armor ${mul()}`,
    regen: () => `Regen ${mul()}`,
    reflect: () => `${ab()} chance to send a hit back`,
    secondWind: () => `Heal ${ab()} of max health on each kill`,
    dodge: () => `${ab()} chance to dodge a hit`,
    rangedGuard: () => `Damage from ranged enemies -${ab()}`,
    meleeGuard: () => `Damage from melee enemies -${ab()}`,
    bossGuard: () => `Damage from bosses -${ab()}`,
    eliteGuard: () => `Damage from elites -${ab()}`,
    raceGuard: () => `Damage from ${mapName(effect.mapId ?? "")} enemies -${ab()}`,
    shield: () => `A shield of ${ab()} max health that takes all of the hit that breaks it, back ${effect.seconds ?? CARD_EFFECT_DEFAULTS.shield.seconds}s after the last hit`,
    panicHeal: () => `Hit under ${percent(CARD_EFFECT_DEFAULTS.panicHeal.below)} health: ${ab()} chance to heal ${percent(CARD_EFFECT_DEFAULTS.panicHeal.heal)}`,
    lastStand: () => `Once per map visit, a killing blow leaves you at ${ab()} health`,
    web: () => `Enemies that hit you are slowed ${ab()} for ${effect.seconds ?? CARD_EFFECT_DEFAULTS.web.seconds}s`,
    prism: () => `A reflected hit also strikes up to ${PRISM_MAX_TARGETS} enemies near the attacker, each once a second at most`,
    fleetFoot: () => `Move Speed ${sig()}`,
    longShot: () => `Attack Range ${sig("")}`,
    statGain: () => `${STAT_NAMES[effect.stat ?? "damage"]} from kills ${mul()}`,
    allStatGain: () => `All stats from kills ${mul()}`,
    cardHunter: () => `Card drop chance ${sig()}`,
    treasure: () => `Gold drop chance ${sig()}`,
    respawn: () => `Enemies respawn ${ab()} faster`,
    miningSpeed: () => `Mining speed ${sig()}`,
    oreFind: () => `${ab()} chance for an extra ore`,
    starshardFind: () => `${sig()} chance of a second Starshard`,
    woodcuttingSpeed: () => `Chop speed ${sig()}`,
    logFind: () => `${ab()} chance for an extra log`,
    onward: () => "Beating your furthest map's boss teleports you to the next map",
  };
  return lines[effect.effect]?.() ?? effect.effect;
}

/** "Needle Card". */
export const cardName = (card: CardDefinition) => `${card.enemy} Card`;


const killWord = (card: CardDefinition, many: boolean) =>
  card.tree ? `tree${many ? "s" : ""}` : `${card.rarity === "boss" ? "boss " : ""}kill${many ? "s" : ""}`;

/** "Endless 11–20", "Endless 51+": the maps whose Wardens drop a card. */
const endlessBand = ({ from, to }: { from: number; to?: number }) => `Endless ${from}${to === undefined ? "+" : `–${to}`}`;
/** Where a card drops: its map, or for a Warden card its band, "Endless 11–20". */
const cardWhere = (card: CardDefinition) => card.endless ? endlessBand(card.endless) : mapName(card.mapId);

/** "Elite · Tutorial Forest". */
export const cardOrigin = (card: CardDefinition) =>
  `${card.rarity === "boss" ? "Boss" : card.rarity === "elite" ? "Elite" : "Regular"} · ${cardWhere(card)}`;

/**
 * Where a card drops and one kill's chance at it: "Tutorial Forest · 1 in 877 kills" (boss cards per boss kill,
 * Warden cards by their band of Endless, tree cards per tree felled).
 */
export function cardOddsText(card: CardDefinition, chance: number) {
  const where = cardWhere(card);
  if (!(chance > 0)) return `${where} · No drop`;
  if (chance >= 1) return `${where} · Every ${killWord(card, false)}`;
  return `${where} · 1 in ${Math.max(1, Math.round(1 / chance)).toLocaleString("en-US")} ${killWord(card, true)}`;
}

/** "Sure by 2,000 kills": a full card meter guarantees the card. */
export const cardSureText = (card: CardDefinition, kills: number) => `Sure by ${kills.toLocaleString("en-US")} ${killWord(card, kills !== 1)}`;
