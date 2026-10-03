import { TIDEWYRM_SURGE_WINDUP } from "../constants";
import { bossVerticalRadius } from "../../../shared/boss-hitbox";
import { VERDANT_ROOTS, VERDANT_SPORES, verdantRootHits, verdantSporeHits, verdantSporeSites } from "../../../shared/verdant-attacks";
import { ION_SWEEP, ION_BURSTS, ionSweepHits, ionBurstHits, ionBurstSites } from "../../../shared/ion-attacks";
import { NEON_LASER, NEON_EMP, neonLaserHits, neonEmpHits } from "../../../shared/neon-attacks";
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
  PRISMSHELL_AGGRO_RANGE, IRONHORN_AGGRO_RANGE, DREADREAPER_AGGRO_RANGE, VOLTWARDEN_AGGRO_RANGE, GRAVEBLOOM_AGGRO_RANGE, AEGIS_PRIME_AGGRO_RANGE,
  MIREMAW_TONGUE_HALF_ANGLE,
  PRISMSHELL_SHATTER_HALF_ANGLE, IRONHORN_SHATTER_HALF_ANGLE, DREADREAPER_SHATTER_HALF_ANGLE,
  MIREMAW_TONGUE_RANGE,
  PRISMSHELL_SHATTER_RANGE, IRONHORN_SHATTER_RANGE, DREADREAPER_SHATTER_RANGE,
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
  PRISMSHELL_REWARD_ARMOR, IRONHORN_REWARD_ARMOR, DREADREAPER_REWARD_ARMOR, VOLTWARDEN_REWARD_ARMOR, GRAVEBLOOM_REWARD_ARMOR, AEGIS_PRIME_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  PRISMSHELL_REWARD_DAMAGE, IRONHORN_REWARD_DAMAGE, DREADREAPER_REWARD_DAMAGE, VOLTWARDEN_REWARD_DAMAGE, GRAVEBLOOM_REWARD_DAMAGE, AEGIS_PRIME_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  PRISMSHELL_REWARD_HEALTH, IRONHORN_REWARD_HEALTH, DREADREAPER_REWARD_HEALTH, VOLTWARDEN_REWARD_HEALTH, GRAVEBLOOM_REWARD_HEALTH, AEGIS_PRIME_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  PRISMSHELL_REWARD_REGEN, IRONHORN_REWARD_REGEN, DREADREAPER_REWARD_REGEN, VOLTWARDEN_REWARD_REGEN, GRAVEBLOOM_REWARD_REGEN, AEGIS_PRIME_REWARD_REGEN,
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
} from "../../../shared/boss-simulation";
import { REWARD_DATA, rewardLabel, type RewardType } from "../enemies";
import { BOSS_DAMAGE_PROFILES } from "../boss-damage";
import { clamp } from "../math";
import type { PlayerGender } from "../../../shared/player-gender";
import type { BossCone, PlayerState } from "./types";
import { BOSSES, BOSS_KINDS, bossForMap, clearBossAttack, perBoss, type BossHazards, type BossKind, type BossStates } from "./boss-registry";
import { addPlayerBaseMaxHealth } from "./player-health";

export const BOSS_HP_LOSS_FLASH_DURATION = .18;
export const SPIDER_WEB_RANGE = 720;
export const BOSS_AREA_KNOCKBACK_DURATION = .32;

/**
 * One hit covers a quarter of the usable attack radius.
 */
export function bossAreaKnockbackDistance(attackRange: number, bossRadius: number) {
  return Math.max(0, (attackRange - bossRadius) / 4);
}

const DRAGON_CONE_WINDUP = .75;
const DRAGON_CONE_DURATION = 1.2;
const SPIDER_AGGRO_RANGE = 575;
const DRAGON_CONTACT_DAMAGE_COOLDOWN = .75;
const FROSTCLAW_ROAR_WINDUP = .85;
const FROSTCLAW_ROAR_DURATION = .95;
const FROSTCLAW_RIFT_WINDUP = .7;
const FROSTCLAW_RIFT_DURATION = 1.05;
const MAGMALISK_BITE_WINDUP = .72;
const MAGMALISK_BITE_DURATION = .9;
const GLOOMROOT_SWEEP_WINDUP = .85;
const GLOOMROOT_SWEEP_DURATION = 1;
const TIDEWYRM_SURGE_DURATION = 1.05;
const KOI_SHOGUN_SLASH_WINDUP = .78;
const KOI_SHOGUN_SLASH_DURATION = 1.04;
const TEMPEST_KIRIN_CHARGE_WINDUP = .74;
const TEMPEST_KIRIN_CHARGE_DURATION = 1.02;
const MIREMAW_TONGUE_WINDUP = .68;
const PRISMSHELL_SHATTER_WINDUP = .85;
const IRONHORN_SHATTER_WINDUP = 1.05;
const DREADREAPER_SHATTER_WINDUP = 1.1;
const MIREMAW_TONGUE_DURATION = .58;
const PRISMSHELL_SHATTER_DURATION = .8;
const IRONHORN_SHATTER_DURATION = .8;
const DREADREAPER_SHATTER_DURATION = .8;
const DEATH_PARTICLE_COLOR = "#e53935";

export type SharedBossState = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
};

export type BossResult = {
  encounter: bigint;
  totalDamage: number;
  contributors: Array<{ identity: string; name: string; gender: PlayerGender; damage: number; percentage: number }>;
};

type BossAbilityTarget = { id: string; x: number; y: number };
type AbilityTarget = Pick<BossAbilityTarget, "x" | "y">;
type Burst = readonly [color: string, count: number, speed: number];
type StatReward = "damage" | "health" | "armor" | "regen";
type Hazard = { x: number; y: number; r: number; timer: number; maxTimer: number };
type PortalCutscene = { seen: () => boolean; start: () => boolean | void };

/** What the frame loop, collision and map changes call on one world boss. */
export type BossBehaviour = {
  reset: () => void;
  sync: () => void;
  update: (dt: number) => void;
  resolveCollision: () => void;
};

export type BossController = {
  byKind: Record<BossKind, BossBehaviour>;
  /** The boss that lives on `mapId`, or null on a map without a world boss. */
  forMap: (mapId: string) => BossBehaviour | null;
  resetAll: () => void;
  applyBossKnockback: (dt: number) => void;
  onPortalCutsceneFinished: () => void;
};

type StandardKind = Exclude<BossKind, "dragon">;

/** How a boss other than the Dragon dies and pays out. */
type BossOutcome = {
  /** Read when paid: a map's balance replaces the reward values once it loads. */
  rewards: () => readonly (readonly [StatReward, number])[];
  deathBurst: Burst;
  /**
   * A boss already dead when the player arrives still shows that player's
   * reward. Frostclaw only did so while its portal reveal was unseen.
   */
  rewardOnArrival: boolean | "beforeCutscene";
  /**
   * The Scorpion predates two details every later boss shares: a heal clears
   * the health-loss flash, and a reset clears `hurt`.
   */
  scorpion?: true;
  /** Bosses drawn from an attack clip advance and reset that clip's clock. */
  spriteClock?: true;
};

const BOSS_OUTCOMES: Record<StandardKind, BossOutcome> = {
  spider: {
    rewards: () => [["damage", SPIDER_REWARD_DAMAGE], ["health", SPIDER_REWARD_HEALTH]],
    deathBurst: [DEATH_PARTICLE_COLOR, 64, 230], rewardOnArrival: false, scorpion: true,
  },
  frostclaw: {
    rewards: () => [["damage", FROSTCLAW_REWARD_DAMAGE], ["health", FROSTCLAW_REWARD_HEALTH], ["armor", FROSTCLAW_REWARD_ARMOR]],
    deathBurst: ["#8eeeff", 76, 260], rewardOnArrival: "beforeCutscene",
  },
  magmalisk: {
    rewards: () => [["damage", MAGMALISK_REWARD_DAMAGE], ["health", MAGMALISK_REWARD_HEALTH], ["armor", MAGMALISK_REWARD_ARMOR], ["regen", MAGMALISK_REWARD_REGEN]],
    deathBurst: ["#ff6b24", 88, 280], rewardOnArrival: true,
  },
  gloomroot: {
    rewards: () => [["damage", GLOOMROOT_REWARD_DAMAGE], ["health", GLOOMROOT_REWARD_HEALTH], ["armor", GLOOMROOT_REWARD_ARMOR], ["regen", GLOOMROOT_REWARD_REGEN]],
    deathBurst: ["#43d9e6", 96, 290], rewardOnArrival: true,
  },
  tidewyrm: {
    rewards: () => [["damage", TIDEWYRM_REWARD_DAMAGE], ["health", TIDEWYRM_REWARD_HEALTH], ["armor", TIDEWYRM_REWARD_ARMOR], ["regen", TIDEWYRM_REWARD_REGEN]],
    deathBurst: ["#40d9f2", 104, 310], rewardOnArrival: true, spriteClock: true,
  },
  koiShogun: {
    rewards: () => [["damage", KOI_SHOGUN_REWARD_DAMAGE], ["health", KOI_SHOGUN_REWARD_HEALTH], ["armor", KOI_SHOGUN_REWARD_ARMOR], ["regen", KOI_SHOGUN_REWARD_REGEN]],
    deathBurst: ["#f0a044", 112, 320], rewardOnArrival: true,
  },
  tempestKirin: {
    rewards: () => [["damage", TEMPEST_KIRIN_REWARD_DAMAGE], ["health", TEMPEST_KIRIN_REWARD_HEALTH], ["armor", TEMPEST_KIRIN_REWARD_ARMOR], ["regen", TEMPEST_KIRIN_REWARD_REGEN]],
    deathBurst: ["#9fe9ff", 120, 340], rewardOnArrival: true,
  },
  miremaw: {
    rewards: () => [["damage", MIREMAW_REWARD_DAMAGE], ["health", MIREMAW_REWARD_HEALTH], ["armor", MIREMAW_REWARD_ARMOR], ["regen", MIREMAW_REWARD_REGEN]],
    deathBurst: ["#71efc1", 120, 340], rewardOnArrival: true,
  },
  prismshell: {
    rewards: () => [["damage", PRISMSHELL_REWARD_DAMAGE], ["health", PRISMSHELL_REWARD_HEALTH], ["armor", PRISMSHELL_REWARD_ARMOR], ["regen", PRISMSHELL_REWARD_REGEN]],
    deathBurst: ["#c3a6ff", 120, 340], rewardOnArrival: true,
  },
  ironhorn: {
    rewards: () => [["damage", IRONHORN_REWARD_DAMAGE], ["health", IRONHORN_REWARD_HEALTH], ["armor", IRONHORN_REWARD_ARMOR], ["regen", IRONHORN_REWARD_REGEN]],
    deathBurst: ["#c3a6ff", 120, 340], rewardOnArrival: true, spriteClock: true,
  },
  dreadreaper: {
    rewards: () => [["damage", DREADREAPER_REWARD_DAMAGE], ["health", DREADREAPER_REWARD_HEALTH], ["armor", DREADREAPER_REWARD_ARMOR], ["regen", DREADREAPER_REWARD_REGEN]],
    deathBurst: ["#c3a6ff", 120, 340], rewardOnArrival: true, spriteClock: true,
  },
  voltwarden: {
    rewards: () => [["damage", VOLTWARDEN_REWARD_DAMAGE], ["health", VOLTWARDEN_REWARD_HEALTH], ["armor", VOLTWARDEN_REWARD_ARMOR], ["regen", VOLTWARDEN_REWARD_REGEN]],
    deathBurst: ["#c3a6ff", 120, 340], rewardOnArrival: true,
  },
  gravebloom: {
    rewards: () => [["damage", GRAVEBLOOM_REWARD_DAMAGE], ["health", GRAVEBLOOM_REWARD_HEALTH], ["armor", GRAVEBLOOM_REWARD_ARMOR], ["regen", GRAVEBLOOM_REWARD_REGEN]],
    deathBurst: ["#c3a6ff", 120, 340], rewardOnArrival: true,
  },
  aegisPrime: {
    rewards: () => [["damage", AEGIS_PRIME_REWARD_DAMAGE], ["health", AEGIS_PRIME_REWARD_HEALTH], ["armor", AEGIS_PRIME_REWARD_ARMOR], ["regen", AEGIS_PRIME_REWARD_REGEN]],
    deathBurst: ["#c3a6ff", 120, 340], rewardOnArrival: true,
  },
};

const REWARD_LOG_COLORS: Record<StatReward, string> = {
  damage: "#ff655a",
  health: "#6fe48e",
  armor: REWARD_DATA.armor.color,
  regen: REWARD_DATA.regen.color,
};

/** A ring of hazards seeded from the encounter, dropped around the target. */
type SeededHazards = {
  pattern: BossAbilityName;
  count: number;
  angleJitter: number;
  minimumRadius: number;
  maximumRadius: number;
  centerFirst?: boolean;
  /** The first hazard lands after this many seconds, each later one `timerStep` after it. */
  firstTimer: number;
  timerStep: number;
  /** Hazards stay this far inside the world's edge. */
  margin: number;
  radius: number;
  /** Seconds until the next attack once these are down. */
  attackClock: number;
  next: string;
  /** Leads the sprite's attack clip into the first landing. */
  spriteLead?: number;
};

const DRAGON_RAIN: SeededHazards = {
  pattern: "rain", count: 8, angleJitter: .25, minimumRadius: 24, maximumRadius: BOSS_RAIN_RANGE,
  firstTimer: .8, timerStep: .14, margin: 60, radius: 52, attackClock: 4.8, next: "cone",
};
const SPIDER_VENOM: SeededHazards = {
  pattern: "venom", count: 6, angleJitter: .25, minimumRadius: 15, maximumRadius: 125,
  firstTimer: .9, timerStep: .13, margin: 60, radius: 58, attackClock: 4.2, next: "web",
};
const FROSTCLAW_ICEFALL: SeededHazards = {
  pattern: "icefall", count: 9, angleJitter: .32, minimumRadius: 42, maximumRadius: 185, centerFirst: true,
  firstTimer: .8, timerStep: .13, margin: 70, radius: 66, attackClock: 4.8, next: "rift",
};

type ConeKind = "magmalisk" | "gloomroot" | "tidewyrm" | "koiShogun" | "tempestKirin" | "miremaw" | "prismshell" | "ironhorn" | "dreadreaper";

/**
 * Bosses that alternate a widening cone with a field of ground hazards. The
 * hazards land first; the cone waits for the last of them.
 */
type ConeBoss = {
  aggroRange: number;
  cone: {
    ability: BossAbilityName;
    windup: number;
    duration: number;
    range: number;
    halfAngle: number;
    /** Slack either side of the travelling front that still counts as a hit. */
    reach: number;
    hitBurst: Burst;
    /** Seconds until the next attack once the cone has passed. */
    recover: number;
  };
  hazards: {
    ability: BossAbilityName;
    landBurst: Burst;
    /** Seeded ring, or a hand-placed pattern. */
    pattern: SeededHazards | ((elapsedSeconds: number, patternIndex: number | undefined, target: AbilityTarget) => void);
  };
  /** Drawn from an attack clip whose clock leads into the cone. */
  spriteClock?: true;
};

type PulseKind = "voltwarden" | "gravebloom" | "aegisPrime";

/**
 * The expansion bosses alternate a laser with rings that pulse outward; the
 * shared attack art in shared/*-attacks.ts decides what each one hits.
 */
type PulseBoss = {
  aggroRange: number;
  laser: {
    ability: BossAbilityName;
    start: (elapsedSeconds: number, target: AbilityTarget) => void;
    hits: (dx: number, dy: number, angle: number, playerRadius: number) => boolean;
    /** Only the wave's travelling front hits, from `innerRange` out to `range`. */
    front?: { innerRange: number; range: number };
  };
  pulses: {
    ability: BossAbilityName;
    start: (elapsedSeconds: number, attackIndex: number | undefined, target: AbilityTarget) => void;
    hits: (distance: number, previousElapsed: number, elapsed: number, playerRadius: number) => boolean;
    hitColor: string;
  };
};

/**
 * Owns world-boss state synchronization, attacks, collision, and reward UI.
 * The application entry point supplies DOM and multiplayer boundaries only.
 */
export function createBossController(options: {
  serverOwnsRewards?: boolean;
  bosses: BossStates;
  hazards: BossHazards;
  player: PlayerState;
  sharedBoss: (kind: BossKind) => SharedBossState | null | undefined;
  bossResult: (kind: BossKind) => BossResult | null | undefined;
  localIdentity: () => string | undefined;
  /** Estimated server clock used to keep boss abilities in one shared phase. */
  serverNowMs?: () => number;
  /** Consensus-time players already known by the client; no extra server state. */
  bossTargets?: () => readonly BossAbilityTarget[];
  running: () => boolean;
  currentMapId: () => string;
  portalCutsceneActive: () => boolean;
  /** The portal reveal a boss's first kill plays, for the bosses that open one. */
  portalCutscenes: Partial<Record<BossKind, PortalCutscene>>;
  spawnBurst: (x: number, y: number, color: string, count: number, speed: number) => void;
  damagePlayer: (amount: number) => boolean;
  logPickup: (text: string, color: string, baseText?: string) => void;
  saveProgress: () => void;
  healthMultiplierBonus?: () => number;
  rewardMultiplier?: () => number;
  displayRewardAmount?: (type: RewardType, baseAmount: number) => number;
}): BossController {
  const { bosses, hazards, player, localIdentity, running, portalCutsceneActive, spawnBurst, damagePlayer, logPickup, saveProgress } = options;
  const boss = bosses.dragon;
  const bossRain = hazards.dragon;
  const spiderBoss = bosses.spider;
  const spiderVenom = hazards.spider;
  const frostclawBoss = bosses.frostclaw;
  const frostclawIcefalls = hazards.frostclaw;
  const ironhornBoss = bosses.ironhorn;
  const ironhornCrystalBursts = hazards.ironhorn;
  const voltwardenBoss = bosses.voltwarden;
  const voltwardenCrystalBursts = hazards.voltwarden;
  const gravebloomBoss = bosses.gravebloom;
  const gravebloomCrystalBursts = hazards.gravebloom;
  const aegisPrimeBoss = bosses.aegisPrime;
  const aegisPrimeCrystalBursts = hazards.aegisPrime;

  // Which encounter each boss was last seen in, whether it was alive then, and
  // the reward result waiting to be shown, shown already, or held back while a
  // portal reveal plays.
  const encounters = perBoss(() => ({
    observed: null as bigint | null,
    wasAlive: null as boolean | null,
    pendingResult: null as bigint | null,
    shownResult: null as bigint | null,
    queuedResult: null as BossResult | null,
    locallyRewarded: new Set<string>(),
  }));
  const patternIndex = perBoss(() => 0);

  let bossKnockbackAngle = 0;
  let bossKnockbackTimeRemaining = 0;
  let bossKnockbackDistanceRemaining = 0;
  const observedAbilityKeys = new Map<BossKind, string>();
  const activatedAbilityKeys = new Map<BossKind, string>();

  const onMap = (kind: BossKind) => options.currentMapId() === BOSSES[kind].mapId;
  const damageFor = (kind: BossKind, ability: string) => (BOSS_DAMAGE_PROFILES[kind] as Record<string, number>)[ability];

  function resetAbilityTimeline(kind: BossKind) {
    observedAbilityKeys.delete(kind);
    activatedAbilityKeys.delete(kind);
  }

  function syncAbilityTimeline(options: {
    kind: BossKind;
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
    if (!target || activatedAbilityKeys.get(options.kind) === key) return true;
    activatedAbilityKeys.set(options.kind, key);
    // Bosses are fought locally and no one needs to see the same beat, so an
    // attack always starts from its full warning. Picking it up partway used
    // to spend the elapsed time first: a cone with no windup left, rain already
    // landing, a hit the moment the boss came into view. One that would not
    // finish before the next slot clears it is skipped instead.
    if (phase.slotDurationMs - phase.elapsedMs < phase.activeDurationMs) return true;
    options.start(phase.ability, 0, phase.attackIndex, target);
    return true;
  }

  function selectAbilityTarget(
    kind: BossKind,
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
      baseAmount,
    };
  }

  function logReward(reward: ReturnType<typeof scaledReward>, color: string) {
    // Bosses on the live balance pay nothing: no "+0" pop-up for them.
    if (!(reward.baseAmount > 0)) return;
    logPickup(rewardLabel({ ...reward, amount: options.displayRewardAmount?.(reward.type, reward.baseAmount) ?? reward.amount }), color, rewardLabel({ type: reward.type, amount: reward.baseAmount }));
  }

  // Boss area attacks hit without knocking the player back. Restoring the push
  // is setting the angle, BOSS_AREA_KNOCKBACK_DURATION and
  // bossAreaKnockbackDistance(attackRange, bossRadius) here again.
  function queueBossAreaKnockback(_sourceX: number, _sourceY: number, _attackRange: number, _bossRadius: number) {}

  function clearBossKnockback() {
    bossKnockbackTimeRemaining = 0;
    bossKnockbackDistanceRemaining = 0;
  }

  /** Ends the attack in play and sweeps its hazards off the ground. */
  function clearAttacks(kind: BossKind) {
    clearBossAttack(kind, bosses[kind]);
    hazards[kind].length = 0;
  }

  function resetBoss(kind: BossKind) {
    const state = bosses[kind];
    if (kind !== "dragon" && BOSS_OUTCOMES[kind].spriteClock) state.spriteAttackElapsed = undefined;
    if (kind === "dragon") clearBossKnockback();
    const shared = options.sharedBoss(kind);
    if (shared) {
      state.encounter = shared.encounter;
      state.hp = shared.hp;
      state.maxHp = shared.maxHp;
      state.dead = !shared.alive;
    }
    if (kind === "dragon" || !BOSS_OUTCOMES[kind].scorpion) state.hurt = 0;
    state.hpLossFlashFrom = state.hp;
    state.hpLossFlashTimer = 0;
    state.contactDamageClock = 0;
    state.attackClock = 3;
    state.nextAttack = BOSSES[kind].firstAttack;
    clearAttacks(kind);
    patternIndex[kind] = 0;
    resetAbilityTimeline(kind);
  }

  function showResult(kind: StandardKind, result: BossResult | null | undefined) {
    const encounter = encounters[kind];
    if (!result || encounter.shownResult === result.encounter || (portalCutsceneActive() && encounter.queuedResult?.encounter === result.encounter)) return;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    const cutscene = options.portalCutscenes[kind];
    if (localContribution && cutscene && onMap(kind) && !cutscene.seen()) {
      if (cutscene.start() === false) return;
      encounter.pendingResult = null;
      encounter.queuedResult = result;
      return;
    }
    encounter.pendingResult = null;
    encounter.shownResult = result.encounter;
    if (!localContribution) return;
    const rewards = BOSS_OUTCOMES[kind].rewards().map(([type, amount]) => scaledReward(type, amount));
    const encounterKey = String(result.encounter);
    if (!options.serverOwnsRewards && !encounter.locallyRewarded.has(encounterKey)) {
      // The authoritative reward arrives through the server result. Mirror it
      // into the active runtime now so the overhead HP and Power labels change
      // in the same frame as the reward notice, not after a later save sync.
      encounter.locallyRewarded.add(encounterKey);
      for (const reward of rewards) {
        if (reward.type === "damage") player.damage += reward.amount;
        else if (reward.type === "health") addPlayerBaseMaxHealth(player, reward.amount, options.healthMultiplierBonus?.() ?? 0);
        else if (reward.type === "armor") player.armor += reward.amount;
        else player.regen += reward.amount;
      }
    }
    for (const reward of rewards) logReward(reward, REWARD_LOG_COLORS[reward.type as StatReward]);
  }

  function killBoss() {
    if (boss.dead) return;
    boss.dead = true;
    boss.cone = null;
    bossRain.length = 0;
    spawnBurst(boss.x, boss.y, DEATH_PARTICLE_COLOR, 64, 230);
  }

  function showDragonResult(result: BossResult | null | undefined) {
    const encounter = encounters.dragon;
    if (!result || encounter.shownResult === result.encounter) return;
    if (portalCutsceneActive() && encounter.queuedResult?.encounter === result.encounter) return;
    if (!running()) {
      encounter.shownResult = result.encounter;
      encounter.pendingResult = null;
      return;
    }
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    const cutscene = options.portalCutscenes.dragon;
    if (localContribution && cutscene && !cutscene.seen()) {
      encounter.queuedResult = result;
      cutscene.start();
      return;
    }
    encounter.shownResult = result.encounter;
    encounter.pendingResult = null;
    if (!localContribution) return;
    const damageReward = scaledReward("damage", DRAGON_REWARD_DAMAGE);
    const encounterKey = String(result.encounter);
    if (!options.serverOwnsRewards && !encounter.locallyRewarded.has(encounterKey)) {
      encounter.locallyRewarded.add(encounterKey);
      player.damage += damageReward.amount;
      logReward(damageReward, "#ff655a");
      saveProgress();
    }
  }

  function syncState(kind: StandardKind) {
    const shared = options.sharedBoss(kind);
    if (!shared) return;
    const state = bosses[kind];
    const outcome = BOSS_OUTCOMES[kind];
    const encounter = encounters[kind];
    const initialized = encounter.observed !== null;
    const encounterChanged = initialized && encounter.observed !== shared.encounter;
    const previousHp = state.hp;
    if (!initialized || encounterChanged) {
      encounter.observed = shared.encounter;
      encounter.wasAlive = shared.alive;
      state.dead = !shared.alive;
      state.attackClock = 3;
      state.nextAttack = BOSSES[kind].firstAttack;
      clearAttacks(kind);
      patternIndex[kind] = 0;
      resetAbilityTimeline(kind);
      state.hpLossFlashFrom = shared.hp;
      state.hpLossFlashTimer = 0;
    } else if (encounter.wasAlive && !shared.alive) {
      encounter.wasAlive = false;
      state.dead = true;
      clearAttacks(kind);
      encounter.pendingResult = shared.encounter;
      spawnBurst(state.x, state.y, ...outcome.deathBurst);
    } else if (!encounter.wasAlive && shared.alive) {
      encounter.wasAlive = true;
      state.dead = false;
      state.attackClock = 3;
      state.nextAttack = BOSSES[kind].firstAttack;
      patternIndex[kind] = 0;
      resetAbilityTimeline(kind);
    } else if (shared.alive && shared.hp < previousHp) {
      state.hpLossFlashFrom = state.hpLossFlashTimer > 0
        ? Math.max(state.hpLossFlashFrom, previousHp)
        : previousHp;
      state.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (!outcome.scorpion && shared.hp > previousHp) {
      state.hpLossFlashFrom = shared.hp;
      state.hpLossFlashTimer = 0;
    }
    state.encounter = shared.encounter;
    state.maxHp = shared.maxHp;
    state.hp = shared.hp;
    const rewardOnArrival = () => outcome.rewardOnArrival === "beforeCutscene"
      ? !options.portalCutscenes[kind]?.seen()
      : outcome.rewardOnArrival;
    if (!initialized && !shared.alive && onMap(kind) && rewardOnArrival()) {
      const result = options.bossResult(kind);
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        encounter.locallyRewarded.add(String(result.encounter));
        showResult(kind, result);
      }
    }
    if (encounter.pendingResult !== null) {
      const result = options.bossResult(kind);
      if (result?.encounter === encounter.pendingResult) showResult(kind, result);
    }
  }

  function syncDragonState() {
    const shared = options.sharedBoss("dragon");
    if (!shared) return;
    const encounter = encounters.dragon;
    const initialized = encounter.observed !== null;
    const encounterChanged = initialized && encounter.observed !== shared.encounter;
    const previousHp = boss.hp;
    if (!initialized) {
      encounter.observed = shared.encounter;
      encounter.wasAlive = shared.alive;
      boss.dead = !shared.alive;
      if (boss.dead) { boss.cone = null; bossRain.length = 0; }
      patternIndex.dragon = 0;
      resetAbilityTimeline("dragon");
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (encounterChanged) {
      encounter.observed = shared.encounter;
      encounter.wasAlive = shared.alive;
      encounter.pendingResult = null;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      patternIndex.dragon = 0;
      resetAbilityTimeline("dragon");
      boss.dead = !shared.alive;
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (encounter.wasAlive && !shared.alive) {
      encounter.pendingResult = shared.encounter;
      killBoss();
      encounter.wasAlive = false;
    } else if (!encounter.wasAlive && shared.alive) {
      encounter.wasAlive = true;
      boss.dead = false;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      patternIndex.dragon = 0;
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
    if (encounter.pendingResult !== null && encounter.shownResult !== encounter.pendingResult) {
      const result = options.bossResult("dragon");
      if (result?.encounter === encounter.pendingResult) showDragonResult(result);
    }
  }

  /** A cone aimed at the target, its windup and sweep already advanced by `elapsedSeconds`. */
  function coneAttack(
    state: { x: number; y: number },
    windup: number,
    duration: number,
    elapsedSeconds: number,
    target: AbilityTarget,
  ): BossCone {
    const elapsed = Math.max(0, elapsedSeconds);
    return {
      angle: Math.atan2(target.y - state.y, target.x - state.x),
      windup: Math.max(0, windup - elapsed),
      timer: Math.max(0, duration - Math.max(0, elapsed - windup)),
      duration,
      hitPlayer: false,
    };
  }

  function startSeededHazards(
    kind: BossKind,
    spec: SeededHazards,
    elapsedSeconds = 0,
    deterministicPatternIndex?: number,
    target: AbilityTarget = player,
  ) {
    const state = bosses[kind];
    const ground: Hazard[] = hazards[kind];
    if (spec.spriteLead !== undefined) state.spriteAttackElapsed = Math.max(0, elapsedSeconds) - spec.spriteLead + .5;
    const pattern = deterministicPatternIndex ?? patternIndex[kind];
    for (let index = 0; index < spec.count; index += 1) {
      const { angle, radius } = seededBossHazardPolar({
        kind,
        encounter: state.encounter,
        pattern: spec.pattern,
        patternIndex: pattern,
        hazardIndex: index,
        hazardCount: spec.count,
        angleJitter: spec.angleJitter,
        minimumRadius: spec.minimumRadius,
        maximumRadius: spec.maximumRadius,
        centerFirst: spec.centerFirst,
      });
      const maxTimer = spec.firstTimer + index * spec.timerStep;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      ground.push({
        x: clamp(target.x + Math.cos(angle) * radius, spec.margin, WORLD.w - spec.margin),
        y: clamp(target.y + Math.sin(angle) * radius, spec.margin, WORLD.h - spec.margin),
        r: spec.radius,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) patternIndex[kind] += 1;
    state.attackClock = spec.attackClock;
    (state as { nextAttack: string }).nextAttack = spec.next;
  }

  /** Counts hazards down; each that lands hurts a player standing in it. */
  function landHazards(ground: Hazard[], dt: number, damage: () => number, burst: Burst) {
    for (let index = ground.length - 1; index >= 0; index -= 1) {
      const hazard = ground[index];
      hazard.timer -= dt;
      if (hazard.timer > 0) continue;
      const dx = player.x - hazard.x;
      const dy = player.y - hazard.y;
      if (dx * dx + dy * dy <= hazard.r * hazard.r) damagePlayer(damage());
      spawnBurst(hazard.x, hazard.y, ...burst);
      ground.splice(index, 1);
    }
  }

  function startBossCone(elapsedSeconds = 0, target: AbilityTarget = player) {
    boss.cone = coneAttack(boss, DRAGON_CONE_WINDUP, DRAGON_CONE_DURATION, elapsedSeconds, target);
    boss.nextAttack = "rain";
  }

  function startBossRain(elapsedSeconds = 0, deterministicPatternIndex?: number, target: AbilityTarget = player) {
    startSeededHazards("dragon", DRAGON_RAIN, elapsedSeconds, deterministicPatternIndex, target);
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
    landHazards(bossRain, dt, () => BOSS_DAMAGE_PROFILES.dragon.rain, ["#ff5d32", 22, 170]);
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
          damagePlayer(BOSS_DAMAGE_PROFILES.dragon.cone);
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

  function startSpiderVenom(elapsedSeconds = 0, deterministicPatternIndex?: number, target: AbilityTarget = player) {
    startSeededHazards("spider", SPIDER_VENOM, elapsedSeconds, deterministicPatternIndex, target);
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
    landHazards(spiderVenom, dt, () => BOSS_DAMAGE_PROFILES.spider.venom, ["#89e255", 22, 150]);
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
        damagePlayer(BOSS_DAMAGE_PROFILES.spider.web);
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

  function startFrostclawIcefall(elapsedSeconds = 0, deterministicPatternIndex?: number, target: AbilityTarget = player) {
    startSeededHazards("frostclaw", FROSTCLAW_ICEFALL, elapsedSeconds, deterministicPatternIndex, target);
  }

  function startFrostclawRift(elapsedSeconds = 0, target: AbilityTarget = player) {
    frostclawBoss.rift = coneAttack(frostclawBoss, FROSTCLAW_RIFT_WINDUP, FROSTCLAW_RIFT_DURATION, elapsedSeconds, target);
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

    landHazards(frostclawIcefalls, dt, () => BOSS_DAMAGE_PROFILES.frostclaw.icefall, ["#a9f5ff", 28, 190]);

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
          damagePlayer(BOSS_DAMAGE_PROFILES.frostclaw.roar);
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
          damagePlayer(BOSS_DAMAGE_PROFILES.frostclaw.rift);
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

  function startIronhornCrystalBurst(elapsedSeconds = 0, deterministicPatternIndex?: number, target: AbilityTarget = player) {
    ironhornBoss.spriteAttackElapsed = Math.max(0, elapsedSeconds) - 1.05 + .5;
    const pattern = deterministicPatternIndex ?? patternIndex.ironhorn;
    // Two staggered rows of scrap leave alternating escape lanes.
    const angle = Math.atan2(target.y - ironhornBoss.y, target.x - ironhornBoss.x) + (pattern % 2 ? Math.PI / 2 : 0);
    for (let index = 0; index < 6; index += 1) {
      const along = (index % 3 - 1) * 200;
      const across = (index < 3 ? -1 : 1) * 135;
      const maxTimer = 1.05 + Math.floor(index / 3) * .55;
      const timer = maxTimer - Math.max(0, elapsedSeconds);
      if (timer <= 0) continue;
      ironhornCrystalBursts.push({
        x: clamp(target.x + Math.cos(angle) * along - Math.sin(angle) * across, 82, WORLD.w - 82),
        y: clamp(target.y + Math.sin(angle) * along + Math.cos(angle) * across, 82, WORLD.h - 82),
        r: 90,
        timer,
        maxTimer,
      });
    }
    if (deterministicPatternIndex === undefined) patternIndex.ironhorn += 1;
    ironhornBoss.attackClock = 3.1;
    ironhornBoss.nextAttack = "shatter";
  }

  const CONE_BOSSES: Record<ConeKind, ConeBoss> = {
    magmalisk: {
      aggroRange: MAGMALISK_AGGRO_RANGE,
      cone: { ability: "bite", windup: MAGMALISK_BITE_WINDUP, duration: MAGMALISK_BITE_DURATION, range: MAGMALISK_BITE_RANGE, halfAngle: MAGMALISK_BITE_HALF_ANGLE, reach: 38, hitBurst: ["#ffb13b", 28, 230], recover: 2.4 },
      hazards: { ability: "eruption", landBurst: ["#ff7a24", 32, 220], pattern: {
        pattern: "eruption", count: 11, angleJitter: .3, minimumRadius: 48, maximumRadius: 230, centerFirst: true,
        firstTimer: .8, timerStep: .11, margin: 72, radius: 72, attackClock: 3.1, next: "bite",
      } },
    },
    gloomroot: {
      aggroRange: GLOOMROOT_AGGRO_RANGE,
      cone: { ability: "sweep", windup: GLOOMROOT_SWEEP_WINDUP, duration: GLOOMROOT_SWEEP_DURATION, range: GLOOMROOT_SWEEP_RANGE, halfAngle: GLOOMROOT_SWEEP_HALF_ANGLE, reach: 40, hitBurst: ["#8af4f3", 30, 235], recover: 2.5 },
      hazards: { ability: "bloom", landBurst: ["#58e2ee", 34, 225], pattern: {
        pattern: "bloom", count: 12, angleJitter: .28, minimumRadius: 55, maximumRadius: 255, centerFirst: true,
        firstTimer: .9, timerStep: .1, margin: 74, radius: 74, attackClock: 3.2, next: "sweep",
      } },
    },
    tidewyrm: {
      aggroRange: TIDEWYRM_AGGRO_RANGE,
      cone: { ability: "surge", windup: TIDEWYRM_SURGE_WINDUP, duration: TIDEWYRM_SURGE_DURATION, range: TIDEWYRM_SURGE_RANGE, halfAngle: TIDEWYRM_SURGE_HALF_ANGLE, reach: 42, hitBurst: ["#b7f7ff", 32, 250], recover: 2.45 },
      hazards: { ability: "whirlpool", landBurst: ["#5eeaff", 38, 245], pattern: {
        pattern: "whirlpool", count: 11, angleJitter: .25, minimumRadius: 70, maximumRadius: 290, centerFirst: true,
        firstTimer: .85, timerStep: .11, margin: 82, radius: 82, attackClock: 3.15, next: "surge", spriteLead: .85,
      } },
      spriteClock: true,
    },
    koiShogun: {
      aggroRange: KOI_SHOGUN_AGGRO_RANGE,
      cone: { ability: "slash", windup: KOI_SHOGUN_SLASH_WINDUP, duration: KOI_SHOGUN_SLASH_DURATION, range: KOI_SHOGUN_SLASH_RANGE, halfAngle: KOI_SHOGUN_SLASH_HALF_ANGLE, reach: 42, hitBurst: ["#d7fbff", 34, 255], recover: 2.4 },
      hazards: { ability: "whirlpool", landBurst: ["#71e9ff", 40, 250], pattern: {
        pattern: "whirlpool", count: 11, angleJitter: .25, minimumRadius: 70, maximumRadius: 300, centerFirst: true,
        firstTimer: .82, timerStep: .105, margin: 82, radius: 84, attackClock: 3.1, next: "slash",
      } },
    },
    tempestKirin: {
      aggroRange: TEMPEST_KIRIN_AGGRO_RANGE,
      cone: { ability: "charge", windup: TEMPEST_KIRIN_CHARGE_WINDUP, duration: TEMPEST_KIRIN_CHARGE_DURATION, range: TEMPEST_KIRIN_CHARGE_RANGE, halfAngle: TEMPEST_KIRIN_CHARGE_HALF_ANGLE, reach: 42, hitBurst: ["#f3fdff", 38, 280], recover: 2.35 },
      hazards: { ability: "thunder", landBurst: ["#d6f7ff", 44, 270], pattern: {
        pattern: "thunder", count: 12, angleJitter: .22, minimumRadius: 64, maximumRadius: 320, centerFirst: true,
        firstTimer: .72, timerStep: .1, margin: 82, radius: 82, attackClock: 3.1, next: "charge",
      } },
    },
    miremaw: {
      aggroRange: MIREMAW_AGGRO_RANGE,
      cone: { ability: "tongue", windup: MIREMAW_TONGUE_WINDUP, duration: MIREMAW_TONGUE_DURATION, range: MIREMAW_TONGUE_RANGE, halfAngle: MIREMAW_TONGUE_HALF_ANGLE, reach: 42, hitBurst: ["#e1fff2", 38, 280], recover: 2.35 },
      hazards: { ability: "bogBurst", landBurst: ["#a9ffe0", 44, 270], pattern: {
        pattern: "bogBurst", count: 10, angleJitter: .28, minimumRadius: 72, maximumRadius: 340, centerFirst: true,
        firstTimer: .76, timerStep: .11, margin: 82, radius: 96, attackClock: 3.1, next: "tongue",
      } },
    },
    prismshell: {
      aggroRange: PRISMSHELL_AGGRO_RANGE,
      cone: { ability: "shatter", windup: PRISMSHELL_SHATTER_WINDUP, duration: PRISMSHELL_SHATTER_DURATION, range: PRISMSHELL_SHATTER_RANGE, halfAngle: PRISMSHELL_SHATTER_HALF_ANGLE, reach: 42, hitBurst: ["#d5fcff", 38, 280], recover: 2.35 },
      hazards: { ability: "crystalBurst", landBurst: ["#c3a6ff", 44, 270], pattern: {
        pattern: "crystalBurst", count: 8, angleJitter: .12, minimumRadius: 105, maximumRadius: 330, centerFirst: true,
        firstTimer: .95, timerStep: .15, margin: 82, radius: 86, attackClock: 3.1, next: "shatter",
      } },
    },
    ironhorn: {
      aggroRange: IRONHORN_AGGRO_RANGE,
      cone: { ability: "shatter", windup: IRONHORN_SHATTER_WINDUP, duration: IRONHORN_SHATTER_DURATION, range: IRONHORN_SHATTER_RANGE, halfAngle: IRONHORN_SHATTER_HALF_ANGLE, reach: 42, hitBurst: ["#d5fcff", 38, 280], recover: 2.35 },
      hazards: { ability: "crystalBurst", landBurst: ["#c3a6ff", 44, 270], pattern: startIronhornCrystalBurst },
      spriteClock: true,
    },
    dreadreaper: {
      aggroRange: DREADREAPER_AGGRO_RANGE,
      cone: { ability: "shatter", windup: DREADREAPER_SHATTER_WINDUP, duration: DREADREAPER_SHATTER_DURATION, range: DREADREAPER_SHATTER_RANGE, halfAngle: DREADREAPER_SHATTER_HALF_ANGLE, reach: 42, hitBurst: ["#d5fcff", 38, 280], recover: 2.35 },
      hazards: { ability: "crystalBurst", landBurst: ["#c3a6ff", 44, 270], pattern: {
        pattern: "crystalBurst", count: 10, angleJitter: 0, minimumRadius: 240, maximumRadius: 240, centerFirst: false,
        firstTimer: 1.15, timerStep: .07, margin: 82, radius: 68, attackClock: 3.1, next: "shatter", spriteLead: 1.15,
      } },
      spriteClock: true,
    },
  };

  /** The cone a cone boss is playing, held in the attack slot the registry names. */
  const coneSlot = (kind: ConeKind) => BOSSES[kind].attackSlots[0] as string;
  const coneOf = (kind: ConeKind) => (bosses[kind] as unknown as Record<string, BossCone | null>)[coneSlot(kind)];
  const setCone = (kind: ConeKind, cone: BossCone | null) => {
    (bosses[kind] as unknown as Record<string, BossCone | null>)[coneSlot(kind)] = cone;
  };

  function startCone(kind: ConeKind, elapsedSeconds = 0, target: AbilityTarget = player) {
    const rules = CONE_BOSSES[kind];
    const state = bosses[kind];
    if (rules.spriteClock) state.spriteAttackElapsed = Math.max(0, elapsedSeconds) - rules.cone.windup + .5;
    setCone(kind, coneAttack(state, rules.cone.windup, rules.cone.duration, elapsedSeconds, target));
    (state as { nextAttack: string }).nextAttack = rules.hazards.ability;
  }

  function startConeHazards(kind: ConeKind, elapsedSeconds = 0, deterministicPatternIndex?: number, target: AbilityTarget = player) {
    const pattern = CONE_BOSSES[kind].hazards.pattern;
    if (typeof pattern === "function") pattern(elapsedSeconds, deterministicPatternIndex, target);
    else startSeededHazards(kind, pattern, elapsedSeconds, deterministicPatternIndex, target);
  }

  function updateConeBoss(kind: ConeKind, dt: number) {
    const rules = CONE_BOSSES[kind];
    const state = bosses[kind];
    const ground = hazards[kind];
    if (rules.spriteClock && state.spriteAttackElapsed !== undefined) state.spriteAttackElapsed += dt;
    state.hpLossFlashTimer = Math.max(0, state.hpLossFlashTimer - dt);
    state.contactDamageClock = Math.max(0, state.contactDamageClock - dt);
    if (state.dead) return;
    state.hurt = Math.max(0, state.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind,
      encounter: state.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget(kind, state.encounter, attackIndex, state.x, state.y, rules.aggroRange),
      clear: () => { setCone(kind, null); ground.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === rules.cone.ability) startCone(kind, elapsedSeconds, target);
        else if (ability === rules.hazards.ability) startConeHazards(kind, elapsedSeconds, attackIndex, target);
      },
      setAttackClock: (seconds) => { state.attackClock = seconds; },
    });

    landHazards(ground, dt, () => damageFor(kind, rules.hazards.ability), rules.hazards.landBurst);
    if (ground.length > 0) return;

    const cone = coneOf(kind);
    if (cone) {
      if (cone.windup > 0) {
        cone.windup -= dt;
        return;
      }
      const range = rules.cone.range;
      const previousProgress = clamp(1 - cone.timer / cone.duration, 0, 1);
      cone.timer -= dt;
      const progress = clamp(1 - cone.timer / cone.duration, 0, 1);
      const minRadius = state.r + (range - state.r) * previousProgress;
      const maxRadius = state.r + (range - state.r) * progress;
      if (!cone.hitPlayer) {
        const dx = player.x - state.x;
        const dy = player.y - state.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - cone.angle),
          Math.cos(Math.atan2(dy, dx) - cone.angle),
        );
        if (distance >= minRadius - rules.cone.reach && distance <= maxRadius + rules.cone.reach && Math.abs(angleDelta) <= rules.cone.halfAngle) {
          cone.hitPlayer = true;
          damagePlayer(damageFor(kind, rules.cone.ability));
          queueBossAreaKnockback(state.x, state.y, range, state.r);
          spawnBurst(player.x, player.y, ...rules.cone.hitBurst);
        }
      }
      if (cone.timer <= 0) {
        setCone(kind, null);
        state.attackClock = rules.cone.recover;
      }
      return;
    }

    if (sharedTimeline) return;
    state.attackClock -= dt;
    if (state.attackClock > 0) return;
    const dx = player.x - state.x;
    const dy = player.y - state.y;
    if (dx * dx + dy * dy > rules.aggroRange * rules.aggroRange) return;
    if (state.nextAttack === rules.cone.ability) startCone(kind);
    else startConeHazards(kind);
  }

  function startVoltwardenShatter(elapsedSeconds = 0, target: AbilityTarget = player) {
    voltwardenBoss.shatter = coneAttack(voltwardenBoss, NEON_LASER.windup, NEON_LASER.duration, elapsedSeconds, target);
    voltwardenBoss.nextAttack = "empPulse";
  }
  function startGravebloomShatter(elapsedSeconds = 0, target: AbilityTarget = player) {
    gravebloomBoss.shatter = coneAttack(gravebloomBoss, VERDANT_ROOTS.windup, VERDANT_ROOTS.duration, elapsedSeconds, target);
    gravebloomBoss.nextAttack = "sporeBurst";
  }
  function startAegisPrimeShatter(elapsedSeconds = 0, target: AbilityTarget = player) {
    aegisPrimeBoss.shatter = coneAttack(aegisPrimeBoss, ION_SWEEP.windup, ION_SWEEP.duration, elapsedSeconds, target);
    aegisPrimeBoss.nextAttack = "ionVolley";
  }

  function startVoltwardenCrystalBurst(elapsedSeconds = 0) {
    const duration = NEON_EMP.windup + NEON_EMP.duration;
    for (let index = 0; index < 3; index++) {
      const elapsed = elapsedSeconds - index * NEON_EMP.stagger;
      if (elapsed >= duration) continue;
      voltwardenCrystalBursts.push({ x: voltwardenBoss.x, y: voltwardenBoss.y, r: NEON_EMP.range,
        timer: duration - elapsed, maxTimer: duration, hitPlayer: false });
    }
    voltwardenBoss.attackClock = 3.8;
    voltwardenBoss.nextAttack = "laserGrid";
  }
  function startGravebloomCrystalBurst(elapsedSeconds = 0, patternIndex = 0, target: AbilityTarget = player) {
    const duration = VERDANT_SPORES.windup + VERDANT_SPORES.duration;
    for (const site of verdantSporeSites(target.x, target.y, patternIndex)) {
      const elapsed = elapsedSeconds - site.delay;
      if (elapsed >= duration) continue;
      gravebloomCrystalBursts.push({ x: clamp(site.x, 100, WORLD.w - 100), y: clamp(site.y, 100, WORLD.h - 100), r: VERDANT_SPORES.range,
        timer: duration - elapsed, maxTimer: duration, hitPlayer: false });
    }
    gravebloomBoss.attackClock = 3.8;
    gravebloomBoss.nextAttack = "rootGrasp";
  }
  function startAegisPrimeCrystalBurst(elapsedSeconds = 0, deterministicPatternIndex: number | undefined = undefined, target: AbilityTarget = player) {
    const pattern = deterministicPatternIndex ?? patternIndex.aegisPrime++;
    const duration = ION_BURSTS.windup + ION_BURSTS.duration;
    for (const site of ionBurstSites(target.x, target.y, pattern, aegisPrimeBoss)) {
      const elapsed = elapsedSeconds - site.delay;
      if (elapsed >= duration) continue;
      aegisPrimeCrystalBursts.push({ x: clamp(site.x, 100, WORLD.w - 100), y: clamp(site.y, 100, WORLD.h - 100), r: ION_BURSTS.range,
        timer: duration - elapsed, maxTimer: duration, hitPlayer: false });
    }
    aegisPrimeBoss.attackClock = 3.8;
    aegisPrimeBoss.nextAttack = "shieldSweep";
  }

  const PULSE_BOSSES: Record<PulseKind, PulseBoss> = {
    voltwarden: {
      aggroRange: VOLTWARDEN_AGGRO_RANGE,
      laser: { ability: "laserGrid", start: startVoltwardenShatter, hits: neonLaserHits },
      pulses: { ability: "empPulse", start: (elapsedSeconds) => startVoltwardenCrystalBurst(elapsedSeconds), hits: neonEmpHits, hitColor: "#ff48dc" },
    },
    gravebloom: {
      aggroRange: GRAVEBLOOM_AGGRO_RANGE,
      laser: { ability: "rootGrasp", start: startGravebloomShatter, hits: verdantRootHits },
      pulses: { ability: "sporeBurst", start: startGravebloomCrystalBurst, hits: verdantSporeHits, hitColor: "#8bf2c3" },
    },
    aegisPrime: {
      aggroRange: AEGIS_PRIME_AGGRO_RANGE,
      // The sweep is drawn as a wave travelling out from the shield
      // (ion-attack-art.ts), but it used to hit the whole arc on its first
      // active frame: a player near the far edge took the damage while the
      // wave was still at the boss's feet. Only the wave's front hits now,
      // as it does for every other boss that draws one.
      laser: { ability: "shieldSweep", start: startAegisPrimeShatter, hits: ionSweepHits, front: ION_SWEEP },
      pulses: {
        ability: "ionVolley",
        // Each volley direction holds for two shared slots.
        start: (elapsedSeconds, attackIndex, target) => startAegisPrimeCrystalBurst(elapsedSeconds, attackIndex === undefined ? undefined : Math.floor(attackIndex / 2), target),
        hits: ionBurstHits,
        hitColor: "#8bf2c3",
      },
    },
  };

  function updatePulseBoss(kind: PulseKind, dt: number) {
    const rules = PULSE_BOSSES[kind];
    const state = bosses[kind];
    const pulses: (Hazard & { hitPlayer?: boolean })[] = hazards[kind];
    state.hpLossFlashTimer = Math.max(0, state.hpLossFlashTimer - dt);
    state.contactDamageClock = Math.max(0, state.contactDamageClock - dt);
    if (state.dead) return;
    state.hurt = Math.max(0, state.hurt - dt);
    const sharedTimeline = syncAbilityTimeline({
      kind, encounter: state.encounter,
      targetForAttack: (attackIndex) => selectAbilityTarget(kind, state.encounter, attackIndex, state.x, state.y, rules.aggroRange),
      clear: () => { state.shatter = null; pulses.length = 0; },
      start: (ability, elapsedSeconds, attackIndex, target) => {
        if (ability === rules.laser.ability) rules.laser.start(elapsedSeconds, target);
        else if (ability === rules.pulses.ability) rules.pulses.start(elapsedSeconds, attackIndex, target);
      },
      setAttackClock: seconds => { state.attackClock = seconds; },
    });
    for (let index = pulses.length - 1; index >= 0; index--) {
      const pulse = pulses[index], previous = pulse.maxTimer - pulse.timer;
      pulse.timer -= dt;
      if (!pulse.hitPlayer && rules.pulses.hits(Math.hypot(player.x - pulse.x, player.y - pulse.y), previous, pulse.maxTimer - pulse.timer, player.r)) {
        pulse.hitPlayer = true; damagePlayer(BOSS_DAMAGE_PROFILES[kind].crystalBurst);
        spawnBurst(player.x, player.y, rules.pulses.hitColor, 24, 210);
      }
      if (pulse.timer <= 0) pulses.splice(index, 1);
    }
    const laser = state.shatter;
    if (laser) {
      const activeDt = Math.max(0, dt - Math.max(0, laser.windup));
      laser.windup = Math.max(0, laser.windup - dt);
      if (activeDt > 0) {
        const previousProgress = clamp(1 - laser.timer / laser.duration, 0, 1);
        laser.timer -= activeDt;
        let onFront = true;
        if (rules.laser.front) {
          const progress = clamp(1 - laser.timer / laser.duration, 0, 1);
          const span = rules.laser.front.range - rules.laser.front.innerRange;
          const minRadius = rules.laser.front.innerRange + span * previousProgress;
          const maxRadius = rules.laser.front.innerRange + span * progress;
          const distance = Math.hypot(player.x - state.x, player.y - state.y);
          onFront = distance >= minRadius - 42 && distance <= maxRadius + 42;
        }
        if (!laser.hitPlayer && onFront && rules.laser.hits(player.x - state.x, player.y - state.y, laser.angle, player.r)) {
          laser.hitPlayer = true; damagePlayer(BOSS_DAMAGE_PROFILES[kind].shatter);
          spawnBurst(player.x, player.y, "#56f7ff", 24, 240);
        }
        if (laser.timer <= 0) { state.shatter = null; state.attackClock = 2.8; }
      }
    }
    if (sharedTimeline || state.shatter || pulses.length) return;
    state.attackClock -= dt;
    if (state.attackClock > 0 || Math.hypot(player.x - state.x, player.y - state.y) > rules.aggroRange) return;
    if (state.nextAttack === rules.laser.ability) rules.laser.start(0, player); else rules.pulses.start(0, undefined, player);
  }

  function resolveCollision(target: BossStates[BossKind], damage: number, cooldown: number) {
    if (target.dead) return;
    const dx = player.x - target.x;
    const centreY = target.y + (target.hitboxOffsetY ?? 0);
    const dy = player.y - centreY;
    const horizontal = target.r + player.r;
    const vertical = bossVerticalRadius(target.r, target.ry) + player.r;
    // Expand the tuned ellipse by the player's radius for body contact.
    // The old circle pushed players away from empty air above short bosses.
    const scaledDistance = Math.hypot(dx / horizontal, dy / vertical);
    if (scaledDistance >= 1) return;
    if (target.contactDamageClock <= 0) { damagePlayer(damage); target.contactDamageClock = cooldown; }
    player.x = target.x + (scaledDistance > .001 ? dx / scaledDistance : horizontal);
    player.y = centreY + (scaledDistance > .001 ? dy / scaledDistance : 0);
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

  const UPDATES: Record<BossKind, (dt: number) => void> = {
    dragon: updateBoss,
    spider: updateSpiderBoss,
    frostclaw: updateFrostclawBoss,
    magmalisk: (dt) => updateConeBoss("magmalisk", dt),
    gloomroot: (dt) => updateConeBoss("gloomroot", dt),
    tidewyrm: (dt) => updateConeBoss("tidewyrm", dt),
    koiShogun: (dt) => updateConeBoss("koiShogun", dt),
    tempestKirin: (dt) => updateConeBoss("tempestKirin", dt),
    miremaw: (dt) => updateConeBoss("miremaw", dt),
    prismshell: (dt) => updateConeBoss("prismshell", dt),
    ironhorn: (dt) => updateConeBoss("ironhorn", dt),
    dreadreaper: (dt) => updateConeBoss("dreadreaper", dt),
    voltwarden: (dt) => updatePulseBoss("voltwarden", dt),
    gravebloom: (dt) => updatePulseBoss("gravebloom", dt),
    aegisPrime: (dt) => updatePulseBoss("aegisPrime", dt),
  };

  const byKind = perBoss((kind): BossBehaviour => ({
    reset: () => resetBoss(kind),
    sync: kind === "dragon" ? syncDragonState : () => syncState(kind as StandardKind),
    update: UPDATES[kind],
    resolveCollision: () => resolveCollision(
      bosses[kind],
      BOSS_DAMAGE_PROFILES[kind].contact,
      kind === "dragon" ? DRAGON_CONTACT_DAMAGE_COOLDOWN : .75,
    ),
  }));

  return {
    byKind,
    forMap: (mapId) => {
      const definition = bossForMap(mapId);
      return definition ? byKind[definition.kind] : null;
    },
    resetAll: () => { for (const kind of BOSS_KINDS) byKind[kind].reset(); },
    applyBossKnockback,
    onPortalCutsceneFinished() {
      // Rewards held back while a first kill's portal reveal played, in map order.
      for (const kind of BOSS_KINDS) {
        const result = encounters[kind].queuedResult;
        encounters[kind].queuedResult = null;
        if (!result) continue;
        if (kind === "dragon") showDragonResult(result);
        else showResult(kind, result);
      }
    },
  };
}
