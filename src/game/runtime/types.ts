import type { EnemyDefinition, EnemyKind, RewardType } from "../enemies";
import type { PlayerGender } from "../../../shared/player-gender";

/** Shared position used by collision, projectiles, and world actors. */
export type Position = {
  x: number;
  y: number;
};

export type Circle = Position & {
  r: number;
};

export type PlayerState = Circle & {
  speed: number;
  hp: number;
  /** Persisted max-health stat before temporary equipment multipliers. */
  baseMaxHp: number;
  maxHp: number;
  damage: number;
  attackRate: number;
  projectileSpeed: number;
  projectileCount: number;
  attackRange: number;
  knockback: number;
  armor: number;
  regen: number;
  attackClock: number;
  throwClock: number;
  hurtClock: number;
  facing: number;
  combatFacing: number | null;
  moving: boolean;
};

export type Projectile = Circle & {
  vx: number;
  vy: number;
  damage: number;
  critical: boolean;
  /** Absolute simulation time when this projectile became active. */
  spawnedAtSeconds?: number;
  /** Time remaining for collision checks; visual tail can continue after it expires. */
  hitLife?: number;
  life: number;
  trail: number;
};

export type EnemyShot = Circle & {
  vx: number;
  vy: number;
  damage: number;
  life: number;
};

export type EnemyState = Circle & {
  isBoss?: false;
  type: EnemyKind;
  siteId: number;
  campName: string;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  reward: EnemyDefinition["reward"];
  aggroRadius: number;
  leashRange: number;
  engaged: boolean;
  leashing: boolean;
  /** Stable identity selected by deterministic regular-enemy aggro. */
  aggroTargetId?: string | null;
  aggroStartedAtTick?: number;
  combatTargetX?: number;
  combatTargetY?: number;
  /** Display-only HP from an observer's remote combat shadow. */
  remoteCombatHp?: number;
  /** Presentation-only copy used to show another player's regular-enemy fight. */
  remoteCombatGhost?: boolean;
  /** Zero-to-one squash/fade state for a defeated presentation-only copy. */
  remoteCombatDeathProgress?: number;
  facingX: -1 | 1;
  wandering: boolean;
  wanderTargetX: number;
  wanderTargetY: number;
  wanderWait: number;
  attackClock: number;
  /** Seconds since an actual strike/shot, used only by sprite animation. */
  attackAnimationElapsed?: number;
  moveSpeedRecovery: number;
  hurt: number;
  dead: boolean;
  phase: number;
  idleUpdateElapsed: number;
};

export type BossCone = {
  angle: number;
  windup: number;
  timer: number;
  duration: number;
  hitPlayer: boolean;
};

export type BossRainStrike = Circle & {
  timer: number;
  maxTimer: number;
};

export type SpiderWeb = {
  timer: number;
  duration: number;
  hitPlayer: boolean;
};

export type SpiderVenomPool = Circle & {
  timer: number;
  maxTimer: number;
};

export type FrostclawIcefall = Circle & {
  timer: number;
  maxTimer: number;
};

export type MagmaliskEruption = Circle & {
  timer: number;
  maxTimer: number;
};

export type GloomrootBloom = Circle & {
  timer: number;
  maxTimer: number;
};

export type TidewyrmWhirlpool = Circle & {
  timer: number;
  maxTimer: number;
};

export type KoiShogunWhirlpool = Circle & {
  timer: number;
  maxTimer: number;
};

export type TempestKirinThunderbolt = Circle & {
  timer: number;
  maxTimer: number;
};

export type MiremawBogBurst = Circle & {
  timer: number;
  maxTimer: number;
};
export type PrismshellCrystalBurst = Circle & {
  timer: number;
  maxTimer: number;
};

export type FrostclawRoar = {
  windup: number;
  timer: number;
  duration: number;
  hitPlayer: boolean;
};

export type FrostclawRift = {
  angle: number;
  windup: number;
  timer: number;
  duration: number;
  hitPlayer: boolean;
};

type BossStateBase = Circle & {
  isBoss: true;
  maxHp: number;
  hp: number;
  dead: boolean;
  hpLossFlashFrom: number;
  hpLossFlashTimer: number;
  contactDamageClock: number;
  hurt: number;
  attackClock: number;
  encounter: bigint | null;
};

export type DragonBossState = BossStateBase & {
  hurt: number;
  nextAttack: "cone" | "rain";
  cone: BossCone | null;
};

export type SpiderBossState = BossStateBase & {
  bossKind: "spider";
  nextAttack: "web" | "venom";
  web: SpiderWeb | null;
};

export type FrostclawBossState = BossStateBase & {
  bossKind: "frostclaw";
  nextAttack: "roar" | "icefall" | "rift";
  roar: FrostclawRoar | null;
  rift: FrostclawRift | null;
};

export type MagmaliskBossState = BossStateBase & {
  bossKind: "magmalisk";
  nextAttack: "bite" | "eruption";
  bite: BossCone | null;
};

export type GloomrootBossState = BossStateBase & {
  bossKind: "gloomroot";
  nextAttack: "sweep" | "bloom";
  sweep: BossCone | null;
};

export type TidewyrmBossState = BossStateBase & {
  bossKind: "tidewyrm";
  nextAttack: "surge" | "whirlpool";
  surge: BossCone | null;
};

export type KoiShogunBossState = BossStateBase & {
  bossKind: "koiShogun";
  nextAttack: "slash" | "whirlpool";
  slash: BossCone | null;
};

export type TempestKirinBossState = BossStateBase & {
  bossKind: "tempestKirin";
  nextAttack: "charge" | "thunder";
  charge: BossCone | null;
};

export type MiremawBossState = BossStateBase & {
  bossKind: "miremaw";
  nextAttack: "tongue" | "bogBurst";
  tongue: BossCone | null;
};
export type PrismshellBossState = BossStateBase & {
  bossKind: "prismshell";
  nextAttack: "shatter" | "crystalBurst";
  shatter: BossCone | null;
};

export type BossTarget = DragonBossState | SpiderBossState | FrostclawBossState | MagmaliskBossState | GloomrootBossState | TidewyrmBossState | KoiShogunBossState | TempestKirinBossState | MiremawBossState | PrismshellBossState;

export type DuelPresentation = {
  id: bigint;
  elapsed: number;
  challengerHp: number;
  opponentHp: number;
};

export type DuelCombatant = Position & {
  identity?: string;
  name: string;
  gender: PlayerGender;
  hp: number;
  maxHp: number;
  deathStartedAtMs?: number;
  facing: number;
  combatFacing: number;
  throwClock: number;
  isLocal: boolean;
  headItem: string;
  chestItem: string;
  feetItem: string;
  rightHandItem: string;
  leftHandItem: string;
};

export type DuelShot = Position & {
  color: string;
  weaponItem: string;
  angle: number;
};

export type DuelScene = {
  challenger: DuelCombatant;
  opponent: DuelCombatant;
  shots: DuelShot[];
  countdown: number;
};

export type ReplayMode = {
  replay: RuntimeDuelReplay;
  start: number;
  lastElapsed: number;
  challengerDeathStartedAtMs?: number;
  opponentDeathStartedAtMs?: number;
  lastState: {
    challengerHp: number;
    opponentHp: number;
  };
};

/**
 * Narrow client boundary. Kept structural instead of importing wildstat-coop
 * so the core game runtime does not create a type cycle through Window.
 */
export type RuntimeDuelState = {
  id: bigint;
  challenger: string;
  opponent: string;
  challengerName: string;
  opponentName: string;
  challengerGender: PlayerGender;
  opponentGender: PlayerGender;
  status: string;
  createdAtMs: number;
  startsAtMs: number;
  startedAtMs: number;
  endsAtMs: number;
  challengerHp: number;
  challengerMaxHp: number;
  challengerDamage: number;
  challengerArmor: number;
  challengerAttackRate: number;
  challengerRegen: number;
  challengerAttacks: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentDamage: number;
  opponentArmor: number;
  opponentAttackRate: number;
  opponentRegen: number;
  opponentAttacks: number;
  challengerHeadItem: string;
  challengerChestItem: string;
  challengerFeetItem: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};

export type RuntimeDuelReplay = {
  id: bigint;
  challengerIdentity: string;
  opponentIdentity: string;
  challengerName: string;
  opponentName: string;
  challengerGender: PlayerGender;
  opponentGender: PlayerGender;
  winnerName: string;
  durationSeconds: number;
  challengerMaxHp: number;
  challengerDamage: number;
  challengerArmor: number;
  challengerAttackRate: number;
  challengerRegen: number;
  challengerFinalHp: number;
  challengerAttacks: number;
  challengerDamageDealt: number;
  challengerRegened: number;
  challengerBlocked: number;
  opponentMaxHp: number;
  opponentDamage: number;
  opponentArmor: number;
  opponentAttackRate: number;
  opponentRegen: number;
  opponentFinalHp: number;
  opponentAttacks: number;
  opponentDamageDealt: number;
  opponentRegened: number;
  opponentBlocked: number;
  challengerHeadItem: string;
  challengerChestItem: string;
  challengerFeetItem: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};

export type RuntimeReward = { type: RewardType; amount: number };
