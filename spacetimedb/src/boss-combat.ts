// Boss combat bounds and rewards for the fifteen campaign bosses (dragon
// through Aegis Prime). Boss fights are personal and run on the client; the
// server bounds a kill claim with maximumBossCombatForProgress and pays a
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
import {
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
import { prestigeCriticalDamageBonus, prestigePerkValue, prestigeReachMultiplier, prestigeSwingMultiplier } from "../../shared/prestige-perks";
import { pinnedBossReward } from "./map-balance";
import { bowSkillRollFor } from "./bow-skills";
import { isDropIgnored } from "./ignored-drops";
import { bowSkillBossDamageMultiplier, bowSkillReachMultiplier } from "../../shared/bow-skills";
import { updateSnapshotRow } from "./snapshot-row-writes";
import type { ModuleReducerCtx } from "./index";

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
  researchedDamage: (ctx: any, identity: any, damage: number, knownProgress?: any, knownResearch?: any) => number;
  inventoryForProgress: (progress: any) => string[];
  equippedRightHandForProgress: (progress: any) => string;
  equippedLeftHandForProgress: (progress: any) => string;
  /** Auto equip after a reward is written: see auto-equip.ts. `before` is the progress the reward started from. */
  equipNewUpgrades: (ctx: any, identity: any, before: any) => void;
};

export function createBossCombat(deps: BossCombatDeps) {
  const {
    playerWithMotion, syncPlayerMotionIdentity, powerFieldsForProgress, attackIntervalForProgress,
    playerOwnsItem, publishItemDrop, restoreItemToProgress, researchedDamage, inventoryForProgress,
    equippedRightHandForProgress, equippedLeftHandForProgress, equipNewUpgrades,
  } = deps;

  function maximumBossCombatForProgress(ctx: GameReducerContext, earned: { type: string; amount: number; count: number }[]) {
    const saved = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!saved) return { dps: 0, attackInterval: 1 };
    const research = ctx.db.playerResearch.identity.find(ctx.sender);
    const progress = earned.length ? applyEnemyRewards(saved, earned, statRewardMultiplier(ctx, ctx.sender)) : saved;
    const weapon = equippedRightHandForProgress(progress) || equippedLeftHandForProgress(progress);
    const attackInterval = attackIntervalForProgress(progress);
    if (!weapon) return { dps: 0, attackInterval, projectiles: 1 };
    // Every personal boss can receive criticals. Use the possible maximum so
    // legitimate lucky streaks do not cause first-clear rewards to be rejected.
    // Keen Edge grants crit on its own, so a player with no crit research can
    // still be critting; the bound has to know that or it clips them.
    const ranks = prestigePerkRanks(ctx, ctx.sender);
    const critical = (research?.criticalChance ?? 0) > 0 || prestigePerkValue(ranks, "keenEdge") > 0
      ? Math.max(1, 1.05 + (research?.criticalDamage ?? 0) * .05 + prestigeCriticalDamageBonus(ranks)) : 1;
    const projectiles = itemDefinition(weapon)?.weapon?.mode === "MELEE" ? 1 : Math.max(1, progress.projectileCount);
    // Double Strike is more damage per swing; Split Shot and Riposte are more
    // enemies reached per swing. The first belongs in damage per second, the
    // second in how many kills per second that damage can finish. The bow's
    // skills are both. Every storm arrow, bounce and pierce can reach another
    // enemy, so they widen reach; the Split Shot arrow rolls the bow's skills
    // too, so the two reaches multiply. Against a lone boss only Arrow Storm
    // adds anything, as more damage, so it widens the boss bound alone.
    const bowSkills = bowSkillRollFor(ctx, ctx.sender, weapon);
    const dps = researchedDamage(ctx, ctx.sender, progress.damage, progress, research) * critical
      * prestigeSwingMultiplier(ranks) * projectiles / attackInterval;
    return { attackInterval, projectiles, reach: prestigeReachMultiplier(ranks) * bowSkillReachMultiplier(bowSkills),
      dps, bossDps: dps * bowSkillBossDamageMultiplier(bowSkills) };
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    const current = ctx.db.playerProgress.identity.find(identity);
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
    maximumBossCombatForProgress, rewardDragonContributor, rewardSpiderContributor,
    rewardFrostclawContributor, rewardMagmaliskContributor, rewardGloomrootContributor,
    rewardTidewyrmContributor, rewardKoiShogunContributor, rewardTempestKirinContributor,
    rewardMiremawContributor, rewardPrismshellContributor, rewardIronhornContributor,
    rewardDreadreaperContributor, rewardVoltwardenContributor, rewardGravebloomContributor,
    rewardAegisPrimeContributor,
  };
}
