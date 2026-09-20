// Shared-boss combat: the fifteen map bosses (dragon through Aegis Prime) and
// the helpers that spawn them, accept hits, hand out contributor rewards and
// finish or regenerate encounters. The damage*/respawn* reducer declarations,
// the boss tables and the schema registration stay in index.ts; this module
// only owns the bodies they call. Helpers that still live in index.ts arrive
// through createBossCombat's deps so the moved code reads exactly as it did.
import { ScheduleAt } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  AEGIS_PRIME_MAX_HP,
  AEGIS_PRIME_REWARD_ARMOR,
  AEGIS_PRIME_REWARD_DAMAGE,
  AEGIS_PRIME_REWARD_HEALTH,
  AEGIS_PRIME_REWARD_REGEN,
  BEGINNER_DESERT_MAP_ID,
  BOSS_REWARD_CLAIM_BITS,
  CLOCKWORK_RUINS_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID,
  DRAGON_MAX_HP,
  DRAGON_REWARD_DAMAGE,
  DREADREAPER_MAX_HP,
  DREADREAPER_REWARD_ARMOR,
  DREADREAPER_REWARD_DAMAGE,
  DREADREAPER_REWARD_HEALTH,
  DREADREAPER_REWARD_REGEN,
  DUSKFALL_ORCHARD_MAP_ID,
  FROSTCLAW_MAX_HP,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_MAX_HP,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  GRAVEBLOOM_MAX_HP,
  GRAVEBLOOM_REWARD_ARMOR,
  GRAVEBLOOM_REWARD_DAMAGE,
  GRAVEBLOOM_REWARD_HEALTH,
  GRAVEBLOOM_REWARD_REGEN,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  ION_CITADEL_MAP_ID,
  IRONHORN_MAX_HP,
  IRONHORN_REWARD_ARMOR,
  IRONHORN_REWARD_DAMAGE,
  IRONHORN_REWARD_HEALTH,
  IRONHORN_REWARD_REGEN,
  KOI_SHOGUN_MAX_HP,
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  MAGMALISK_MAX_HP,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MIREMAW_MAX_HP,
  MIREMAW_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  MOONFEN_MAP_ID,
  NEON_BASTION_MAP_ID,
  PLAYER_RADIUS,
  PRISMSHELL_MAX_HP,
  PRISMSHELL_REWARD_ARMOR,
  PRISMSHELL_REWARD_DAMAGE,
  PRISMSHELL_REWARD_HEALTH,
  PRISMSHELL_REWARD_REGEN,
  SAMURAI_GARDEN_MAP_ID,
  SPIDER_MAX_HP,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TEMPEST_KIRIN_MAX_HP,
  TEMPEST_KIRIN_REWARD_ARMOR,
  TEMPEST_KIRIN_REWARD_DAMAGE,
  TEMPEST_KIRIN_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_REGEN,
  TIDEWYRM_MAX_HP,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
  TUTORIAL_FOREST_MAP_ID,
  VERDANT_CATACOMBS_MAP_ID,
  VOLTWARDEN_MAX_HP,
  VOLTWARDEN_REWARD_ARMOR,
  VOLTWARDEN_REWARD_DAMAGE,
  VOLTWARDEN_REWARD_HEALTH,
  VOLTWARDEN_REWARD_REGEN,
  WATER_REACH_MAP_ID,
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
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../shared/map-editor-overrides";
import { PERSONAL_BOSS_COMBAT } from "../../shared/personal-bosses";
import { PLAYER_GENDER_UNSET } from "../../shared/player-gender";
import { applyEnemyRewards } from "../../shared/enemy-defeats";
import { isProceduralMap, proceduralMapCore } from "../../shared/procedural-maps";
import { statRewardMultiplier } from "./prestige";
import { pinnedBossReward } from "./map-balance";
import { isMapShard, queueShardReward } from "./map-sharding";
import { damageProceduralBoss, proceduralBossKey } from "./procedural-maps";
import { updateSnapshotRow } from "./shard-snapshot-writes";
import type { ModuleReducerCtx } from "./index";

type GameReducerContext = ModuleReducerCtx;

export const DRAGON_ID = 1;
export const DRAGON_RADIUS = 140;
export function editedBossPosition(mapId: string, fallback: { x: number; y: number }) {
  return MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.boss ?? fallback;
}

export const DRAGON_HIT_RANGE_TOLERANCE = 60;
export const DRAGON_RESPAWN_MICROS = 45_000_000n;
export const SPIDER_ID = 1;
export const SPIDER_RADIUS = 125;
export const SPIDER_POSITION = editedBossPosition(BEGINNER_DESERT_MAP_ID, { x: 4050, y: 4050 });
export const SPIDER_HIT_RANGE_TOLERANCE = 60;
export const SPIDER_RESPAWN_MICROS = 45_000_000n;
export const FROSTCLAW_ID = 1;
export const FROSTCLAW_RADIUS = 150;
export const FROSTCLAW_POSITION = editedBossPosition(INTERMEDIATE_SNOWLANDS_MAP_ID, { x: 4050, y: 4050 });
export const FROSTCLAW_HIT_RANGE_TOLERANCE = 60;
export const FROSTCLAW_RESPAWN_MICROS = 45_000_000n;
export const MAGMALISK_ID = 1;
export const MAGMALISK_RADIUS = 165;
export const MAGMALISK_POSITION = editedBossPosition(ADVANCED_LAVA_WASTES_MAP_ID, { x: 4050, y: 4050 });
export const MAGMALISK_HIT_RANGE_TOLERANCE = 60;
export const MAGMALISK_RESPAWN_MICROS = 45_000_000n;
export const GLOOMROOT_ID = 1;
export const GLOOMROOT_RADIUS = 175;
export const GLOOMROOT_POSITION = editedBossPosition(INFERNAL_DEPTHS_MAP_ID, { x: 4050, y: 4050 });
export const GLOOMROOT_HIT_RANGE_TOLERANCE = 60;
export const GLOOMROOT_RESPAWN_MICROS = 45_000_000n;
export const TIDEWYRM_ID = 1;
export const TIDEWYRM_RADIUS = 175;
export const TIDEWYRM_POSITION = editedBossPosition(WATER_REACH_MAP_ID, { x: 4050, y: 4050 });
export const TIDEWYRM_HIT_RANGE_TOLERANCE = 60;
export const TIDEWYRM_RESPAWN_MICROS = 45_000_000n;
export const KOI_SHOGUN_ID = 1;
export const KOI_SHOGUN_RADIUS = 175;
export const KOI_SHOGUN_POSITION = editedBossPosition(SAMURAI_GARDEN_MAP_ID, { x: 4050, y: 4050 });
export const KOI_SHOGUN_HIT_RANGE_TOLERANCE = 60;
export const KOI_SHOGUN_RESPAWN_MICROS = 45_000_000n;
export const TEMPEST_KIRIN_ID = 1;
export const TEMPEST_KIRIN_RADIUS = 180;
export const TEMPEST_KIRIN_POSITION = editedBossPosition(CLOUDSPIRE_MAP_ID, { x: 4050, y: 4050 });
export const TEMPEST_KIRIN_HIT_RANGE_TOLERANCE = 60;
export const TEMPEST_KIRIN_RESPAWN_MICROS = 45_000_000n;
export const MIREMAW_ID = 1;
export const PRISMSHELL_ID = 1;
export const IRONHORN_ID = 1;
export const DREADREAPER_ID = 1;
export const VOLTWARDEN_ID = 1;
export const GRAVEBLOOM_ID = 1;
export const AEGIS_PRIME_ID = 1;
export const MIREMAW_RADIUS = 170;
export const PRISMSHELL_RADIUS = 170;
export const IRONHORN_RADIUS = 170;
export const DREADREAPER_RADIUS = 170;
export const VOLTWARDEN_RADIUS = 170;
export const GRAVEBLOOM_RADIUS = 170;
export const AEGIS_PRIME_RADIUS = 170;
export const MIREMAW_POSITION = editedBossPosition(MOONFEN_MAP_ID, { x: 4050, y: 4050 });
export const PRISMSHELL_POSITION = editedBossPosition(CRYSTAL_HOLLOWS_MAP_ID, { x: 4050, y: 4050 });
export const IRONHORN_POSITION = editedBossPosition(CLOCKWORK_RUINS_MAP_ID, { x: 4050, y: 4050 });
export const DREADREAPER_POSITION = editedBossPosition(DUSKFALL_ORCHARD_MAP_ID, { x: 4050, y: 4050 });
export const VOLTWARDEN_POSITION = editedBossPosition(NEON_BASTION_MAP_ID, { x: 4050, y: 4050 });
export const GRAVEBLOOM_POSITION = editedBossPosition(VERDANT_CATACOMBS_MAP_ID, { x: 4050, y: 4050 });
export const AEGIS_PRIME_POSITION = editedBossPosition(ION_CITADEL_MAP_ID, { x: 4050, y: 4050 });
export const MIREMAW_HIT_RANGE_TOLERANCE = 60;
export const PRISMSHELL_HIT_RANGE_TOLERANCE = 60;
export const IRONHORN_HIT_RANGE_TOLERANCE = 60;
export const DREADREAPER_HIT_RANGE_TOLERANCE = 60;
export const VOLTWARDEN_HIT_RANGE_TOLERANCE = 60;
export const GRAVEBLOOM_HIT_RANGE_TOLERANCE = 60;
export const AEGIS_PRIME_HIT_RANGE_TOLERANCE = 60;
export const MIREMAW_RESPAWN_MICROS = 45_000_000n;
export const PRISMSHELL_RESPAWN_MICROS = 45_000_000n;
export const IRONHORN_RESPAWN_MICROS = 45_000_000n;
export const DREADREAPER_RESPAWN_MICROS = 45_000_000n;
export const VOLTWARDEN_RESPAWN_MICROS = 45_000_000n;
export const GRAVEBLOOM_RESPAWN_MICROS = 45_000_000n;
export const AEGIS_PRIME_RESPAWN_MICROS = 45_000_000n;
export const BOSS_REGEN_DELAY_MICROS = 180_000_000n;
export const BOSS_REGEN_FRACTION_PER_MAINTENANCE = .05;

// Everything the moved bodies still borrow from index.ts. Passing these in keeps
// the module free of runtime imports from ./index.
export type BossCombatDeps = {
  WORLD: { width: number; height: number };
  requireControllingPlayer: (ctx: any) => any;
  requireMapWorkload: (ctx: any) => void;
  activeDuelFor: (ctx: any, identity: any) => any;
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
  writeProgressAndPresentation: (ctx: any, progress: any) => void;
};

export function createBossCombat(deps: BossCombatDeps) {
  const {
    WORLD, requireControllingPlayer, requireMapWorkload, activeDuelFor, playerWithMotion,
    syncPlayerMotionIdentity, powerFieldsForProgress, attackIntervalForProgress, playerOwnsItem,
    publishItemDrop, restoreItemToProgress, researchedDamage, inventoryForProgress,
    equippedRightHandForProgress, equippedLeftHandForProgress, writeProgressAndPresentation,
  } = deps;

  const DRAGON_POSITION = editedBossPosition(TUTORIAL_FOREST_MAP_ID, { x: WORLD.width - 760, y: WORLD.height - 560 });

  function bossDamageWithCriticals(ctx: any, progress: any, hits: number, hp: number, mapId: string, position: { x: number; y: number }) {
    const research = ctx.db.playerResearch.identity.find(ctx.sender);
    const chance = Math.max(0, Math.min(100, research?.criticalChance ?? 0));
    const multiplier = 1.05 + Math.max(0, research?.criticalDamage ?? 0) * .05;
    const baseDamage = Math.max(1, researchedDamage(ctx, ctx.sender, progress.damage, progress, research));
    let total = chance === 0 ? baseDamage * hits : 0, critical = false;
    for (let hit = 0; chance > 0 && hit < hits; hit++) {
      const crit = chance > 0 && ctx.random.integerInRange(1, 100) <= chance;
      total += baseDamage * (crit ? multiplier : 1);
      critical ||= crit;
    }
    const damage = Math.min(hp, total);
    ctx.db.bossHitResult.insert({ identity: ctx.sender, mapId, ...position, damage, critical });
    return damage;
  }

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
    const critical = (research?.criticalChance ?? 0) > 0
      ? Math.max(1, 1.05 + (research?.criticalDamage ?? 0) * .05) : 1;
    const projectiles = itemDefinition(weapon)?.weapon?.mode === "MELEE" ? 1 : Math.max(1, progress.projectileCount);
    return { attackInterval, projectiles, dps: researchedDamage(ctx, ctx.sender, progress.damage, progress, research) * critical * projectiles / attackInterval };
  }

  function bossRowAtMaxHealth(existing: any, maxHp: number) {
    const tolerance = Math.max(1, maxHp * 1e-6);
    if (Math.abs(existing.maxHp - maxHp) <= tolerance && existing.hp <= maxHp + tolerance) return existing;
    const healthFraction = existing.maxHp > 0 ? Math.max(0, Math.min(1, existing.hp / existing.maxHp)) : 0;
    return { ...existing, hp: maxHp * healthFraction, maxHp };
  }

  function ensureDragonBoss(ctx: any) {
    const existing = ctx.db.dragonBoss.id.find(DRAGON_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, DRAGON_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.dragonBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.dragonBoss.insert({
      id: DRAGON_ID,
      encounter: 1n,
      hp: DRAGON_MAX_HP,
      maxHp: DRAGON_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureSpiderBoss(ctx: any) {
    const existing = ctx.db.spiderBoss.id.find(SPIDER_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, SPIDER_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.spiderBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.spiderBoss.insert({
      id: SPIDER_ID,
      encounter: 1n,
      hp: SPIDER_MAX_HP,
      maxHp: SPIDER_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureFrostclawBoss(ctx: any) {
    const existing = ctx.db.frostclawBoss.id.find(FROSTCLAW_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, FROSTCLAW_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.frostclawBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.frostclawBoss.insert({
      id: FROSTCLAW_ID,
      encounter: 1n,
      hp: FROSTCLAW_MAX_HP,
      maxHp: FROSTCLAW_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureMagmaliskBoss(ctx: any) {
    const existing = ctx.db.magmaliskBoss.id.find(MAGMALISK_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, MAGMALISK_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.magmaliskBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.magmaliskBoss.insert({
      id: MAGMALISK_ID,
      encounter: 1n,
      hp: MAGMALISK_MAX_HP,
      maxHp: MAGMALISK_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureGloomrootBoss(ctx: any) {
    const existing = ctx.db.gloomrootBoss.id.find(GLOOMROOT_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, GLOOMROOT_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.gloomrootBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.gloomrootBoss.insert({
      id: GLOOMROOT_ID,
      encounter: 1n,
      hp: GLOOMROOT_MAX_HP,
      maxHp: GLOOMROOT_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureTidewyrmBoss(ctx: any) {
    const existing = ctx.db.tidewyrmBoss.id.find(TIDEWYRM_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, TIDEWYRM_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.tidewyrmBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.tidewyrmBoss.insert({
      id: TIDEWYRM_ID,
      encounter: 1n,
      hp: TIDEWYRM_MAX_HP,
      maxHp: TIDEWYRM_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureKoiShogunBoss(ctx: any) {
    const existing = ctx.db.koiShogunBoss.id.find(KOI_SHOGUN_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, KOI_SHOGUN_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.koiShogunBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.koiShogunBoss.insert({
      id: KOI_SHOGUN_ID,
      encounter: 1n,
      hp: KOI_SHOGUN_MAX_HP,
      maxHp: KOI_SHOGUN_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureTempestKirinBoss(ctx: any) {
    const existing = ctx.db.tempestKirinBoss.id.find(TEMPEST_KIRIN_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, TEMPEST_KIRIN_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.tempestKirinBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.tempestKirinBoss.insert({
      id: TEMPEST_KIRIN_ID,
      encounter: 1n,
      hp: TEMPEST_KIRIN_MAX_HP,
      maxHp: TEMPEST_KIRIN_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }

  function ensureMiremawBoss(ctx: any) {
    const existing = ctx.db.miremawBoss.id.find(MIREMAW_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, MIREMAW_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.miremawBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.miremawBoss.insert({
      id: MIREMAW_ID,
      encounter: 1n,
      hp: MIREMAW_MAX_HP,
      maxHp: MIREMAW_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }
  function ensurePrismshellBoss(ctx: any) {
    const existing = ctx.db.prismshellBoss.id.find(PRISMSHELL_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, PRISMSHELL_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.prismshellBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.prismshellBoss.insert({
      id: PRISMSHELL_ID,
      encounter: 1n,
      hp: PRISMSHELL_MAX_HP,
      maxHp: PRISMSHELL_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }
  function ensureIronhornBoss(ctx: any) {
    const existing = ctx.db.ironhornBoss.id.find(IRONHORN_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, IRONHORN_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.ironhornBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.ironhornBoss.insert({
      id: IRONHORN_ID,
      encounter: 1n,
      hp: IRONHORN_MAX_HP,
      maxHp: IRONHORN_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }
  function ensureDreadreaperBoss(ctx: any) {
    const existing = ctx.db.dreadreaperBoss.id.find(DREADREAPER_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, DREADREAPER_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.dreadreaperBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.dreadreaperBoss.insert({
      id: DREADREAPER_ID,
      encounter: 1n,
      hp: DREADREAPER_MAX_HP,
      maxHp: DREADREAPER_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }
  function ensureVoltwardenBoss(ctx: any) {
    const existing = ctx.db.voltwardenBoss.id.find(VOLTWARDEN_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, VOLTWARDEN_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.voltwardenBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.voltwardenBoss.insert({
      id: VOLTWARDEN_ID,
      encounter: 1n,
      hp: VOLTWARDEN_MAX_HP,
      maxHp: VOLTWARDEN_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }
  function ensureGravebloomBoss(ctx: any) {
    const existing = ctx.db.gravebloomBoss.id.find(GRAVEBLOOM_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, GRAVEBLOOM_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.gravebloomBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.gravebloomBoss.insert({
      id: GRAVEBLOOM_ID,
      encounter: 1n,
      hp: GRAVEBLOOM_MAX_HP,
      maxHp: GRAVEBLOOM_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }
  function ensureAegisPrimeBoss(ctx: any) {
    const existing = ctx.db.aegisPrimeBoss.id.find(AEGIS_PRIME_ID);
    if (existing) {
      const balanced = bossRowAtMaxHealth(existing, AEGIS_PRIME_MAX_HP);
      if (balanced === existing) return existing;
      ctx.db.aegisPrimeBoss.id.update(balanced);
      return balanced;
    }
    return ctx.db.aegisPrimeBoss.insert({
      id: AEGIS_PRIME_ID,
      encounter: 1n,
      hp: AEGIS_PRIME_MAX_HP,
      maxHp: AEGIS_PRIME_MAX_HP,
      alive: true,
      respawnAtMicros: 0n,
      lastDamageAtMicros: 0n,
    });
  }


  function regenerateIdleBosses(ctx: any, mapId?: string) {
    if (PERSONAL_BOSS_COMBAT) return;
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const regenerate = (current: any, update: (next: any) => void) => {
      if (!current.alive || current.hp <= 0 || current.hp >= current.maxHp) return;
      if (current.lastDamageAtMicros === 0n) {
        update({ ...current, lastDamageAtMicros: now });
        return;
      }
      if (now - current.lastDamageAtMicros < BOSS_REGEN_DELAY_MICROS) return;
      update({
        ...current,
        hp: Math.min(current.maxHp, current.hp + current.maxHp * BOSS_REGEN_FRACTION_PER_MAINTENANCE),
      });
    };
    if (mapId === undefined || mapId === TUTORIAL_FOREST_MAP_ID) regenerate(ensureDragonBoss(ctx), (next) => ctx.db.dragonBoss.id.update(next));
    if (mapId === undefined || mapId === BEGINNER_DESERT_MAP_ID) regenerate(ensureSpiderBoss(ctx), (next) => ctx.db.spiderBoss.id.update(next));
    if (mapId === undefined || mapId === INTERMEDIATE_SNOWLANDS_MAP_ID) regenerate(ensureFrostclawBoss(ctx), (next) => ctx.db.frostclawBoss.id.update(next));
    if (mapId === undefined || mapId === ADVANCED_LAVA_WASTES_MAP_ID) regenerate(ensureMagmaliskBoss(ctx), (next) => ctx.db.magmaliskBoss.id.update(next));
    if (mapId === undefined || mapId === INFERNAL_DEPTHS_MAP_ID) regenerate(ensureGloomrootBoss(ctx), (next) => ctx.db.gloomrootBoss.id.update(next));
    if (mapId === undefined || mapId === WATER_REACH_MAP_ID) regenerate(ensureTidewyrmBoss(ctx), (next) => ctx.db.tidewyrmBoss.id.update(next));
    if (mapId === undefined || mapId === SAMURAI_GARDEN_MAP_ID) regenerate(ensureKoiShogunBoss(ctx), (next) => ctx.db.koiShogunBoss.id.update(next));
    if (mapId === undefined || mapId === CLOUDSPIRE_MAP_ID) regenerate(ensureTempestKirinBoss(ctx), (next) => ctx.db.tempestKirinBoss.id.update(next));
    if (mapId === undefined || mapId === MOONFEN_MAP_ID) regenerate(ensureMiremawBoss(ctx), (next) => ctx.db.miremawBoss.id.update(next));
    if (mapId === undefined || mapId === CRYSTAL_HOLLOWS_MAP_ID) regenerate(ensurePrismshellBoss(ctx), (next) => ctx.db.prismshellBoss.id.update(next));
    if (mapId === undefined || mapId === CLOCKWORK_RUINS_MAP_ID) regenerate(ensureIronhornBoss(ctx), (next) => ctx.db.ironhornBoss.id.update(next));
    if (mapId === undefined || mapId === NEON_BASTION_MAP_ID) regenerate(ensureVoltwardenBoss(ctx), (next) => ctx.db.voltwardenBoss.id.update(next));
    if (mapId === undefined || mapId === VERDANT_CATACOMBS_MAP_ID) regenerate(ensureGravebloomBoss(ctx), (next) => ctx.db.gravebloomBoss.id.update(next));
    if (mapId === undefined || mapId === ION_CITADEL_MAP_ID) regenerate(ensureAegisPrimeBoss(ctx), (next) => ctx.db.aegisPrimeBoss.id.update(next));
    if (mapId === undefined || mapId === DUSKFALL_ORCHARD_MAP_ID) regenerate(ensureDreadreaperBoss(ctx), (next) => ctx.db.dreadreaperBoss.id.update(next));
  }

  function clearSpiderCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.spiderContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.spiderAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.spiderContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.spiderAttackWindow.identity.delete(identity);
  }

  function rewardSpiderContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "spider")) return;
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
  }

  function finishSpiderEncounter(ctx: any, spider: any) {
    const contributions = [...ctx.db.spiderContribution.iter()]
      .filter((row: any) => row.encounter === spider.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: SPIDER_ID,
      encounter: spider.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.spiderResult.id.find(SPIDER_ID)) ctx.db.spiderResult.id.update(result);
    else ctx.db.spiderResult.insert(result);

    for (const row of contributions) rewardSpiderContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + SPIDER_RESPAWN_MICROS;
    ctx.db.spiderBoss.id.update({ ...spider, hp: 0, alive: false, respawnAtMicros });
    ctx.db.spiderRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: spider.encounter,
    });
  }

  function clearFrostclawCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.frostclawContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.frostclawAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.frostclawContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.frostclawAttackWindow.identity.delete(identity);
  }

  function rewardFrostclawContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "frostclaw")) return;
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
    if (frostBowDropped) {
      const alreadyOwned = playerOwnsItem(ctx, identity, FROST_BOW);
      publishItemDrop(ctx, identity, FROST_BOW, alreadyOwned);
      if (!alreadyOwned) next = restoreItemToProgress(next, FROST_BOW);
    }
    if (frostArmorDropped) {
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
  }

  function finishFrostclawEncounter(ctx: any, frostclaw: any) {
    const contributions = [...ctx.db.frostclawContribution.iter()]
      .filter((row: any) => row.encounter === frostclaw.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: FROSTCLAW_ID,
      encounter: frostclaw.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.frostclawResult.id.find(FROSTCLAW_ID)) ctx.db.frostclawResult.id.update(result);
    else ctx.db.frostclawResult.insert(result);

    for (const row of contributions) rewardFrostclawContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + FROSTCLAW_RESPAWN_MICROS;
    ctx.db.frostclawBoss.id.update({ ...frostclaw, hp: 0, alive: false, respawnAtMicros });
    ctx.db.frostclawRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: frostclaw.encounter,
    });
  }

  function clearMagmaliskCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.magmaliskContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.magmaliskAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.magmaliskContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.magmaliskAttackWindow.identity.delete(identity);
  }

  function rewardMagmaliskContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "magmalisk")) return;
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
    if (lavaBowDropped) {
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
  }

  function finishMagmaliskEncounter(ctx: any, magmalisk: any) {
    const contributions = [...ctx.db.magmaliskContribution.iter()]
      .filter((row: any) => row.encounter === magmalisk.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: MAGMALISK_ID,
      encounter: magmalisk.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.magmaliskResult.id.find(MAGMALISK_ID)) ctx.db.magmaliskResult.id.update(result);
    else ctx.db.magmaliskResult.insert(result);

    for (const row of contributions) rewardMagmaliskContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + MAGMALISK_RESPAWN_MICROS;
    ctx.db.magmaliskBoss.id.update({ ...magmalisk, hp: 0, alive: false, respawnAtMicros });
    ctx.db.magmaliskRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: magmalisk.encounter,
    });
  }

  function clearGloomrootCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.gloomrootContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.gloomrootAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.gloomrootContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.gloomrootAttackWindow.identity.delete(identity);
  }

  function rewardGloomrootContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "gloomroot")) return;
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
  }

  function finishGloomrootEncounter(ctx: any, gloomroot: any) {
    const contributions = [...ctx.db.gloomrootContribution.iter()]
      .filter((row: any) => row.encounter === gloomroot.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: GLOOMROOT_ID,
      encounter: gloomroot.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.gloomrootResult.id.find(GLOOMROOT_ID)) ctx.db.gloomrootResult.id.update(result);
    else ctx.db.gloomrootResult.insert(result);

    for (const row of contributions) rewardGloomrootContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + GLOOMROOT_RESPAWN_MICROS;
    ctx.db.gloomrootBoss.id.update({ ...gloomroot, hp: 0, alive: false, respawnAtMicros });
    ctx.db.gloomrootRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: gloomroot.encounter,
    });
  }

  function clearTidewyrmCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.tidewyrmContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.tidewyrmAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.tidewyrmContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.tidewyrmAttackWindow.identity.delete(identity);
  }

  function clearKoiShogunCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.koiShogunContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.koiShogunAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.koiShogunContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.koiShogunAttackWindow.identity.delete(identity);
  }

  function clearTempestKirinCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.tempestKirinContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.tempestKirinAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.tempestKirinContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.tempestKirinAttackWindow.identity.delete(identity);
  }

  function clearMiremawCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.miremawContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.miremawAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.miremawContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.miremawAttackWindow.identity.delete(identity);
  }
  function clearPrismshellCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.prismshellContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.prismshellAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.prismshellContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.prismshellAttackWindow.identity.delete(identity);
  }
  function clearIronhornCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.ironhornContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.ironhornAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.ironhornContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.ironhornAttackWindow.identity.delete(identity);
  }
  function clearDreadreaperCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.dreadreaperContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.dreadreaperAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.dreadreaperContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.dreadreaperAttackWindow.identity.delete(identity);
  }
  function clearVoltwardenCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.voltwardenContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.voltwardenAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.voltwardenContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.voltwardenAttackWindow.identity.delete(identity);
  }
  function clearGravebloomCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.gravebloomContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.gravebloomAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.gravebloomContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.gravebloomAttackWindow.identity.delete(identity);
  }
  function clearAegisPrimeCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.aegisPrimeContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.aegisPrimeAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.aegisPrimeContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.aegisPrimeAttackWindow.identity.delete(identity);
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


  function rewardTidewyrmContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "tidewyrm")) return;
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
  }

  function rewardKoiShogunContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "koiShogun")) return;
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
  }

  function rewardTempestKirinContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "tempestKirin")) return;
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
  }

  function rewardMiremawContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "miremaw")) return;
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
  }
  function rewardPrismshellContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "prismshell")) return;
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
  }
  function rewardIronhornContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "ironhorn")) return;
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
  }
  function rewardDreadreaperContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "dreadreaper")) return;
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
  }
  function rewardVoltwardenContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "voltwarden")) return;
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
  }
  function rewardGravebloomContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "gravebloom")) return;
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
  }
  function rewardAegisPrimeContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "aegisPrime")) return;
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
  }


  function finishTidewyrmEncounter(ctx: any, tidewyrm: any) {
    const contributions = [...ctx.db.tidewyrmContribution.iter()]
      .filter((row: any) => row.encounter === tidewyrm.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: TIDEWYRM_ID,
      encounter: tidewyrm.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.tidewyrmResult.id.find(TIDEWYRM_ID)) ctx.db.tidewyrmResult.id.update(result);
    else ctx.db.tidewyrmResult.insert(result);

    for (const row of contributions) rewardTidewyrmContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + TIDEWYRM_RESPAWN_MICROS;
    ctx.db.tidewyrmBoss.id.update({ ...tidewyrm, hp: 0, alive: false, respawnAtMicros });
    ctx.db.tidewyrmRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: tidewyrm.encounter,
    });
  }

  function finishKoiShogunEncounter(ctx: any, koiShogun: any) {
    const contributions = [...ctx.db.koiShogunContribution.iter()]
      .filter((row: any) => row.encounter === koiShogun.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: KOI_SHOGUN_ID,
      encounter: koiShogun.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.koiShogunResult.id.find(KOI_SHOGUN_ID)) ctx.db.koiShogunResult.id.update(result);
    else ctx.db.koiShogunResult.insert(result);

    for (const row of contributions) rewardKoiShogunContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + KOI_SHOGUN_RESPAWN_MICROS;
    ctx.db.koiShogunBoss.id.update({ ...koiShogun, hp: 0, alive: false, respawnAtMicros });
    ctx.db.koiShogunRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: koiShogun.encounter,
    });
  }

  function finishTempestKirinEncounter(ctx: any, tempestKirin: any) {
    const contributions = [...ctx.db.tempestKirinContribution.iter()]
      .filter((row: any) => row.encounter === tempestKirin.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: TEMPEST_KIRIN_ID,
      encounter: tempestKirin.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.tempestKirinResult.id.find(TEMPEST_KIRIN_ID)) ctx.db.tempestKirinResult.id.update(result);
    else ctx.db.tempestKirinResult.insert(result);

    for (const row of contributions) rewardTempestKirinContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + TEMPEST_KIRIN_RESPAWN_MICROS;
    ctx.db.tempestKirinBoss.id.update({ ...tempestKirin, hp: 0, alive: false, respawnAtMicros });
    ctx.db.tempestKirinRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: tempestKirin.encounter,
    });
  }

  function finishMiremawEncounter(ctx: any, miremaw: any) {
    const contributions = [...ctx.db.miremawContribution.iter()]
      .filter((row: any) => row.encounter === miremaw.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: MIREMAW_ID,
      encounter: miremaw.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.miremawResult.id.find(MIREMAW_ID)) ctx.db.miremawResult.id.update(result);
    else ctx.db.miremawResult.insert(result);

    for (const row of contributions) rewardMiremawContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + MIREMAW_RESPAWN_MICROS;
    ctx.db.miremawBoss.id.update({ ...miremaw, hp: 0, alive: false, respawnAtMicros });
    ctx.db.miremawRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: miremaw.encounter,
    });
  }
  function finishPrismshellEncounter(ctx: any, prismshell: any) {
    const contributions = [...ctx.db.prismshellContribution.iter()]
      .filter((row: any) => row.encounter === prismshell.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: PRISMSHELL_ID,
      encounter: prismshell.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.prismshellResult.id.find(PRISMSHELL_ID)) ctx.db.prismshellResult.id.update(result);
    else ctx.db.prismshellResult.insert(result);

    for (const row of contributions) rewardPrismshellContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + PRISMSHELL_RESPAWN_MICROS;
    ctx.db.prismshellBoss.id.update({ ...prismshell, hp: 0, alive: false, respawnAtMicros });
    ctx.db.prismshellRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: prismshell.encounter,
    });
  }
  function finishIronhornEncounter(ctx: any, ironhorn: any) {
    const contributions = [...ctx.db.ironhornContribution.iter()]
      .filter((row: any) => row.encounter === ironhorn.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: IRONHORN_ID,
      encounter: ironhorn.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.ironhornResult.id.find(IRONHORN_ID)) ctx.db.ironhornResult.id.update(result);
    else ctx.db.ironhornResult.insert(result);

    for (const row of contributions) rewardIronhornContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + IRONHORN_RESPAWN_MICROS;
    ctx.db.ironhornBoss.id.update({ ...ironhorn, hp: 0, alive: false, respawnAtMicros });
    ctx.db.ironhornRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: ironhorn.encounter,
    });
  }
  function finishDreadreaperEncounter(ctx: any, dreadreaper: any) {
    const contributions = [...ctx.db.dreadreaperContribution.iter()]
      .filter((row: any) => row.encounter === dreadreaper.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: DREADREAPER_ID,
      encounter: dreadreaper.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.dreadreaperResult.id.find(DREADREAPER_ID)) ctx.db.dreadreaperResult.id.update(result);
    else ctx.db.dreadreaperResult.insert(result);

    for (const row of contributions) rewardDreadreaperContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + DREADREAPER_RESPAWN_MICROS;
    ctx.db.dreadreaperBoss.id.update({ ...dreadreaper, hp: 0, alive: false, respawnAtMicros });
    ctx.db.dreadreaperRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: dreadreaper.encounter,
    });
  }
  function finishVoltwardenEncounter(ctx: any, voltwarden: any) {
    const contributions = [...ctx.db.voltwardenContribution.iter()]
      .filter((row: any) => row.encounter === voltwarden.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: VOLTWARDEN_ID,
      encounter: voltwarden.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.voltwardenResult.id.find(VOLTWARDEN_ID)) ctx.db.voltwardenResult.id.update(result);
    else ctx.db.voltwardenResult.insert(result);

    for (const row of contributions) rewardVoltwardenContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + VOLTWARDEN_RESPAWN_MICROS;
    ctx.db.voltwardenBoss.id.update({ ...voltwarden, hp: 0, alive: false, respawnAtMicros });
    ctx.db.voltwardenRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: voltwarden.encounter,
    });
  }
  function finishGravebloomEncounter(ctx: any, gravebloom: any) {
    const contributions = [...ctx.db.gravebloomContribution.iter()]
      .filter((row: any) => row.encounter === gravebloom.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: GRAVEBLOOM_ID,
      encounter: gravebloom.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.gravebloomResult.id.find(GRAVEBLOOM_ID)) ctx.db.gravebloomResult.id.update(result);
    else ctx.db.gravebloomResult.insert(result);

    for (const row of contributions) rewardGravebloomContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + GRAVEBLOOM_RESPAWN_MICROS;
    ctx.db.gravebloomBoss.id.update({ ...gravebloom, hp: 0, alive: false, respawnAtMicros });
    ctx.db.gravebloomRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: gravebloom.encounter,
    });
  }
  function finishAegisPrimeEncounter(ctx: any, aegisPrime: any) {
    const contributions = [...ctx.db.aegisPrimeContribution.iter()]
      .filter((row: any) => row.encounter === aegisPrime.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: AEGIS_PRIME_ID,
      encounter: aegisPrime.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.aegisPrimeResult.id.find(AEGIS_PRIME_ID)) ctx.db.aegisPrimeResult.id.update(result);
    else ctx.db.aegisPrimeResult.insert(result);

    for (const row of contributions) rewardAegisPrimeContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + AEGIS_PRIME_RESPAWN_MICROS;
    ctx.db.aegisPrimeBoss.id.update({ ...aegisPrime, hp: 0, alive: false, respawnAtMicros });
    ctx.db.aegisPrimeRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: aegisPrime.encounter,
    });
  }


  function clearDragonCombatRows(ctx: any) {
    const contributionIdentities = [...ctx.db.dragonContribution.iter()].map((row: any) => row.identity);
    const attackIdentities = [...ctx.db.dragonAttackWindow.iter()].map((row: any) => row.identity);
    for (const identity of contributionIdentities) ctx.db.dragonContribution.identity.delete(identity);
    for (const identity of attackIdentities) ctx.db.dragonAttackWindow.identity.delete(identity);
  }

  function rewardDragonContributor(ctx: any, identity: any) {
    if (queueShardReward(ctx, identity, "dragon")) return;
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
  }

  function finishDragonEncounter(ctx: any, dragon: any) {
    const contributions = [...ctx.db.dragonContribution.iter()]
      .filter((row: any) => row.encounter === dragon.encounter && row.damage > 0)
      .sort((a: any, b: any) => b.damage - a.damage);
    const totalDamage = contributions.reduce((sum: number, row: any) => sum + row.damage, 0);
    const contributorsJson = JSON.stringify(contributions.map((row: any) => ({
      identity: row.identity.toHexString(),
      name: row.displayName,
      gender: ctx.db.playerProfile.identity.find(row.identity)?.gender ?? PLAYER_GENDER_UNSET,
      damage: row.damage,
      percentage: totalDamage > 0 ? row.damage / totalDamage * 100 : 0,
    })));

    const result = {
      id: DRAGON_ID,
      encounter: dragon.encounter,
      totalDamage,
      contributorsJson,
      createdAt: ctx.timestamp,
    };
    if (ctx.db.dragonResult.id.find(DRAGON_ID)) ctx.db.dragonResult.id.update(result);
    else ctx.db.dragonResult.insert(result);

    for (const row of contributions) rewardDragonContributor(ctx, row.identity);

    const respawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + DRAGON_RESPAWN_MICROS;
    ctx.db.dragonBoss.id.update({
      ...dragon,
      hp: 0,
      alive: false,
      respawnAtMicros,
    });
    ctx.db.dragonRespawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(respawnAtMicros),
      encounter: dragon.encounter,
    });
  }

  function applyDragonDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== TUTORIAL_FOREST_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const dragon = ensureDragonBoss(ctx);
    if (!dragon.alive || dragon.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - DRAGON_POSITION.x, actionY - DRAGON_POSITION.y);
    if (centerDistance - DRAGON_RADIUS > progress.attackRange + DRAGON_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.dragonAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== dragon.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: dragon.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.dragonAttackWindow.identity.update(nextWindow);
      else ctx.db.dragonAttackWindow.insert(nextWindow);
    } else {
      ctx.db.dragonAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, dragon.hp, TUTORIAL_FOREST_MAP_ID, DRAGON_POSITION);
    const currentContribution = ctx.db.dragonContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === dragon.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: dragon.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.dragonContribution.identity.update(nextContribution);
    else ctx.db.dragonContribution.insert(nextContribution);
    const nextDragon = {
      ...dragon,
      hp: Math.max(0, dragon.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextDragon.hp <= 0) finishDragonEncounter(ctx, nextDragon);
    else ctx.db.dragonBoss.id.update(nextDragon);
  }

  function applySpiderDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== BEGINNER_DESERT_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const spider = ensureSpiderBoss(ctx);
    if (!spider.alive || spider.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - SPIDER_POSITION.x, actionY - SPIDER_POSITION.y);
    if (centerDistance - SPIDER_RADIUS > progress.attackRange + SPIDER_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.spiderAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== spider.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: spider.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.spiderAttackWindow.identity.update(nextWindow);
      else ctx.db.spiderAttackWindow.insert(nextWindow);
    } else {
      ctx.db.spiderAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, spider.hp, BEGINNER_DESERT_MAP_ID, SPIDER_POSITION);
    const currentContribution = ctx.db.spiderContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === spider.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: spider.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.spiderContribution.identity.update(nextContribution);
    else ctx.db.spiderContribution.insert(nextContribution);
    const nextSpider = {
      ...spider,
      hp: Math.max(0, spider.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextSpider.hp <= 0) finishSpiderEncounter(ctx, nextSpider);
    else ctx.db.spiderBoss.id.update(nextSpider);
  }

  function applyFrostclawDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== INTERMEDIATE_SNOWLANDS_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const frostclaw = ensureFrostclawBoss(ctx);
    if (!frostclaw.alive || frostclaw.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - FROSTCLAW_POSITION.x, actionY - FROSTCLAW_POSITION.y);
    if (centerDistance - FROSTCLAW_RADIUS > progress.attackRange + FROSTCLAW_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.frostclawAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== frostclaw.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: frostclaw.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.frostclawAttackWindow.identity.update(nextWindow);
      else ctx.db.frostclawAttackWindow.insert(nextWindow);
    } else {
      ctx.db.frostclawAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, frostclaw.hp, INTERMEDIATE_SNOWLANDS_MAP_ID, FROSTCLAW_POSITION);
    const currentContribution = ctx.db.frostclawContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === frostclaw.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: frostclaw.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.frostclawContribution.identity.update(nextContribution);
    else ctx.db.frostclawContribution.insert(nextContribution);
    const nextFrostclaw = {
      ...frostclaw,
      hp: Math.max(0, frostclaw.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextFrostclaw.hp <= 0) finishFrostclawEncounter(ctx, nextFrostclaw);
    else ctx.db.frostclawBoss.id.update(nextFrostclaw);
  }

  function applyMagmaliskDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== ADVANCED_LAVA_WASTES_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const magmalisk = ensureMagmaliskBoss(ctx);
    if (!magmalisk.alive || magmalisk.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - MAGMALISK_POSITION.x, actionY - MAGMALISK_POSITION.y);
    if (centerDistance - MAGMALISK_RADIUS > progress.attackRange + MAGMALISK_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.magmaliskAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== magmalisk.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: magmalisk.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.magmaliskAttackWindow.identity.update(nextWindow);
      else ctx.db.magmaliskAttackWindow.insert(nextWindow);
    } else {
      ctx.db.magmaliskAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, magmalisk.hp, ADVANCED_LAVA_WASTES_MAP_ID, MAGMALISK_POSITION);
    const currentContribution = ctx.db.magmaliskContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === magmalisk.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: magmalisk.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.magmaliskContribution.identity.update(nextContribution);
    else ctx.db.magmaliskContribution.insert(nextContribution);
    const nextMagmalisk = {
      ...magmalisk,
      hp: Math.max(0, magmalisk.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextMagmalisk.hp <= 0) finishMagmaliskEncounter(ctx, nextMagmalisk);
    else ctx.db.magmaliskBoss.id.update(nextMagmalisk);
  }

  function applyGloomrootDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== INFERNAL_DEPTHS_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const gloomroot = ensureGloomrootBoss(ctx);
    if (!gloomroot.alive || gloomroot.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - GLOOMROOT_POSITION.x, actionY - GLOOMROOT_POSITION.y);
    if (centerDistance - GLOOMROOT_RADIUS > progress.attackRange + GLOOMROOT_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.gloomrootAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== gloomroot.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: gloomroot.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.gloomrootAttackWindow.identity.update(nextWindow);
      else ctx.db.gloomrootAttackWindow.insert(nextWindow);
    } else {
      ctx.db.gloomrootAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, gloomroot.hp, INFERNAL_DEPTHS_MAP_ID, GLOOMROOT_POSITION);
    const currentContribution = ctx.db.gloomrootContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === gloomroot.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: gloomroot.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.gloomrootContribution.identity.update(nextContribution);
    else ctx.db.gloomrootContribution.insert(nextContribution);
    const nextGloomroot = {
      ...gloomroot,
      hp: Math.max(0, gloomroot.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextGloomroot.hp <= 0) finishGloomrootEncounter(ctx, nextGloomroot);
    else ctx.db.gloomrootBoss.id.update(nextGloomroot);
  }

  function applyTidewyrmDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== WATER_REACH_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const tidewyrm = ensureTidewyrmBoss(ctx);
    if (!tidewyrm.alive || tidewyrm.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - TIDEWYRM_POSITION.x, actionY - TIDEWYRM_POSITION.y);
    if (centerDistance - TIDEWYRM_RADIUS > progress.attackRange + TIDEWYRM_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.tidewyrmAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== tidewyrm.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: tidewyrm.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.tidewyrmAttackWindow.identity.update(nextWindow);
      else ctx.db.tidewyrmAttackWindow.insert(nextWindow);
    } else {
      ctx.db.tidewyrmAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, tidewyrm.hp, WATER_REACH_MAP_ID, TIDEWYRM_POSITION);
    const currentContribution = ctx.db.tidewyrmContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === tidewyrm.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: tidewyrm.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.tidewyrmContribution.identity.update(nextContribution);
    else ctx.db.tidewyrmContribution.insert(nextContribution);
    const nextTidewyrm = {
      ...tidewyrm,
      hp: Math.max(0, tidewyrm.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextTidewyrm.hp <= 0) finishTidewyrmEncounter(ctx, nextTidewyrm);
    else ctx.db.tidewyrmBoss.id.update(nextTidewyrm);
  }

  function applyKoiShogunDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== SAMURAI_GARDEN_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const koiShogun = ensureKoiShogunBoss(ctx);
    if (!koiShogun.alive || koiShogun.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - KOI_SHOGUN_POSITION.x, actionY - KOI_SHOGUN_POSITION.y);
    if (centerDistance - KOI_SHOGUN_RADIUS > progress.attackRange + KOI_SHOGUN_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.koiShogunAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== koiShogun.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: koiShogun.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.koiShogunAttackWindow.identity.update(nextWindow);
      else ctx.db.koiShogunAttackWindow.insert(nextWindow);
    } else {
      ctx.db.koiShogunAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, koiShogun.hp, SAMURAI_GARDEN_MAP_ID, KOI_SHOGUN_POSITION);
    const currentContribution = ctx.db.koiShogunContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === koiShogun.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: koiShogun.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.koiShogunContribution.identity.update(nextContribution);
    else ctx.db.koiShogunContribution.insert(nextContribution);
    const nextKoiShogun = {
      ...koiShogun,
      hp: Math.max(0, koiShogun.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextKoiShogun.hp <= 0) finishKoiShogunEncounter(ctx, nextKoiShogun);
    else ctx.db.koiShogunBoss.id.update(nextKoiShogun);
  }

  function applyTempestKirinDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== CLOUDSPIRE_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const tempestKirin = ensureTempestKirinBoss(ctx);
    if (!tempestKirin.alive || tempestKirin.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - TEMPEST_KIRIN_POSITION.x, actionY - TEMPEST_KIRIN_POSITION.y);
    if (centerDistance - TEMPEST_KIRIN_RADIUS > progress.attackRange + TEMPEST_KIRIN_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.tempestKirinAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== tempestKirin.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: tempestKirin.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.tempestKirinAttackWindow.identity.update(nextWindow);
      else ctx.db.tempestKirinAttackWindow.insert(nextWindow);
    } else {
      ctx.db.tempestKirinAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, tempestKirin.hp, CLOUDSPIRE_MAP_ID, TEMPEST_KIRIN_POSITION);
    const currentContribution = ctx.db.tempestKirinContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === tempestKirin.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: tempestKirin.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.tempestKirinContribution.identity.update(nextContribution);
    else ctx.db.tempestKirinContribution.insert(nextContribution);
    const nextTempestKirin = {
      ...tempestKirin,
      hp: Math.max(0, tempestKirin.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextTempestKirin.hp <= 0) finishTempestKirinEncounter(ctx, nextTempestKirin);
    else ctx.db.tempestKirinBoss.id.update(nextTempestKirin);
  }

  function applyMiremawDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== MOONFEN_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const miremaw = ensureMiremawBoss(ctx);
    if (!miremaw.alive || miremaw.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - MIREMAW_POSITION.x, actionY - MIREMAW_POSITION.y);
    if (centerDistance - MIREMAW_RADIUS > progress.attackRange + MIREMAW_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.miremawAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== miremaw.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: miremaw.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.miremawAttackWindow.identity.update(nextWindow);
      else ctx.db.miremawAttackWindow.insert(nextWindow);
    } else {
      ctx.db.miremawAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, miremaw.hp, MOONFEN_MAP_ID, MIREMAW_POSITION);
    const currentContribution = ctx.db.miremawContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === miremaw.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: miremaw.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.miremawContribution.identity.update(nextContribution);
    else ctx.db.miremawContribution.insert(nextContribution);
    const nextMiremaw = {
      ...miremaw,
      hp: Math.max(0, miremaw.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextMiremaw.hp <= 0) finishMiremawEncounter(ctx, nextMiremaw);
    else ctx.db.miremawBoss.id.update(nextMiremaw);
  }
  function applyPrismshellDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== CRYSTAL_HOLLOWS_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const prismshell = ensurePrismshellBoss(ctx);
    if (!prismshell.alive || prismshell.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - PRISMSHELL_POSITION.x, actionY - PRISMSHELL_POSITION.y);
    if (centerDistance - PRISMSHELL_RADIUS > progress.attackRange + PRISMSHELL_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.prismshellAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== prismshell.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: prismshell.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.prismshellAttackWindow.identity.update(nextWindow);
      else ctx.db.prismshellAttackWindow.insert(nextWindow);
    } else {
      ctx.db.prismshellAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, prismshell.hp, CRYSTAL_HOLLOWS_MAP_ID, PRISMSHELL_POSITION);
    const currentContribution = ctx.db.prismshellContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === prismshell.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: prismshell.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.prismshellContribution.identity.update(nextContribution);
    else ctx.db.prismshellContribution.insert(nextContribution);
    const nextPrismshell = {
      ...prismshell,
      hp: Math.max(0, prismshell.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextPrismshell.hp <= 0) finishPrismshellEncounter(ctx, nextPrismshell);
    else ctx.db.prismshellBoss.id.update(nextPrismshell);
  }
  function applyIronhornDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== CLOCKWORK_RUINS_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const ironhorn = ensureIronhornBoss(ctx);
    if (!ironhorn.alive || ironhorn.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - IRONHORN_POSITION.x, actionY - IRONHORN_POSITION.y);
    if (centerDistance - IRONHORN_RADIUS > progress.attackRange + IRONHORN_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.ironhornAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== ironhorn.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: ironhorn.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.ironhornAttackWindow.identity.update(nextWindow);
      else ctx.db.ironhornAttackWindow.insert(nextWindow);
    } else {
      ctx.db.ironhornAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, ironhorn.hp, CLOCKWORK_RUINS_MAP_ID, IRONHORN_POSITION);
    const currentContribution = ctx.db.ironhornContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === ironhorn.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: ironhorn.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.ironhornContribution.identity.update(nextContribution);
    else ctx.db.ironhornContribution.insert(nextContribution);
    const nextIronhorn = {
      ...ironhorn,
      hp: Math.max(0, ironhorn.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextIronhorn.hp <= 0) finishIronhornEncounter(ctx, nextIronhorn);
    else ctx.db.ironhornBoss.id.update(nextIronhorn);
  }
  function applyDreadreaperDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== DUSKFALL_ORCHARD_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const dreadreaper = ensureDreadreaperBoss(ctx);
    if (!dreadreaper.alive || dreadreaper.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - DREADREAPER_POSITION.x, actionY - DREADREAPER_POSITION.y);
    if (centerDistance - DREADREAPER_RADIUS > progress.attackRange + DREADREAPER_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.dreadreaperAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== dreadreaper.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: dreadreaper.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.dreadreaperAttackWindow.identity.update(nextWindow);
      else ctx.db.dreadreaperAttackWindow.insert(nextWindow);
    } else {
      ctx.db.dreadreaperAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, dreadreaper.hp, DUSKFALL_ORCHARD_MAP_ID, DREADREAPER_POSITION);
    const currentContribution = ctx.db.dreadreaperContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === dreadreaper.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: dreadreaper.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.dreadreaperContribution.identity.update(nextContribution);
    else ctx.db.dreadreaperContribution.insert(nextContribution);
    const nextDreadreaper = {
      ...dreadreaper,
      hp: Math.max(0, dreadreaper.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextDreadreaper.hp <= 0) finishDreadreaperEncounter(ctx, nextDreadreaper);
    else ctx.db.dreadreaperBoss.id.update(nextDreadreaper);
  }
  function applyVoltwardenDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== NEON_BASTION_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const voltwarden = ensureVoltwardenBoss(ctx);
    if (!voltwarden.alive || voltwarden.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - VOLTWARDEN_POSITION.x, actionY - VOLTWARDEN_POSITION.y);
    if (centerDistance - VOLTWARDEN_RADIUS > progress.attackRange + VOLTWARDEN_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.voltwardenAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== voltwarden.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: voltwarden.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.voltwardenAttackWindow.identity.update(nextWindow);
      else ctx.db.voltwardenAttackWindow.insert(nextWindow);
    } else {
      ctx.db.voltwardenAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, voltwarden.hp, NEON_BASTION_MAP_ID, VOLTWARDEN_POSITION);
    const currentContribution = ctx.db.voltwardenContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === voltwarden.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: voltwarden.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.voltwardenContribution.identity.update(nextContribution);
    else ctx.db.voltwardenContribution.insert(nextContribution);
    const nextVoltwarden = {
      ...voltwarden,
      hp: Math.max(0, voltwarden.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextVoltwarden.hp <= 0) finishVoltwardenEncounter(ctx, nextVoltwarden);
    else ctx.db.voltwardenBoss.id.update(nextVoltwarden);
  }
  function applyGravebloomDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== VERDANT_CATACOMBS_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const gravebloom = ensureGravebloomBoss(ctx);
    if (!gravebloom.alive || gravebloom.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - GRAVEBLOOM_POSITION.x, actionY - GRAVEBLOOM_POSITION.y);
    if (centerDistance - GRAVEBLOOM_RADIUS > progress.attackRange + GRAVEBLOOM_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.gravebloomAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== gravebloom.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: gravebloom.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.gravebloomAttackWindow.identity.update(nextWindow);
      else ctx.db.gravebloomAttackWindow.insert(nextWindow);
    } else {
      ctx.db.gravebloomAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, gravebloom.hp, VERDANT_CATACOMBS_MAP_ID, GRAVEBLOOM_POSITION);
    const currentContribution = ctx.db.gravebloomContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === gravebloom.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: gravebloom.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.gravebloomContribution.identity.update(nextContribution);
    else ctx.db.gravebloomContribution.insert(nextContribution);
    const nextGravebloom = {
      ...gravebloom,
      hp: Math.max(0, gravebloom.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextGravebloom.hp <= 0) finishGravebloomEncounter(ctx, nextGravebloom);
    else ctx.db.gravebloomBoss.id.update(nextGravebloom);
  }
  function applyAegisPrimeDamage(ctx: any, requestedHits: number, clientPosition?: { x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    requireMapWorkload(ctx);
    if (isMapShard(ctx) && ctx.db.shardAdmission.identity.find(ctx.sender)?.inDuel) return;
    const activePlayer = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    if (activePlayer.mapId !== ION_CITADEL_MAP_ID) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) return;
    const aegisPrime = ensureAegisPrimeBoss(ctx);
    if (!aegisPrime.alive || aegisPrime.hp <= 0) return;

    if (clientPosition && ![clientPosition.x, clientPosition.y].every(Number.isFinite)) {
      throw new SenderError("Boss attack position must be finite");
    }
    const actionX = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, clientPosition.x)) : activePlayer.x;
    const actionY = clientPosition ? Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, clientPosition.y)) : activePlayer.y;
    const centerDistance = Math.hypot(actionX - AEGIS_PRIME_POSITION.x, actionY - AEGIS_PRIME_POSITION.y);
    if (centerDistance - AEGIS_PRIME_RADIUS > progress.attackRange + AEGIS_PRIME_HIT_RANGE_TOLERANCE) return;

    const boundedHits = Math.max(1, Math.min(20, Math.floor(requestedHits)));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const intervalMicros = BigInt(Math.max(1, Math.round(attackIntervalForProgress(progress) * 1_000_000)));
    const currentWindow = ctx.db.aegisPrimeAttackWindow.identity.find(ctx.sender);
    const newWindow =
      !currentWindow ||
      currentWindow.encounter !== aegisPrime.encounter ||
      now - currentWindow.startedAtMicros >= intervalMicros;
    const remainingHits = newWindow
      ? progress.projectileCount
      : Math.max(0, progress.projectileCount - currentWindow.hits);
    const acceptedHits = Math.min(boundedHits, remainingHits);
    if (acceptedHits <= 0) return;

    if (newWindow) {
      const nextWindow = {
        identity: ctx.sender,
        encounter: aegisPrime.encounter,
        startedAtMicros: now,
        hits: acceptedHits,
      };
      if (currentWindow) ctx.db.aegisPrimeAttackWindow.identity.update(nextWindow);
      else ctx.db.aegisPrimeAttackWindow.insert(nextWindow);
    } else {
      ctx.db.aegisPrimeAttackWindow.identity.update({ ...currentWindow, hits: currentWindow.hits + acceptedHits });
    }

    const damage = bossDamageWithCriticals(ctx, progress, acceptedHits, aegisPrime.hp, ION_CITADEL_MAP_ID, AEGIS_PRIME_POSITION);
    const currentContribution = ctx.db.aegisPrimeContribution.identity.find(ctx.sender);
    const continuingContribution = currentContribution?.encounter === aegisPrime.encounter;
    const displayName = continuingContribution
      ? currentContribution.displayName
      : ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "PLAYER";
    const nextContribution = {
      identity: ctx.sender,
      encounter: aegisPrime.encounter,
      displayName,
      damage: continuingContribution ? currentContribution.damage + damage : damage,
    };
    if (currentContribution) ctx.db.aegisPrimeContribution.identity.update(nextContribution);
    else ctx.db.aegisPrimeContribution.insert(nextContribution);
    const nextAegisPrime = {
      ...aegisPrime,
      hp: Math.max(0, aegisPrime.hp - damage),
      lastDamageAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (nextAegisPrime.hp <= 0) finishAegisPrimeEncounter(ctx, nextAegisPrime);
    else ctx.db.aegisPrimeBoss.id.update(nextAegisPrime);
  }

  function applyProceduralBossHit(ctx: GameReducerContext, action: { mapId: string; bossKey: string; encounter: bigint; hits: number; x: number; y: number }) {
    if (PERSONAL_BOSS_COMBAT) throw new SenderError("WildStat updated. Refresh to continue.");
    const player = requireControllingPlayer(ctx);
    if (activeDuelFor(ctx, ctx.sender)) return;
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress || !isProceduralMap(player.mapId) || action.mapId !== player.mapId) return;
    if (proceduralBossKey(ctx, player.mapId) !== action.bossKey) return;
    damageProceduralBoss(ctx, { ...action, mapId:player.mapId, attackRange:progress.attackRange,
      attackInterval:attackIntervalForProgress(progress), projectiles:progress.projectileCount,
      damage:(hits,hp) => bossDamageWithCriticals(ctx, progress, hits, hp, player.mapId, proceduralMapCore(player.mapId).boss),
      reward:(identity,rewards) => {
        const earned = ctx.db.playerProgress.identity.find(identity);
        if (earned) writeProgressAndPresentation(ctx, applyEnemyRewards(earned, rewards.map(reward => ({ ...reward, count: 1 })), statRewardMultiplier(ctx, identity)));
      },
    });
  }

  return {
    bossDamageWithCriticals, maximumBossCombatForProgress, bossRowAtMaxHealth, ensureDragonBoss,
    ensureSpiderBoss, ensureFrostclawBoss, ensureMagmaliskBoss, ensureGloomrootBoss,
    ensureTidewyrmBoss, ensureKoiShogunBoss, ensureTempestKirinBoss, ensureMiremawBoss,
    ensurePrismshellBoss, ensureIronhornBoss, ensureDreadreaperBoss, ensureVoltwardenBoss,
    ensureGravebloomBoss, ensureAegisPrimeBoss, regenerateIdleBosses, clearSpiderCombatRows,
    rewardSpiderContributor, finishSpiderEncounter, clearFrostclawCombatRows,
    rewardFrostclawContributor, finishFrostclawEncounter, clearMagmaliskCombatRows,
    rewardMagmaliskContributor, finishMagmaliskEncounter, clearGloomrootCombatRows,
    rewardGloomrootContributor, finishGloomrootEncounter, clearTidewyrmCombatRows,
    clearKoiShogunCombatRows, clearTempestKirinCombatRows, clearMiremawCombatRows,
    clearPrismshellCombatRows, clearIronhornCombatRows, clearDreadreaperCombatRows,
    clearVoltwardenCombatRows, clearGravebloomCombatRows, clearAegisPrimeCombatRows,
    applyBossRepeatableReward, rewardTidewyrmContributor, rewardKoiShogunContributor,
    rewardTempestKirinContributor, rewardMiremawContributor, rewardPrismshellContributor,
    rewardIronhornContributor, rewardDreadreaperContributor, rewardVoltwardenContributor,
    rewardGravebloomContributor, rewardAegisPrimeContributor, finishTidewyrmEncounter,
    finishKoiShogunEncounter, finishTempestKirinEncounter, finishMiremawEncounter,
    finishPrismshellEncounter, finishIronhornEncounter, finishDreadreaperEncounter,
    finishVoltwardenEncounter, finishGravebloomEncounter, finishAegisPrimeEncounter,
    clearDragonCombatRows, rewardDragonContributor, finishDragonEncounter, applyDragonDamage,
    applySpiderDamage, applyFrostclawDamage, applyMagmaliskDamage, applyGloomrootDamage,
    applyTidewyrmDamage, applyKoiShogunDamage, applyTempestKirinDamage, applyMiremawDamage,
    applyPrismshellDamage, applyIronhornDamage, applyDreadreaperDamage, applyVoltwardenDamage,
    applyGravebloomDamage, applyAegisPrimeDamage, applyProceduralBossHit,
  };
}
