// Regular-enemy report validation. Boss combat runs on the client and clears
// only unlock gates (boss-gates.ts); the retained IDs below serve old migrations.
import { upgradeSlotForItem } from "../../shared/slot-upgrades";
import { preparePlayerPowerStats } from "../../shared/player-power";
import { powerFieldsFromStats, powerStatsFrom } from "./power-stats";
import { researchInPlayFor } from "../../shared/bonus-toggles";
import { bootSkillChanceFactor, equipmentDamageFactor, hasBootStat, itemDefinition, type ItemLevel } from "../../shared/items";
import { armorSkillChanceFactor } from "../../shared/armor-class-perks";
import { createEnemyRewardAccumulator, type EnemyStatReward } from "../../shared/enemy-reward-accumulator";
import { attackCapInPlay, bonusRowsFor, statRewardMultiplierFor, prestigePerkRanks, type BonusRows } from "./prestige";
import { WORLD_REFLECT_SHARE, preArmorFactor, prestigePerkValue, prestigeReachMultiplier, prestigeSwingMultiplier } from "../../shared/prestige-perks";
import { armorDamageReduction } from "../../shared/combat";
import { criticalDamageMultiplier } from "../../shared/critical-damage";
import { cardStatFactors, type CardTotals } from "../../shared/card-effects";
import { activeCardTotalsFor } from "./active-cards";
import { serverBoostRewardMultiplier } from "./server-boost-tables";
import { luckInPlay } from "./luck-research";
import type { LuckRanks } from "../../shared/luck-research";
import { soulStatsFor, withSoulStats } from "./soul-dimension";
import { bowSkillRollFor } from "./bow-skills";
import { bowSkillReachMultiplier, isSkillBow } from "../../shared/bow-skills";
import { PRISM_MAX_TARGETS, bowSkillsWithCards, cardGuardFactor, cardOffenseBound, cardSustainBound } from "../../shared/card-bounds";
import { cardChance, cardValue } from "../../shared/card-effects";
import { swordSkillChance, swordSkillReachMultiplier } from "../../shared/sword-skills";
import { swordSkillRollFor } from "./sword-skills";
import { STAFF_BOLT_DAMAGE_FACTOR, isStaff, staffSkillReachMultiplier, weaponAttackInterval } from "../../shared/staff-skills";
import { isBow } from "../../shared/bow-skills";
import { arrowOffenseBound } from "../../shared/arrows";
import { arrowInPlay } from "./arrows";
import { staffSkillRollFor } from "./staff-skills";
import type { ModuleReducerCtx as GameReducerContext } from "./index";
import { readCritRating, readPlayerProgress } from "./wide-stats";
import { weaponMasteryPoints } from "./weapon-mastery";
import { masteryDamageTaken, masteryInPlay, rollWithProficiency } from "../../shared/weapon-mastery";
import { masteryTechniqueBound } from "../../shared/mastery-techniques";

// Primary key of the single row in each retained shared-boss table. The
// one-time migrations still read the old result rows by it.
export const MAGMALISK_ID = 1;
export const TEMPEST_KIRIN_ID = 1;
export const MIREMAW_ID = 1;
export const PRISMSHELL_ID = 1;
export const DREADREAPER_ID = 1;
export const VOLTWARDEN_ID = 1;
export const GRAVEBLOOM_ID = 1;

// Everything the bodies still borrow from index.ts. Passing these in keeps
// the module free of runtime imports from ./index.
export type CombatReportDeps = {
  attackIntervalForProgress: (progress: any) => number;
  /** The slot tier and refine of a worn item (progress-helpers itemLevelFor). */
  itemUpgradeLevelFor: (ctx: any, identity: any, itemId: unknown) => ItemLevel;
  // The equipped* helpers take an already parsed inventory, so one parse serves all four.
  equippedRightHandForProgress: (progress: any, inventory?: string[]) => string;
  equippedLeftHandForProgress: (progress: any, inventory?: string[]) => string;
  equippedHeadForProgress: (progress: any, inventory?: string[]) => string;
  equippedChestForProgress: (progress: any, inventory?: string[]) => string;
  inventoryForProgress: (progress: any) => string[];
};

/** The death screen's 3-second countdown and a second more: shorter than any real death and walk back. */
export const REFLECT_ONLY_LIFE_SECONDS = 4;
/** Reflect lands whenever a hit does, with no swing to round kills to; a short tick keeps the bound continuous. */
export const REFLECT_ONLY_TICK_SECONDS = .1;
/** More kills a second than any map respawns (about 3.3 on Endless): Second Wind heals once per kill. */
export const SECOND_WIND_KILLS_PER_SECOND = 4;

// The gear's damage and skill chance factors are pure in the worn items and their levels, so recent
// loadouts keep theirs. Only numeric levels are keyed; anything else is worked out each time.
const gearFactorMemo = new Map<string, { equipment: number; skillFactor: number }>();
const GEAR_FACTOR_MEMO_SIZE = 256;
const levelKey = (level: ItemLevel) => typeof level === "number" ? `${level}`
  : level && typeof level.tier === "number" && typeof level.refine === "number" ? `${level.tier}/${level.refine}` : null;
function gearFactors(weapon: string, head: string, chest: string, feet: string, levels: ItemLevel[]) {
  const work = () => ({ equipment: equipmentDamageFactor(weapon, head, chest, levels[0], levels[1], levels[2]),
    skillFactor: armorSkillChanceFactor(head, chest) * (hasBootStat(feet) ? bootSkillChanceFactor(feet, levels[3]) : 1) });
  const parts = levels.map(levelKey);
  if (parts.includes(null) || ![weapon, head, chest, feet].every(id => typeof id === "string")) return work();
  const key = JSON.stringify([weapon, head, chest, feet, ...parts]);
  let factors = gearFactorMemo.get(key);
  if (!factors) {
    gearFactorMemo.set(key, factors = work());
    if (gearFactorMemo.size > GEAR_FACTOR_MEMO_SIZE) gearFactorMemo.delete(gearFactorMemo.keys().next().value!);
  }
  return factors;
}

export function createCombatReport(deps: CombatReportDeps) {
  const {
    attackIntervalForProgress, itemUpgradeLevelFor, inventoryForProgress,
    equippedRightHandForProgress, equippedLeftHandForProgress, equippedHeadForProgress, equippedChestForProgress,
  } = deps;

  /**
   * researchedDamage (index.ts) with the gear resolved once: the weapon, and
   * what it and the head and chest make of any base damage, with each slot's
   * upgrade level read at most once. The formula has to stay researchedDamage's.
   */
  function damageLoadout(ctx: GameReducerContext, progress: any, research: any, cardTotals: CardTotals) {
    const inventory = inventoryForProgress(progress);
    const rightHand = equippedRightHandForProgress(progress, inventory);
    const weapon = rightHand || equippedLeftHandForProgress(progress, inventory);
    const head = equippedHeadForProgress(progress, inventory), chest = equippedChestForProgress(progress, inventory);
    // Per item: the slot's tier and the item's own refine are both fixed for a report.
    const levels = new Map<string, ItemLevel>();
    const levelFor = (itemId: unknown): ItemLevel => {
      // Boots have no slot tier, but graded ones refine.
      if (!upgradeSlotForItem(itemId) && !hasBootStat(itemId)) return 0;
      const key = String(itemId);
      let level = levels.get(key);
      if (level === undefined) levels.set(key, level = itemUpgradeLevelFor(ctx, ctx.sender, itemId));
      return level;
    };
    const feet = inventory.includes(progress.equippedFeet) ? progress.equippedFeet : "";
    const warcraft = 1 + (research?.warcraft ?? 0) * .02;
    // The gear's bonuses and the class set (items.ts equipmentDamageFactor); Magic armor and Mystic Boots
    // raise skill chances as Skill Proficiency does.
    const { equipment, skillFactor } = gearFactors(weapon, head, chest, feet,
      [levelFor(weapon), levelFor(head), levelFor(chest), hasBootStat(feet) ? levelFor(feet) : 0]);
    // The active cards: attack cards multiply damage as they do power.
    const cards = cardStatFactors(cardTotals);
    return { weapon, rightHand, levelFor, cardTotals, cards, skillFactor,
      damage: (base: number) => base * equipment * warcraft * cards.damage };
  }

  /**
   * The most combat this player could have brought to each entry of one kill
   * report. Every row it reads is fixed for the length of a report: validation
   * writes only budget rows and the stream cursor, and the rewards a report
   * earns move stats, never gear, unlocks, perks, research or the bow's roll.
   * So the rows are read and the inventory parsed once, on first use, and each
   * entry after that is arithmetic on the saved stats plus what it earned.
   * Rebuilding it per species would be most of what the kill reducer costs.
   */
  function combatBoundForReport(ctx: GameReducerContext, worn?: CardTotals, savedRow?: any) {
    let loaded: ReturnType<typeof load> | undefined;
    let power: ReturnType<typeof powerStatsFrom> | undefined;
    // Rows the rest of the report reads too, each read once on first use. Nothing in a report writes them.
    let researchRead: { row: any } | undefined, rows: BonusRows | undefined, luck: LuckRanks | undefined, boostRead: number | undefined;
    const researchRow = () => (researchRead ??= { row: ctx.db.playerResearch.identity.find(ctx.sender) }).row;
    const bonuses = () => (rows ??= bonusRowsFor(ctx, ctx.sender, researchRow()));
    const serverBoost = () => (boostRead ??= serverBoostRewardMultiplier(ctx));
    function load() {
      // The caller passes the save when it has just read it and written nothing since.
      const saved = savedRow ?? readPlayerProgress(ctx, ctx.sender);
      const bonus = bonuses(), research = bonus.research;
      // The active cards, read once for the report (syncCardAttackCap) rather than again by each helper.
      // A running Server Boost doubles what this report earns, and the bound counts the stronger player that makes.
      const stat = statRewardMultiplierFor(ctx, ctx.sender, worn, bonus), boost = serverBoost();
      const statMultiplier = (type: string) => stat(type) * boost;
      // Soul stats add to the run's in every fight; the saved row and the earned rewards stay the run's alone.
      const soul = soulStatsFor(ctx, ctx.sender, bonus);
      const cards = worn ?? activeCardTotalsFor(ctx, ctx.sender);
      const loadout = saved ? damageLoadout(ctx, saved, research, cards) : null;
      const challenge = bonus.challenge;
      // Reflect Only wins and Quick Draw set the attack speed cap, Aggro runs included (attackCapInPlay).
      // The bounds above keep stored research, the looser side.
      const ranks = prestigePerkRanks(ctx, ctx.sender, bonus);
      const minInterval = attackCapInPlay(ctx, ctx.sender, worn, bonus);
      const earned = saved ? createEnemyRewardAccumulator(saved, statMultiplier, minInterval) : null;
      const statsFor = saved ? preparePlayerPowerStats(saved, research, loadout?.levelFor, cards) : null;
      // Armor rewards can change the nonlinear reduction inside a report.
      // Calculate it once per distinct effective armor, never reuse a stale value.
      const armorFactors = new Map<number, { reduction: number; preArmor: number }>();
      const armorFor = (armor: number) => {
        let factors = armorFactors.get(armor);
        if (!factors) {
          const reduction = armorDamageReduction(armor);
          factors = { reduction, preArmor: preArmorFactor(reduction) };
          armorFactors.set(armor, factors);
        }
        return factors;
      };
      if (!saved || !loadout || !statsFor) return { saved, earned, statsFor, armorFor, soul, minInterval, research, ranks, cards, gear: null };
      // Empty hands still earn through Reflect (an unarmed Reflect run): the
      // bound must not read no weapon as no combat, which paid them nothing.
      const armed = Boolean(loadout.weapon);
      // Use the possible maximum so legitimate lucky streaks are never clipped,
      // and no more than the critical damage cap lets a hit deal.
      // Keen Edge grants crit on its own, so a player with no crit research can
      // still be critting; the bound has to know that or it clips them.
      // Crit kills inside the report raise the run's rating, so the multiplier is read per entry.
      // Card effects in combat (card-bounds.ts): more damage a hit and more enemies reached, all counted at once.
      const cardBound = cardOffenseBound(loadout.cardTotals);
      // Weapon Mastery's Skill Proficiency raises every skill chance, and its techniques add hits, damage and speed
      // (mastery-techniques.ts), each at its most. Read once a report, and counted during Reflect Only and Aggro runs
      // too (where the client leaves it off): the looser side.
      const mastery = masteryInPlay(weaponMasteryPoints(ctx, ctx.sender), loadout.rightHand, loadout.weapon);
      const technique = masteryTechniqueBound(mastery,
        prestigePerkValue(ranks, "splitShot") > 0 || cardChance(loadout.cardTotals, "splitShot") > 0);
      // Steady Aim and Focus crit without any crit chance at all.
      const crits = (research?.criticalChance ?? 0) > 0 || prestigePerkValue(ranks, "keenEdge") > 0 || loadout.cards.critChance > 0 || cardBound.crits
        || technique.crits || isBow(loadout.weapon);
      const critical = (rating = 0) => crits
        ? criticalDamageMultiplier({ researchRank: research?.criticalDamage, perks: ranks, soul: soul?.critDamage, rating, capRank: research?.critCap,
          card: loadout.cards.critDamage }) : 1;
      // Double Strike is more damage per swing; Split Shot and Riposte are more
      // enemies reached per swing. The first belongs in damage per second, the
      // second in how many kills per second that damage can finish. The bow's
      // skills are both. Every storm arrow, bounce and pierce can reach another
      // enemy, so they widen reach; the Split Shot arrow rolls the bow's skills
      // too, so the two reaches multiply.
      // Bow skill cards add to a bow's own roll.
      const bowSkills = isSkillBow(loadout.weapon)
        ? rollWithProficiency(bowSkillsWithCards(bowSkillRollFor(ctx, ctx.sender, loadout.weapon), loadout.cardTotals), mastery.level, loadout.skillFactor) : null;
      const swordSkills = rollWithProficiency(swordSkillRollFor(ctx, ctx.sender, loadout.weapon), mastery.level, loadout.skillFactor);
      // A staff's bolt bursts on every enemy around its impact, and its skills reach further (staff-skills.ts).
      // Sorcery's bigger blast needs nothing more: the bound counts a burst's most targets, not its size.
      const staff = isStaff(loadout.weapon);
      const staffReach = staff
        ? staffSkillReachMultiplier(rollWithProficiency(staffSkillRollFor(ctx, ctx.sender, loadout.weapon), mastery.level, loadout.skillFactor), technique.meteorFalls) : 1;
      const armorReduction = armorFor(statsFor(withSoulStats(saved, soul, minInterval)).armor).reduction;
      // A nocked arrow, while the bow in hand has some to shoot (arrows.ts).
      const arrow = arrowOffenseBound(isBow(loadout.weapon) ? arrowInPlay(ctx, ctx.sender) : null);
      return { saved, earned, statsFor, armorFor, soul, minInterval, research, ranks, cards, gear: {
        loadout, critical: (rating?: number) => critical(rating) * arrow.critical, swing: prestigeSwingMultiplier(ranks),
        // Projectile count is not a kill reward, so the saved row holds for the whole report.
        armed,
        projectiles: !armed || itemDefinition(loadout.weapon)?.weapon?.mode === "MELEE" ? 1 : Math.max(1, saved.projectileCount),
        // Reflect returns the hit before armor, so armor raises what it adds.
        reach: (prestigeReachMultiplier(ranks, armorReduction) + cardBound.reflect * WORLD_REFLECT_SHARE * preArmorFactor(armorReduction))
          * bowSkillReachMultiplier(bowSkills, technique.stormWaves) * staffReach * cardBound.reach
          * swordSkillReachMultiplier(swordSkills, technique.whirlwindTicks, technique.cleave) * arrow.reach,
        // A bolt hits a little harder than an arrow, and casts come slower.
        weapon: loadout.weapon, boltDamage: staff ? STAFF_BOLT_DAMAGE_FACTOR : 1,
        cardDamage: cardBound.damage * arrow.damage,
        // Hunter's Mark, Hex and Volley hit harder; Momentum swings faster; Bloodlust heals each swing.
        techniqueDamage: technique.damage, attackSpeed: technique.attackSpeed, healPerSwing: technique.healPerSwing,
        deflectReturn: technique.deflectReturn,
        reflects: prestigePerkValue(ranks, "riposte") > 0 || cardBound.reflect > 0,
        // Prism: a reflected hit strikes up to four enemies near its attacker as well.
        reflectReach: cardBound.prism ? 1 + PRISM_MAX_TARGETS : 1,
        deflects: swordSkillChance(swordSkills, "deflect") > 0,
        // Second Wind cards add to the perk.
        secondWind: prestigePerkValue(ranks, "secondWind") + Math.max(0, cardValue(loadout.cardTotals, "secondWind")) / 100,
        cardTotals: loadout.cardTotals,
        // Swordplay's Guard and Mana Shield, like guard cards, let less of a hit through than Reflect answers.
        guardFactor: technique.guard / masteryDamageTaken(mastery),
        reflectOnly: Boolean(challenge?.active),
      } };
    }
    const report = () => (loaded ??= load());
    return {
      /** Preview this entry on top of previously accepted rewards. */
      preview(reward: EnemyStatReward) {
        const { saved, earned, gear, statsFor, armorFor, soul, minInterval } = report();
        if (!saved) return { dps: 0, attackInterval: 1 };
        const progress = withSoulStats(earned!.preview(reward), soul, minInterval);
        if (!gear) return { dps: 0, attackInterval: attackIntervalForProgress(progress), projectiles: 1 };
        const attackInterval = weaponAttackInterval(gear.weapon, attackIntervalForProgress(progress)) / gear.attackSpeed;
        const dps = gear.armed ? gear.loadout.damage(progress.damage) * gear.boltDamage * gear.critical(progress.critRating) * gear.swing
          * gear.cardDamage * gear.techniqueDamage * gear.projectiles / attackInterval : 0;
        // Reflect throws a hit back as it arrived before armor
        // (capped at max health outside Reflect Only). What got through can
        // never total more than the player's health, what regen restores and
        // what Second Wind heals on kills before they fall, and a hit before
        // armor is what got through times preArmorFactor: so that, scaled, is
        // the most Reflect can deal, whatever its bag drew.
        const stats = gear.reflects || gear.deflects ? statsFor!(progress) : null;
        // Guard cards let less of a hit through, so a reflected hit is that much bigger than what was lost.
        const reflect = stats ? { maxHp: stats.maxHp, regen: stats.regen, preArmor: armorFor(stats.armor).preArmor * cardGuardFactor(gear.cardTotals) * gear.guardFactor } : null;
        // Damage taken per second that Reflect can answer: regen, a health bar
        // per life (a life no shorter than REFLECT_ONLY_LIFE_SECONDS), and
        // Second Wind's heal at the most kills a second any map can respawn.
        // Bloodlust heals on every swing, at its fastest.
        const absorbed = reflect ? reflect.regen + reflect.maxHp / REFLECT_ONLY_LIFE_SECONDS + gear.secondWind * reflect.maxHp * SECOND_WIND_KILLS_PER_SECOND
          + (gear.armed ? gear.healPerSwing * reflect.maxHp / attackInterval : 0)
          + cardSustainBound(gear.cardTotals, reflect.maxHp, dps, 1 / REFLECT_ONLY_TICK_SECONDS, REFLECT_ONLY_LIFE_SECONDS) : 0;
        // The perk's chance is left out, so the bound only ever errs towards paying.
        // Deflect prevents the hit, so health lost cannot bound it. Each return is capped at max health,
        // and shares the player's .1s hurt window. Leave its chance out, as for Reflect's lucky streaks.
        const reflectDps = (reflect && gear.reflects ? WORLD_REFLECT_SHARE * reflect.preArmor * absorbed * gear.reflectReach : 0)
          + (stats && gear.deflects ? stats.maxHp * gear.deflectReturn / REFLECT_ONLY_TICK_SECONDS : 0);
        // Reflect Only: the weapon counts for nothing, and every kill has to come from hits taken.
        if (gear.reflectOnly) {
          return { attackInterval: REFLECT_ONLY_TICK_SECONDS, projectiles: 1, reach: 1, dps: reflectDps, reflectDps: 0, reflectTick: REFLECT_ONLY_TICK_SECONDS };
        }
        // Outside it, Reflect is its own damage on top of the weapon's: a hit
        // as big as max health is no share of a weak bow's kills.
        return { attackInterval, projectiles: gear.projectiles, reach: gear.reach, dps, reflectDps, reflectTick: REFLECT_ONLY_TICK_SECONDS };
      },
      commit: (reward: EnemyStatReward) => report().earned?.commit(reward),
      research: researchRow, bonuses, serverBoost,
      /** Luck as drops read it, for the report's card and gold rolls. */
      luck: () => (luck ??= luckInPlay(ctx, ctx.sender, bonuses().off)),
      /** Either challenge under way (prestige-challenge.ts challengeActive). */
      inChallenge: () => Boolean(bonuses().challenge?.active) || bonuses().aggro,
      /** The active cards the caller read for this report, if it passed them. */
      wornCards: () => worn,
      rewardedProgress: () => report().earned?.current(),
      /** The saved progress row as the report found it; nothing in validation writes it. */
      savedProgress: () => report().saved,
      /**
       * powerFieldsForProgress for the rewarded row, through the same powerStatsFrom with the rows this report
       * already read. Loot adds to the bag but equips nothing, so this is exact.
       */
      powerFields(progress: any) {
        const { saved, statsFor, soul, minInterval, research, ranks, cards, gear } = report();
        if (!saved || !statsFor || !gear) return { power: 0, powerLevel: 0 };
        if (!power) {
          // Research as it plays: the bound keeps the stored row, so its gear factors serve only while nothing is switched off.
          const inPlay = researchInPlayFor(research, bonuses().off);
          power = powerStatsFrom({ soul, cap: minInterval, research: inPlay, perks: ranks, cards, itemLevel: gear.loadout.levelFor,
            critRating: () => readCritRating(ctx, ctx.sender) }, inPlay === research ? statsFor : undefined);
        }
        return powerFieldsFromStats(power(progress));
      },
    };
  }

  return { combatBoundForReport };
}
