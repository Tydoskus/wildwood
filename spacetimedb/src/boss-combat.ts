// Regular-enemy report validation. Boss combat runs on the client and clears
// only unlock gates (boss-gates.ts); the retained IDs below serve old migrations.
import { challengeMinimumInterval } from "../../shared/prestige-challenge";
import { upgradeSlotForItem } from "../../shared/slot-upgrades";
import { preparePlayerPowerStats, playerPowerForStats, legacyU32Power } from "../../shared/player-power";
import { equipmentDamageMultiplierBonus, itemDefinition } from "../../shared/items";
import { createEnemyRewardAccumulator, type EnemyStatReward } from "../../shared/enemy-reward-accumulator";
import { statRewardMultiplier, prestigePerkRanks } from "./prestige";
import { WORLD_REFLECT_SHARE, preArmorFactor, prestigeCriticalDamageBonus, prestigePerkValue, prestigeReachMultiplier, prestigeSwingMultiplier } from "../../shared/prestige-perks";
import { armorDamageReduction } from "../../shared/combat";
import { soulStatsFor, withSoulStats } from "./soul-dimension";
import { bowSkillRollFor } from "./bow-skills";
import { bowSkillReachMultiplier } from "../../shared/bow-skills";
import type { ModuleReducerCtx as GameReducerContext } from "./index";
import { readPlayerProgress } from "./wide-stats";

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
  itemUpgradeLevelFor: (ctx: any, identity: any, itemId: unknown) => number;
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
  function damageLoadout(ctx: GameReducerContext, progress: any, research: any) {
    const inventory = inventoryForProgress(progress);
    const weapon = equippedRightHandForProgress(progress, inventory) || equippedLeftHandForProgress(progress, inventory);
    const head = equippedHeadForProgress(progress, inventory), chest = equippedChestForProgress(progress, inventory);
    const levels = new Map<string, number>();
    const levelFor = (itemId: unknown) => {
      const slot = upgradeSlotForItem(itemId);
      if (!slot) return 0;
      let level = levels.get(slot);
      if (level === undefined) levels.set(slot, level = itemUpgradeLevelFor(ctx, ctx.sender, itemId));
      return level;
    };
    const [weaponLevel, headLevel, chestLevel] = [levelFor(weapon), levelFor(head), levelFor(chest)];
    const warcraft = 1 + (research?.warcraft ?? 0) * .02;
    const equipment = 1 + equipmentDamageMultiplierBonus(weapon, head, chest, weaponLevel, headLevel, chestLevel);
    return { weapon, levelFor, damage: (base: number) => base * equipment * warcraft };
  }

  /**
   * The most combat this player could have brought to each entry of one kill
   * report. Every row it reads is fixed for the length of a report: validation
   * writes only budget rows and the stream cursor, and the rewards a report
   * earns move stats, never gear, unlocks, perks, research or the bow's roll.
   * So the rows are read and the inventory parsed once, on first use, and each
   * entry after that is arithmetic on the saved stats plus what it earned.
   * This used to be rebuilt from scratch per species (nine reads and four
   * inventory parses each, thirty-one times on an Endless report), which was
   * most of what the kill reducer cost.
   */
  function combatBoundForReport(ctx: GameReducerContext) {
    let loaded: ReturnType<typeof load> | undefined;
    function load() {
      const saved = readPlayerProgress(ctx, ctx.sender);
      const research = ctx.db.playerResearch.identity.find(ctx.sender);
      const statMultiplier = statRewardMultiplier(ctx, ctx.sender);
      // Soul stats add to the run's in every fight; the saved row and the earned rewards stay the run's alone.
      const soul = soulStatsFor(ctx, ctx.sender);
      const loadout = saved ? damageLoadout(ctx, saved, research) : null;
      const challenge = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
      const minInterval = challengeMinimumInterval(ctx.db.playerAggroChallenge.identity.find(ctx.sender)?.active ? null : challenge);
      const earned = saved ? createEnemyRewardAccumulator(saved, statMultiplier, minInterval) : null;
      const statsFor = saved ? preparePlayerPowerStats(saved, research, loadout?.levelFor) : null;
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
      if (!saved || !loadout || !statsFor) return { saved, earned, statsFor, armorFor, soul, gear: null };
      // Empty hands still earn through Reflect (an unarmed Reflect run): the
      // bound must not read no weapon as no combat, which paid them nothing.
      const armed = Boolean(loadout.weapon);
      // Use the possible maximum so legitimate lucky streaks are never clipped.
      // Keen Edge grants crit on its own, so a player with no crit research can
      // still be critting; the bound has to know that or it clips them.
      const ranks = prestigePerkRanks(ctx, ctx.sender);
      const critical = (research?.criticalChance ?? 0) > 0 || prestigePerkValue(ranks, "keenEdge") > 0
        ? Math.max(1, 1.05 + (research?.criticalDamage ?? 0) * .05 + prestigeCriticalDamageBonus(ranks) + (soul?.critDamage ?? 0)) : 1;
      // Double Strike is more damage per swing; Split Shot and Riposte are more
      // enemies reached per swing. The first belongs in damage per second, the
      // second in how many kills per second that damage can finish. The bow's
      // skills are both. Every storm arrow, bounce and pierce can reach another
      // enemy, so they widen reach; the Split Shot arrow rolls the bow's skills
      // too, so the two reaches multiply.
      const bowSkills = bowSkillRollFor(ctx, ctx.sender, loadout.weapon);
      return { saved, earned, statsFor, armorFor, soul, minInterval, gear: {
        loadout, critical, swing: prestigeSwingMultiplier(ranks),
        // Projectile count is not a kill reward, so the saved row holds for the whole report.
        armed,
        projectiles: !armed || itemDefinition(loadout.weapon)?.weapon?.mode === "MELEE" ? 1 : Math.max(1, saved.projectileCount),
        // Reflect returns the hit before armor, so armor raises what it adds.
        reach: prestigeReachMultiplier(ranks, armorFor(statsFor(withSoulStats(saved, soul, minInterval)).armor).reduction)
          * bowSkillReachMultiplier(bowSkills),
        reflects: prestigePerkValue(ranks, "riposte") > 0,
        secondWind: prestigePerkValue(ranks, "secondWind"),
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
        const attackInterval = attackIntervalForProgress(progress);
        if (!gear) return { dps: 0, attackInterval, projectiles: 1 };
        const dps = gear.armed ? gear.loadout.damage(progress.damage) * gear.critical * gear.swing * gear.projectiles / attackInterval : 0;
        // Reflect throws a hit back as it arrived before armor
        // (capped at max health outside Reflect Only). What got through can
        // never total more than the player's health, what regen restores and
        // what Second Wind heals on kills before they fall, and a hit before
        // armor is what got through times preArmorFactor: so that, scaled, is
        // the most Reflect can deal, whatever its bag drew.
        const stats = gear.reflects ? statsFor!(progress) : null;
        const reflect = stats ? { maxHp: stats.maxHp, regen: stats.regen, preArmor: armorFor(stats.armor).preArmor } : null;
        // Damage taken per second that Reflect can answer: regen, a health bar
        // per life (a life no shorter than REFLECT_ONLY_LIFE_SECONDS), and
        // Second Wind's heal at the most kills a second any map can respawn.
        const absorbed = reflect ? reflect.regen + reflect.maxHp / REFLECT_ONLY_LIFE_SECONDS + gear.secondWind * reflect.maxHp * SECOND_WIND_KILLS_PER_SECOND : 0;
        // The perk's chance is left out, so the bound only ever errs towards paying.
        const reflectDps = reflect ? WORLD_REFLECT_SHARE * reflect.preArmor * absorbed : 0;
        // Reflect Only: the weapon counts for nothing, and every kill has to come from hits taken.
        if (gear.reflectOnly) {
          return { attackInterval: REFLECT_ONLY_TICK_SECONDS, projectiles: 1, reach: 1, dps: reflectDps, reflectDps: 0, reflectTick: REFLECT_ONLY_TICK_SECONDS };
        }
        // Outside it, Reflect is its own damage on top of the weapon's: a hit
        // as big as max health is no share of a weak bow's kills.
        return { attackInterval, projectiles: gear.projectiles, reach: gear.reach, dps, reflectDps, reflectTick: REFLECT_ONLY_TICK_SECONDS };
      },
      commit: (reward: EnemyStatReward) => report().earned?.commit(reward),
      rewardedProgress: () => report().earned?.current(),
      /** The saved progress row as the report found it; nothing in validation writes it. */
      savedProgress: () => report().saved,
      /**
       * powerFieldsForProgress for the rewarded row, from the research row and
       * slot levels this report already read. Loot adds to the bag but equips
       * nothing, and the levels are memoised by slot, so this is exact.
       */
      powerFields(progress: any) {
        const { statsFor, soul, minInterval } = report();
        const powerLevel = statsFor ? playerPowerForStats(statsFor(withSoulStats(progress, soul, minInterval))) : 0;
        return { power: legacyU32Power(powerLevel), powerLevel };
      },
    };
  }

  return { combatBoundForReport };
}
