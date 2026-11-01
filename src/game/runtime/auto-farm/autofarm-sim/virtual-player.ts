/**
 * A headless "virtual player" for autofarm: the game's own frame step
 * (game-session-controller.ts simulate) wired as main.ts wires it, minus the
 * renderer, the network and the DOM. Player combat, enemy AI, respawns, bosses
 * (campaign and Endless), map travel and autofarm are the real modules; what
 * the server owns (map unlocks on a boss kill, the death screen's respawn) is
 * stood in for here. Research and upgrades never change; kills pay gold and Weapon Mastery, and the Smith's
 * next grades are bought from them as the game's Smith sells them (src/balance/smith-purchases.ts).
 *
 * Every clock the game reads (performance.now, Date.now) and Math.random are
 * replaced by a simulated, seeded copy for the run, so a run is repeatable and
 * runs as fast as the CPU allows. Global tables (ENEMY_TYPES, the installed map
 * balance, WORLD) are shared, so run players one after another, never at once.
 */
import { createGameBootstrap } from '../../game-bootstrap';
import { createEnemyLifecycle } from '../../enemies/enemy-lifecycle';
import { createEnemySimulation, LOCAL_REGULAR_ENEMY_TARGET_ID } from '../../enemies/enemy-simulation';
import type { RemoteCombatStats, RemotePlayer } from '../../../../wildstat-coop';
import { createPlayerCombatController, type PlayerCombatController } from '../../player-combat-controller';
import { createPlayerController, type PlayerController } from '../../player-controller';
import { createMapController } from '../../map-controller';
import { createBossController } from '../../boss/boss-controller';
import { BOSSES, bossStateForMap } from '../../boss/boss-registry';
import { createPersonalBosses } from '../../boss/personal-bosses';
import { createProceduralBossController } from '../../boss/procedural-boss-controller';
import { createRegularEnemyRespawn, REGULAR_ENEMY_RESPAWN_SECONDS } from '../../enemies/regular-enemy-respawn';
import { createRespawnMemory } from '../../respawn-memory';
import { createBossFightMemory } from '../../boss/boss-fight-memory';
import { createResearchController } from '../../research-controller';
import { createAutoFarmController, type AutoFarmController } from '../auto-farm-controller';
import type { KiteTuning } from '../auto-farm-dodge';
import { AUTO_FARM_PULL_KEY, farmGroupOf, writeAutoFarmPullGroups } from '../auto-farm-priority';
import { isEnemyAttackingPlayer } from '../../enemies/enemy-threat';
import { chaseDamage } from '../auto-farm-kite-model';
import { enemyChaseSpeed } from '../../../../../shared/rules';
import { damageAfterArmor } from '../../../../../shared/combat';
import { createAutoFarmProgress, farmMapRank } from '../auto-farm-build';
import { bossAggroRange } from '../boss-zone';
import { createPowerGainMeter, type FarmPush } from '../auto-farm-brain';
import { applyMapBalance } from '../../map-balance-loader';
import { refreshMapBalanceEnemies } from '../../enemies/map-balance-enemies';
import { createPlayerStatsRuntime } from '../../player-stats-runtime';
import { setPlayerBaseMaxHealth } from '../../player-health';
import { weaponAttackRange } from '../../../weapon-combat';
import { WORLD } from '../../../constants';
import { ENEMY_TYPES } from '../../../enemies';
import type { MapId } from '../../../world';
import { resolveMapBalance } from '../../../../../shared/map-balance';
import { runtimeMapBalance } from '../../../../../shared/map-balance-runtime';
import { GAME_BALANCE } from '../../../../balance/game-balance';
import { worldBoundsFor } from '../../../../../shared/world-bounds';
import { CAMPAIGN_MAPS } from '../../../../../shared/campaign-registry';
import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../../../shared/rules';
import { campaignMapUnlocked, type CampaignAccess } from '../../../../../shared/equipment-access';
import { isProceduralMap, proceduralMapNumber } from '../../../../../shared/procedural-maps';
import { regularEnemySimulationTick } from '../../../../../shared/regular-enemy-simulation';
import { prestigePerkValue, type PrestigePerkRanks } from '../../../../../shared/prestige-perks';
import { challengeMinimumInterval } from '../../../../../shared/prestige-challenge';
import { createEmptyResearchRanks, type ResearchRanks } from '../../../../../shared/research';
import type { BowSkillRoll } from '../../../../../shared/bow-skills';
import type { PlayerPowerStats } from '../../../../../shared/player-power';
import { AUTO_FARM_ADVANCE_KEY, writeMovePower } from '../auto-farm-plan';
import { ITEM_DEFINITIONS, type ItemId } from '../../../../../shared/items';
import { effectivePlayerPowerStats, unroundedPlayerPower } from '../../../../../shared/player-power';
import { rollBossGold, rollKillGold } from '../../../../../shared/gold';
import { luckMultiplier } from '../../../../../shared/luck-research';
import { masteryAttackRange, masteryInPlay, masteryPointsForReport, masteryPointsInPlay, weaponSchool } from '../../../../../shared/weapon-mastery';
import { SMITH_VISIT_SECONDS, nextSmithPurchase, type MasteryPointsBySchool } from '../../../../balance/smith-purchases';

export const SIM_STEP_SECONDS = 1 / 60;
const STEP_MS = 1000 / 60;
/** The death screen: the fall, then the three-second countdown (death-screen-controller.ts). */
const DEATH_RESPAWN_MS = 850 + 3_000;
const SIM_EPOCH_MS = Date.UTC(2026, 9, 7, 12);

/**
 * Each map's live balance as the server would send it, resolved before any virtual player applies one:
 * applyMapBalance rewrites the shared enemy and boss definitions, so resolving after it scales them twice.
 */
const pristineBalances = new Map<string, ReturnType<typeof resolveMapBalance>>();
for (const mapId of CAMPAIGN_MAP_IDS) pristineBalances.set(mapId, resolveMapBalance(mapId, GAME_BALANCE.settings, GAME_BALANCE.revision));
function pristineBalance(mapId: string) {
  let snapshot = pristineBalances.get(mapId);
  if (!snapshot) { snapshot = resolveMapBalance(mapId, GAME_BALANCE.settings, GAME_BALANCE.revision); pristineBalances.set(mapId, snapshot); }
  return snapshot;
}

export type VirtualPlayerProfile = {
  name: string;
  seed: number;
  /** Map it starts on. */
  startMap: string;
  /** Highest campaign index unlocked (the start map's own boss is unbeaten unless `bossBeaten`). */
  highestUnlocked: number;
  /** The start map's boss is already beaten, so its way forward is open. */
  bossBeaten?: boolean;
  /** Endless stages already cleared. */
  endlessCompleted?: number;
  /** Earned base stats (before gear and research), as saved. */
  base: PlayerPowerStats;
  weapon: string;
  head?: string;
  chest?: string;
  /** Gold held and Mastery points at the start: kills add to both, and the Smith's next grades are bought from them. */
  gold?: number;
  masteryPoints?: MasteryPointsBySchool;
  /** False: gear, gold and Mastery stay as they start, to compare one thing at a time. */
  economy?: boolean;
  projectileCount?: number;
  bowSkills?: Partial<BowSkillRoll>;
  perks?: Partial<PrestigePerkRanks>;
  prestigeLevel?: number;
  research?: Partial<ResearchRanks>;
  push: FarmPush;
  /** "Boss & Next Map". */
  advance: boolean;
  /** Move At: the margin Move On, and the boss holding the way, ask for (the game's default unless set). */
  moveAt?: number;
  /** Move On and Fight Bosses by readiness from the live balance (map-readiness.ts), as the game does; off, by the old power table. */
  readiness?: boolean;
  /** The Reflect Only prestige challenge. */
  reflectOnly?: boolean;
  /** The kite's tuning, for comparing kites (the game's defaults otherwise). */
  kite?: Partial<KiteTuning>;
  /** "Pull Whole Group": the farmed group comes for the player as it spawns. */
  pull?: boolean;
  /** Stat groups switched to Aggro beside the Farm ones (e.g. "stat:health"). */
  aggroGroups?: string[];
  /** An Aggro run: this many of the map's groups chase the player from arrival (Pull is off during one). */
  aggro?: number;
};

export type BossDuelSetup = {
  /** Boss health as a share of its max when the duel starts. */
  bossShare: number;
  /** Player health share when it starts. */
  playerShare: number;
};

type Sample = { t: number; map: string; power: number; phase: string; selected: string | null; x?: number; y?: number; hp: number; status: string; bossStatus: string };
type MapVisit = { map: string; from: number; to: number | null; entryPower: number; exitPower: number | null; deaths: number; reason: string };
type DeathEvent = { t: number; map: string; phase: string; selected: string | null; probation: boolean; afterBossLeave: boolean;
  /** What happened in the last 15 s: health shares taken by source, and the biggest single hit. */
  status: string; taken: Record<string, number>; biggestHit: number };
type BossAttempt = { t: number; map: string; power: number; end: number | null; outcome: 'won' | 'walked' | 'died' | 'other' | null;
  bossShareStart: number; playerShareStart: number; bossShareEnd: number | null; playerShareEnd: number | null; fightSeconds: number; base?: PlayerPowerStats;
  /** For a walk-away: the same fight fought on to the end (bossDuel). */
  foughtOn?: { won: boolean; seconds: number; bossShare: number } };
/**
 * How the fighting went: hits taken (and how much of the player's health they
 * took, in max-health shares), shots fired, and the seconds alive, with a
 * target in range (shooting), and kiting. `landed` counts hits on regular
 * enemies: each arrow (and skill arrow) that lands, reflected hits aside, and
 * the rare boss attack that catches an enemy.
 */
type Combat = {
  /** Kills of elites, of enemies on a regen camp, and of the rest; and arrows landed on each (a fight kiting keeps it in, or not). */
  killsBy: Record<string, number>; landedBy: Record<string, number>;
  /** Kills by map and stat group. */
  killsByGroup: Record<string, number>;
  hits: Record<string, number>; taken: Record<string, number>; shots: number; landed: number; aliveSeconds: number; shootingSeconds: number; kitingSeconds: number;
  /**
   * The kite model checked against the fight: for each thing the kite did with
   * melee enemies chasing (circling, backing off, standing), the seconds, the
   * melee blows landed and health they took, and the blows the model predicts
   * (auto-farm-kite-model.ts chaseDamage, from the chasers within 160 of the player's edge).
   */
  modes: Record<string, { seconds: number; hits: number; taken: number; predicted: number; predictedTaken: number }> };
/**
 * Enemies woken by walking near them (not by a shot, a pull or an Aggro run),
 * one per camp woken at once: of the farmed group or a camp already fighting
 * (own), or any other camp, and of those, how many while kiting or dodging.
 */
type Wakes = { own: number; other: number; otherKiting: number; otherCamps: Record<string, number> };
/**
 * Where it stood: seconds farming inside a standing boss's attack range, boss hits taken while not
 * fighting it, seconds after each boss win until it walked clear of the pit, and sharp turns
 * (a step autofarm asks for against the last one it asked for) per walking minute.
 */
type Placement = { nearBossSeconds: number; bossHitsFarming: number; lingers: number[]; reversals: number; walkingSeconds: number;
  /** The status at each sharp turn, last step's and this one's. */
  turnStatuses: Record<string, number> };
type Travel = { t: number; from: string; to: string; direction: 'forward' | 'back'; power: number; why: string; previousRate: number | null; rateHere: number | null };

export type VirtualPlayerReport = {
  name: string;
  simSeconds: number;
  wallMs: number;
  samples: Sample[];
  visits: MapVisit[];
  deaths: DeathEvent[];
  bossAttempts: BossAttempt[];
  travels: Travel[];
  /** Seconds spent per activity bucket and per farmed stat group. */
  activity: Record<string, number>;
  groups: Record<string, number>;
  /** Distinct status / bossStatus strings with first time seen and total seconds. */
  statuses: Record<string, { first: number; seconds: number }>;
  bossStatuses: Record<string, { first: number; seconds: number }>;
  kills: number;
  stuck: { t: number; seconds: number; status: string; map: string }[];
  startPower: number;
  endPower: number;
  endMap: string;
  autofarmStopped: { t: number; status: string }[];
  combat: Combat;
  wakes: Wakes;
  placement: Placement;
  /** Gold and Mastery points at the end, and each piece bought from the Smith. */
  gold: number;
  masteryPoints: MasteryPointsBySchool;
  purchases: { t: number; itemId: string; price: number }[];
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

/** Installs the simulated clocks and random source; returns the undo. */
function installSimGlobals(clock: { ms: number }, random: () => number) {
  const realNow = performance.now.bind(performance), realDate = Date.now, realRandom = Math.random;
  performance.now = () => clock.ms - SIM_EPOCH_MS + 1_000;
  Date.now = () => Math.floor(clock.ms);
  Math.random = random;
  return () => { performance.now = realNow; Date.now = realDate; Math.random = realRandom; };
}

function installBalance(mapId: string) {
  applyMapBalance(resolveMapBalance(mapId, GAME_BALANCE.settings, GAME_BALANCE.revision));
}

/**
 * One virtual player, built and ready to run. `run(seconds)` advances the
 * simulation; `report()` is everything measured so far.
 */
export function createVirtualPlayer(profile: VirtualPlayerProfile, options: {
  duel?: BossDuelSetup;
  /** For tests: the browser storage it keeps (a reload passes the last page's), and the clock it starts at. */
  storage?: ReturnType<typeof memoryStorage>; startMs?: number;
  /** Respawn and boss-fight memory read the simulated clock, as the browser's would read the real one (the Lab keeps the wall clock). */
  memoryOnSimClock?: boolean;
  /** For tests: the server's answer to a crossing (true by default). */
  changeMap?: (mapId: string) => boolean;
} = {}) {
  const clock = { ms: options.startMs ?? SIM_EPOCH_MS };
  const random = mulberry32(profile.seed);
  const restoreGlobals = installSimGlobals(clock, random);
  const identity = `vp-${profile.name}`;
  const storage = options.storage ?? memoryStorage();
  storage.setItem(AUTO_FARM_ADVANCE_KEY, profile.advance ? '1' : '0');
  if (profile.moveAt) writeMovePower(profile.moveAt, () => storage as Storage);
  storage.setItem(AUTO_FARM_PULL_KEY, profile.pull ? '1' : '0');
  if (profile.aggroGroups) writeAutoFarmPullGroups(profile.aggroGroups, () => storage as Storage);

  const bootstrap = createGameBootstrap();
  const { bosses, bossHazards, enemies, spawnSites, player, projectileStore, inventory } = bootstrap;
  const mapConfig = bootstrap.mapConfig;
  inventory.itemIds = [profile.weapon, profile.head ?? '', profile.chest ?? ''].filter(Boolean);
  inventory.equippedRightHand = profile.weapon;
  inventory.equippedHead = profile.head ?? '';
  inventory.equippedChest = profile.chest ?? '';
  const research = { ...createEmptyResearchRanks(), ...profile.research };
  const perks = profile.perks ?? {};
  const challenge = profile.reflectOnly ? { active: true, completed: 0 } as never : null;

  // Server-owned progress, stood in for: which maps are open.
  const access: CampaignAccess = { bossRewardClaims: 0 };
  let endlessCompleted = profile.endlessCompleted ?? 0;
  let campaignComplete = false;
  function unlockAfterBoss(mapIndex: number) {
    const map = CAMPAIGN_MAPS[mapIndex];
    access.bossRewardClaims = (access.bossRewardClaims ?? 0) | 2 ** map.claimIndex;
    const next = CAMPAIGN_MAPS[mapIndex + 1];
    if (next) (access as Record<string, unknown>)[next.unlockField] = true;
    else campaignComplete = true;
  }
  for (let index = 0; index < profile.highestUnlocked; index++) unlockAfterBoss(index);
  const startIndex = CAMPAIGN_MAP_IDS.indexOf(profile.startMap);
  if (profile.bossBeaten && startIndex >= 0) unlockAfterBoss(startIndex);
  if (isProceduralMap(profile.startMap)) unlockAfterBoss(CAMPAIGN_MAPS.length - 1);
  const mapUnlocked = (mapId: string) => isProceduralMap(mapId)
    ? campaignComplete && (proceduralMapNumber(mapId) ?? Infinity) <= endlessCompleted + 1
    : !CAMPAIGN_MAP_IDS.includes(mapId) || campaignMapUnlocked(CAMPAIGN_MAP_IDS.indexOf(mapId), access);

  let currentMapId = profile.startMap as MapId;
  let running = false;
  let gameTime = 0;
  let deathAt: number | null = null;
  const respawnMemory = createRespawnMemory(storage, () => identity, options.memoryOnSimClock ? () => clock.ms : undefined);
  const bossFightMemory = createBossFightMemory(storage, () => identity, options.memoryOnSimClock ? () => clock.ms : undefined);
  const enemyRespawnKey = (site: typeof spawnSites[number]) => `enemy:${currentMapId}:${site.id}:${site.type}:${site.campName}`;
  const noop = () => {};
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, noop, {
    remaining: site => respawnMemory.remaining(enemyRespawnKey(site)),
    gameTime: () => gameTime,
  });
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  const regularEnemyRespawn = createRegularEnemyRespawn(() => gameTime, 1,
    () => runtimeMapBalance(currentMapId)?.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS, () => research.enemyRespawn ?? 0);

  function setCurrentMap(mapId: MapId) {
    currentMapId = mapId;
    WORLD.w = worldBoundsFor(mapId).width;
    WORLD.h = worldBoundsFor(mapId).height;
  }

  // As main.ts, with no slot tiers, refines or cards: the sim plays bare graded gear.
  const playerStats = createPlayerStatsRuntime({ player, inventory, source: () => ({ researchInPlay: () => research, prestigePerks: () => perks }),
    tailwind: () => playerCombat?.tailwind() ?? 0 });
  const { healthMultiplierBonus, movementMultiplier } = playerStats;
  const researchController = createResearchController({
    prestigeLevel: () => profile.prestigeLevel ?? 0, guildQuestBonus: () => 1, prestigePerks: () => perks,
    player, getRanks: () => research, isDueling: () => false, maxPlayerStat: Number.MAX_VALUE, saveProgress: noop, healthMultiplierBonus,
    equippedFeet: () => inventory.equippedFeet, equippedWeapon: () => inventory.equippedRightHand || inventory.equippedLeftHand,
  });
  const minAttackInterval = () => challengeMinimumInterval(challenge);
  const weapon = () => inventory.equippedRightHand || inventory.equippedLeftHand;

  // Gold and Mastery, as the server keeps them. Gold rolls on a stream of its own, so combat draws the same numbers.
  const economy = profile.economy !== false;
  let gold = Math.max(0, profile.gold ?? 0);
  let masteryPoints: MasteryPointsBySchool = { ...profile.masteryPoints };
  const purchases: VirtualPlayerReport['purchases'] = [];
  const goldRandom = mulberry32(profile.seed ^ 0x5bd1e995);
  // Reflect Only and Aggro runs play without Mastery and train none.
  const masteryOff = Boolean(profile.reflectOnly || profile.aggro);
  const masteryNow = () => masteryPointsInPlay(masteryPoints, masteryOff);
  const baseAttackRange = player.attackRange;
  const applyMasteryRange = () => { player.attackRange = baseAttackRange + masteryAttackRange(masteryInPlay(masteryNow(), inventory.equippedRightHand, weapon())); };
  const powerWith = (equipped: { head: string; chest: string; feet: string; right: string }) => unroundedPlayerPower(effectivePlayerPowerStats({
    maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen,
    equippedHead: equipped.head, equippedChest: equipped.chest, equippedFeet: equipped.feet, equippedRightHand: equipped.right }, research));
  /** Wears a piece just bought unless it would lower power, as auto-equip does. */
  function wearIfStronger(itemId: string) {
    const slot = ITEM_DEFINITIONS[itemId as ItemId]?.slot;
    const current = { head: inventory.equippedHead, chest: inventory.equippedChest, feet: inventory.equippedFeet, right: inventory.equippedRightHand };
    const next = { ...current, ...(slot === 'HAND' ? { right: itemId } : slot === 'HEAD' ? { head: itemId } : slot === 'CHEST' ? { chest: itemId } : slot === 'FEET' ? { feet: itemId } : {}) };
    if (powerWith(next) + 1e-9 < powerWith(current)) return;
    inventory.equippedRightHand = next.right; inventory.equippedHead = next.head; inventory.equippedChest = next.chest; inventory.equippedFeet = next.feet;
    setPlayerBaseMaxHealth(player, player.baseMaxHp, healthMultiplierBonus());
    applyMasteryRange();
  }
  /** When the Smith is next visited while farming; a boss's first clear sends the player to him too. */
  let smithVisitAt = 0;
  function shop() {
    smithVisitAt = clock.ms + SMITH_VISIT_SECONDS * 1000;
    for (let buy = nextSmithPurchase(weapon(), new Set(inventory.itemIds), gold, masteryPoints); buy;
      buy = nextSmithPurchase(weapon(), new Set(inventory.itemIds), gold, masteryPoints)) {
      gold -= buy.price;
      inventory.itemIds.push(buy.itemId);
      purchases.push({ t: (clock.ms - SIM_EPOCH_MS) / 1000, itemId: buy.itemId, price: buy.price });
      wearIfStronger(buy.itemId);
    }
  }
  /** An accepted kill report: gold rolls (Gold Luck in; no cards), Mastery to the right hand's school, then the Smith when a visit is due. */
  function earn(killCount: number, firstBossClear: boolean) {
    if (!economy) return;
    gold += rollKillGold(killCount, goldRandom, luckMultiplier('gearLuck', research.gearLuck)) + (firstBossClear ? rollBossGold(goldRandom) : 0);
    if (!masteryOff) {
      const school = weaponSchool(inventory.equippedRightHand);
      masteryPoints = { ...masteryPoints, [school]: (masteryPoints[school] ?? 0) + masteryPointsForReport(killCount, firstBossClear) };
      applyMasteryRange();
    }
    // Not after every kill: gold saves up between visits, so a visit can skip grades.
    if (firstBossClear || clock.ms >= smithVisitAt) shop();
  }

  let autoFarm!: AutoFarmController;
  let lastCommand = { x: 0, y: 0 };
  /** Keys or stick held by whoever drives the player (tests); autofarm yields to it as it does to a player. */
  let manualInput: { x: number; y: number; source: 'none' | 'keyboard' } = { x: 0, y: 0, source: 'none' };
  let playerCombat!: PlayerCombatController;
  let playerController!: PlayerController;
  let kills = 0;
  /** Kills by what the game reports them as (an enemy type, or an Endless site), as a kill report sends them. */
  const claims: Record<string, number> = {};
  const onDeath: (() => void)[] = [];
  const onBossDefeated: ((mapId: string) => void)[] = [];

  const personalBosses = createPersonalBosses({
    respawns: respawnMemory, fights: bossFightMemory, ready: () => true,
    mapId: () => currentMapId, identity: () => identity, bossRespawnRank: () => research.bossRespawn ?? 0,
    alive: () => player.hp > 0, now: () => clock.ms,
    defeated: mapId => {
      // The server's unlock, at once: no reducer round trip. A boss pays gold and Mastery on its first clear in the run.
      const index = CAMPAIGN_MAP_IDS.indexOf(mapId);
      const first = index >= 0 ? !((access.bossRewardClaims ?? 0) & 2 ** CAMPAIGN_MAPS[index].claimIndex)
        : isProceduralMap(mapId) && (proceduralMapNumber(mapId) ?? 0) > endlessCompleted;
      if (first) earn(0, true);
      if (index >= 0) unlockAfterBoss(index);
      else if (isProceduralMap(mapId)) endlessCompleted = Math.max(endlessCompleted, proceduralMapNumber(mapId) ?? 0);
      for (const listener of onBossDefeated) listener(mapId);
    },
  });
  /** Damage taken lately, by what dealt it, as shares of max health: why each death happened. */
  let hits: { at: number; kind: string; share: number }[] = [];
  const combat: Combat = { killsBy: {}, killsByGroup: {}, landedBy: {}, modes: {}, hits: {}, taken: {}, shots: 0, landed: 0, aliveSeconds: 0, shootingSeconds: 0, kitingSeconds: 0 };
  /** Inside a hit on the player: the combat callback it fires is not a shot. */
  let dealing = false;
  function taken<T>(kind: string, deal: () => T) {
    const before = player.hp, outer = dealing;
    dealing = true;
    let result: T;
    try { result = deal(); } finally { dealing = outer; }
    if (player.hp < before && player.maxHp > 0) {
      const share = (before - Math.max(0, player.hp)) / player.maxHp;
      hits.push({ at: clock.ms, kind, share });
      combat.hits[kind] = (combat.hits[kind] ?? 0) + 1;
      combat.taken[kind] = (combat.taken[kind] ?? 0) + share;
      if (kind === 'regular' || kind === 'elite') { const mode = modeNow(); mode.hits++; mode.taken += share; }
      if (kind === 'boss' && autoFarm?.state().phase !== 'boss') placement.bossHitsFarming++;
    }
    return result;
  }
  const modeNow = () => combat.modes.none ??= { seconds: 0, hits: 0, taken: 0, predicted: 0, predictedTaken: 0 };
  const enemyKind = (enemy: typeof enemies[number]) => { const definition = enemy.definition ?? ENEMY_TYPES[enemy.type]; return definition.elite ? 'elite' : definition.regen ? 'regen' : 'regular'; };
  const wakes: Wakes = { own: 0, other: 0, otherKiting: 0, otherCamps: {} };
  const placement: Placement = { nearBossSeconds: 0, bossHitsFarming: 0, lingers: [], reversals: 0, walkingSeconds: 0, turnStatuses: {} };
  let lastStatus = '';
  /** The enemy simulation's own aggro: an enemy woken by the player walking near it. */
  function proximityEngage(enemy: typeof enemies[number], targetId?: string | null, startedAtTick?: number) {
    if (!enemy.engaged && !autoFarm.pulls(enemy) && !autoFarm.forced(enemy)) {
      const state = autoFarm.state();
      const own = (state.phase === 'farm' && state.selected === farmGroupOf(enemy))
        || enemies.some(other => other !== enemy && other.campName === enemy.campName && isEnemyAttackingPlayer(other, identity));
      if (own) wakes.own++;
      else {
        wakes.other++;
        wakes.otherCamps[`${currentMapId}|${enemy.campName}`] = (wakes.otherCamps[`${currentMapId}|${enemy.campName}`] ?? 0) + 1;
        if (/Kiting|Dodging/.test(state.status)) wakes.otherKiting++;
      }
    }
    engageEnemy(enemy, targetId, startedAtTick);
  }
  // Other players on the map, for tests: none unless one is placed.
  const remotePlayers: RemotePlayer[] = [];
  const remoteCombatStats = new Map<string, RemoteCombatStats>();
  const proceduralBoss = createProceduralBossController({
    mapId: () => currentMapId, state: mapId => ({ ready: true, completed: endlessCompleted, boss: personalBosses.proceduralState(mapId) }),
    enemies, player, spawn: spawnFromSite,
    damagePlayer: (damage, source) => taken('boss', () => playerCombat.damagePlayer(damage, source)),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss), burst: noop, shot: projectileStore.spawnEnemyShot,
  });
  const enemySimulation = createEnemySimulation(enemies, projectileStore.spawnEnemyShot, player,
    () => ({ width: 1280, height: 720, zoom: 1 }), proximityEngage,
    (amount, source) => taken(source?.generatedBoss ? 'boss' : source && (source.definition ?? ENEMY_TYPES[source.type])?.elite ? 'elite' : 'regular',
      () => playerCombat.damagePlayer(amount, source)), {
      currentMapId: () => currentMapId, serverNowMs: () => clock.ms, localIdentity: () => identity,
      remotePlayers: () => remotePlayers, remoteCombatStats: id => remoteCombatStats.get(id),
      playerMovementSpeed: () => player.speed * movementMultiplier(),
      playerAttackRange: () => weaponAttackRange(weapon(), player.attackRange),
      pullAggro: enemy => autoFarm.pulls(enemy) || autoFarm.forced(enemy),
    });

  const farmProgress = createAutoFarmProgress({ mapId: () => currentMapId,
    base: () => ({ maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen }),
    equipment: () => ({ equippedHead: inventory.equippedHead, equippedChest: inventory.equippedChest, equippedFeet: inventory.equippedFeet, equippedRightHand: inventory.equippedRightHand, equippedLeftHand: inventory.equippedLeftHand }),
    research: () => research, upgradeLevel: () => 0, rewardMultiplier: () => researchController.rewardMultiplier(), minAttackInterval,
    criticalChance: () => researchController.criticalChance(), criticalMultiplier: () => researchController.criticalDamageMultiplier(),
    reflectOnly: () => Boolean(profile.reflectOnly),
    fetchBalance: profile.readiness ? pristineBalance : undefined,
    mapBoss: () => {
      const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId);
      // A duel fights to the end: without its health the controller cannot judge the fight, so it never walks away.
      const shape = boss as { ry?: number; hitboxOffsetY?: number } | null;
      return boss && options.duel ? { x: boss.x, y: boss.y, r: boss.r, dead: boss.dead, isBoss: boss.isBoss, ry: shape!.ry, hitboxOffsetY: shape!.hitboxOffsetY } as never : boss;
    },
    portalUnlocked: portal => mapController.portalIsUnlocked(portal as never),
    portals: () => { const config = mapConfig[currentMapId]; return [config.portal, 'secondaryPortal' in config ? config.secondaryPortal : null]; } });

  const mapController = createMapController({
    onTravelStarted: () => autoFarm.travelStarted(),
    travelWanted: destination => autoFarm.headingTo(destination), onTravelRefused: destination => autoFarm.travelRefused(destination),
    markPortalCutsceneSeen: noop,
    mapConfig: mapConfig as never,
    getCurrentMapId: () => currentMapId, setCurrentMapId: setCurrentMap, prepareMapAssets: async () => {},
    player, camera: { x: 0, y: 0, zoom: 1 }, viewport: () => ({ width: 1280, height: 720 }), keys: { clear: noop }, stopTouchMove: noop,
    cutsceneOverlay: { hidden: true } as HTMLElement, resizeViewport: noop, isDueling: () => false, running: () => running,
    localMapState: () => ({ mapId: currentMapId, x: player.x, y: player.y, facing: player.facing }),
    // The server's move, at once; the destination's balance is installed before the map is built, as main.ts awaits it.
    changeMap: mapId => { if (options.changeMap && !options.changeMap(mapId)) return false; installBalance(mapId); return true; },
    syncStoppedPosition: noop, resetPresentationState: noop, fadeToWorld: action => { action(); },
    mapUnlocked: mapId => mapUnlocked(mapId),
    syncMapMusic: noop, rebuildWorld: () => playerController.rebuildWorld(), spawnFromSite, enemies, spawnSites,
    clearTransientCombat: () => { projectileStore.clear(); enemySimulation.clearRemoteCombat(); },
    bosses, bossHazards, onCutsceneFinished: noop,
  });

  const bossController = createBossController({
    bosses, hazards: bossHazards, player,
    sharedBoss: kind => personalBosses.state(BOSSES[kind].mapId),
    bossResult: kind => personalBosses.result(BOSSES[kind].mapId),
    localIdentity: () => identity, serverNowMs: () => clock.ms,
    bossTargets: () => player.hp > 0 ? [{ id: identity, x: player.x, y: player.y }] : [],
    running: () => running, currentMapId: () => currentMapId, portalCutsceneActive: () => false, portalCutscenes: {},
    spawnBurst: noop,
    damagePlayer: amount => taken('boss', () => playerCombat.damagePlayerFromBoss(amount)),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss),
  });


  autoFarm = createAutoFarmController({
    player, enemies, spawnSites, mapId: () => currentMapId, pullCamps: () => profile.aggro ? 0 : 1,
    forcedGroups: () => profile.aggro ? { groups: [], needed: profile.aggro } : null,
    equippedWeapon: weapon, localIdentity: () => identity, now: () => clock.ms - SIM_EPOCH_MS,
    connection: () => !running || mapController.isMapTransitioning() ? 'recovering' : 'ready',
    unavailable: () => !running || player.hp <= 0 ? 'Start your adventure to farm' : mapController.isMapTransitioning() ? 'Autofarm stopped for travel' : null,
    paused: () => false,
    speed: () => player.speed * movementMultiplier(),
    priorityStorage: () => storage,
    obstacles: () => {
      const config = mapConfig[currentMapId];
      const obstacles = [config.portal, 'secondaryPortal' in config ? config.secondaryPortal : null].flatMap(portal => portal
        ? [{ x: portal.x, y: portal.y - portal.height * .32, r: Math.max(60, portal.width * .6) + player.r + 24 }] : []);
      const mapBoss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId);
      if (mapBoss && !mapBoss.dead) obstacles.push({ x: mapBoss.x, y: mapBoss.y, r: mapBoss.r + player.r + 40 });
      return obstacles;
    },
    ...farmProgress,
  });

  playerCombat = createPlayerCombatController({
    player, enemies, spawnSites, projectileStore, bosses, random,
    nowSeconds: () => gameTime, localIdentity: () => identity,
    engageEnemy: enemy => engageEnemy(enemy, identity || LOCAL_REGULAR_ENEMY_TARGET_ID, regularEnemySimulationTick(clock.ms)),
    researchDamageMultiplier: researchController.damageMultiplier,
    researchCriticalChance: researchController.criticalChance,
    researchCriticalDamageMultiplier: researchController.criticalDamageMultiplier,
    researchRewardMultiplier: researchController.rewardMultiplier,
    prestigeBossSlayer: () => prestigePerkValue(perks, 'bossSlayer'),
    prestigeSecondWind: () => prestigePerkValue(perks, 'secondWind'),
    prestigeDoubleStrike: () => prestigePerkValue(perks, 'doubleStrike'),
    prestigeSplitShot: () => prestigePerkValue(perks, 'splitShot'),
    prestigeReflect: () => prestigePerkValue(perks, 'riposte'),
    bowSkills: () => profile.bowSkills,
    weaponMastery: masteryNow, equippedRightHand: () => inventory.equippedRightHand,
    equippedWeapon: weapon, equippedHead: () => inventory.equippedHead, equippedChest: () => inventory.equippedChest, equippedFeet: () => inventory.equippedFeet,
    healthMultiplierBonus, minAttackInterval, reflectOnly: () => Boolean(profile.reflectOnly),
    effectiveArmor: researchController.effectiveArmor, isDueling: () => false,
    hitGeneratedBoss: (enemy, damage) => { if (!enemy.generatedBoss) return false; personalBosses.hit(currentMapId, damage); return true; },
    hitPersonalBoss: damage => { personalBosses.hit(currentMapId, damage); },
    scheduleEnemyRespawn: site => {
      regularEnemyRespawn.schedule(site);
      respawnMemory.remember(enemyRespawnKey(site), (site.respawnAt - gameTime) * 1000);
    },
    recordRegularEnemyDefeat: (_mapId, enemy) => { kills += 1; claims[enemy] = (claims[enemy] ?? 0) + 1; earn(1, false); }, incrementKills: noop,
    currentMapId: () => currentMapId, spawnBurst: noop, spawnParticle: noop,
    spawnDamageNumber: (x, y, _amount, _critical, damageTaken, reflected) => {
      if (damageTaken || reflected) return;
      combat.landed++;
      const struck = enemies.find(enemy => enemy.x === x && enemy.y === y);
      if (struck) { const kind = enemyKind(struck); combat.landedBy[kind] = (combat.landedBy[kind] ?? 0) + 1; }
    },
    onCombat: () => { if (!dealing) combat.shots++; },
    onEnemyDefeated: enemy => {
      const kind = enemyKind(enemy), group = `${currentMapId}|${farmGroupOf(enemy)}`;
      combat.killsBy[kind] = (combat.killsBy[kind] ?? 0) + 1;
      combat.killsByGroup[group] = (combat.killsByGroup[group] ?? 0) + 1;
      return false;
    },
    logPickup: noop, saveProgress: noop, recordDeath: noop,
    endGame: () => {
      // session.end() -> showGameOver: the farm hears of it at once; the death screen respawns later.
      running = false;
      player.moving = false;
      bossFightMemory.flush();
      for (const listener of onDeath) listener();
      autoFarm.defeated();
      deathAt = clock.ms;
    },
  });

  playerController = createPlayerController({
    player, boss: bosses.dragon, enemies, spawnSites, decor: bootstrap.decor, paths: bootstrap.paths,
    clearTransientCombat: () => { projectileStore.clear(); enemySimulation.clearRemoteCombat(); },
    getCurrentMapId: () => currentMapId,
    // As main.ts: the forest's dead respawn at the new-character start, not by its portal.
    mapSpawn: mapId => mapId === 'tutorial_forest' ? bootstrap.startSpawn : mapConfig[mapId].arrival,
    initialStats: { ...player },
    invalidateStaticWorld: noop, spawnFromSite,
    clearPlayerCombat: () => playerCombat.clearPendingThrow(),
    resetBosses: () => bossController.resetAll(),
    onResetUI: () => { gameTime = 0; },
    movement: dt => { const command = autoFarm.movement(manualInput, dt); lastCommand = command; return command; },
    isMapTransitioning: () => mapController.isMapTransitioning(),
    resolvePortalCollision: () => mapController.resolvePortalCollision(),
    resolveBossCollision: () => bossController.forMap(currentMapId)?.resolveCollision(),
    applyBossKnockback: dt => bossController.applyBossKnockback(dt),
    viewport: () => ({ width: 1280, height: 720, zoom: 1 }), cameraPosition: () => ({ x: 0, y: 0 }),
    isConnected: () => false, syncSpeed: noop, movementSpeedMultiplier: movementMultiplier,
    regenerationPerSecond: playerStats.regenerationPerSecond,
    healthMultiplierBonus,
    syncMovementState: noop,
    autoAttack: () => playerCombat.attackNearest(autoFarm.attackType(), autoFarm.targetCamp(), autoFarm.attackPriority()),
    isAutoAttackEnabled: () => true,
    activeDuel: () => null, isDueling: () => false, localIdentity: () => identity, localState: () => null,
    syncLiveDuelDamage: () => ({ state: { challengerHp: 0, opponentHp: 0 } }), liveDuelScene: () => null, setHeldDuelScene: noop,
    pulseDuel: noop, resetLiveDuelPresentation: noop, loadDuelReplay: async () => null, showDuelResult: noop, showDuelResultUnavailable: noop,
  });

  // The build.
  Object.assign(player, { damage: profile.base.damage, attackRate: profile.base.attackRate, armor: profile.base.armor, regen: profile.base.regen,
    projectileCount: profile.projectileCount ?? 1 });
  player.baseMaxHp = profile.base.maxHp;
  if (economy) shop();
  applyMasteryRange();
  setPlayerBaseMaxHealth(player, profile.base.maxHp, healthMultiplierBonus(), true);

  /** session.start(): respawn at the map's arrival with full health, every enemy reset. */
  function startSession() {
    playerController.reset(true, true);
    mapController.resolvePortalCollision();
    running = true;
    deathAt = null;
  }
  installBalance(currentMapId);
  setCurrentMap(currentMapId);
  const start = currentMapId === 'tutorial_forest' ? bootstrap.startSpawn : mapConfig[currentMapId].arrival;
  mapController.loadMap(currentMapId, start.x, start.y);
  refreshMapBalanceEnemies(runtimeMapBalance(currentMapId)!, spawnSites, enemies);
  startSession();

  // ---- Measurement ----
  const power = () => farmProgress.power();
  const startPower = power();
  const gain = createPowerGainMeter();
  const report: VirtualPlayerReport = {
    name: profile.name, simSeconds: 0, wallMs: 0, samples: [], visits: [], deaths: [], bossAttempts: [], travels: [],
    activity: {}, groups: {}, statuses: {}, bossStatuses: {}, kills: 0, stuck: [], startPower, endPower: startPower, endMap: currentMapId,
    autofarmStopped: [], combat, wakes, placement, gold, masteryPoints, purchases,
  };
  const t = () => (clock.ms - SIM_EPOCH_MS) / 1000;
  let visit: MapVisit = { map: currentMapId, from: 0, to: null, entryPower: startPower, exitPower: null, deaths: 0, reason: 'start' };
  report.visits.push(visit);
  let attempt: BossAttempt | null = null;
  let lastBossLeaveAt = -Infinity;
  let retreatStartedAt: number | null = null;
  let lastPhase = 'farm';
  let stuckSince: number | null = null, stuckAt = { x: 0, y: 0 };
  const bossShare = () => {
    const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId);
    return boss && boss.maxHp ? Math.max(0, boss.hp) / boss.maxHp : 0;
  };
  const bossAlive = () => { const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId); return Boolean(boss && !boss.dead && boss.hp > 0); };
  const add = (record: Record<string, number>, key: string, seconds: number) => { record[key] = (record[key] ?? 0) + seconds; };
  const note = (record: Record<string, { first: number; seconds: number }>, key: string, seconds: number) => {
    const entry = record[key] ??= { first: t(), seconds: 0 };
    entry.seconds += seconds;
  };
  function closeAttempt(outcome: BossAttempt['outcome']) {
    if (!attempt) return;
    attempt.end = t(); attempt.outcome = outcome; attempt.bossShareEnd = bossShare(); attempt.playerShareEnd = player.hp / player.maxHp;
    attempt = null;
  }
  onDeath.push(() => {
    const state = autoFarm.state();
    visit.deaths += 1;
    hits = hits.filter(hit => clock.ms - hit.at < 15_000);
    const byKind: Record<string, number> = {};
    for (const hit of hits) byKind[hit.kind] = (byKind[hit.kind] ?? 0) + hit.share;
    report.deaths.push({ t: t(), map: currentMapId, phase: state.phase, selected: state.selected, probation: autoFarm.bossStatus().startsWith('Trying Next Map'),
      afterBossLeave: t() - lastBossLeaveAt < 15, status: state.status, taken: byKind, biggestHit: Math.max(0, ...hits.map(hit => hit.share)) });
    hits = [];
    if (attempt) closeAttempt('died');
  });
  /** Where the last boss fell and when, until the player walks clear of its range. */
  let pit: { x: number; y: number; at: number; range: number } | null = null;
  let lastStep: { x: number; y: number } | null = null;
  onBossDefeated.push(() => {
    if (attempt) closeAttempt('won');
    const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId);
    if (boss) pit = { x: boss.x, y: boss.y, at: t(), range: bossAggroRange(currentMapId) ?? 600 };
  });

  function activityOf(status: string, phase: string) {
    if (!running) return 'dead';
    if (mapController.isMapTransitioning()) return 'travel';
    if (!autoFarm.state().active) return /moving/i.test(status) ? 'travel' : 'inactive';
    if (phase === 'boss') return /Fighting|Dodging|Kiting/.test(status) ? 'boss-fight' : 'boss-walk';
    if (phase === 'portal') return 'portal-walk';
    if (/^Farming|Defending|Holding ground|Pulling|Dodging|Kiting|Waiting out/.test(status)) return 'fight';
    if (/^Moving to/.test(status)) return 'walk';
    if (/Waiting for respawn|Healing/.test(status)) return 'wait';
    if (/clear route/.test(status)) return 'stuck';
    return `other`;
  }

  function measure(seconds: number) {
    const state = autoFarm.state();
    const status = state.status, bossStatus = autoFarm.bossStatus();
    if (bossStatus === 'Moving Back A Map') retreatStartedAt ??= t();
    const activity = activityOf(status, state.phase);
    add(report.activity, activity, seconds);
    if (running && state.active && state.phase === 'farm' && state.selected && activity !== 'travel') add(report.groups, `${currentMapId}|${state.selected}`, seconds);
    note(report.statuses, status, seconds);
    note(report.bossStatuses, bossStatus || '(none)', seconds);
    // The farm ended itself (not a death, which it rides out, or a portal, which carries it across).
    if (!state.active && /^Autofarm stopped|No matching|Map changed/.test(status) && report.autofarmStopped[report.autofarmStopped.length - 1]?.status !== status) report.autofarmStopped.push({ t: t(), status });
    // Boss attempts: entering the boss phase on foot.
    if (running && state.phase === 'boss' && lastPhase !== 'boss' && !attempt) {
      attempt = { t: t(), map: currentMapId, power: power(), end: null, outcome: null, bossShareStart: bossShare(), playerShareStart: player.hp / player.maxHp, bossShareEnd: null, playerShareEnd: null,
        fightSeconds: 0, base: { maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen } };
      report.bossAttempts.push(attempt);
    }
    if (attempt && activity === 'boss-fight') attempt.fightSeconds += seconds;
    if (running) {
      combat.aliveSeconds += seconds;
      if (player.combatFacing !== null) combat.shootingSeconds += seconds;
      if (status === 'Kiting') combat.kitingSeconds += seconds;
      // Kiting is off (AUTO_FARM_EVASION): it stands every fight.
      const kite = { mode: 'none' as 'orbit' | 'back-off' | 'stand' | 'none', holds: false };
      if (kite.mode !== 'none') {
        const speed = player.speed * movementMultiplier(), armor = researchController.effectiveArmor();
        const near = enemies.filter(enemy => !enemy.dead && !enemy.generatedBoss && isEnemyAttackingPlayer(enemy, identity) && !(enemy.definition ?? ENEMY_TYPES[enemy.type]).ranged
          && Math.hypot(enemy.x - player.x, enemy.y - player.y) - enemy.r - player.r < 160);
        const model = chaseDamage({ chasers: near.map(enemy => ({ damage: damageAfterArmor(enemy.damage, armor), attackSpeed: (enemy.definition ?? ENEMY_TYPES[enemy.type]).attackSpeed, hp: enemy.hp, r: enemy.r })),
          speed, chaseSpeed: enemyChaseSpeed(205, speed), playerR: player.r, holds: kite.holds });
        const mode = modeNow(), standing = kite.mode === 'stand';
        mode.seconds += seconds;
        mode.predicted += (standing ? model.standingHits : model.kitedHits) * seconds;
        mode.predictedTaken += (standing ? model.standing : model.kited) / Math.max(1, player.maxHp) * seconds;
      }
    }
    if (attempt && running && state.phase !== 'boss') {
      if (!bossAlive()) closeAttempt('won');
      else if (state.phase === 'farm') { lastBossLeaveAt = t(); closeAttempt('walked'); }
      else closeAttempt('other');
    }
    lastPhase = state.phase;
    // Walking that gets nowhere for a minute.
    const moving = running && state.active && /Moving|clear route/.test(status) && !mapController.isMapTransitioning();
    if (moving && Math.hypot(player.x - stuckAt.x, player.y - stuckAt.y) < 40) {
      stuckSince ??= t();
    } else {
      if (stuckSince !== null && t() - stuckSince > 60) report.stuck.push({ t: stuckSince, seconds: t() - stuckSince, status, map: currentMapId });
      stuckSince = null; stuckAt = { x: player.x, y: player.y };
    }
    if (running && state.active) {
      const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId), range = bossAggroRange(currentMapId);
      if (boss && !boss.dead && boss.hp > 0 && range && state.phase !== 'boss' && Math.hypot(player.x - boss.x, player.y - boss.y) < range) placement.nearBossSeconds += seconds;
      if (pit && (Math.hypot(player.x - pit.x, player.y - pit.y) > pit.range || state.phase === 'portal')) { placement.lingers.push(t() - pit.at); pit = null; }
      // What autofarm asked for, not where pushes left the player.
      const step = lastCommand, moved = Math.hypot(step.x, step.y);
      if (moved > .05) {
        placement.walkingSeconds += seconds;
        if (lastStep && step.x * lastStep.x + step.y * lastStep.y < -.5 * moved * Math.hypot(lastStep.x, lastStep.y)) {
          placement.reversals++;
          const key = `${lastStatus} > ${status}`;
          placement.turnStatuses[key] = (placement.turnStatuses[key] ?? 0) + 1;
        }
        lastStep = step; lastStatus = status;
      }
    }
    if (pit && !running) pit = null;
    if (running) gain.sample(clock.ms, power(), currentMapId);
    if (hits.length > 600) hits = hits.filter(hit => clock.ms - hit.at < 15_000);
  }

  function step() {
    if (!running) {
      if (deathAt !== null && clock.ms - deathAt >= DEATH_RESPAWN_MS) startSession();
      clock.ms += STEP_MS;
      return;
    }
    // simulate(dt), as game-session-controller.ts runs it; syncBoss runs once a frame before it.
    gameTime += SIM_STEP_SECONDS;
    bossController.forMap(currentMapId)?.sync();
    if (!mapController.isMapTransitioning()) playerController.update(SIM_STEP_SECONDS);
    mapController.updatePortal(SIM_STEP_SECONDS);
    if (!mapController.isMapTransitioning()) {
      personalBosses.update(SIM_STEP_SECONDS); proceduralBoss.update(SIM_STEP_SECONDS); enemySimulation.update(SIM_STEP_SECONDS);
      if (running) bossController.forMap(currentMapId)?.update(SIM_STEP_SECONDS);
      taken('shots', () => playerCombat.updateProjectiles(SIM_STEP_SECONDS));
      updateRespawns(gameTime);
    }
    clock.ms += STEP_MS;
  }

  async function finishTravel(from: string) {
    // The portal's handoff is promise-based: let it settle (no real time passes in the game meanwhile).
    for (let spin = 0; spin < 50 && mapController.isMapTransitioning(); spin++) await new Promise(resolve => setImmediate(resolve));
    // Server round trip, art and fades: a second of nothing.
    clock.ms += 1_000;
    if (currentMapId === from) return;
    refreshMapBalanceEnemies(runtimeMapBalance(currentMapId)!, spawnSites, enemies);
    const entry = power();
    visit.to = t(); visit.exitPower = entry;
    visit = { map: currentMapId, from: t(), to: null, entryPower: entry, exitPower: null, deaths: 0, reason: '' };
    report.visits.push(visit);
  }

  async function run(seconds: number, onProgress?: (report: VirtualPlayerReport) => void, runOptions: { autofarm?: boolean } = {}) {
    const wallStart = process.hrtime.bigint();
    const end = clock.ms + seconds * 1000;
    let nextSample = clock.ms;
    let nextProgress = clock.ms + 1_800_000;
    if (runOptions.autofarm !== false && !autoFarm.state().active) autoFarm.start([]);
    while (clock.ms < end) {
      const from = currentMapId;
      step();
      if (mapController.isMapTransitioning()) {
        const leaving = visit, power0 = power(), rate = gain.rate(clock.ms, from);
        await finishTravel(from);
        const back = farmMapRank(currentMapId) < farmMapRank(from);
        // Why it went back, from what happened on the map it left (the controller keeps its reason to itself).
        // Five defeats end with a death at the moment it turned back; probation ends ten minutes in, on the rate.
        const turned = retreatStartedAt ?? t();
        const killed = report.deaths.some(death => death.t <= turned + .5 && death.t >= turned - 5);
        const why = !back ? 'next map' : killed ? (leaving.reason === 'next map' ? 'defeat limit on trial' : 'defeat limit') : 'probation slow';
        report.travels.push({ t: t(), from, to: currentMapId, direction: back ? 'back' : 'forward', power: power0, why, previousRate: null, rateHere: rate });
        visit.reason = why;
        retreatStartedAt = null;
      }
      measure(SIM_STEP_SECONDS);
      if (clock.ms >= nextSample) {
        nextSample += 10_000;
        const state = autoFarm.state();
        report.samples.push({ t: Math.round(t()), map: currentMapId, power: power(), phase: state.phase, selected: state.selected, x: Math.round(player.x), y: Math.round(player.y),
          hp: player.maxHp > 0 ? player.hp / player.maxHp : 0, status: state.status, bossStatus: `${autoFarm.moveStatus()} | ${autoFarm.bossStatus()}` });
      }
      if (onProgress && clock.ms >= nextProgress) { nextProgress += 1_800_000; report.simSeconds = t(); onProgress(report); }
      if (options.duel && (!bossAlive() || report.deaths.length)) break;
    }
    report.simSeconds = t();
    report.wallMs += Number(process.hrtime.bigint() - wallStart) / 1e6;
    report.kills = kills;
    report.gold = gold;
    report.masteryPoints = { ...masteryPoints };
    report.endPower = power();
    report.endMap = currentMapId;
    return report;
  }

  return {
    run,
    report: () => report,
    dispose: restoreGlobals,
    /** For a boss duel: stand the player beside the boss with the given health shares. */
    prepareDuel(setup: BossDuelSetup) {
      const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId);
      if (!boss) return false;
      const state = personalBosses.state(currentMapId);
      if (state) personalBosses.hit(currentMapId, state.maxHp * (1 - setup.bossShare));
      player.hp = player.maxHp * setup.playerShare;
      // Next to it, at the edge of reach, so the farm walks straight into the fight.
      const reach = weaponAttackRange(weapon(), player.attackRange);
      const shape = boss as { ry?: number; hitboxOffsetY?: number };
      player.x = boss.x; player.y = boss.y + (shape.hitboxOffsetY ?? 0) + (shape.ry ?? boss.r) + reach * .6;
      return true;
    },
    bossAlive,
    bossShare,
    power,
    mapId: () => currentMapId,
    /** The running game's pieces, for tests that drive or inspect them (tests/scenarios). */
    parts: {
      player, enemies, spawnSites, bosses, bossHazards, projectileStore, inventory, storage, clock, research, mapConfig,
      autoFarm: () => autoFarm, playerCombat: () => playerCombat, mapController, bossController, personalBosses, proceduralBoss, enemySimulation,
      /** Every kill so far, as the game reports them to the server. */
      claims: () => ({ ...claims }),
      /** Another player on the map, fighting with these stats (as their rows would say). */
      addRemotePlayer(remote: RemotePlayer, stats: RemoteCombatStats) { remotePlayers.push(remote); remoteCombatStats.set(remote.id, stats); },
      /** Holds a direction (unit-ish x/y, as the keys give) until set back to 0, 0. */
      setInput(x: number, y: number) { manualInput = x || y ? { x, y, source: 'keyboard' } : { x: 0, y: 0, source: 'none' }; },
      running: () => running,
      gameTime: () => gameTime,
      onDeath: (listener: () => void) => { onDeath.push(listener); },
      onBossDefeated: (listener: (mapId: string) => void) => { onBossDefeated.push(listener); },
    },
  };
}

/**
 * A walk-away's counterfactual: the same build beside the same boss, at the
 * health shares it walked away with, fighting until one of them falls. The
 * controller is not changed: without the boss's health it cannot judge the
 * fight, so it never walks away.
 */
export async function bossDuel(profile: VirtualPlayerProfile, setup: BossDuelSetup, seconds = 300) {
  // The lowest Move At: a duel fights whatever readiness says.
  const duel = createVirtualPlayer({ ...profile, advance: true, moveAt: .1 }, { duel: setup });
  try {
    duel.prepareDuel(setup);
    const report = await duel.run(seconds);
    const won = !duel.bossAlive() && report.deaths.length === 0;
    return { won, seconds: report.simSeconds, bossShare: duel.bossShare() };
  } finally { duel.dispose(); }
}
