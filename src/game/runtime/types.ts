import type { EnemyDefinition, EnemyKind, RewardType } from "../enemies";

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
  moving: boolean;
};

export type Projectile = Circle & {
  vx: number;
  vy: number;
  damage: number;
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
  facingX: -1 | 1;
  wandering: boolean;
  wanderTargetX: number;
  wanderTargetY: number;
  wanderWait: number;
  attackClock: number;
  moveSpeedRecovery: number;
  hurt: number;
  dead: boolean;
  phase: number;
};

export type BossCone = {
  angle: number;
  windup: number;
  timer: number;
  duration: number;
  hitPlayer: boolean;
  pushAngle: number | null;
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

export type BossTarget = DragonBossState | SpiderBossState;
export type CombatTarget = EnemyState | BossTarget;

export type DuelPresentation = {
  id: bigint;
  elapsed: number;
  challengerHp: number;
  opponentHp: number;
};

export type DuelReturnState = Position & {
  facing: number;
};

export type DuelCombatant = Position & {
  identity?: string;
  name: string;
  hp: number;
  maxHp: number;
  facing: number;
  isLocal: boolean;
};

export type DuelShot = Position & {
  color: string;
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
  lastState: {
    challengerHp: number;
    opponentHp: number;
  };
};

/**
 * Narrow client boundary. Kept structural instead of importing wildwood-coop
 * so the core game runtime does not create a type cycle through Window.
 */
export type RuntimeDuelState = {
  id: bigint;
  challenger: string;
  opponent: string;
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
};

export type RuntimeDuelReplay = {
  id: bigint;
  challengerIdentity: string;
  opponentIdentity: string;
  challengerName: string;
  opponentName: string;
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
};

export type RuntimeReward = { type: RewardType; amount: number };
