import type { PlayerGender } from "../../shared/player-gender";
import type { ResearchId } from "../../shared/research";
import type { PlayerProgress } from "./services/progress";
import type { RemoteBossAttackVisual } from "./services/remote-boss-attack";
import type { RemoteEquipment } from "./services/remote-equipment";

export type RemotePlayer = RemoteEquipment & {
  id: string;
  name: string;
  power: number;
  x: number;
  y: number;
  speed: number;
  facing: number;
  moving: boolean;
  throwClock?: number;
  bossAttack?: RemoteBossAttackVisual;
};

export type MapPlayerMarker = {
  id: string;
  x: number;
  y: number;
};

export type LocalPlayerState = {
  x: number;
  y: number;
  facing: number;
  speed: number;
  moving: boolean;
  lastInputSequence: number;
  mapId: string;
};

export type RemotePlayerDeath = {
  id: string;
  mapId: string;
  x: number;
  y: number;
  facing: number;
  startedAtMs: number;
};

export type ChatMessage = {
  id: bigint;
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
  powerLevel: number;
  senderGender: PlayerGender;
  moderated: boolean;
  replyToMessageId: bigint;
  replyToSenderName: string;
  replyToMessage: string;
  sentAtMs: number;
};

export type { PlayerProgress } from "./services/progress";

export type PlayerResearch = Record<ResearchId, number>;
export type ActiveResearch = {
  researchId: ResearchId;
  targetRank: number;
  startedAtMs: number;
  completesAtMs: number;
};

export type UpgradeBenchSlot = 1 | 2;

export type ActiveItemUpgrade = {
  slot: UpgradeBenchSlot;
  itemId: string;
  currentLevel: number;
  targetLevel: number;
  startedAtMs: number;
  completesAtMs: number;
  paused: boolean;
  remainingMs: number;
};

export type PlayerLifetime = {
  joinedAtMs: number;
  playedSeconds: number;
  sessionStartedAtMs: number;
  enemyKills: number;
  deathCount: number;
};

export type PlayerProfileData = {
  identity: string;
  name: string;
  gender: PlayerGender;
  progress: PlayerProgress;
  research: PlayerResearch;
  itemUpgradeLevels: Record<string, number>;
  lifetime: PlayerLifetime;
  mapId?: string;
};

export type LeaderboardEntry = {
  identity: string;
  name: string;
  gender: PlayerGender;
  power: number;
  damage: number;
  maxHp: number;
  armor: number;
  regen: number;
  playedSeconds: number;
  isGuest: boolean;
  skinTone: number;
  headItem: string;
  chestItem: string;
  feetItem: string;
  rightHandItem: string;
  leftHandItem: string;
};

export type AccessAuditEntry = {
  identity: string;
  displayName: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  accountType: string;
  lastProtocolVersion: number;
  label: string;
};

export type BugReportEntry = {
  id: bigint;
  reporter: string;
  reporterName: string;
  message: string;
  protocolVersion: number;
  reportedAtMs: number;
};

export type DragonBossState = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMs: number;
};

export type SpiderBossState = DragonBossState;
export type SpiderResult = DragonResult;
export type FrostclawBossState = DragonBossState;
export type FrostclawResult = DragonResult;
export type MagmaliskBossState = DragonBossState;
export type MagmaliskResult = DragonResult;

export type DragonContributor = {
  identity: string;
  name: string;
  gender: PlayerGender;
  damage: number;
  percentage: number;
};

export type DragonResult = {
  encounter: bigint;
  totalDamage: number;
  contributors: DragonContributor[];
  createdAtMs: number;
};

export type DuelState = {
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

export type DuelReplay = {
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
