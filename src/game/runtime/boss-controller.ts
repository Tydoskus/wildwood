import {
  BOSS_AGGRO_RANGE,
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  BOSS_RAIN_RANGE,
  FROSTCLAW_AGGRO_RANGE,
  FROSTCLAW_RIFT_HALF_ANGLE,
  FROSTCLAW_RIFT_RANGE,
  FROSTCLAW_ROAR_RANGE,
  GLOOMROOT_AGGRO_RANGE,
  GLOOMROOT_SWEEP_HALF_ANGLE,
  GLOOMROOT_SWEEP_RANGE,
  KOI_SHOGUN_AGGRO_RANGE,
  KOI_SHOGUN_SLASH_HALF_ANGLE,
  KOI_SHOGUN_SLASH_RANGE,
  MAGMALISK_AGGRO_RANGE,
  MAGMALISK_BITE_HALF_ANGLE,
  MAGMALISK_BITE_RANGE,
  MIREMAW_AGGRO_RANGE,
  MIREMAW_TONGUE_HALF_ANGLE,
  MIREMAW_TONGUE_RANGE,
  TIDEWYRM_AGGRO_RANGE,
  TIDEWYRM_SURGE_HALF_ANGLE,
  TIDEWYRM_SURGE_RANGE,
  TEMPEST_KIRIN_AGGRO_RANGE,
  TEMPEST_KIRIN_CHARGE_HALF_ANGLE,
  TEMPEST_KIRIN_CHARGE_RANGE,
  WORLD,
} from "../constants";
import {
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  TEMPEST_KIRIN_REWARD_ARMOR,
  TEMPEST_KIRIN_REWARD_DAMAGE,
  TEMPEST_KIRIN_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_REGEN,
  DRAGON_REWARD_DAMAGE,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MIREMAW_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
} from "../../../shared/rules";
import {
  bossAbilityTimelineAt,
  bossSeededUnit,
  seededBossHazardPolar,
  type BossAbilityName,
  type BossSimulationKind,
} from "../../../shared/boss-simulation";
import { REWARD_DATA, rewardLabel, type RewardType } from "../enemies";
import { BOSS_DAMAGE_PROFILES } from "../boss-damage";
import { clamp } from "../math";
import type { PlayerGender } from "../../../shared/player-gender";
import type {
  BossRainStrike,
  DragonBossState,
  FrostclawBossState,
  FrostclawIcefall,
  GloomrootBloom,
  GloomrootBossState,
  KoiShogunBossState,
  KoiShogunWhirlpool,
  MagmaliskBossState,
  MagmaliskEruption,
  MiremawBogBurst,
  MiremawBossState,
  PlayerState,
  SpiderBossState,
  SpiderVenomPool,
  TempestKirinBossState,
  TempestKirinThunderbolt,
  TidewyrmBossState,
  TidewyrmWhirlpool,
} from "./types";
import { addPlayerBaseMaxHealth } from "./player-health";

export const BOSS_HP_LOSS_FLASH_DURATION = .18;
export const SPIDER_WEB_RANGE = 720;
export const BOSS_AREA_KNOCKBACK_DURATION = .32;

/**
 * One hit covers half of the usable attack radius. A player pressed against
 * the boss therefore needs two area hits to be pushed beyond that attack.
 */
export function bossAreaKnockbackDistance(attackRange: number, bossRadius: number) {
  return Math.max(0, (attackRange - bossRadius) / 2);
}

const DRAGON_CONE_WINDUP = .75;
const DRAGON_CONE_DURATION = 1.2;
const DRAGON_RAIN_DAMAGE = BOSS_DAMAGE_PROFILES.dragon.rain;
const DRAGON_CONE_DAMAGE = BOSS_DAMAGE_PROFILES.dragon.cone;
const SPIDER_AGGRO_RANGE = 1150;
const SPIDER_WEB_DAMAGE = BOSS_DAMAGE_PROFILES.spider.web;
const SPIDER_VENOM_DAMAGE = BOSS_DAMAGE_PROFILES.spider.venom;
const SPIDER_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.spider.contact;
const DRAGON_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.dragon.contact;
const DRAGON_CONTACT_DAMAGE_COOLDOWN = .75;
const FROSTCLAW_ROAR_WINDUP = .85;
const FROSTCLAW_ROAR_DURATION = .95;
const FROSTCLAW_RIFT_WINDUP = .7;
const FROSTCLAW_RIFT_DURATION = 1.05;
const FROSTCLAW_ROAR_DAMAGE = BOSS_DAMAGE_PROFILES.frostclaw.roar;
const FROSTCLAW_ICEFALL_DAMAGE = BOSS_DAMAGE_PROFILES.frostclaw.icefall;
const FROSTCLAW_RIFT_DAMAGE = BOSS_DAMAGE_PROFILES.frostclaw.rift;
const FROSTCLAW_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.frostclaw.contact;
const MAGMALISK_BITE_WINDUP = .72;
const MAGMALISK_BITE_DURATION = .9;
const MAGMALISK_BITE_DAMAGE = BOSS_DAMAGE_PROFILES.magmalisk.bite;
const MAGMALISK_ERUPTION_DAMAGE = BOSS_DAMAGE_PROFILES.magmalisk.eruption;
const MAGMALISK_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.magmalisk.contact;
const GLOOMROOT_SWEEP_WINDUP = .85;
const GLOOMROOT_SWEEP_DURATION = 1;
const GLOOMROOT_SWEEP_DAMAGE = BOSS_DAMAGE_PROFILES.gloomroot.sweep;
const GLOOMROOT_BLOOM_DAMAGE = BOSS_DAMAGE_PROFILES.gloomroot.bloom;
const GLOOMROOT_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.gloomroot.contact;
const TIDEWYRM_SURGE_WINDUP = .82;
const TIDEWYRM_SURGE_DURATION = 1.05;
const TIDEWYRM_SURGE_DAMAGE = BOSS_DAMAGE_PROFILES.tidewyrm.surge;
const TIDEWYRM_WHIRLPOOL_DAMAGE = BOSS_DAMAGE_PROFILES.tidewyrm.whirlpool;
const TIDEWYRM_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.tidewyrm.contact;
const KOI_SHOGUN_SLASH_WINDUP = .78;
const KOI_SHOGUN_SLASH_DURATION = 1.04;
const KOI_SHOGUN_SLASH_DAMAGE = BOSS_DAMAGE_PROFILES.koiShogun.slash;
const KOI_SHOGUN_WHIRLPOOL_DAMAGE = BOSS_DAMAGE_PROFILES.koiShogun.whirlpool;
const KOI_SHOGUN_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.koiShogun.contact;
const TEMPEST_KIRIN_CHARGE_WINDUP = .74;
const TEMPEST_KIRIN_CHARGE_DURATION = 1.02;
const TEMPEST_KIRIN_CHARGE_DAMAGE = BOSS_DAMAGE_PROFILES.tempestKirin.charge;
const TEMPEST_KIRIN_THUNDER_DAMAGE = BOSS_DAMAGE_PROFILES.tempestKirin.thunder;
const TEMPEST_KIRIN_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.tempestKirin.contact;
const MIREMAW_TONGUE_WINDUP = .68;
const MIREMAW_TONGUE_DURATION = .58;
const MIREMAW_TONGUE_DAMAGE = BOSS_DAMAGE_PROFILES.miremaw.tongue;
const MIREMAW_BOG_BURST_DAMAGE = BOSS_DAMAGE_PROFILES.miremaw.bogBurst;
const MIREMAW_CONTACT_DAMAGE = BOSS_DAMAGE_PROFILES.miremaw.contact;
const DEATH_PARTICLE_COLOR = "#e53935";

type SharedBossState = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
};

type BossResult = {
  encounter: bigint;
  totalDamage: number;
  contributors: Array<{ identity: string; name: string; gender: PlayerGender; damage: number; percentage: number }>;
};

type NoticeElements = {
  worldNotice: HTMLElement;
  worldNoticeDetail: HTMLElement;
};

type BossAbilityTarget = { id: string; x: number; y: number };

export type BossController = {
  resetBoss: () => void;
  resetSpiderBoss: () => void;
  resetFrostclawBoss: () => void;
  resetMagmaliskBoss: () => void;
  resetGloomrootBoss: () => void;
  resetTidewyrmBoss: () => void;
  resetKoiShogunBoss: () => void;
  resetTempestKirinBoss: () => void;
  resetMiremawBoss: () => void;
  syncDragonState: () => void;
  syncSpiderState: () => void;
  syncFrostclawState: () => void;
  syncMagmaliskState: () => void;
  syncGloomrootState: () => void;
  syncTidewyrmState: () => void;
  syncKoiShogunState: () => void;
  syncTempestKirinState: () => void;
  syncMiremawState: () => void;
  updateBoss: (dt: number) => void;
  updateSpiderBoss: (dt: number) => void;
  updateFrostclawBoss: (dt: number) => void;
  updateMagmaliskBoss: (dt: number) => void;
  updateGloomrootBoss: (dt: number) => void;
  updateTidewyrmBoss: (dt: number) => void;
  updateKoiShogunBoss: (dt: number) => void;
  updateTempestKirinBoss: (dt: number) => void;
  updateMiremawBoss: (dt: number) => void;
  resolveDragonCollision: () => void;
  resolveSpiderCollision: () => void;
  resolveFrostclawCollision: () => void;
  resolveMagmaliskCollision: () => void;
  resolveGloomrootCollision: () => void;
  resolveTidewyrmCollision: () => void;
  resolveKoiShogunCollision: () => void;
  resolveTempestKirinCollision: () => void;
  resolveMiremawCollision: () => void;
  applyBossKnockback: (dt: number) => void;
  onPortalCutsceneFinished: (wasPreview: boolean) => void;
};

/**
 * Owns world-boss state synchronization, attacks, collision, and reward UI.
 * The application entry point supplies DOM and multiplayer boundaries only.
 */
export function createBossController(options: {
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  koiShogunBoss: KoiShogunBossState;
  tempestKirinBoss: TempestKirinBossState;
  miremawBoss: MiremawBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  frostclawIcefalls: FrostclawIcefall[];
  magmaliskEruptions: MagmaliskEruption[];
  gloomrootBlooms: GloomrootBloom[];
  tidewyrmWhirlpools: TidewyrmWhirlpool[];
  koiShogunWhirlpools: KoiShogunWhirlpool[];
  tempestKirinThunderbolts: TempestKirinThunderbolt[];
  miremawBogBursts: MiremawBogBurst[];
  player: PlayerState;
  getDragonBoss: () => SharedBossState | null | undefined;
  getSpiderBoss: () => SharedBossState | null | undefined;
  getFrostclawBoss: () => SharedBossState | null | undefined;
  getMagmaliskBoss: () => SharedBossState | null | undefined;
  getGloomrootBoss: () => SharedBossState | null | undefined;
  getTidewyrmBoss: () => SharedBossState | null | undefined;
  getKoiShogunBoss: () => SharedBossState | null | undefined;
  getTempestKirinBoss: () => SharedBossState | null | undefined;
  getMiremawBoss: () => SharedBossState | null | undefined;
  getDragonResult: () => BossResult | null | undefined;
  getSpiderResult: () => BossResult | null | undefined;
  getFrostclawResult: () => BossResult | null | undefined;
  getMagmaliskResult: () => BossResult | null | undefined;
  getGloomrootResult: () => BossResult | null | undefined;
  getTidewyrmResult: () => BossResult | null | undefined;
  getKoiShogunResult: () => BossResult | null | undefined;
  getTempestKirinResult: () => BossResult | null | undefined;
  getMiremawResult: () => BossResult | null | undefined;
  localIdentity: () => string | undefined;
  /** Estimated server clock used to keep boss abilities in one shared phase. */
  serverNowMs?: () => number;
  /** Consensus-time players already known by the client; no extra server state. */
  bossTargets?: () => readonly BossAbilityTarget[];
  running: () => boolean;
  currentMapIsDesert: () => boolean;
  currentMapIsSnow: () => boolean;
  currentMapIsLava: () => boolean;
  currentMapIsInfernal: () => boolean;
  currentMapIsWater: () => boolean;
  currentMapIsSamurai: () => boolean;
  currentMapIsCloudspire: () => boolean;
  currentMapIsMoonfen: () => boolean;
  portalCutsceneActive: () => boolean;
  hasSeenDragonPortalCutscene: () => boolean;
  hasSeenSnowlandsPortalCutscene: () => boolean;
  hasSeenLavaPortalCutscene: () => boolean;
  hasSeenInfernalPortalCutscene: () => boolean;
  hasSeenWaterPortalCutscene: () => boolean;
  hasSeenSamuraiPortalCutscene: () => boolean;
  startDragonPortalCutscene: () => void;
  startSnowlandsPortalCutscene: () => void;
  startLavaPortalCutscene: () => void;
  startInfernalPortalCutscene: () => void;
  startWaterPortalCutscene: () => void;
  startSamuraiPortalCutscene: () => void;
  elements: NoticeElements;
  renderPlayerName: (element: HTMLElement, identity: string, name: string, gender?: PlayerGender) => void;
  spawnBurst: (x: number, y: number, color: string, count: number, speed: number) => void;
  damagePlayer: (amount: number) => boolean;
  logPickup: (text: string, color: string) => void;
  saveProgress: () => void;
  healthMultiplier?: () => number;
  rewardMultiplier?: () => number;
}): BossController {
  const {
    boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, koiShogunBoss, tempestKirinBoss, miremawBoss, bossRain, spiderVenom, frostclawIcefalls, magmaliskEruptions, gloomrootBlooms, tidewyrmWhirlpools, koiShogunWhirlpools, tempestKirinThunderbolts, miremawBogBursts, player, elements,
    getDragonBoss, getSpiderBoss, getFrostclawBoss, getMagmaliskBoss, getGloomrootBoss, getTidewyrmBoss, getKoiShogunBoss, getTempestKirinBoss, getMiremawBoss, getDragonResult, getSpiderResult, getFrostclawResult, getMagmaliskResult, getGloomrootResult, getTidewyrmResult, getKoiShogunResult, getTempestKirinResult, getMiremawResult,
    localIdentity, running, currentMapIsDesert, currentMapIsSnow, currentMapIsLava, currentMapIsInfernal, currentMapIsWater, currentMapIsSamurai, currentMapIsCloudspire, currentMapIsMoonfen, portalCutsceneActive,
    hasSeenDragonPortalCutscene, hasSeenSnowlandsPortalCutscene, hasSeenLavaPortalCutscene, hasSeenInfernalPortalCutscene, hasSeenWaterPortalCutscene, hasSeenSamuraiPortalCutscene,
    startDragonPortalCutscene, startSnowlandsPortalCutscene, startLavaPortalCutscene, startInfernalPortalCutscene, startWaterPortalCutscene, startSamuraiPortalCutscene,
    renderPlayerName, spawnBurst, damagePlayer, logPickup, saveProgress,
  } = options;
  let dragonWorldNoticeTimer: number | null = null;
  let observedDragonEncounter: bigint | null = null;
  let dragonWasAlive: boolean | null = null;
  let pendingDragonResultEncounter: bigint | null = null;
  let shownDragonResultEncounter: bigint | null = null;
  let observedSpiderEncounter: bigint | null = null;
  let spiderWasAlive: boolean | null = null;
  let pendingSpiderResultEncounter: bigint | null = null;
  let shownSpiderResultEncounter: bigint | null = null;
  let queuedDragonResult: BossResult | null = null;
  let queuedSpiderResult: BossResult | null = null;
  let queuedFrostclawResult: BossResult | null = null;
  let queuedMagmaliskResult: BossResult | null = null;
  let observedFrostclawEncounter: bigint | null = null;
  let frostclawWasAlive: boolean | null = null;
  let pendingFrostclawResultEncounter: bigint | null = null;
  let shownFrostclawResultEncounter: bigint | null = null;
  let observedMagmaliskEncounter: bigint | null = null;
  let magmaliskWasAlive: boolean | null = null;
  let pendingMagmaliskResultEncounter: bigint | null = null;
  let shownMagmaliskResultEncounter: bigint | null = null;
  let queuedGloomrootResult: BossResult | null = null;
  let observedGloomrootEncounter: bigint | null = null;
  let gloomrootWasAlive: boolean | null = null;
  let pendingGloomrootResultEncounter: bigint | null = null;
  let shownGloomrootResultEncounter: bigint | null = null;
  let queuedTidewyrmResult: BossResult | null = null;
  let observedTidewyrmEncounter: bigint | null = null;
  let tidewyrmWasAlive: boolean | null = null;
  let pendingTidewyrmResultEncounter: bigint | null = null;
  let shownTidewyrmResultEncounter: bigint | null = null;
  let observedKoiShogunEncounter: bigint | null = null;
  let koiShogunWasAlive: boolean | null = null;
  let pendingKoiShogunResultEncounter: bigint | null = null;
  let shownKoiShogunResultEncounter: bigint | null = null;
  let observedTempestKirinEncounter: bigint | null = null;
  let tempestKirinWasAlive: boolean | null = null;
  let pendingTempestKirinResultEncounter: bigint | null = null;
  let shownTempestKirinResultEncounter: bigint | null = null;
  let observedMiremawEncounter: bigint | null = null;
  let miremawWasAlive: boolean | null = null;
  let pendingMiremawResultEncounter: bigint | null = null;
  let shownMiremawResultEncounter: bigint | null = null;
  const locallyRewardedDragonEncounters = new Set<string>();
  const locallyRewardedSpiderEncounters = new Set<string>();
  const locallyRewardedFrostclawEncounters = new Set<string>();
  const locallyRewardedMagmaliskEncounters = new Set<string>();
  const locallyRewardedGloomrootEncounters = new Set<string>();
  const locallyRewardedTidewyrmEncounters = new Set<string>();
  const locallyRewardedKoiShogunEncounters = new Set<string>();
  const locallyRewardedTempestKirinEncounters = new Set<string>();
  const locallyRewardedMiremawEncounters = new Set<string>();
  let dragonRainPatternIndex = 0;
  let spiderVenomPatternIndex = 0;
  let frostclawIcefallPatternIndex = 0;
  let magmaliskEruptionPatternIndex = 0;
  let gloomrootBloomPatternIndex = 0;
  let tidewyrmWhirlpoolPatternIndex = 0;
  let koiShogunWhirlpoolPatternIndex = 0;
  let tempestKirinThunderPatternIndex = 0;
  let miremawBogBurstPatternIndex = 0;
  let bossKnockbackAngle = 0;
  let bossKnockbackTimeRemaining = 0;
  let bossKnockbackDistanceRemaining = 0;
  const observedAbilityKeys = new Map<BossSimulationKind, string>();
  const activatedAbilityKeys = new Map<BossSimulationKind, string>();

  function resetAbilityTimeline(kind: BossSimulationKind) {
    observedAbilityKeys.delete(kind);
    activatedAbilityKeys.delete(kind);
  }

  function syncAbilityTimeline(options: {
    kind: BossSimulationKind;
    encounter: bigint | null;
    targetForAttack: (attackIndex: number) => BossAbilityTarget | null;
    clear: () => void;
    start: (ability: BossAbilityName, elapsedSeconds: number, attackIndex: number, target: BossAbilityTarget) => void;
    setAttackClock: (seconds: number) => void;
  }) {
    if (!hasSharedBossClock()) return false;
    const phase = bossAbilityTimelineAt({
      kind: options.kind,
      serverNowMs: sharedServerNowMs(),
    });
    const key = `${options.encounter ?? 0n}:${phase.attackIndex}`;
    if (observedAbilityKeys.get(options.kind) !== key) {
      observedAbilityKeys.set(options.kind, key);
      options.clear();
    }
    options.setAttackClock(Math.max(0, (phase.slotDurationMs - phase.elapsedMs) / 1_000));
    const target = options.targetForAttack(phase.attackIndex);
    if (
      !target ||
      phase.elapsedMs >= phase.activeDurationMs ||
      activatedAbilityKeys.get(options.kind) === key
    ) return true;
    activatedAbilityKeys.set(options.kind, key);
    options.start(phase.ability, phase.elapsedMs / 1_000, phase.attackIndex, target);
    return true;
  }

  function selectAbilityTarget(
    kind: BossSimulationKind,
    encounter: bigint | null,
    attackIndex: number,
    bossX: number,
    bossY: number,
    aggroRange: number,
  ) {
    const supplied = options.bossTargets?.() ?? [{
      id: localIdentity() ?? "local-player",
      x: player.x,
      y: player.y,
    }];
    const candidates = new Map<string, BossAbilityTarget>();
    for (const target of supplied) {
      if (!target.id || !Number.isFinite(target.x) || !Number.isFinite(target.y)) continue;
      const dx = target.x - bossX;
      const dy = target.y - bossY;
      if (dx * dx + dy * dy > aggroRange * aggroRange) continue;
      candidates.set(target.id, target);
    }
    const ordered = [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
    if (ordered.length === 0) return null;
    const selectedIndex = Math.min(
      ordered.length - 1,
      Math.floor(bossSeededUnit("boss-ability-target", kind, encounter ?? 0n, attackIndex) * ordered.length),
    );
    return ordered[selectedIndex];
  }

  function hasSharedBossClock() {
    return typeof options.serverNowMs === "function";
  }

  function sharedServerNowMs() {
    return options.serverNowMs?.() ?? Date.now();
  }

  function scaledReward(type: RewardType, baseAmount: number) {
    const multiplier = options.rewardMultiplier?.() ?? 1;
    return {
      type,
      amount: baseAmount * (Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1),
    };
  }

  function queueBossAreaKnockback(sourceX: number, sourceY: number, attackRange: number, bossRadius: number) {
    bossKnockbackAngle = Math.atan2(player.y - sourceY, player.x - sourceX);
    bossKnockbackTimeRemaining = BOSS_AREA_KNOCKBACK_DURATION;
    bossKnockbackDistanceRemaining = bossAreaKnockbackDistance(attackRange, bossRadius);
  }

  function clearBossKnockback() {
    bossKnockbackTimeRemaining = 0;
    bossKnockbackDistanceRemaining = 0;
  }

  function resetBoss() {
    clearBossKnockback();
    const shared = getDragonBoss();
    if (shared) {
      boss.encounter = shared.encounter;
      boss.hp = shared.hp;
      boss.maxHp = shared.maxHp;
      boss.dead = !shared.alive;
    }
    boss.hurt = 0;
    boss.hpLossFlashFrom = boss.hp;
    boss.hpLossFlashTimer = 0;
    boss.contactDamageClock = 0;
    boss.attackClock = 3;
    boss.nextAttack = "cone";
    boss.cone = null;
    bossRain.length = 0;
    dragonRainPatternIndex = 0;
    resetAbilityTimeline("dragon");
  }

  function resetSpiderBoss() {
    const shared = getSpiderBoss();
    if (shared) {
      spiderBoss.encounter = shared.encounter;
      spiderBoss.hp = shared.hp;
      spiderBoss.maxHp = shared.maxHp;
      spiderBoss.dead = !shared.alive;
    }
    spiderBoss.hpLossFlashFrom = spiderBoss.hp;
    spiderBoss.hpLossFlashTimer = 0;
    spiderBoss.contactDamageClock = 0;
    spiderBoss.attackClock = 3;
    spiderBoss.nextAttack = "web";
    spiderBoss.web = null;
    spiderVenom.length = 0;
    spiderVenomPatternIndex = 0;
    resetAbilityTimeline("spider");
  }

  function resetFrostclawBoss() {
    const shared = getFrostclawBoss();
    if (shared) {
      frostclawBoss.encounter = shared.encounter;
      frostclawBoss.hp = shared.hp;
      frostclawBoss.maxHp = shared.maxHp;
      frostclawBoss.dead = !shared.alive;
    }
    frostclawBoss.hurt = 0;
    frostclawBoss.hpLossFlashFrom = frostclawBoss.hp;
    frostclawBoss.hpLossFlashTimer = 0;
    frostclawBoss.contactDamageClock = 0;
    frostclawBoss.attackClock = 3;
    frostclawBoss.nextAttack = "roar";
    frostclawBoss.roar = null;
    frostclawBoss.rift = null;
    frostclawIcefalls.length = 0;
    frostclawIcefallPatternIndex = 0;
    resetAbilityTimeline("frostclaw");
  }

  function resetMagmaliskBoss() {
    const shared = getMagmaliskBoss();
    if (shared) {
      magmaliskBoss.encounter = shared.encounter;
      magmaliskBoss.hp = shared.hp;
      magmaliskBoss.maxHp = shared.maxHp;
      magmaliskBoss.dead = !shared.alive;
    }
    magmaliskBoss.hurt = 0;
    magmaliskBoss.hpLossFlashFrom = magmaliskBoss.hp;
    magmaliskBoss.hpLossFlashTimer = 0;
    magmaliskBoss.contactDamageClock = 0;
    magmaliskBoss.attackClock = 3;
    magmaliskBoss.nextAttack = "bite";
    magmaliskBoss.bite = null;
    magmaliskEruptions.length = 0;
    magmaliskEruptionPatternIndex = 0;
    resetAbilityTimeline("magmalisk");
  }

  function resetGloomrootBoss() {
    const shared = getGloomrootBoss();
    if (shared) {
      gloomrootBoss.encounter = shared.encounter;
      gloomrootBoss.hp = shared.hp;
      gloomrootBoss.maxHp = shared.maxHp;
      gloomrootBoss.dead = !shared.alive;
    }
    gloomrootBoss.hurt = 0;
    gloomrootBoss.hpLossFlashFrom = gloomrootBoss.hp;
    gloomrootBoss.hpLossFlashTimer = 0;
    gloomrootBoss.contactDamageClock = 0;
    gloomrootBoss.attackClock = 3;
    gloomrootBoss.nextAttack = "sweep";
    gloomrootBoss.sweep = null;
    gloomrootBlooms.length = 0;
    gloomrootBloomPatternIndex = 0;
    resetAbilityTimeline("gloomroot");
  }

  function resetTidewyrmBoss() {
    const shared = getTidewyrmBoss();
    if (shared) {
      tidewyrmBoss.encounter = shared.encounter;
      tidewyrmBoss.hp = shared.hp;
      tidewyrmBoss.maxHp = shared.maxHp;
      tidewyrmBoss.dead = !shared.alive;
    }
    tidewyrmBoss.hurt = 0;
    tidewyrmBoss.hpLossFlashFrom = tidewyrmBoss.hp;
    tidewyrmBoss.hpLossFlashTimer = 0;
    tidewyrmBoss.contactDamageClock = 0;
    tidewyrmBoss.attackClock = 3;
    tidewyrmBoss.nextAttack = "surge";
    tidewyrmBoss.surge = null;
    tidewyrmWhirlpools.length = 0;
    tidewyrmWhirlpoolPatternIndex = 0;
    resetAbilityTimeline("tidewyrm");
  }

  function resetKoiShogunBoss() {
    const shared = getKoiShogunBoss();
    if (shared) {
      koiShogunBoss.encounter = shared.encounter;
      koiShogunBoss.hp = shared.hp;
      koiShogunBoss.maxHp = shared.maxHp;
      koiShogunBoss.dead = !shared.alive;
    }
    koiShogunBoss.hurt = 0;
    koiShogunBoss.hpLossFlashFrom = koiShogunBoss.hp;
    koiShogunBoss.hpLossFlashTimer = 0;
    koiShogunBoss.contactDamageClock = 0;
    koiShogunBoss.attackClock = 3;
    koiShogunBoss.nextAttack = "slash";
    koiShogunBoss.slash = null;
    koiShogunWhirlpools.length = 0;
    koiShogunWhirlpoolPatternIndex = 0;
    resetAbilityTimeline("koiShogun");
  }

  function resetTempestKirinBoss() {
    const shared = getTempestKirinBoss();
    if (shared) {
      tempestKirinBoss.encounter = shared.encounter;
      tempestKirinBoss.hp = shared.hp;
      tempestKirinBoss.maxHp = shared.maxHp;
      tempestKirinBoss.dead = !shared.alive;
    }
    tempestKirinBoss.hurt = 0;
    tempestKirinBoss.hpLossFlashFrom = tempestKirinBoss.hp;
    tempestKirinBoss.hpLossFlashTimer = 0;
    tempestKirinBoss.contactDamageClock = 0;
    tempestKirinBoss.attackClock = 3;
    tempestKirinBoss.nextAttack = "charge";
    tempestKirinBoss.charge = null;
    tempestKirinThunderbolts.length = 0;
    tempestKirinThunderPatternIndex = 0;
    resetAbilityTimeline("tempestKirin");
  }

function resetMiremawBoss() {
    const shared = getMiremawBoss();
    if (shared) {
      miremawBoss.encounter = shared.encounter;
      miremawBoss.hp = shared.hp;
      miremawBoss.maxHp = shared.maxHp;
      miremawBoss.dead = !shared.alive;
    }
    miremawBoss.hurt = 0;
    miremawBoss.hpLossFlashFrom = miremawBoss.hp;
    miremawBoss.hpLossFlashTimer = 0;
    miremawBoss.contactDamageClock = 0;
    miremawBoss.attackClock = 3;
    miremawBoss.nextAttack = "tongue";
    miremawBoss.tongue = null;
    miremawBogBursts.length = 0;
    miremawBogBurstPatternIndex = 0;
    resetAbilityTimeline("miremaw");
  }


  function showWorldResult(result: BossResult, heading: string) {
    const title = elements.worldNotice.querySelector("strong");
    if (title) title.textContent = heading;
    elements.worldNoticeDetail.replaceChildren();
    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-world-notice-row";
      const name = document.createElement("span");
      renderPlayerName(name, contributor.identity, contributor.name, contributor.gender);
      const percentage = document.createElement("span");
      percentage.textContent = `${Math.round(contributor.percentage)}%`;
      row.append(name, percentage);
      elements.worldNoticeDetail.appendChild(row);
    }
    elements.worldNotice.hidden = false;
    if (dragonWorldNoticeTimer !== null) window.clearTimeout(dragonWorldNoticeTimer);
    dragonWorldNoticeTimer = window.setTimeout(() => {
      elements.worldNotice.hidden = true;
      dragonWorldNoticeTimer = null;
    }, 6_000);
  }

  function showSpiderResult(result: BossResult | null | undefined) {
    if (!result || shownSpiderResultEncounter === result.encounter || (portalCutsceneActive() && queuedSpiderResult?.encounter === result.encounter)) return;
    pendingSpiderResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && currentMapIsDesert() && !hasSeenSnowlandsPortalCutscene()) {
      queuedSpiderResult = result;
      startSnowlandsPortalCutscene();
      return;
    }
    shownSpiderResultEncounter = result.encounter;
    showWorldResult(result, "DESERT SCORPION DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", SPIDER_REWARD_DAMAGE);
    const healthReward = scaledReward("health", SPIDER_REWARD_HEALTH);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedSpiderEncounters.has(encounterKey)) {
      // The authoritative reward arrives through the server result. Mirror it
      // into the active runtime now so the overhead HP and Power labels change
      // in the same frame as the reward notice, not after a later save sync.
      locallyRewardedSpiderEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
  }

  function showFrostclawResult(result: BossResult | null | undefined) {
    if (!result || shownFrostclawResultEncounter === result.encounter || (portalCutsceneActive() && queuedFrostclawResult?.encounter === result.encounter)) return;
    pendingFrostclawResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && currentMapIsSnow() && !hasSeenLavaPortalCutscene()) {
      queuedFrostclawResult = result;
      startLavaPortalCutscene();
      return;
    }
    shownFrostclawResultEncounter = result.encounter;
    showWorldResult(result, "FROSTCLAW DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", FROSTCLAW_REWARD_DAMAGE);
    const healthReward = scaledReward("health", FROSTCLAW_REWARD_HEALTH);
    const armorReward = scaledReward("armor", FROSTCLAW_REWARD_ARMOR);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedFrostclawEncounters.has(encounterKey)) {
      locallyRewardedFrostclawEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
  }

  function showMagmaliskResult(result: BossResult | null | undefined) {
    if (!result || shownMagmaliskResultEncounter === result.encounter || (portalCutsceneActive() && queuedMagmaliskResult?.encounter === result.encounter)) return;
    pendingMagmaliskResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && currentMapIsLava() && !hasSeenInfernalPortalCutscene()) {
      queuedMagmaliskResult = result;
      startInfernalPortalCutscene();
      return;
    }
    shownMagmaliskResultEncounter = result.encounter;
    showWorldResult(result, "MAGMALISK DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", MAGMALISK_REWARD_DAMAGE);
    const healthReward = scaledReward("health", MAGMALISK_REWARD_HEALTH);
    const armorReward = scaledReward("armor", MAGMALISK_REWARD_ARMOR);
    const regenReward = scaledReward("regen", MAGMALISK_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedMagmaliskEncounters.has(encounterKey)) {
      locallyRewardedMagmaliskEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
  }

  function showGloomrootResult(result: BossResult | null | undefined) {
    if (!result || shownGloomrootResultEncounter === result.encounter || (portalCutsceneActive() && queuedGloomrootResult?.encounter === result.encounter)) return;
    pendingGloomrootResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && currentMapIsInfernal() && !hasSeenWaterPortalCutscene()) {
      queuedGloomrootResult = result;
      startWaterPortalCutscene();
      return;
    }
    shownGloomrootResultEncounter = result.encounter;
    showWorldResult(result, "GLOOMROOT DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", GLOOMROOT_REWARD_DAMAGE);
    const healthReward = scaledReward("health", GLOOMROOT_REWARD_HEALTH);
    const armorReward = scaledReward("armor", GLOOMROOT_REWARD_ARMOR);
    const regenReward = scaledReward("regen", GLOOMROOT_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedGloomrootEncounters.has(encounterKey)) {
      locallyRewardedGloomrootEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
  }

  function showTidewyrmResult(result: BossResult | null | undefined) {
    if (!result || shownTidewyrmResultEncounter === result.encounter || (portalCutsceneActive() && queuedTidewyrmResult?.encounter === result.encounter)) return;
    pendingTidewyrmResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && currentMapIsWater() && !hasSeenSamuraiPortalCutscene()) {
      queuedTidewyrmResult = result;
      startSamuraiPortalCutscene();
      return;
    }
    shownTidewyrmResultEncounter = result.encounter;
    showWorldResult(result, "TIDEWYRM DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", TIDEWYRM_REWARD_DAMAGE);
    const healthReward = scaledReward("health", TIDEWYRM_REWARD_HEALTH);
    const armorReward = scaledReward("armor", TIDEWYRM_REWARD_ARMOR);
    const regenReward = scaledReward("regen", TIDEWYRM_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedTidewyrmEncounters.has(encounterKey)) {
      locallyRewardedTidewyrmEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
  }

  function showKoiShogunResult(result: BossResult | null | undefined) {
    if (!result || shownKoiShogunResultEncounter === result.encounter) return;
    pendingKoiShogunResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    shownKoiShogunResultEncounter = result.encounter;
    showWorldResult(result, "KOI SHOGUN DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", KOI_SHOGUN_REWARD_DAMAGE);
    const healthReward = scaledReward("health", KOI_SHOGUN_REWARD_HEALTH);
    const armorReward = scaledReward("armor", KOI_SHOGUN_REWARD_ARMOR);
    const regenReward = scaledReward("regen", KOI_SHOGUN_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedKoiShogunEncounters.has(encounterKey)) {
      locallyRewardedKoiShogunEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
  }

  function showTempestKirinResult(result: BossResult | null | undefined) {
    if (!result || shownTempestKirinResultEncounter === result.encounter) return;
    pendingTempestKirinResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    shownTempestKirinResultEncounter = result.encounter;
    showWorldResult(result, "TEMPEST KIRIN DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", TEMPEST_KIRIN_REWARD_DAMAGE);
    const healthReward = scaledReward("health", TEMPEST_KIRIN_REWARD_HEALTH);
    const armorReward = scaledReward("armor", TEMPEST_KIRIN_REWARD_ARMOR);
    const regenReward = scaledReward("regen", TEMPEST_KIRIN_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedTempestKirinEncounters.has(encounterKey)) {
      locallyRewardedTempestKirinEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
  }

function showMiremawResult(result: BossResult | null | undefined) {
    if (!result || shownMiremawResultEncounter === result.encounter) return;
    pendingMiremawResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    shownMiremawResultEncounter = result.encounter;
    showWorldResult(result, "MIREMAW DEFEATED");
    if (!localContribution) return;
    const damageReward = scaledReward("damage", MIREMAW_REWARD_DAMAGE);
    const healthReward = scaledReward("health", MIREMAW_REWARD_HEALTH);
    const armorReward = scaledReward("armor", MIREMAW_REWARD_ARMOR);
    const regenReward = scaledReward("regen", MIREMAW_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedMiremawEncounters.has(encounterKey)) {
      locallyRewardedMiremawEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
  }


  function killBoss() {
    if (boss.dead) return;
    boss.dead = true;
    boss.cone = null;
    bossRain.length = 0;
    spawnBurst(boss.x, boss.y, DEATH_PARTICLE_COLOR, 64, 230);
  }

  function showDragonResult(result: BossResult | null | undefined) {
    if (!result || shownDragonResultEncounter === result.encounter) return;
    if (portalCutsceneActive() && queuedDragonResult?.encounter === result.encounter) return;
    if (!running()) {
      shownDragonResultEncounter = result.encounter;
      pendingDragonResultEncounter = null;
      return;
    }
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && !hasSeenDragonPortalCutscene()) {
      queuedDragonResult = result;
      startDragonPortalCutscene();
      return;
    }
    shownDragonResultEncounter = result.encounter;
    pendingDragonResultEncounter = null;
    showWorldResult(result, "DRAGON DEFEATED");
    elements.worldNotice.style.animation = "none";
    void elements.worldNotice.offsetWidth;
    elements.worldNotice.style.animation = "";
    if (!localContribution) return;
    const damageReward = scaledReward("damage", DRAGON_REWARD_DAMAGE);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedDragonEncounters.has(encounterKey)) {
      locallyRewardedDragonEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      logPickup(rewardLabel(damageReward), "#ff655a");
      saveProgress();
    }
  }

  function syncSpiderState() {
    const shared = getSpiderBoss();
    if (!shared) return;
    const initialized = observedSpiderEncounter !== null;
    const encounterChanged = initialized && observedSpiderEncounter !== shared.encounter;
    const previousHp = spiderBoss.hp;
    if (!initialized || encounterChanged) {
      observedSpiderEncounter = shared.encounter;
      spiderWasAlive = shared.alive;
      spiderBoss.dead = !shared.alive;
      spiderBoss.attackClock = 3;
      spiderBoss.nextAttack = "web";
      spiderBoss.web = null;
      spiderVenom.length = 0;
      spiderVenomPatternIndex = 0;
      resetAbilityTimeline("spider");
      spiderBoss.hpLossFlashFrom = shared.hp;
      spiderBoss.hpLossFlashTimer = 0;
    } else if (spiderWasAlive && !shared.alive) {
      spiderWasAlive = false;
      spiderBoss.dead = true;
      spiderBoss.web = null;
      spiderVenom.length = 0;
      pendingSpiderResultEncounter = shared.encounter;
      spawnBurst(spiderBoss.x, spiderBoss.y, DEATH_PARTICLE_COLOR, 64, 230);
    } else if (!spiderWasAlive && shared.alive) {
      spiderWasAlive = true;
      spiderBoss.dead = false;
      spiderBoss.attackClock = 3;
      spiderBoss.nextAttack = "web";
      spiderVenomPatternIndex = 0;
      resetAbilityTimeline("spider");
    } else if (shared.alive && shared.hp < previousHp) {
      spiderBoss.hpLossFlashFrom = spiderBoss.hpLossFlashTimer > 0 ? Math.max(spiderBoss.hpLossFlashFrom, previousHp) : previousHp;
      spiderBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    }
    spiderBoss.encounter = shared.encounter;
    spiderBoss.maxHp = shared.maxHp;
    spiderBoss.hp = shared.hp;
    if (pendingSpiderResultEncounter !== null) {
      const result = getSpiderResult();
      if (result?.encounter === pendingSpiderResultEncounter) showSpiderResult(result);
    }
  }

  function syncFrostclawState() {
    const shared = getFrostclawBoss();
    if (!shared) return;
    const initialized = observedFrostclawEncounter !== null;
    const encounterChanged = initialized && observedFrostclawEncounter !== shared.encounter;
    const previousHp = frostclawBoss.hp;
    if (!initialized || encounterChanged) {
      observedFrostclawEncounter = shared.encounter;
      frostclawWasAlive = shared.alive;
      frostclawBoss.dead = !shared.alive;
      frostclawBoss.attackClock = 3;
      frostclawBoss.nextAttack = "roar";
      frostclawBoss.roar = null;
      frostclawBoss.rift = null;
      frostclawIcefalls.length = 0;
      frostclawIcefallPatternIndex = 0;
      resetAbilityTimeline("frostclaw");
      frostclawBoss.hpLossFlashFrom = shared.hp;
      frostclawBoss.hpLossFlashTimer = 0;
    } else if (frostclawWasAlive && !shared.alive) {
      frostclawWasAlive = false;
      frostclawBoss.dead = true;
      frostclawBoss.roar = null;
      frostclawBoss.rift = null;
      frostclawIcefalls.length = 0;
      pendingFrostclawResultEncounter = shared.encounter;
      spawnBurst(frostclawBoss.x, frostclawBoss.y, "#8eeeff", 76, 260);
    } else if (!frostclawWasAlive && shared.alive) {
      frostclawWasAlive = true;
      frostclawBoss.dead = false;
      frostclawBoss.attackClock = 3;
      frostclawBoss.nextAttack = "roar";
      frostclawIcefallPatternIndex = 0;
      resetAbilityTimeline("frostclaw");
    } else if (shared.alive && shared.hp < previousHp) {
      frostclawBoss.hpLossFlashFrom = frostclawBoss.hpLossFlashTimer > 0
        ? Math.max(frostclawBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      frostclawBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      frostclawBoss.hpLossFlashFrom = shared.hp;
      frostclawBoss.hpLossFlashTimer = 0;
    }
    frostclawBoss.encounter = shared.encounter;
    frostclawBoss.maxHp = shared.maxHp;
    frostclawBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsSnow() && !hasSeenLavaPortalCutscene()) {
      const result = getFrostclawResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedFrostclawEncounters.add(String(result.encounter));
        showFrostclawResult(result);
      }
    }
    if (pendingFrostclawResultEncounter !== null) {
      const result = getFrostclawResult();
      if (result?.encounter === pendingFrostclawResultEncounter) showFrostclawResult(result);
    }
  }

  function syncMagmaliskState() {
    const shared = getMagmaliskBoss();
    if (!shared) return;
    const initialized = observedMagmaliskEncounter !== null;
    const encounterChanged = initialized && observedMagmaliskEncounter !== shared.encounter;
    const previousHp = magmaliskBoss.hp;
    if (!initialized || encounterChanged) {
      observedMagmaliskEncounter = shared.encounter;
      magmaliskWasAlive = shared.alive;
      magmaliskBoss.dead = !shared.alive;
      magmaliskBoss.attackClock = 3;
      magmaliskBoss.nextAttack = "bite";
      magmaliskBoss.bite = null;
      magmaliskEruptions.length = 0;
      magmaliskEruptionPatternIndex = 0;
      resetAbilityTimeline("magmalisk");
      magmaliskBoss.hpLossFlashFrom = shared.hp;
      magmaliskBoss.hpLossFlashTimer = 0;
    } else if (magmaliskWasAlive && !shared.alive) {
      magmaliskWasAlive = false;
      magmaliskBoss.dead = true;
      magmaliskBoss.bite = null;
      magmaliskEruptions.length = 0;
      pendingMagmaliskResultEncounter = shared.encounter;
      spawnBurst(magmaliskBoss.x, magmaliskBoss.y, "#ff6b24", 88, 280);
    } else if (!magmaliskWasAlive && shared.alive) {
      magmaliskWasAlive = true;
      magmaliskBoss.dead = false;
      magmaliskBoss.attackClock = 3;
      magmaliskBoss.nextAttack = "bite";
      magmaliskEruptionPatternIndex = 0;
      resetAbilityTimeline("magmalisk");
    } else if (shared.alive && shared.hp < previousHp) {
      magmaliskBoss.hpLossFlashFrom = magmaliskBoss.hpLossFlashTimer > 0
        ? Math.max(magmaliskBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      magmaliskBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      magmaliskBoss.hpLossFlashFrom = shared.hp;
      magmaliskBoss.hpLossFlashTimer = 0;
    }
    magmaliskBoss.encounter = shared.encounter;
    magmaliskBoss.maxHp = shared.maxHp;
    magmaliskBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsLava()) {
      const result = getMagmaliskResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedMagmaliskEncounters.add(String(result.encounter));
        showMagmaliskResult(result);
      }
    }
    if (pendingMagmaliskResultEncounter !== null) {
      const result = getMagmaliskResult();
      if (result?.encounter === pendingMagmaliskResultEncounter) showMagmaliskResult(result);
    }
  }

  function syncGloomrootState() {
    const shared = getGloomrootBoss();
    if (!shared) return;
    const initialized = observedGloomrootEncounter !== null;
    const encounterChanged = initialized && observedGloomrootEncounter !== shared.encounter;
    const previousHp = gloomrootBoss.hp;
    if (!initialized || encounterChanged) {
      observedGloomrootEncounter = shared.encounter;
      gloomrootWasAlive = shared.alive;
      gloomrootBoss.dead = !shared.alive;
      gloomrootBoss.attackClock = 3;
      gloomrootBoss.nextAttack = "sweep";
      gloomrootBoss.sweep = null;
      gloomrootBlooms.length = 0;
      gloomrootBloomPatternIndex = 0;
      resetAbilityTimeline("gloomroot");
      gloomrootBoss.hpLossFlashFrom = shared.hp;
      gloomrootBoss.hpLossFlashTimer = 0;
    } else if (gloomrootWasAlive && !shared.alive) {
      gloomrootWasAlive = false;
      gloomrootBoss.dead = true;
      gloomrootBoss.sweep = null;
      gloomrootBlooms.length = 0;
      pendingGloomrootResultEncounter = shared.encounter;
      spawnBurst(gloomrootBoss.x, gloomrootBoss.y, "#43d9e6", 96, 290);
    } else if (!gloomrootWasAlive && shared.alive) {
      gloomrootWasAlive = true;
      gloomrootBoss.dead = false;
      gloomrootBoss.attackClock = 3;
      gloomrootBoss.nextAttack = "sweep";
      gloomrootBloomPatternIndex = 0;
      resetAbilityTimeline("gloomroot");
    } else if (shared.alive && shared.hp < previousHp) {
      gloomrootBoss.hpLossFlashFrom = gloomrootBoss.hpLossFlashTimer > 0
        ? Math.max(gloomrootBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      gloomrootBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      gloomrootBoss.hpLossFlashFrom = shared.hp;
      gloomrootBoss.hpLossFlashTimer = 0;
    }
    gloomrootBoss.encounter = shared.encounter;
    gloomrootBoss.maxHp = shared.maxHp;
    gloomrootBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsInfernal()) {
      const result = getGloomrootResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedGloomrootEncounters.add(String(result.encounter));
        showGloomrootResult(result);
      }
    }
    if (pendingGloomrootResultEncounter !== null) {
      const result = getGloomrootResult();
      if (result?.encounter === pendingGloomrootResultEncounter) showGloomrootResult(result);
    }
  }

  function syncTidewyrmState() {
    const shared = getTidewyrmBoss();
    if (!shared) return;
    const initialized = observedTidewyrmEncounter !== null;
    const encounterChanged = initialized && observedTidewyrmEncounter !== shared.encounter;
    const previousHp = tidewyrmBoss.hp;
    if (!initialized || encounterChanged) {
      observedTidewyrmEncounter = shared.encounter;
      tidewyrmWasAlive = shared.alive;
      tidewyrmBoss.dead = !shared.alive;
      tidewyrmBoss.attackClock = 3;
      tidewyrmBoss.nextAttack = "surge";
      tidewyrmBoss.surge = null;
      tidewyrmWhirlpools.length = 0;
      tidewyrmWhirlpoolPatternIndex = 0;
      resetAbilityTimeline("tidewyrm");
      tidewyrmBoss.hpLossFlashFrom = shared.hp;
      tidewyrmBoss.hpLossFlashTimer = 0;
    } else if (tidewyrmWasAlive && !shared.alive) {
      tidewyrmWasAlive = false;
      tidewyrmBoss.dead = true;
      tidewyrmBoss.surge = null;
      tidewyrmWhirlpools.length = 0;
      pendingTidewyrmResultEncounter = shared.encounter;
      spawnBurst(tidewyrmBoss.x, tidewyrmBoss.y, "#40d9f2", 104, 310);
    } else if (!tidewyrmWasAlive && shared.alive) {
      tidewyrmWasAlive = true;
      tidewyrmBoss.dead = false;
      tidewyrmBoss.attackClock = 3;
      tidewyrmBoss.nextAttack = "surge";
      tidewyrmWhirlpoolPatternIndex = 0;
      resetAbilityTimeline("tidewyrm");
    } else if (shared.alive && shared.hp < previousHp) {
      tidewyrmBoss.hpLossFlashFrom = tidewyrmBoss.hpLossFlashTimer > 0
        ? Math.max(tidewyrmBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      tidewyrmBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      tidewyrmBoss.hpLossFlashFrom = shared.hp;
      tidewyrmBoss.hpLossFlashTimer = 0;
    }
    tidewyrmBoss.encounter = shared.encounter;
    tidewyrmBoss.maxHp = shared.maxHp;
    tidewyrmBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsWater()) {
      const result = getTidewyrmResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedTidewyrmEncounters.add(String(result.encounter));
        showTidewyrmResult(result);
      }
    }
    if (pendingTidewyrmResultEncounter !== null) {
      const result = getTidewyrmResult();
      if (result?.encounter === pendingTidewyrmResultEncounter) showTidewyrmResult(result);
    }
  }

  function syncKoiShogunState() {
    const shared = getKoiShogunBoss();
    if (!shared) return;
    const initialized = observedKoiShogunEncounter !== null;
    const encounterChanged = initialized && observedKoiShogunEncounter !== shared.encounter;
    const previousHp = koiShogunBoss.hp;
    if (!initialized || encounterChanged) {
      observedKoiShogunEncounter = shared.encounter;
      koiShogunWasAlive = shared.alive;
      koiShogunBoss.dead = !shared.alive;
      koiShogunBoss.attackClock = 3;
      koiShogunBoss.nextAttack = "slash";
      koiShogunBoss.slash = null;
      koiShogunWhirlpools.length = 0;
      koiShogunWhirlpoolPatternIndex = 0;
      resetAbilityTimeline("koiShogun");
      koiShogunBoss.hpLossFlashFrom = shared.hp;
      koiShogunBoss.hpLossFlashTimer = 0;
    } else if (koiShogunWasAlive && !shared.alive) {
      koiShogunWasAlive = false;
      koiShogunBoss.dead = true;
      koiShogunBoss.slash = null;
      koiShogunWhirlpools.length = 0;
      pendingKoiShogunResultEncounter = shared.encounter;
      spawnBurst(koiShogunBoss.x, koiShogunBoss.y, "#f0a044", 112, 320);
    } else if (!koiShogunWasAlive && shared.alive) {
      koiShogunWasAlive = true;
      koiShogunBoss.dead = false;
      koiShogunBoss.attackClock = 3;
      koiShogunBoss.nextAttack = "slash";
      koiShogunWhirlpoolPatternIndex = 0;
      resetAbilityTimeline("koiShogun");
    } else if (shared.alive && shared.hp < previousHp) {
      koiShogunBoss.hpLossFlashFrom = koiShogunBoss.hpLossFlashTimer > 0
        ? Math.max(koiShogunBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      koiShogunBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      koiShogunBoss.hpLossFlashFrom = shared.hp;
      koiShogunBoss.hpLossFlashTimer = 0;
    }
    koiShogunBoss.encounter = shared.encounter;
    koiShogunBoss.maxHp = shared.maxHp;
    koiShogunBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsSamurai()) {
      const result = getKoiShogunResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedKoiShogunEncounters.add(String(result.encounter));
        showKoiShogunResult(result);
      }
    }
    if (pendingKoiShogunResultEncounter !== null) {
      const result = getKoiShogunResult();
      if (result?.encounter === pendingKoiShogunResultEncounter) showKoiShogunResult(result);
    }
  }

  function syncTempestKirinState() {
    const shared = getTempestKirinBoss();
    if (!shared) return;
    const initialized = observedTempestKirinEncounter !== null;
    const encounterChanged = initialized && observedTempestKirinEncounter !== shared.encounter;
    const previousHp = tempestKirinBoss.hp;
    if (!initialized || encounterChanged) {
      observedTempestKirinEncounter = shared.encounter;
      tempestKirinWasAlive = shared.alive;
      tempestKirinBoss.dead = !shared.alive;
      tempestKirinBoss.attackClock = 3;
      tempestKirinBoss.nextAttack = "charge";
      tempestKirinBoss.charge = null;
      tempestKirinThunderbolts.length = 0;
      tempestKirinThunderPatternIndex = 0;
      resetAbilityTimeline("tempestKirin");
      tempestKirinBoss.hpLossFlashFrom = shared.hp;
      tempestKirinBoss.hpLossFlashTimer = 0;
    } else if (tempestKirinWasAlive && !shared.alive) {
      tempestKirinWasAlive = false;
      tempestKirinBoss.dead = true;
      tempestKirinBoss.charge = null;
      tempestKirinThunderbolts.length = 0;
      pendingTempestKirinResultEncounter = shared.encounter;
      spawnBurst(tempestKirinBoss.x, tempestKirinBoss.y, "#9fe9ff", 120, 340);
    } else if (!tempestKirinWasAlive && shared.alive) {
      tempestKirinWasAlive = true;
      tempestKirinBoss.dead = false;
      tempestKirinBoss.attackClock = 3;
      tempestKirinBoss.nextAttack = "charge";
      tempestKirinThunderPatternIndex = 0;
      resetAbilityTimeline("tempestKirin");
    } else if (shared.alive && shared.hp < previousHp) {
      tempestKirinBoss.hpLossFlashFrom = tempestKirinBoss.hpLossFlashTimer > 0
        ? Math.max(tempestKirinBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      tempestKirinBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      tempestKirinBoss.hpLossFlashFrom = shared.hp;
      tempestKirinBoss.hpLossFlashTimer = 0;
    }
    tempestKirinBoss.encounter = shared.encounter;
    tempestKirinBoss.maxHp = shared.maxHp;
    tempestKirinBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsCloudspire()) {
      const result = getTempestKirinResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedTempestKirinEncounters.add(String(result.encounter));
        showTempestKirinResult(result);
      }
    }
    if (pendingTempestKirinResultEncounter !== null) {
      const result = getTempestKirinResult();
      if (result?.encounter === pendingTempestKirinResultEncounter) showTempestKirinResult(result);
    }
  }

function syncMiremawState() {
    const shared = getMiremawBoss();
    if (!shared) return;
    const initialized = observedMiremawEncounter !== null;
    const encounterChanged = initialized && observedMiremawEncounter !== shared.encounter;
    const previousHp = miremawBoss.hp;
    if (!initialized || encounterChanged) {
      observedMiremawEncounter = shared.encounter;
      miremawWasAlive = shared.alive;
      miremawBoss.dead = !shared.alive;
      miremawBoss.attackClock = 3;
      miremawBoss.nextAttack = "tongue";
      miremawBoss.tongue = null;
      miremawBogBursts.length = 0;
      miremawBogBurstPatternIndex = 0;
      resetAbilityTimeline("miremaw");
      miremawBoss.hpLossFlashFrom = shared.hp;
      miremawBoss.hpLossFlashTimer = 0;
    } else if (miremawWasAlive && !shared.alive) {
      miremawWasAlive = false;
      miremawBoss.dead = true;
      miremawBoss.tongue = null;
      miremawBogBursts.length = 0;
      pendingMiremawResultEncounter = shared.encounter;
      spawnBurst(miremawBoss.x, miremawBoss.y, "#71efc1", 120, 340);
    } else if (!miremawWasAlive && shared.alive) {
      miremawWasAlive = true;
      miremawBoss.dead = false;
      miremawBoss.attackClock = 3;
      miremawBoss.nextAttack = "tongue";
      miremawBogBurstPatternIndex = 0;
      resetAbilityTimeline("miremaw");
    } else if (shared.alive && shared.hp < previousHp) {
      miremawBoss.hpLossFlashFrom = miremawBoss.hpLossFlashTimer > 0
        ? Math.max(miremawBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      miremawBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      miremawBoss.hpLossFlashFrom = shared.hp;
      miremawBoss.hpLossFlashTimer = 0;
    }
    miremawBoss.encounter = shared.encounter;
    miremawBoss.maxHp = shared.maxHp;
    miremawBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsMoonfen()) {
      const result = getMiremawResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedMiremawEncounters.add(String(result.encounter));
        showMiremawResult(result);
      }
    }
    if (pendingMiremawResultEncounter !== null) {
      const result = getMiremawResult();
      if (result?.encounter === pendingMiremawResultEncounter) showMiremawResult(result);
    }
  }


  function syncDragonState() {
    const shared = getDragonBoss();
    if (!shared) return;
    const initialized = observedDragonEncounter !== null;
    const encounterChanged = initialized && observedDragonEncounter !== shared.encounter;
    const previousHp = boss.hp;
    if (!initialized) {
      observedDragonEncounter = shared.encounter;
      dragonWasAlive = shared.alive;
      boss.dead = !shared.alive;
      if (boss.dead) { boss.cone = null; bossRain.length = 0; }
      dragonRainPatternIndex = 0;
      resetAbilityTimeline("dragon");
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (encounterChanged) {
      observedDragonEncounter = shared.encounter;
      dragonWasAlive = shared.alive;
      pendingDragonResultEncounter = null;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      dragonRainPatternIndex = 0;
      resetAbilityTimeline("dragon");
      boss.dead = !shared.alive;
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (dragonWasAlive && !shared.alive) {
      pendingDragonResultEncounter = shared.encounter;
      killBoss();
      dragonWasAlive = false;
    } else if (!dragonWasAlive && shared.alive) {
      dragonWasAlive = true;
      boss.dead = false;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      dragonRainPatternIndex = 0;
      resetAbilityTimeline("dragon");
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (shared.alive && shared.hp < previousHp) {
      boss.hpLossFlashFrom = boss.hpLossFlashTimer > 0 ? Math.max(boss.hpLossFlashFrom, previousHp) : previousHp;
      boss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    }
    boss.encounter = shared.encounter;
    boss.maxHp = shared.maxHp;
    boss.hp = shared.hp;
    if (!shared.alive) boss.dead = true;
    if (pendingDragonResultEncounter !== null && shownDragonResultEncounter !== pendingDragonResultEncounter) {
      const result = getDragonResult();
      if (result?.encounter === pendingDragonResultEncounter) showDragonResult(result);
    }
  }

  function startBossCone(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    boss.cone = {
      angle: Math.atan2(target.y - boss.y, target.x - boss.x),
      windup: Math.max(0, DRAGON_CONE_WINDUP - elapsed),
      timer: Math.max(0, DRAGON_CONE_DURATION - Math.max(0, elapsed - DRAGON_CONE_WINDUP)),
      duration: DRAGON_CONE_DURATION,
      hitPlayer: false,
    };
    boss.nextAttack = "rain";
  }

  function startBossRain(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? dragonRainPatternIndex;
    for (let i = 0; i < 8; i++) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "dragon",
        encounter: boss.encounter,
        pattern: "rain",
        patternIndex,
        hazardIndex: i,
        hazardCount: 8,
        angleJitter: .25,
        minimumRadius: 24,
        maximumRadius: BOSS_RAIN_RANGE,
      });
      const maxTimer = .8 + i * .14;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      bossRain.push({ x: clamp(target.x + Math.cos(angle) * radius, 60, WORLD.w - 60), y: clamp(target.y + Math.sin(angle) * radius, 60, WORLD.h - 60), timer, maxTimer, r: 52 });
    }
    if (deterministicPatternIndex === undefined) dragonRainPatternIndex += 1;
    boss.attackClock = 4.8;
    boss.nextAttack = "cone";
  }

  function updateBoss(dt: number) {
    boss.hpLossFlashTimer = Math.max(0, boss.hpLossFlashTimer - dt);
    boss.contactDamageClock = Math.max(0, boss.contactDamageClock - dt);
    if (boss.dead) return;
    boss.hurt = Math.max(0, boss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "dragon",
      encounter: boss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("dragon", boss.encounter, attackIndex, boss.x, boss.y, BOSS_AGGRO_RANGE),
      clear: () => { boss.cone = null; bossRain.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "cone") startBossCone(elapsedSeconds, target);
        else if (ability === "rain") startBossRain(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { boss.attackClock = seconds; },
    });
    for (let i = bossRain.length - 1; i >= 0; i--) {
      const strike = bossRain[i];
      strike.timer -= dt;
      if (strike.timer <= 0) {
        const dx = player.x - strike.x;
        const dy = player.y - strike.y;
        if (dx * dx + dy * dy <= strike.r * strike.r) damagePlayer(DRAGON_RAIN_DAMAGE);
        spawnBurst(strike.x, strike.y, "#ff5d32", 22, 170);
        bossRain.splice(i, 1);
      }
    }
    if (boss.cone) {
      const cone = boss.cone;
      if (cone.windup > 0) { cone.windup -= dt; return; }
      const previousProgress = clamp(1 - cone.timer / cone.duration, 0, 1);
      cone.timer -= dt;
      const progress = clamp(1 - cone.timer / cone.duration, 0, 1);
      const minRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * previousProgress;
      const maxRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * progress;
      if (!cone.hitPlayer) {
        const dx = player.x - boss.x;
        const dy = player.y - boss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(Math.sin(Math.atan2(dy, dx) - cone.angle), Math.cos(Math.atan2(dy, dx) - cone.angle));
        if (distance >= minRadius - 34 && distance <= maxRadius + 34 && Math.abs(angleDelta) <= BOSS_CONE_HALF_ANGLE) {
          cone.hitPlayer = true;
          damagePlayer(DRAGON_CONE_DAMAGE);
          queueBossAreaKnockback(boss.x, boss.y, BOSS_CONE_RANGE, boss.r);
          spawnBurst(player.x, player.y, "#ffb14a", 18, 165);
        }
      }
      if (cone.timer <= 0) {
        spawnBurst(boss.x + Math.cos(cone.angle) * BOSS_CONE_RANGE, boss.y + Math.sin(cone.angle) * BOSS_CONE_RANGE, "#ff9b3d", 28, 210);
        boss.cone = null;
        boss.attackClock = 2.8;
      }
      return;
    }
    if (sharedTimeline) return;
    if (boss.attackClock > 0) { boss.attackClock -= dt; return; }
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    if (dx * dx + dy * dy > BOSS_AGGRO_RANGE * BOSS_AGGRO_RANGE) return;
    if (boss.nextAttack === "cone") startBossCone(); else startBossRain();
  }

  function startSpiderWeb(elapsedSeconds = 0) {
    spiderBoss.web = {
      timer: Math.max(0, 1.15 - Math.max(0, elapsedSeconds)),
      duration: 1.15,
      hitPlayer: false,
    };
    spiderBoss.nextAttack = "venom";
  }

  function startSpiderVenom(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? spiderVenomPatternIndex;
    for (let index = 0; index < 6; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "spider",
        encounter: spiderBoss.encounter,
        pattern: "venom",
        patternIndex,
        hazardIndex: index,
        hazardCount: 6,
        angleJitter: .25,
        minimumRadius: 15,
        maximumRadius: 125,
      });
      const maxTimer = .9 + index * .13;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      spiderVenom.push({
        x: clamp(target.x + Math.cos(angle) * radius, 60, WORLD.w - 60),
        y: clamp(target.y + Math.sin(angle) * radius, 60, WORLD.h - 60),
        timer,
        maxTimer,
        r: 58,
      });
    }
    if (deterministicPatternIndex === undefined) spiderVenomPatternIndex += 1;
    spiderBoss.attackClock = 4.2;
    spiderBoss.nextAttack = "web";
  }

  function updateSpiderBoss(dt: number) {
    spiderBoss.hpLossFlashTimer = Math.max(0, spiderBoss.hpLossFlashTimer - dt);
    spiderBoss.contactDamageClock = Math.max(0, spiderBoss.contactDamageClock - dt);
    if (spiderBoss.dead) return;
    const sharedTimeline = syncAbilityTimeline({
      kind: "spider",
      encounter: spiderBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("spider", spiderBoss.encounter, attackIndex, spiderBoss.x, spiderBoss.y, SPIDER_AGGRO_RANGE),
      clear: () => { spiderBoss.web = null; spiderVenom.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "web") startSpiderWeb(elapsedSeconds);
        else if (ability === "venom") startSpiderVenom(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { spiderBoss.attackClock = seconds; },
    });
    for (let i = spiderVenom.length - 1; i >= 0; i--) {
      const pool = spiderVenom[i];
      pool.timer -= dt;
      if (pool.timer <= 0) {
        const dx = player.x - pool.x;
        const dy = player.y - pool.y;
        if (dx * dx + dy * dy <= pool.r * pool.r) damagePlayer(SPIDER_VENOM_DAMAGE);
        spawnBurst(pool.x, pool.y, "#89e255", 22, 150);
        spiderVenom.splice(i, 1);
      }
    }
    if (spiderBoss.web) {
      const web = spiderBoss.web;
      const previousProgress = clamp(1 - web.timer / web.duration, 0, 1);
      web.timer -= dt;
      const progress = clamp(1 - web.timer / web.duration, 0, 1);
      const minRadius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * previousProgress;
      const maxRadius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * progress;
      const distance = Math.hypot(player.x - spiderBoss.x, player.y - spiderBoss.y);
      if (!web.hitPlayer && distance >= minRadius - 30 && distance <= maxRadius + 30) {
        web.hitPlayer = true;
        damagePlayer(SPIDER_WEB_DAMAGE);
        queueBossAreaKnockback(spiderBoss.x, spiderBoss.y, SPIDER_WEB_RANGE, spiderBoss.r);
      }
      if (web.timer <= 0) { spiderBoss.web = null; spiderBoss.attackClock = 2.5; }
      return;
    }
    if (sharedTimeline) return;
    spiderBoss.attackClock -= dt;
    if (spiderBoss.attackClock > 0) return;
    const dx = player.x - spiderBoss.x;
    const dy = player.y - spiderBoss.y;
    if (dx * dx + dy * dy > SPIDER_AGGRO_RANGE * SPIDER_AGGRO_RANGE) return;
    if (spiderBoss.nextAttack === "web") startSpiderWeb();
    else startSpiderVenom();
  }

  function startFrostclawRoar(elapsedSeconds = 0) {
    const elapsed = Math.max(0, elapsedSeconds);
    frostclawBoss.roar = {
      windup: Math.max(0, FROSTCLAW_ROAR_WINDUP - elapsed),
      timer: Math.max(0, FROSTCLAW_ROAR_DURATION - Math.max(0, elapsed - FROSTCLAW_ROAR_WINDUP)),
      duration: FROSTCLAW_ROAR_DURATION,
      hitPlayer: false,
    };
    frostclawBoss.nextAttack = "icefall";
  }

  function startFrostclawIcefall(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? frostclawIcefallPatternIndex;
    for (let index = 0; index < 9; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "frostclaw",
        encounter: frostclawBoss.encounter,
        pattern: "icefall",
        patternIndex,
        hazardIndex: index,
        hazardCount: 9,
        angleJitter: .32,
        minimumRadius: 42,
        maximumRadius: 185,
        centerFirst: true,
      });
      const maxTimer = .8 + index * .13;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      frostclawIcefalls.push({
        x: clamp(target.x + Math.cos(angle) * radius, 70, WORLD.w - 70),
        y: clamp(target.y + Math.sin(angle) * radius, 70, WORLD.h - 70),
        r: 66,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) frostclawIcefallPatternIndex += 1;
    frostclawBoss.attackClock = 4.8;
    frostclawBoss.nextAttack = "rift";
  }

  function startFrostclawRift(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    frostclawBoss.rift = {
      angle: Math.atan2(target.y - frostclawBoss.y, target.x - frostclawBoss.x),
      windup: Math.max(0, FROSTCLAW_RIFT_WINDUP - elapsed),
      timer: Math.max(0, FROSTCLAW_RIFT_DURATION - Math.max(0, elapsed - FROSTCLAW_RIFT_WINDUP)),
      duration: FROSTCLAW_RIFT_DURATION,
      hitPlayer: false,
    };
    frostclawBoss.nextAttack = "roar";
  }

  function updateFrostclawBoss(dt: number) {
    frostclawBoss.hpLossFlashTimer = Math.max(0, frostclawBoss.hpLossFlashTimer - dt);
    frostclawBoss.contactDamageClock = Math.max(0, frostclawBoss.contactDamageClock - dt);
    if (frostclawBoss.dead) return;
    frostclawBoss.hurt = Math.max(0, frostclawBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "frostclaw",
      encounter: frostclawBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("frostclaw", frostclawBoss.encounter, attackIndex, frostclawBoss.x, frostclawBoss.y, FROSTCLAW_AGGRO_RANGE),
      clear: () => {
        frostclawBoss.roar = null;
        frostclawBoss.rift = null;
        frostclawIcefalls.length = 0;
      },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "roar") startFrostclawRoar(elapsedSeconds);
        else if (ability === "icefall") startFrostclawIcefall(elapsedSeconds, attackIndex, target);
        else if (ability === "rift") startFrostclawRift(elapsedSeconds, target);
      },
      setAttackClock: (seconds) => { frostclawBoss.attackClock = seconds; },
    });

    for (let index = frostclawIcefalls.length - 1; index >= 0; index -= 1) {
      const strike = frostclawIcefalls[index];
      strike.timer -= dt;
      if (strike.timer > 0) continue;
      const dx = player.x - strike.x;
      const dy = player.y - strike.y;
      if (dx * dx + dy * dy <= strike.r * strike.r) damagePlayer(FROSTCLAW_ICEFALL_DAMAGE);
      spawnBurst(strike.x, strike.y, "#a9f5ff", 28, 190);
      frostclawIcefalls.splice(index, 1);
    }

    if (frostclawBoss.roar) {
      const roar = frostclawBoss.roar;
      if (roar.windup > 0) {
        roar.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - roar.timer / roar.duration, 0, 1);
      roar.timer -= dt;
      const progress = clamp(1 - roar.timer / roar.duration, 0, 1);
      const minRadius = frostclawBoss.r + (FROSTCLAW_ROAR_RANGE - frostclawBoss.r) * previousProgress;
      const maxRadius = frostclawBoss.r + (FROSTCLAW_ROAR_RANGE - frostclawBoss.r) * progress;
      if (!roar.hitPlayer) {
        const dx = player.x - frostclawBoss.x;
        const dy = player.y - frostclawBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance >= minRadius - 38 && distance <= maxRadius + 38) {
          roar.hitPlayer = true;
          damagePlayer(FROSTCLAW_ROAR_DAMAGE);
          queueBossAreaKnockback(frostclawBoss.x, frostclawBoss.y, FROSTCLAW_ROAR_RANGE, frostclawBoss.r);
          spawnBurst(player.x, player.y, "#d8fbff", 24, 210);
        }
      }
      if (roar.timer <= 0) {
        frostclawBoss.roar = null;
        frostclawBoss.attackClock = 2.6;
      }
      return;
    }

    if (frostclawBoss.rift) {
      const rift = frostclawBoss.rift;
      if (rift.windup > 0) {
        rift.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - rift.timer / rift.duration, 0, 1);
      rift.timer -= dt;
      const progress = clamp(1 - rift.timer / rift.duration, 0, 1);
      const minRadius = frostclawBoss.r + (FROSTCLAW_RIFT_RANGE - frostclawBoss.r) * previousProgress;
      const maxRadius = frostclawBoss.r + (FROSTCLAW_RIFT_RANGE - frostclawBoss.r) * progress;
      if (!rift.hitPlayer) {
        const dx = player.x - frostclawBoss.x;
        const dy = player.y - frostclawBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const playerAngle = Math.atan2(dy, dx);
        const inRift = [-.28, 0, .28].some((offset) => {
          const angleDelta = Math.atan2(
            Math.sin(playerAngle - rift.angle - offset),
            Math.cos(playerAngle - rift.angle - offset),
          );
          return Math.abs(angleDelta) <= FROSTCLAW_RIFT_HALF_ANGLE + 24 / distance;
        });
        if (inRift && distance >= minRadius - 32 && distance <= maxRadius + 32) {
          rift.hitPlayer = true;
          damagePlayer(FROSTCLAW_RIFT_DAMAGE);
          spawnBurst(player.x, player.y, "#71dfff", 26, 220);
        }
      }
      if (rift.timer <= 0) {
        frostclawBoss.rift = null;
        frostclawBoss.attackClock = 2.9;
      }
      return;
    }

    if (sharedTimeline) return;
    frostclawBoss.attackClock -= dt;
    if (frostclawBoss.attackClock > 0) return;
    const dx = player.x - frostclawBoss.x;
    const dy = player.y - frostclawBoss.y;
    if (dx * dx + dy * dy > FROSTCLAW_AGGRO_RANGE * FROSTCLAW_AGGRO_RANGE) return;
    if (frostclawBoss.nextAttack === "roar") startFrostclawRoar();
    else if (frostclawBoss.nextAttack === "icefall") startFrostclawIcefall();
    else startFrostclawRift();
  }

  function startMagmaliskBite(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    magmaliskBoss.bite = {
      angle: Math.atan2(target.y - magmaliskBoss.y, target.x - magmaliskBoss.x),
      windup: Math.max(0, MAGMALISK_BITE_WINDUP - elapsed),
      timer: Math.max(0, MAGMALISK_BITE_DURATION - Math.max(0, elapsed - MAGMALISK_BITE_WINDUP)),
      duration: MAGMALISK_BITE_DURATION,
      hitPlayer: false,
    };
    magmaliskBoss.nextAttack = "eruption";
  }

  function startMagmaliskEruption(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? magmaliskEruptionPatternIndex;
    for (let index = 0; index < 11; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "magmalisk",
        encounter: magmaliskBoss.encounter,
        pattern: "eruption",
        patternIndex,
        hazardIndex: index,
        hazardCount: 11,
        angleJitter: .3,
        minimumRadius: 48,
        maximumRadius: 230,
        centerFirst: true,
      });
      const maxTimer = .8 + index * .11;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      magmaliskEruptions.push({
        x: clamp(target.x + Math.cos(angle) * radius, 72, WORLD.w - 72),
        y: clamp(target.y + Math.sin(angle) * radius, 72, WORLD.h - 72),
        r: 72,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) magmaliskEruptionPatternIndex += 1;
    magmaliskBoss.attackClock = 3.1;
    magmaliskBoss.nextAttack = "bite";
  }

  function updateMagmaliskBoss(dt: number) {
    magmaliskBoss.hpLossFlashTimer = Math.max(0, magmaliskBoss.hpLossFlashTimer - dt);
    magmaliskBoss.contactDamageClock = Math.max(0, magmaliskBoss.contactDamageClock - dt);
    if (magmaliskBoss.dead) return;
    magmaliskBoss.hurt = Math.max(0, magmaliskBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "magmalisk",
      encounter: magmaliskBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("magmalisk", magmaliskBoss.encounter, attackIndex, magmaliskBoss.x, magmaliskBoss.y, MAGMALISK_AGGRO_RANGE),
      clear: () => { magmaliskBoss.bite = null; magmaliskEruptions.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "bite") startMagmaliskBite(elapsedSeconds, target);
        else if (ability === "eruption") startMagmaliskEruption(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { magmaliskBoss.attackClock = seconds; },
    });

    for (let index = magmaliskEruptions.length - 1; index >= 0; index -= 1) {
      const eruption = magmaliskEruptions[index];
      eruption.timer -= dt;
      if (eruption.timer > 0) continue;
      const dx = player.x - eruption.x;
      const dy = player.y - eruption.y;
      if (dx * dx + dy * dy <= eruption.r * eruption.r) damagePlayer(MAGMALISK_ERUPTION_DAMAGE);
      spawnBurst(eruption.x, eruption.y, "#ff7a24", 32, 220);
      magmaliskEruptions.splice(index, 1);
    }
    if (magmaliskEruptions.length > 0) return;

    if (magmaliskBoss.bite) {
      const bite = magmaliskBoss.bite;
      if (bite.windup > 0) {
        bite.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - bite.timer / bite.duration, 0, 1);
      bite.timer -= dt;
      const progress = clamp(1 - bite.timer / bite.duration, 0, 1);
      const minRadius = magmaliskBoss.r + (MAGMALISK_BITE_RANGE - magmaliskBoss.r) * previousProgress;
      const maxRadius = magmaliskBoss.r + (MAGMALISK_BITE_RANGE - magmaliskBoss.r) * progress;
      if (!bite.hitPlayer) {
        const dx = player.x - magmaliskBoss.x;
        const dy = player.y - magmaliskBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - bite.angle),
          Math.cos(Math.atan2(dy, dx) - bite.angle),
        );
        if (distance >= minRadius - 38 && distance <= maxRadius + 38 && Math.abs(angleDelta) <= MAGMALISK_BITE_HALF_ANGLE) {
          bite.hitPlayer = true;
          damagePlayer(MAGMALISK_BITE_DAMAGE);
          queueBossAreaKnockback(magmaliskBoss.x, magmaliskBoss.y, MAGMALISK_BITE_RANGE, magmaliskBoss.r);
          spawnBurst(player.x, player.y, "#ffb13b", 28, 230);
        }
      }
      if (bite.timer <= 0) {
        magmaliskBoss.bite = null;
        magmaliskBoss.attackClock = 2.4;
      }
      return;
    }

    if (sharedTimeline) return;
    magmaliskBoss.attackClock -= dt;
    if (magmaliskBoss.attackClock > 0) return;
    const dx = player.x - magmaliskBoss.x;
    const dy = player.y - magmaliskBoss.y;
    if (dx * dx + dy * dy > MAGMALISK_AGGRO_RANGE * MAGMALISK_AGGRO_RANGE) return;
    if (magmaliskBoss.nextAttack === "bite") startMagmaliskBite();
    else startMagmaliskEruption();
  }

  function startGloomrootSweep(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    gloomrootBoss.sweep = {
      angle: Math.atan2(target.y - gloomrootBoss.y, target.x - gloomrootBoss.x),
      windup: Math.max(0, GLOOMROOT_SWEEP_WINDUP - elapsed),
      timer: Math.max(0, GLOOMROOT_SWEEP_DURATION - Math.max(0, elapsed - GLOOMROOT_SWEEP_WINDUP)),
      duration: GLOOMROOT_SWEEP_DURATION,
      hitPlayer: false,
    };
    gloomrootBoss.nextAttack = "bloom";
  }

  function startGloomrootBloom(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? gloomrootBloomPatternIndex;
    for (let index = 0; index < 12; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "gloomroot",
        encounter: gloomrootBoss.encounter,
        pattern: "bloom",
        patternIndex,
        hazardIndex: index,
        hazardCount: 12,
        angleJitter: .28,
        minimumRadius: 55,
        maximumRadius: 255,
        centerFirst: true,
      });
      const maxTimer = .9 + index * .1;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      gloomrootBlooms.push({
        x: clamp(target.x + Math.cos(angle) * radius, 74, WORLD.w - 74),
        y: clamp(target.y + Math.sin(angle) * radius, 74, WORLD.h - 74),
        r: 74,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) gloomrootBloomPatternIndex += 1;
    gloomrootBoss.attackClock = 3.2;
    gloomrootBoss.nextAttack = "sweep";
  }

  function updateGloomrootBoss(dt: number) {
    gloomrootBoss.hpLossFlashTimer = Math.max(0, gloomrootBoss.hpLossFlashTimer - dt);
    gloomrootBoss.contactDamageClock = Math.max(0, gloomrootBoss.contactDamageClock - dt);
    if (gloomrootBoss.dead) return;
    gloomrootBoss.hurt = Math.max(0, gloomrootBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "gloomroot",
      encounter: gloomrootBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("gloomroot", gloomrootBoss.encounter, attackIndex, gloomrootBoss.x, gloomrootBoss.y, GLOOMROOT_AGGRO_RANGE),
      clear: () => { gloomrootBoss.sweep = null; gloomrootBlooms.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "sweep") startGloomrootSweep(elapsedSeconds, target);
        else if (ability === "bloom") startGloomrootBloom(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { gloomrootBoss.attackClock = seconds; },
    });

    for (let index = gloomrootBlooms.length - 1; index >= 0; index -= 1) {
      const bloom = gloomrootBlooms[index];
      bloom.timer -= dt;
      if (bloom.timer > 0) continue;
      const dx = player.x - bloom.x;
      const dy = player.y - bloom.y;
      if (dx * dx + dy * dy <= bloom.r * bloom.r) damagePlayer(GLOOMROOT_BLOOM_DAMAGE);
      spawnBurst(bloom.x, bloom.y, "#58e2ee", 34, 225);
      gloomrootBlooms.splice(index, 1);
    }
    if (gloomrootBlooms.length > 0) return;

    if (gloomrootBoss.sweep) {
      const sweep = gloomrootBoss.sweep;
      if (sweep.windup > 0) {
        sweep.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - sweep.timer / sweep.duration, 0, 1);
      sweep.timer -= dt;
      const progress = clamp(1 - sweep.timer / sweep.duration, 0, 1);
      const minRadius = gloomrootBoss.r + (GLOOMROOT_SWEEP_RANGE - gloomrootBoss.r) * previousProgress;
      const maxRadius = gloomrootBoss.r + (GLOOMROOT_SWEEP_RANGE - gloomrootBoss.r) * progress;
      if (!sweep.hitPlayer) {
        const dx = player.x - gloomrootBoss.x;
        const dy = player.y - gloomrootBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - sweep.angle),
          Math.cos(Math.atan2(dy, dx) - sweep.angle),
        );
        if (distance >= minRadius - 40 && distance <= maxRadius + 40 && Math.abs(angleDelta) <= GLOOMROOT_SWEEP_HALF_ANGLE) {
          sweep.hitPlayer = true;
          damagePlayer(GLOOMROOT_SWEEP_DAMAGE);
          queueBossAreaKnockback(gloomrootBoss.x, gloomrootBoss.y, GLOOMROOT_SWEEP_RANGE, gloomrootBoss.r);
          spawnBurst(player.x, player.y, "#8af4f3", 30, 235);
        }
      }
      if (sweep.timer <= 0) {
        gloomrootBoss.sweep = null;
        gloomrootBoss.attackClock = 2.5;
      }
      return;
    }

    if (sharedTimeline) return;
    gloomrootBoss.attackClock -= dt;
    if (gloomrootBoss.attackClock > 0) return;
    const dx = player.x - gloomrootBoss.x;
    const dy = player.y - gloomrootBoss.y;
    if (dx * dx + dy * dy > GLOOMROOT_AGGRO_RANGE * GLOOMROOT_AGGRO_RANGE) return;
    if (gloomrootBoss.nextAttack === "sweep") startGloomrootSweep();
    else startGloomrootBloom();
  }

  function startTidewyrmSurge(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    tidewyrmBoss.surge = {
      angle: Math.atan2(target.y - tidewyrmBoss.y, target.x - tidewyrmBoss.x),
      windup: Math.max(0, TIDEWYRM_SURGE_WINDUP - elapsed),
      timer: Math.max(0, TIDEWYRM_SURGE_DURATION - Math.max(0, elapsed - TIDEWYRM_SURGE_WINDUP)),
      duration: TIDEWYRM_SURGE_DURATION,
      hitPlayer: false,
    };
    tidewyrmBoss.nextAttack = "whirlpool";
  }

  function startTidewyrmWhirlpools(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? tidewyrmWhirlpoolPatternIndex;
    for (let index = 0; index < 11; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "tidewyrm",
        encounter: tidewyrmBoss.encounter,
        pattern: "whirlpool",
        patternIndex,
        hazardIndex: index,
        hazardCount: 11,
        angleJitter: .25,
        minimumRadius: 70,
        maximumRadius: 290,
        centerFirst: true,
      });
      const maxTimer = .85 + index * .11;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      tidewyrmWhirlpools.push({
        x: clamp(target.x + Math.cos(angle) * radius, 82, WORLD.w - 82),
        y: clamp(target.y + Math.sin(angle) * radius, 82, WORLD.h - 82),
        r: 82,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) tidewyrmWhirlpoolPatternIndex += 1;
    tidewyrmBoss.attackClock = 3.15;
    tidewyrmBoss.nextAttack = "surge";
  }

  function updateTidewyrmBoss(dt: number) {
    tidewyrmBoss.hpLossFlashTimer = Math.max(0, tidewyrmBoss.hpLossFlashTimer - dt);
    tidewyrmBoss.contactDamageClock = Math.max(0, tidewyrmBoss.contactDamageClock - dt);
    if (tidewyrmBoss.dead) return;
    tidewyrmBoss.hurt = Math.max(0, tidewyrmBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "tidewyrm",
      encounter: tidewyrmBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("tidewyrm", tidewyrmBoss.encounter, attackIndex, tidewyrmBoss.x, tidewyrmBoss.y, TIDEWYRM_AGGRO_RANGE),
      clear: () => { tidewyrmBoss.surge = null; tidewyrmWhirlpools.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "surge") startTidewyrmSurge(elapsedSeconds, target);
        else if (ability === "whirlpool") startTidewyrmWhirlpools(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { tidewyrmBoss.attackClock = seconds; },
    });

    for (let index = tidewyrmWhirlpools.length - 1; index >= 0; index -= 1) {
      const pool = tidewyrmWhirlpools[index];
      pool.timer -= dt;
      if (pool.timer > 0) continue;
      const dx = player.x - pool.x;
      const dy = player.y - pool.y;
      if (dx * dx + dy * dy <= pool.r * pool.r) damagePlayer(TIDEWYRM_WHIRLPOOL_DAMAGE);
      spawnBurst(pool.x, pool.y, "#5eeaff", 38, 245);
      tidewyrmWhirlpools.splice(index, 1);
    }
    if (tidewyrmWhirlpools.length > 0) return;

    if (tidewyrmBoss.surge) {
      const surge = tidewyrmBoss.surge;
      if (surge.windup > 0) {
        surge.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - surge.timer / surge.duration, 0, 1);
      surge.timer -= dt;
      const progress = clamp(1 - surge.timer / surge.duration, 0, 1);
      const minRadius = tidewyrmBoss.r + (TIDEWYRM_SURGE_RANGE - tidewyrmBoss.r) * previousProgress;
      const maxRadius = tidewyrmBoss.r + (TIDEWYRM_SURGE_RANGE - tidewyrmBoss.r) * progress;
      if (!surge.hitPlayer) {
        const dx = player.x - tidewyrmBoss.x;
        const dy = player.y - tidewyrmBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - surge.angle),
          Math.cos(Math.atan2(dy, dx) - surge.angle),
        );
        if (distance >= minRadius - 42 && distance <= maxRadius + 42 && Math.abs(angleDelta) <= TIDEWYRM_SURGE_HALF_ANGLE) {
          surge.hitPlayer = true;
          damagePlayer(TIDEWYRM_SURGE_DAMAGE);
          queueBossAreaKnockback(tidewyrmBoss.x, tidewyrmBoss.y, TIDEWYRM_SURGE_RANGE, tidewyrmBoss.r);
          spawnBurst(player.x, player.y, "#b7f7ff", 32, 250);
        }
      }
      if (surge.timer <= 0) {
        tidewyrmBoss.surge = null;
        tidewyrmBoss.attackClock = 2.45;
      }
      return;
    }

    if (sharedTimeline) return;
    tidewyrmBoss.attackClock -= dt;
    if (tidewyrmBoss.attackClock > 0) return;
    const dx = player.x - tidewyrmBoss.x;
    const dy = player.y - tidewyrmBoss.y;
    if (dx * dx + dy * dy > TIDEWYRM_AGGRO_RANGE * TIDEWYRM_AGGRO_RANGE) return;
    if (tidewyrmBoss.nextAttack === "surge") startTidewyrmSurge();
    else startTidewyrmWhirlpools();
  }

  function startKoiShogunSlash(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    koiShogunBoss.slash = {
      angle: Math.atan2(target.y - koiShogunBoss.y, target.x - koiShogunBoss.x),
      windup: Math.max(0, KOI_SHOGUN_SLASH_WINDUP - elapsed),
      timer: Math.max(0, KOI_SHOGUN_SLASH_DURATION - Math.max(0, elapsed - KOI_SHOGUN_SLASH_WINDUP)),
      duration: KOI_SHOGUN_SLASH_DURATION,
      hitPlayer: false,
    };
    koiShogunBoss.nextAttack = "whirlpool";
  }

  function startKoiShogunWhirlpools(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? koiShogunWhirlpoolPatternIndex;
    for (let index = 0; index < 11; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "koiShogun",
        encounter: koiShogunBoss.encounter,
        pattern: "whirlpool",
        patternIndex,
        hazardIndex: index,
        hazardCount: 11,
        angleJitter: .25,
        minimumRadius: 70,
        maximumRadius: 300,
        centerFirst: true,
      });
      const maxTimer = .82 + index * .105;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      koiShogunWhirlpools.push({
        x: clamp(target.x + Math.cos(angle) * radius, 82, WORLD.w - 82),
        y: clamp(target.y + Math.sin(angle) * radius, 82, WORLD.h - 82),
        r: 84,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) koiShogunWhirlpoolPatternIndex += 1;
    koiShogunBoss.attackClock = 3.1;
    koiShogunBoss.nextAttack = "slash";
  }

  function updateKoiShogunBoss(dt: number) {
    koiShogunBoss.hpLossFlashTimer = Math.max(0, koiShogunBoss.hpLossFlashTimer - dt);
    koiShogunBoss.contactDamageClock = Math.max(0, koiShogunBoss.contactDamageClock - dt);
    if (koiShogunBoss.dead) return;
    koiShogunBoss.hurt = Math.max(0, koiShogunBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "koiShogun",
      encounter: koiShogunBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("koiShogun", koiShogunBoss.encounter, attackIndex, koiShogunBoss.x, koiShogunBoss.y, KOI_SHOGUN_AGGRO_RANGE),
      clear: () => { koiShogunBoss.slash = null; koiShogunWhirlpools.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "slash") startKoiShogunSlash(elapsedSeconds, target);
        else if (ability === "whirlpool") startKoiShogunWhirlpools(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { koiShogunBoss.attackClock = seconds; },
    });

    for (let index = koiShogunWhirlpools.length - 1; index >= 0; index -= 1) {
      const pool = koiShogunWhirlpools[index];
      pool.timer -= dt;
      if (pool.timer > 0) continue;
      const dx = player.x - pool.x;
      const dy = player.y - pool.y;
      if (dx * dx + dy * dy <= pool.r * pool.r) damagePlayer(KOI_SHOGUN_WHIRLPOOL_DAMAGE);
      spawnBurst(pool.x, pool.y, "#71e9ff", 40, 250);
      koiShogunWhirlpools.splice(index, 1);
    }
    if (koiShogunWhirlpools.length > 0) return;

    if (koiShogunBoss.slash) {
      const slash = koiShogunBoss.slash;
      if (slash.windup > 0) {
        slash.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - slash.timer / slash.duration, 0, 1);
      slash.timer -= dt;
      const progress = clamp(1 - slash.timer / slash.duration, 0, 1);
      const minRadius = koiShogunBoss.r + (KOI_SHOGUN_SLASH_RANGE - koiShogunBoss.r) * previousProgress;
      const maxRadius = koiShogunBoss.r + (KOI_SHOGUN_SLASH_RANGE - koiShogunBoss.r) * progress;
      if (!slash.hitPlayer) {
        const dx = player.x - koiShogunBoss.x;
        const dy = player.y - koiShogunBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - slash.angle),
          Math.cos(Math.atan2(dy, dx) - slash.angle),
        );
        if (distance >= minRadius - 42 && distance <= maxRadius + 42 && Math.abs(angleDelta) <= KOI_SHOGUN_SLASH_HALF_ANGLE) {
          slash.hitPlayer = true;
          damagePlayer(KOI_SHOGUN_SLASH_DAMAGE);
          queueBossAreaKnockback(koiShogunBoss.x, koiShogunBoss.y, KOI_SHOGUN_SLASH_RANGE, koiShogunBoss.r);
          spawnBurst(player.x, player.y, "#d7fbff", 34, 255);
        }
      }
      if (slash.timer <= 0) {
        koiShogunBoss.slash = null;
        koiShogunBoss.attackClock = 2.4;
      }
      return;
    }

    if (sharedTimeline) return;
    koiShogunBoss.attackClock -= dt;
    if (koiShogunBoss.attackClock > 0) return;
    const dx = player.x - koiShogunBoss.x;
    const dy = player.y - koiShogunBoss.y;
    if (dx * dx + dy * dy > KOI_SHOGUN_AGGRO_RANGE * KOI_SHOGUN_AGGRO_RANGE) return;
    if (koiShogunBoss.nextAttack === "slash") startKoiShogunSlash();
    else startKoiShogunWhirlpools();
  }

  function startTempestKirinCharge(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    tempestKirinBoss.charge = {
      angle: Math.atan2(target.y - tempestKirinBoss.y, target.x - tempestKirinBoss.x),
      windup: Math.max(0, TEMPEST_KIRIN_CHARGE_WINDUP - elapsed),
      timer: Math.max(0, TEMPEST_KIRIN_CHARGE_DURATION - Math.max(0, elapsed - TEMPEST_KIRIN_CHARGE_WINDUP)),
      duration: TEMPEST_KIRIN_CHARGE_DURATION,
      hitPlayer: false,
    };
    tempestKirinBoss.nextAttack = "thunder";
  }

function startMiremawTongue(elapsedSeconds = 0, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const elapsed = Math.max(0, elapsedSeconds);
    miremawBoss.tongue = {
      angle: Math.atan2(target.y - miremawBoss.y, target.x - miremawBoss.x),
      windup: Math.max(0, MIREMAW_TONGUE_WINDUP - elapsed),
      timer: Math.max(0, MIREMAW_TONGUE_DURATION - Math.max(0, elapsed - MIREMAW_TONGUE_WINDUP)),
      duration: MIREMAW_TONGUE_DURATION,
      hitPlayer: false,
    };
    miremawBoss.nextAttack = "bogBurst";
  }


  function startTempestKirinThunder(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? tempestKirinThunderPatternIndex;
    for (let index = 0; index < 12; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "tempestKirin",
        encounter: tempestKirinBoss.encounter,
        pattern: "thunder",
        patternIndex,
        hazardIndex: index,
        hazardCount: 12,
        angleJitter: .22,
        minimumRadius: 64,
        maximumRadius: 320,
        centerFirst: true,
      });
      const maxTimer = .72 + index * .1;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      tempestKirinThunderbolts.push({
        x: clamp(target.x + Math.cos(angle) * radius, 82, WORLD.w - 82),
        y: clamp(target.y + Math.sin(angle) * radius, 82, WORLD.h - 82),
        r: 82,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) tempestKirinThunderPatternIndex += 1;
    tempestKirinBoss.attackClock = 3.1;
    tempestKirinBoss.nextAttack = "charge";
  }

function startMiremawBogBurst(elapsedSeconds = 0, deterministicPatternIndex?: number, target: Pick<BossAbilityTarget, "x" | "y"> = player) {
    const patternIndex = deterministicPatternIndex ?? miremawBogBurstPatternIndex;
    for (let index = 0; index < 10; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind: "miremaw",
        encounter: miremawBoss.encounter,
        pattern: "bogBurst",
        patternIndex,
        hazardIndex: index,
        hazardCount: 10,
        angleJitter: .28,
        minimumRadius: 72,
        maximumRadius: 340,
        centerFirst: true,
      });
      const maxTimer = .76 + index * .11;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      miremawBogBursts.push({
        x: clamp(target.x + Math.cos(angle) * radius, 82, WORLD.w - 82),
        y: clamp(target.y + Math.sin(angle) * radius, 82, WORLD.h - 82),
        r: 96,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) miremawBogBurstPatternIndex += 1;
    miremawBoss.attackClock = 3.1;
    miremawBoss.nextAttack = "tongue";
  }


  function updateTempestKirinBoss(dt: number) {
    tempestKirinBoss.hpLossFlashTimer = Math.max(0, tempestKirinBoss.hpLossFlashTimer - dt);
    tempestKirinBoss.contactDamageClock = Math.max(0, tempestKirinBoss.contactDamageClock - dt);
    if (tempestKirinBoss.dead) return;
    tempestKirinBoss.hurt = Math.max(0, tempestKirinBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "tempestKirin",
      encounter: tempestKirinBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("tempestKirin", tempestKirinBoss.encounter, attackIndex, tempestKirinBoss.x, tempestKirinBoss.y, TEMPEST_KIRIN_AGGRO_RANGE),
      clear: () => { tempestKirinBoss.charge = null; tempestKirinThunderbolts.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "charge") startTempestKirinCharge(elapsedSeconds, target);
        else if (ability === "thunder") startTempestKirinThunder(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { tempestKirinBoss.attackClock = seconds; },
    });

    for (let index = tempestKirinThunderbolts.length - 1; index >= 0; index -= 1) {
      const bolt = tempestKirinThunderbolts[index];
      bolt.timer -= dt;
      if (bolt.timer > 0) continue;
      const dx = player.x - bolt.x;
      const dy = player.y - bolt.y;
      if (dx * dx + dy * dy <= bolt.r * bolt.r) damagePlayer(TEMPEST_KIRIN_THUNDER_DAMAGE);
      spawnBurst(bolt.x, bolt.y, "#d6f7ff", 44, 270);
      tempestKirinThunderbolts.splice(index, 1);
    }
    if (tempestKirinThunderbolts.length > 0) return;

    if (tempestKirinBoss.charge) {
      const charge = tempestKirinBoss.charge;
      if (charge.windup > 0) {
        charge.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - charge.timer / charge.duration, 0, 1);
      charge.timer -= dt;
      const progress = clamp(1 - charge.timer / charge.duration, 0, 1);
      const minRadius = tempestKirinBoss.r + (TEMPEST_KIRIN_CHARGE_RANGE - tempestKirinBoss.r) * previousProgress;
      const maxRadius = tempestKirinBoss.r + (TEMPEST_KIRIN_CHARGE_RANGE - tempestKirinBoss.r) * progress;
      if (!charge.hitPlayer) {
        const dx = player.x - tempestKirinBoss.x;
        const dy = player.y - tempestKirinBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - charge.angle),
          Math.cos(Math.atan2(dy, dx) - charge.angle),
        );
        if (distance >= minRadius - 42 && distance <= maxRadius + 42 && Math.abs(angleDelta) <= TEMPEST_KIRIN_CHARGE_HALF_ANGLE) {
          charge.hitPlayer = true;
          damagePlayer(TEMPEST_KIRIN_CHARGE_DAMAGE);
          queueBossAreaKnockback(tempestKirinBoss.x, tempestKirinBoss.y, TEMPEST_KIRIN_CHARGE_RANGE, tempestKirinBoss.r);
          spawnBurst(player.x, player.y, "#f3fdff", 38, 280);
        }
      }
      if (charge.timer <= 0) {
        tempestKirinBoss.charge = null;
        tempestKirinBoss.attackClock = 2.35;
      }
      return;
    }

    if (sharedTimeline) return;
    tempestKirinBoss.attackClock -= dt;
    if (tempestKirinBoss.attackClock > 0) return;
    const dx = player.x - tempestKirinBoss.x;
    const dy = player.y - tempestKirinBoss.y;
    if (dx * dx + dy * dy > TEMPEST_KIRIN_AGGRO_RANGE * TEMPEST_KIRIN_AGGRO_RANGE) return;
    if (tempestKirinBoss.nextAttack === "charge") startTempestKirinCharge();
    else startTempestKirinThunder();
  }

function updateMiremawBoss(dt: number) {
    miremawBoss.hpLossFlashTimer = Math.max(0, miremawBoss.hpLossFlashTimer - dt);
    miremawBoss.contactDamageClock = Math.max(0, miremawBoss.contactDamageClock - dt);
    if (miremawBoss.dead) return;
    miremawBoss.hurt = Math.max(0, miremawBoss.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind: "miremaw",
      encounter: miremawBoss.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget("miremaw", miremawBoss.encounter, attackIndex, miremawBoss.x, miremawBoss.y, MIREMAW_AGGRO_RANGE),
      clear: () => { miremawBoss.tongue = null; miremawBogBursts.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === "tongue") startMiremawTongue(elapsedSeconds, target);
        else if (ability === "bogBurst") startMiremawBogBurst(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { miremawBoss.attackClock = seconds; },
    });

    for (let index = miremawBogBursts.length - 1; index >= 0; index -= 1) {
      const bolt = miremawBogBursts[index];
      bolt.timer -= dt;
      if (bolt.timer > 0) continue;
      const dx = player.x - bolt.x;
      const dy = player.y - bolt.y;
      if (dx * dx + dy * dy <= bolt.r * bolt.r) damagePlayer(MIREMAW_BOG_BURST_DAMAGE);
      spawnBurst(bolt.x, bolt.y, "#a9ffe0", 44, 270);
      miremawBogBursts.splice(index, 1);
    }
    if (miremawBogBursts.length > 0) return;

    if (miremawBoss.tongue) {
      const tongue = miremawBoss.tongue;
      if (tongue.windup > 0) {
        tongue.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - tongue.timer / tongue.duration, 0, 1);
      tongue.timer -= dt;
      const progress = clamp(1 - tongue.timer / tongue.duration, 0, 1);
      const minRadius = miremawBoss.r + (MIREMAW_TONGUE_RANGE - miremawBoss.r) * previousProgress;
      const maxRadius = miremawBoss.r + (MIREMAW_TONGUE_RANGE - miremawBoss.r) * progress;
      if (!tongue.hitPlayer) {
        const dx = player.x - miremawBoss.x;
        const dy = player.y - miremawBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - tongue.angle),
          Math.cos(Math.atan2(dy, dx) - tongue.angle),
        );
        if (distance >= minRadius - 42 && distance <= maxRadius + 42 && Math.abs(angleDelta) <= MIREMAW_TONGUE_HALF_ANGLE) {
          tongue.hitPlayer = true;
          damagePlayer(MIREMAW_TONGUE_DAMAGE);
          queueBossAreaKnockback(miremawBoss.x, miremawBoss.y, MIREMAW_TONGUE_RANGE, miremawBoss.r);
          spawnBurst(player.x, player.y, "#e1fff2", 38, 280);
        }
      }
      if (tongue.timer <= 0) {
        miremawBoss.tongue = null;
        miremawBoss.attackClock = 2.35;
      }
      return;
    }

    if (sharedTimeline) return;
    miremawBoss.attackClock -= dt;
    if (miremawBoss.attackClock > 0) return;
    const dx = player.x - miremawBoss.x;
    const dy = player.y - miremawBoss.y;
    if (dx * dx + dy * dy > MIREMAW_AGGRO_RANGE * MIREMAW_AGGRO_RANGE) return;
    if (miremawBoss.nextAttack === "tongue") startMiremawTongue();
    else startMiremawBogBurst();
  }


  function resolveCollision(target: DragonBossState | SpiderBossState | FrostclawBossState | MagmaliskBossState | GloomrootBossState | TidewyrmBossState | KoiShogunBossState | TempestKirinBossState | MiremawBossState, damage: number, cooldown: number) {
    if (target.dead) return;
    const dx = player.x - target.x;
    const dy = player.y - target.y;
    const minimumDistance = player.r + target.r;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimumDistance * minimumDistance) return;
    if (target.contactDamageClock <= 0) { damagePlayer(damage); target.contactDamageClock = cooldown; }
    const distance = Math.sqrt(distanceSquared);
    const nx = distance > .001 ? dx / distance : 1;
    const ny = distance > .001 ? dy / distance : 0;
    player.x = target.x + nx * minimumDistance;
    player.y = target.y + ny * minimumDistance;
  }

  function applyBossKnockback(dt: number) {
    if (dt <= 0 || bossKnockbackTimeRemaining <= 0 || bossKnockbackDistanceRemaining <= 0) return;
    const elapsed = Math.min(dt, bossKnockbackTimeRemaining);
    const distance = bossKnockbackDistanceRemaining * elapsed / bossKnockbackTimeRemaining;
    player.x = clamp(player.x + Math.cos(bossKnockbackAngle) * distance, player.r, WORLD.w - player.r);
    player.y = clamp(player.y + Math.sin(bossKnockbackAngle) * distance, player.r, WORLD.h - player.r);
    bossKnockbackTimeRemaining = Math.max(0, bossKnockbackTimeRemaining - elapsed);
    bossKnockbackDistanceRemaining = Math.max(0, bossKnockbackDistanceRemaining - distance);
  }

  return {
    resetBoss,
    resetSpiderBoss,
    resetFrostclawBoss,
    resetMagmaliskBoss,
    resetGloomrootBoss,
    resetTidewyrmBoss,
    resetKoiShogunBoss,
    resetTempestKirinBoss,
    resetMiremawBoss,
    syncDragonState,
    syncSpiderState,
    syncFrostclawState,
    syncMagmaliskState,
    syncGloomrootState,
    syncTidewyrmState,
    syncKoiShogunState,
    syncTempestKirinState,
    syncMiremawState,
    updateBoss,
    updateSpiderBoss,
    updateFrostclawBoss,
    updateMagmaliskBoss,
    updateGloomrootBoss,
    updateTidewyrmBoss,
    updateKoiShogunBoss,
    updateTempestKirinBoss,
    updateMiremawBoss,
    resolveDragonCollision: () => resolveCollision(boss, DRAGON_CONTACT_DAMAGE, DRAGON_CONTACT_DAMAGE_COOLDOWN),
    resolveSpiderCollision: () => resolveCollision(spiderBoss, SPIDER_CONTACT_DAMAGE, .75),
    resolveFrostclawCollision: () => resolveCollision(frostclawBoss, FROSTCLAW_CONTACT_DAMAGE, .75),
    resolveMagmaliskCollision: () => resolveCollision(magmaliskBoss, MAGMALISK_CONTACT_DAMAGE, .75),
    resolveGloomrootCollision: () => resolveCollision(gloomrootBoss, GLOOMROOT_CONTACT_DAMAGE, .75),
    resolveTidewyrmCollision: () => resolveCollision(tidewyrmBoss, TIDEWYRM_CONTACT_DAMAGE, .75),
    resolveKoiShogunCollision: () => resolveCollision(koiShogunBoss, KOI_SHOGUN_CONTACT_DAMAGE, .75),
    resolveTempestKirinCollision: () => resolveCollision(tempestKirinBoss, TEMPEST_KIRIN_CONTACT_DAMAGE, .75),
    resolveMiremawCollision: () => resolveCollision(miremawBoss, MIREMAW_CONTACT_DAMAGE, .75),
    applyBossKnockback,
    onPortalCutsceneFinished(wasPreview) {
      const dragon = queuedDragonResult;
      queuedDragonResult = null;
      if (dragon && !wasPreview) showDragonResult(dragon);
      const spider = queuedSpiderResult;
      queuedSpiderResult = null;
      if (spider && !wasPreview) showSpiderResult(spider);
      const frostclaw = queuedFrostclawResult;
      queuedFrostclawResult = null;
      if (frostclaw && !wasPreview) showFrostclawResult(frostclaw);
      const magmalisk = queuedMagmaliskResult;
      queuedMagmaliskResult = null;
      if (magmalisk && !wasPreview) showMagmaliskResult(magmalisk);
      const gloomroot = queuedGloomrootResult;
      queuedGloomrootResult = null;
      if (gloomroot && !wasPreview) showGloomrootResult(gloomroot);
      const tidewyrm = queuedTidewyrmResult;
      queuedTidewyrmResult = null;
      if (tidewyrm && !wasPreview) showTidewyrmResult(tidewyrm);
    },
  };
}
