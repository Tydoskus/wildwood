import type { DuelCombatModifiers } from "../../shared/duel-combat";
import type { PlayerGender } from "../../shared/player-gender";
import type { ResearchId } from "../../shared/research";
import type { PlayerProgress } from "./services/progress";
import type { RemoteEquipment } from "./services/remote-equipment";

export type RemoteRegularEnemyCombatVisual = {
  enemySiteId: number;
  targetX: number;
  targetY: number;
  targetRadius: number;
  hits: number;
  projectileProgress: number;
  throwClock: number;
  critical: boolean;
  hp: number;
  maxHp: number;
  /** The weapon fought with, so its attack is drawn whatever look is held. */
  weaponItem?: string;
};

/** Existing saved stats needed to reproduce a remote regular-enemy fight locally. */
export type RemoteCombatStats = {
  melee?: boolean;
  /** The equipped weapon (saved progress); the player row only carries the look drawn. */
  weaponItem?: string;
  damage: number;
  maxHp: number;
  armor: number;
  regen: number;
  attackInterval: number;
  projectileSpeed: number;
  projectileCount: number;
  attackRange: number;
  criticalChance: number;
  criticalDamageMultiplier: number;
};

export type RemotePlayer = RemoteEquipment & {
  id: string;
  name: string;
  power: number;
  x: number;
  y: number;
  speed: number;
  facing: number;
  moving: boolean;
  /** Server-time pose used for deterministic regular-enemy decisions. */
  simulationX?: number;
  simulationY?: number;
  throwClock?: number;
  regularEnemyCombat?: RemoteRegularEnemyCombatVisual;
  /** The equipped weapon while fighting; the hand items may be a look of another kind. */
  weaponItem?: string;
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
  reactionCountsJson?: string;
  guildReplayKey?: string;
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
/** Research set aside with the time it still needs; starting it again resumes it. */
export type PausedResearch = { researchId: ResearchId; targetRank: number; remainingMs: number };

export type PlayerPrestige = {
  level: number;
  perkPoints: number;
  peakPower: number;
  prestigedAtMs: number;
};

export type PlayerPrestigePerks = {
  keenEdge: number;
  doubleStrike: number;
  splitShot: number;
  riposte: number;
  bossSlayer?: number;
  secondWind?: number;
  longShot?: number;
  fleetFoot?: number;
  quickDraw?: number;
  weaponCards?: number;
  helmetCards?: number;
  armorCards?: number;
};

export type SlotUpgradeQueue = 1 | 2 | 3;

export type ActiveItemUpgrade = {
  slot: SlotUpgradeQueue;
  itemId: string;
  currentLevel: number;
  targetLevel: number;
  startedAtMs: number;
  completesAtMs: number;
  paused: boolean;
  remainingMs: number;
};

export type PlayerLifetime = {
  chatHeartsReceived?: number;
  joinedAtMs: number;
  playedSeconds: number;
  sessionStartedAtMs: number;
  enemyKills: number;
  deathCount: number;
};

export type PlayerProfileData = {
  prestigeChallenge?: import("../../shared/prestige-challenge").PrestigeChallenge;
  aggroChallenge?: import("../../shared/aggro-challenge").AggroChallenge;
  prestigeLevel?: number;
  /** Another player's Guild stat gain (get_stat_gain_bonus), once the server answers; your own comes from weeklyQuests. */
  questBonus?: number;
  prestigePerks?: Partial<import("../../shared/prestige-perks").PrestigePerkRanks>;
  /** Their soul stats as the server holds them (profile_soul_stats), null with none; the profile drops them during a challenge. */
  soulStats?: import("../../shared/soul-dimension").SoulStats | null;
  identity: string;
  name: string;
  gender: PlayerGender;
  progress: PlayerProgress;
  research: PlayerResearch;
  itemUpgradeLevels: Record<string, number>;
  /** Each first copy's refine by item id (player_item_refine); the worn items' are what stats read. +0 is missing. */
  itemRefines?: Record<string, number>;
  /** Each unlocked look's kept refine by item id (player_cosmetic_refine): a look's ★10/★20 art, never its stats. */
  cosmeticRefines?: Record<string, number>;
  /** The bonus item ids they switched off (player_bonus_toggle): profiles count stats with them left out, as the server does. */
  bonusOff?: readonly string[];
  /** The active cards they chose by type (player_active_card), waiting ones included; profileActiveCardIds keeps those in play. */
  activeCards?: import("../../shared/active-cards").ActiveCards;
  /** The equipped weapon's skill roll (player_worn_skill), for showing it on the profile. */
  wornSkill?: { itemId: string; roll: Record<string, number> } | null;
  /** The Mining stat (my_mining for your own, player_mining_level for anyone else's); null before their first rock. */
  mining?: number | null;
  /** The Woodcutting stat (my_woodcutting for your own, player_woodcutting_level for anyone else's); null before their first tree. */
  woodcutting?: number | null;
  /** Weapon Mastery levels by school (player_weapon_mastery for your own, player_mastery_level for anyone else's); a missing school is level 0. */
  mastery?: Partial<Record<import("../../shared/weapon-mastery").WeaponSchool, number>> | null;
  /** Craft levels (my_craft_skills for your own, player_craft_level for anyone else's); a craft never practised is missing. */
  crafts?: Partial<Record<import("../../shared/crafting").CraftSkill, number>> | null;
  lifetime: PlayerLifetime;
  mapId?: string;
};

export type LeaderboardEntry = {
  rank?: number;
  identity: string;
  name: string;
  gender: PlayerGender;
  power: number;
  damage: number;
  maxHp: number;
  armor: number;
  regen: number;
  playedSeconds: number;
  /** When the account began (ms), sent with Account Created. */
  joinedAt?: number;
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

export type DuelState = DuelCombatModifiers & {
  combatVersion?: number;
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
  challengerWeaponItem?: string;
  opponentWeaponItem?: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};

export type DuelReplay = DuelCombatModifiers & {
  combatVersion?: number;
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
  challengerWeaponItem?: string;
  opponentWeaponItem?: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};
