import { challengeMinimumInterval } from "../../shared/prestige-challenge";
// Boss combat bounds and rewards for the fifteen campaign bosses (dragon
// through Aegis Prime). Boss fights are personal and run on the client; the
// server bounds a kill claim with combatBoundForReport and pays a
// validated clear through the reward*Contributor handlers, which index.ts maps
// by boss kind in bossRewardHandlers. The shared-boss tables stay registered
// (boss-tables.ts) so the publish needs no data deletion; nothing here writes
// them. Helpers that still live in index.ts arrive through createBossCombat's
// deps so the module has no runtime imports from ./index.
import {
  AEGIS_PRIME_REWARD_ARMOR,
  AEGIS_PRIME_REWARD_DAMAGE,
  AEGIS_PRIME_REWARD_HEALTH,
  AEGIS_PRIME_REWARD_REGEN,
  BOSS_REWARD_CLAIM_BITS,
  DRAGON_REWARD_DAMAGE,
  DREADREAPER_REWARD_ARMOR,
  DREADREAPER_REWARD_DAMAGE,
  DREADREAPER_REWARD_HEALTH,
  DREADREAPER_REWARD_REGEN,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  GRAVEBLOOM_REWARD_ARMOR,
  GRAVEBLOOM_REWARD_DAMAGE,
  GRAVEBLOOM_REWARD_HEALTH,
  GRAVEBLOOM_REWARD_REGEN,
  IRONHORN_REWARD_ARMOR,
  IRONHORN_REWARD_DAMAGE,
  IRONHORN_REWARD_HEALTH,
  IRONHORN_REWARD_REGEN,
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MIREMAW_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  PRISMSHELL_REWARD_ARMOR,
  PRISMSHELL_REWARD_DAMAGE,
  PRISMSHELL_REWARD_HEALTH,
  PRISMSHELL_REWARD_REGEN,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_ARMOR,
  TEMPEST_KIRIN_REWARD_DAMAGE,
  TEMPEST_KIRIN_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_REGEN,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
  VOLTWARDEN_REWARD_ARMOR,
  VOLTWARDEN_REWARD_DAMAGE,
  VOLTWARDEN_REWARD_HEALTH,
  VOLTWARDEN_REWARD_REGEN,
} from "../../shared/rules";
import { upgradeSlotForItem } from "../../shared/slot-upgrades";
import { effectivePlayerPower, effectivePlayerPowerStats, legacyU32Power } from "../../shared/player-power";
import {
  equipmentDamage,
  FROST_ARMOR,
  FROST_BOW,
  itemDefinition,
  LAVA_BOSS_ITEM_DROP_DENOMINATOR,
  LAVA_BOW,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
} from "../../shared/items";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
import { statRewardMultiplier, prestigePerkRanks } from "./prestige";
import { WORLD_REFLECT_SHARE, preArmorFactor, prestigeCriticalDamageBonus, prestigePerkValue, prestigeReachMultiplier, prestigeSwingMultiplier } from "../../shared/prestige-perks";
import { armorDamageReduction } from "../../shared/combat";
import { pinnedBossReward } from "./map-balance";
import { bowSkillRollFor } from "./bow-skills";
import { isDropIgnored } from "./ignored-drops";
import { bowSkillBossDamageMultiplier, bowSkillReachMultiplier } from "../../shared/bow-skills";
import { updateSnapshotRow } from "./snapshot-row-writes";
import type { ModuleReducerCtx } from "./index";
import { readPlayerProgress } from "./wide-stats";

type GameReducerContext = ModuleReducerCtx;

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
export type BossCombatDeps = {
  playerWithMotion: (ctx: any, activePlayer: any) => any;
  syncPlayerMotionIdentity: (ctx: any, activePlayer: any) => void;
  powerFieldsForProgress: (ctx: any, progress: any) => { power: number; powerLevel: number };
  attackIntervalForProgress: (progress: any) => number;
  playerOwnsItem: (ctx: any, identity: any, itemId: string) => boolean;
  publishItemDrop: (ctx: any, identity: any, itemId: string, alreadyOwned: boolean) => void;
  restoreItemToProgress: (progress: any, itemId: string) => any;
  itemUpgradeLevelFor: (ctx: any, identity: any, itemId: unknown) => number;
  // The equipped* helpers take an already parsed inventory, so one parse serves all four.
  equippedRightHandForProgress: (progress: any, inventory?: string[]) => string;
  equippedLeftHandForProgress: (progress: any, inventory?: string[]) => string;
  equippedHeadForProgress: (progress: any, inventory?: string[]) => string;
  equippedChestForProgress: (progress: any, inventory?: string[]) => string;
  inventoryForProgress: (progress: any) => string[];
  /** Auto equip after a reward is written: see auto-equip.ts. `before` is the progress the reward started from. */
  equipNewUpgrades: (ctx: any, identity: any, before: any) => void;
};

/** The death screen's 3-second countdown and a second more: shorter than any real death and walk back. */
export const REFLECT_ONLY_LIFE_SECONDS = 4;
/** Reflect lands whenever a hit does, with no swing to round kills to; a short tick keeps the bound continuous. */
export const REFLECT_ONLY_TICK_SECONDS = .1;
/** More kills a second than any map respawns (about 3.3 on Endless): Second Wind heals once per kill. */
export const SECOND_WIND_KILLS_PER_SECOND = 4;

export function createBossCombat(deps: BossCombatDeps) {
  const {
    playerWithMotion, syncPlayerMotionIdentity, powerFieldsForProgress, attackIntervalForProgress,
    playerOwnsItem, publishItemDrop, restoreItemToProgress, itemUpgradeLevelFor, inventoryForProgress,
    equippedRightHandForProgress, equippedLeftHandForProgress, equippedHeadForProgress, equippedChestForProgress,
    equipNewUpgrades,
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
    return { weapon, levelFor,
      damage: (base: number) => equipmentDamage(base, weapon, head, chest, warcraft, weaponLevel, headLevel, chestLevel) };
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
      const loadout = saved ? damageLoadout(ctx, saved, research) : null;
      if (!saved || !loadout) return { saved, research, loadout, statMultiplier, gear: null };
      // Empty hands still earn through Reflect (an unarmed Reflect run): the
      // bound must not read no weapon as no combat, which paid them nothing.
      const armed = Boolean(loadout.weapon);
      // Every personal boss can receive criticals. Use the possible maximum so
      // legitimate lucky streaks do not cause first-clear rewards to be rejected.
      // Keen Edge grants crit on its own, so a player with no crit research can
      // still be critting; the bound has to know that or it clips them.
      const ranks = prestigePerkRanks(ctx, ctx.sender);
      const critical = (research?.criticalChance ?? 0) > 0 || prestigePerkValue(ranks, "keenEdge") > 0
        ? Math.max(1, 1.05 + (research?.criticalDamage ?? 0) * .05 + prestigeCriticalDamageBonus(ranks)) : 1;
      // Double Strike is more damage per swing; Split Shot and Riposte are more
      // enemies reached per swing. The first belongs in damage per second, the
      // second in how many kills per second that damage can finish. The bow's
      // skills are both. Every storm arrow, bounce and pierce can reach another
      // enemy, so they widen reach; the Split Shot arrow rolls the bow's skills
      // too, so the two reaches multiply. Against a lone boss only Arrow Storm
      // adds anything, as more damage, so it widens the boss bound alone.
      const bowSkills = bowSkillRollFor(ctx, ctx.sender, loadout.weapon);
      return { saved, research, loadout, statMultiplier, gear: {
        loadout, critical, swing: prestigeSwingMultiplier(ranks),
        // Projectile count is not a kill reward, so the saved row holds for the whole report.
        armed,
        projectiles: !armed || itemDefinition(loadout.weapon)?.weapon?.mode === "MELEE" ? 1 : Math.max(1, saved.projectileCount),
        // Reflect returns the hit before armor, so armor raises what it adds.
        reach: prestigeReachMultiplier(ranks, armorDamageReduction(effectivePlayerPowerStats(saved, research, loadout.levelFor).armor))
          * bowSkillReachMultiplier(bowSkills),
        bossDamage: bowSkillBossDamageMultiplier(bowSkills) * (1 + prestigePerkValue(ranks, "bossSlayer")),
        reflects: prestigePerkValue(ranks, "riposte") > 0,
        secondWind: prestigePerkValue(ranks, "secondWind"),
        reflectOnly: Boolean(ctx.db.playerPrestigeChallenge.identity.find(ctx.sender)?.active),
      } };
    }
    const report = () => (loaded ??= load());
    return {
      /** The bound with the given earned rewards applied, as the client had them by its last kill. */
      bound(earned: { type: string; amount: number; count: number }[]) {
        const { saved, statMultiplier, gear } = report();
        if (!saved) return { dps: 0, attackInterval: 1 };
        const progress = earned.length ? applyEnemyRewards(saved, earned, statMultiplier, challengeMinimumInterval(ctx.db.playerPrestigeChallenge.identity.find(ctx.sender))) : saved;
        const attackInterval = attackIntervalForProgress(progress);
        if (!gear) return { dps: 0, attackInterval, projectiles: 1 };
        const dps = gear.armed ? gear.loadout.damage(progress.damage) * gear.critical * gear.swing * gear.projectiles / attackInterval : 0;
        // Reflect throws a hit back, at bosses too, as it arrived before armor
        // (capped at max health outside Reflect Only). What got through can
        // never total more than the player's health, what regen restores and
        // what Second Wind heals on kills before they fall, and a hit before
        // armor is what got through times preArmorFactor: so that, scaled, is
        // the most Reflect can deal, whatever its bag drew.
        const stats = gear.reflects ? effectivePlayerPowerStats(progress, report().research, gear.loadout.levelFor) : null;
        const reflect = stats ? { maxHp: stats.maxHp, regen: stats.regen, preArmor: preArmorFactor(armorDamageReduction(stats.armor)) } : null;
        // Damage taken per second that Reflect can answer: regen, a health bar
        // per life (a life no shorter than REFLECT_ONLY_LIFE_SECONDS), and
        // Second Wind's heal at the most kills a second any map can respawn.
        const absorbed = reflect ? reflect.regen + reflect.maxHp / REFLECT_ONLY_LIFE_SECONDS + gear.secondWind * reflect.maxHp * SECOND_WIND_KILLS_PER_SECOND : 0;
        // The perk's chance is left out, so the bound only ever errs towards paying.
        const reflectDps = reflect ? WORLD_REFLECT_SHARE * reflect.preArmor * absorbed : 0;
        // Reflect Only: the weapon counts for nothing, and every kill has to come from hits taken.
        if (gear.reflectOnly) {
          return { attackInterval: REFLECT_ONLY_TICK_SECONDS, projectiles: 1, reach: 1, dps: reflectDps, bossDps: reflectDps, reflect: null, reflectDps: 0, reflectTick: REFLECT_ONLY_TICK_SECONDS };
        }
        // Outside it, Reflect is its own damage on top of the weapon's: a hit
        // as big as max health is no share of a weak bow's kills.
        return { attackInterval, projectiles: gear.projectiles, reach: gear.reach, dps, bossDps: dps * gear.bossDamage, reflect, reflectDps, reflectTick: REFLECT_ONLY_TICK_SECONDS };
      },
      /** statRewardMultiplier: research and prestige cannot change inside one report. */
      statMultiplier: () => report().statMultiplier,
      /** The saved progress row as the report found it; nothing in validation writes it. */
      savedProgress: () => report().saved,
      /**
       * powerFieldsForProgress for the rewarded row, from the research row and
       * slot levels this report already read. Loot adds to the bag but equips
       * nothing, and the levels are memoised by slot, so this is exact.
       */
      powerFields(progress: any) {
        const { research, loadout } = report();
        if (!loadout) return powerFieldsForProgress(ctx, progress);
        const powerLevel = effectivePlayerPower(progress, research, loadout.levelFor);
        return { power: legacyU32Power(powerLevel), powerLevel };
      },
    };
  }

  function applyBossRepeatableReward(
    progress: any,
    claimBit: number,
    rewardMultiplier: number,
    rewards: Partial<{ damage: number; maxHp: number; armor: number; regen: number }>,
  ) {
    const existingClaims = Number(progress.bossRewardClaims ?? 0) >>> 0;
    const next = {
      ...progress,
      // Retain the historical claim marker for save compatibility. It records
      // clear history but never suppresses or scales a reward.
      bossRewardClaims: (existingClaims | claimBit) >>> 0,
    };
    if (rewards.damage !== undefined) next.damage = progress.damage + rewards.damage * rewardMultiplier;
    if (rewards.maxHp !== undefined) next.maxHp = progress.maxHp + rewards.maxHp * rewardMultiplier;
    if (rewards.armor !== undefined) next.armor = progress.armor + rewards.armor * rewardMultiplier;
    if (rewards.regen !== undefined) next.regen = progress.regen + rewards.regen * rewardMultiplier;
    return next;
  }

  function rewardDragonContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.dragon, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "tutorial_forest", "damage", DRAGON_REWARD_DAMAGE),
    });
    const next = { ...reward, desertUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardSpiderContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.spider, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "beginner_desert", "damage", SPIDER_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "beginner_desert", "health", SPIDER_REWARD_HEALTH),
    });
    const next = { ...reward, snowlandsUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardFrostclawContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    // Each boss item owns an independent roll, even when the player already has
    // that item. Successful duplicates become an explicit "Already owned" event.
    const frostBowDropped = ctx.random.integerInRange(1, SNOW_BOSS_ITEM_DROP_DENOMINATOR) === 1;
    const frostArmorDropped = ctx.random.integerInRange(1, SNOW_BOSS_ARMOR_DROP_DENOMINATOR) === 1;
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.frostclaw, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "intermediate_snowlands", "damage", FROSTCLAW_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "intermediate_snowlands", "health", FROSTCLAW_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "intermediate_snowlands", "armor", FROSTCLAW_REWARD_ARMOR),
    });
    let next = { ...reward, lavaUnlocked: true };
    // The rolls above always happen; the loot filter only decides what is kept.
    if (frostBowDropped && !isDropIgnored(ctx, identity, FROST_BOW)) {
      const alreadyOwned = playerOwnsItem(ctx, identity, FROST_BOW);
      publishItemDrop(ctx, identity, FROST_BOW, alreadyOwned);
      if (!alreadyOwned) next = restoreItemToProgress(next, FROST_BOW);
    }
    if (frostArmorDropped && !isDropIgnored(ctx, identity, FROST_ARMOR)) {
      const alreadyOwned = playerOwnsItem(ctx, identity, FROST_ARMOR);
      publishItemDrop(ctx, identity, FROST_ARMOR, alreadyOwned);
      if (!alreadyOwned) next = restoreItemToProgress(next, FROST_ARMOR);
    }
    next.inventoryJson = JSON.stringify([...new Set(inventoryForProgress(next))]);
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardMagmaliskContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const lavaBowDropped = ctx.random.integerInRange(1, LAVA_BOSS_ITEM_DROP_DENOMINATOR) === 1;
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.magmalisk, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "advanced_lava_wastes", "damage", MAGMALISK_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "advanced_lava_wastes", "health", MAGMALISK_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "advanced_lava_wastes", "armor", MAGMALISK_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "advanced_lava_wastes", "regen", MAGMALISK_REWARD_REGEN),
    });
    let next = { ...reward, infernalUnlocked: true };
    if (lavaBowDropped && !isDropIgnored(ctx, identity, LAVA_BOW)) {
      const alreadyOwned = playerOwnsItem(ctx, identity, LAVA_BOW);
      publishItemDrop(ctx, identity, LAVA_BOW, alreadyOwned);
      if (!alreadyOwned) next = restoreItemToProgress(next, LAVA_BOW);
    }
    next.inventoryJson = JSON.stringify([...new Set(inventoryForProgress(next))]);
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardGloomrootContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.gloomroot, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "infernal_depths", "damage", GLOOMROOT_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "infernal_depths", "health", GLOOMROOT_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "infernal_depths", "armor", GLOOMROOT_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "infernal_depths", "regen", GLOOMROOT_REWARD_REGEN),
    });
    const next = { ...reward, waterUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardTidewyrmContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.tidewyrm, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "water_reach", "damage", TIDEWYRM_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "water_reach", "health", TIDEWYRM_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "water_reach", "armor", TIDEWYRM_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "water_reach", "regen", TIDEWYRM_REWARD_REGEN),
    });
    const next = { ...reward, samuraiUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardKoiShogunContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.koiShogun, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "samurai_garden", "damage", KOI_SHOGUN_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "samurai_garden", "health", KOI_SHOGUN_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "samurai_garden", "armor", KOI_SHOGUN_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "samurai_garden", "regen", KOI_SHOGUN_REWARD_REGEN),
    });
    const next = { ...reward, samuraiUnlocked: true, cloudspireUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardTempestKirinContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.tempestKirin, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "cloudspire", "damage", TEMPEST_KIRIN_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "cloudspire", "health", TEMPEST_KIRIN_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "cloudspire", "armor", TEMPEST_KIRIN_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "cloudspire", "regen", TEMPEST_KIRIN_REWARD_REGEN),
    });
    const next = { ...reward, cloudspireUnlocked: true, moonfenUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardMiremawContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.miremaw, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "moonfen", "damage", MIREMAW_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "moonfen", "health", MIREMAW_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "moonfen", "armor", MIREMAW_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "moonfen", "regen", MIREMAW_REWARD_REGEN),
    });
    const next = { ...reward, moonfenUnlocked: true, crystalHollowsUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardPrismshellContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.prismshell, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "crystal_hollows", "damage", PRISMSHELL_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "crystal_hollows", "health", PRISMSHELL_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "crystal_hollows", "armor", PRISMSHELL_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "crystal_hollows", "regen", PRISMSHELL_REWARD_REGEN),
    });
    const next = { ...reward, crystalHollowsUnlocked: true, clockworkRuinsUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardIronhornContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.ironhorn, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "clockwork_ruins", "damage", IRONHORN_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "clockwork_ruins", "health", IRONHORN_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "clockwork_ruins", "armor", IRONHORN_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "clockwork_ruins", "regen", IRONHORN_REWARD_REGEN),
    });
    const next = { ...reward, clockworkRuinsUnlocked: true, duskfallOrchardUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardDreadreaperContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.dreadreaper, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "duskfall_orchard", "damage", DREADREAPER_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "duskfall_orchard", "health", DREADREAPER_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "duskfall_orchard", "armor", DREADREAPER_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "duskfall_orchard", "regen", DREADREAPER_REWARD_REGEN),
    });
    const next = { ...reward, duskfallOrchardUnlocked: true, neonBastionUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardVoltwardenContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.voltwarden, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "neon_bastion", "damage", VOLTWARDEN_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "neon_bastion", "health", VOLTWARDEN_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "neon_bastion", "armor", VOLTWARDEN_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "neon_bastion", "regen", VOLTWARDEN_REWARD_REGEN),
    });
    const next = { ...reward, neonBastionUnlocked: true, verdantCatacombsUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardGravebloomContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.gravebloom, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "verdant_catacombs", "damage", GRAVEBLOOM_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "verdant_catacombs", "health", GRAVEBLOOM_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "verdant_catacombs", "armor", GRAVEBLOOM_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "verdant_catacombs", "regen", GRAVEBLOOM_REWARD_REGEN),
    });
    const next = { ...reward, verdantCatacombsUnlocked: true, ionCitadelUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  function rewardAegisPrimeContributor(ctx: any, identity: any) {
    const current = readPlayerProgress(ctx, identity);
    if (!current) return;
    const rewardMultiplier = statRewardMultiplier(ctx, identity);
    const reward = applyBossRepeatableReward(current, BOSS_REWARD_CLAIM_BITS.aegisPrime, rewardMultiplier, {
      damage: pinnedBossReward(ctx, identity, "ion_citadel", "damage", AEGIS_PRIME_REWARD_DAMAGE),
      maxHp: pinnedBossReward(ctx, identity, "ion_citadel", "health", AEGIS_PRIME_REWARD_HEALTH),
      armor: pinnedBossReward(ctx, identity, "ion_citadel", "armor", AEGIS_PRIME_REWARD_ARMOR),
      regen: pinnedBossReward(ctx, identity, "ion_citadel", "regen", AEGIS_PRIME_REWARD_REGEN),
    });
    const next = { ...reward, ionCitadelUnlocked: true };
    updateSnapshotRow(ctx, "playerProgress", next);
    const active = ctx.db.player.identity.find(identity);
    if (active) {
      const nextPlayer = {
        ...active,
        ...powerFieldsForProgress(ctx, next),
      };
      updateSnapshotRow(ctx, "player", nextPlayer);
      syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
    }
    equipNewUpgrades(ctx, identity, current);
  }

  return {
    combatBoundForReport, rewardDragonContributor, rewardSpiderContributor,
    rewardFrostclawContributor, rewardMagmaliskContributor, rewardGloomrootContributor,
    rewardTidewyrmContributor, rewardKoiShogunContributor, rewardTempestKirinContributor,
    rewardMiremawContributor, rewardPrismshellContributor, rewardIronhornContributor,
    rewardDreadreaperContributor, rewardVoltwardenContributor, rewardGravebloomContributor,
    rewardAegisPrimeContributor,
  };
}
