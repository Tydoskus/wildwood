/**
 * A headless "virtual player" for autofarm: the game's own frame step
 * (game-session-controller.ts simulate) wired as main.ts wires it, minus the
 * renderer, the network and the DOM. Player combat, enemy AI, respawns, bosses
 * (campaign and Endless), map travel and autofarm are the real modules; what
 * the server owns (map unlocks on a boss kill, the death screen's respawn) is
 * stood in for here. Gear is fixed: loot, research and upgrades never change.
 *
 * Every clock the game reads (performance.now, Date.now) and Math.random are
 * replaced by a simulated, seeded copy for the run, so a run is repeatable and
 * runs as fast as the CPU allows. Global tables (ENEMY_TYPES, the installed map
 * balance, WORLD) are shared, so run players one after another, never at once.
 */
import { createGameBootstrap } from '../game-bootstrap';
import { createEnemyLifecycle } from '../enemy-lifecycle';
import { createEnemySimulation, LOCAL_REGULAR_ENEMY_TARGET_ID } from '../enemy-simulation';
import { createPlayerCombatController, type PlayerCombatController } from '../player-combat-controller';
import { createPlayerController, type PlayerController } from '../player-controller';
import { createMapController } from '../map-controller';
import { createBossController } from '../boss-controller';
import { BOSSES, bossStateForMap } from '../boss-registry';
import { createPersonalBosses } from '../personal-bosses';
import { createProceduralBossController } from '../procedural-boss-controller';
import { createRegularEnemyRespawn, REGULAR_ENEMY_RESPAWN_SECONDS } from '../regular-enemy-respawn';
import { createRespawnMemory } from '../respawn-memory';
import { createBossFightMemory } from '../boss-fight-memory';
import { createResearchController } from '../research-controller';
import { createAutoFarmController, type AutoFarmController } from '../auto-farm-controller';
import { createAutoFarmProgress, farmMapRank } from '../auto-farm-build';
import { createPowerGainMeter, type FarmPush } from '../auto-farm-brain';
import { applyMapBalance } from '../map-balance-loader';
import { refreshMapBalanceEnemies } from '../map-balance-enemies';
import { playerRegenerationPerSecond } from '../reward-display';
import { setPlayerBaseMaxHealth } from '../player-health';
import { weaponAttackRange } from '../../weapon-combat';
import { WORLD } from '../../constants';
import { ENEMY_TYPES } from '../../enemies';
import { TUTORIAL_FOREST_MAP_ID, type MapId } from '../../world';
import { resolveMapBalance } from '../../../../shared/map-balance';
import { runtimeMapBalance } from '../../../../shared/map-balance-runtime';
import { LIVE_BALANCE } from '../../../balance/live-balance';
import { worldBoundsFor } from '../../../../shared/world-bounds';
import { CAMPAIGN_MAPS } from '../../../../shared/campaign-registry';
import { MAP_IDS as CAMPAIGN_MAP_IDS } from '../../../../shared/rules';
import { campaignMapUnlocked, type CampaignAccess } from '../../../../shared/equipment-access';
import { isProceduralMap, proceduralMapNumber } from '../../../../shared/procedural-maps';
import { regularEnemySimulationTick } from '../../../../shared/regular-enemy-simulation';
import { equipmentMaxHealthMultiplierBonus } from '../../../../shared/items';
import { prestigePerkValue, type PrestigePerkRanks } from '../../../../shared/prestige-perks';
import { challengeMinimumInterval } from '../../../../shared/prestige-challenge';
import { createEmptyResearchRanks, type ResearchRanks } from '../../../../shared/research';
import type { BowSkillRoll } from '../../../../shared/bow-skills';
import type { PlayerPowerStats } from '../../../../shared/player-power';
import { AUTO_FARM_ADVANCE_KEY } from '../auto-farm-plan';
import { AUTO_FARM_PUSH_KEY } from '../auto-farm-brain';

export const SIM_STEP_SECONDS = 1 / 60;
const STEP_MS = 1000 / 60;
/** The death screen: the fall, then the three-second countdown (death-screen-controller.ts). */
const DEATH_RESPAWN_MS = 850 + 3_000;
const SIM_EPOCH_MS = Date.UTC(2026, 9, 7, 12);

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
  projectileCount?: number;
  bowSkills?: Partial<BowSkillRoll>;
  perks?: Partial<PrestigePerkRanks>;
  prestigeLevel?: number;
  research?: Partial<ResearchRanks>;
  push: FarmPush;
  /** "Boss & Next Map". */
  advance: boolean;
  /** The Reflect Only prestige challenge. */
  reflectOnly?: boolean;
};

export type BossDuelSetup = {
  /** Boss health as a share of its max when the duel starts. */
  bossShare: number;
  /** Player health share when it starts. */
  playerShare: number;
};

type Sample = { t: number; map: string; power: number; phase: string; selected: string | null; hp: number; status: string; bossStatus: string };
type MapVisit = { map: string; from: number; to: number | null; entryPower: number; exitPower: number | null; deaths: number; reason: string };
type DeathEvent = { t: number; map: string; phase: string; selected: string | null; probation: boolean; afterBossLeave: boolean;
  /** What happened in the last 15 s: health shares taken by source, and the biggest single hit. */
  status: string; taken: Record<string, number>; biggestHit: number };
type BossAttempt = { t: number; map: string; power: number; end: number | null; outcome: 'won' | 'walked' | 'died' | 'other' | null;
  bossShareStart: number; playerShareStart: number; bossShareEnd: number | null; playerShareEnd: number | null; fightSeconds: number; base?: PlayerPowerStats;
  /** For a walk-away: the same fight fought on to the end (bossDuel). */
  foughtOn?: { won: boolean; seconds: number; bossShare: number } };
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
  applyMapBalance(resolveMapBalance(mapId, LIVE_BALANCE.settings, LIVE_BALANCE.revision));
}

/**
 * One virtual player, built and ready to run. `run(seconds)` advances the
 * simulation; `report()` is everything measured so far.
 */
export function createVirtualPlayer(profile: VirtualPlayerProfile, options: { duel?: BossDuelSetup } = {}) {
  const clock = { ms: SIM_EPOCH_MS };
  const random = mulberry32(profile.seed);
  const restoreGlobals = installSimGlobals(clock, random);
  const identity = `vp-${profile.name}`;
  const storage = memoryStorage();
  storage.setItem(AUTO_FARM_ADVANCE_KEY, profile.advance ? '1' : '0');
  storage.setItem(AUTO_FARM_PUSH_KEY, profile.push);

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
  const respawnMemory = createRespawnMemory(storage, () => identity);
  const bossFightMemory = createBossFightMemory(storage, () => identity);
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

  const healthMultiplierBonus = () => (1 + equipmentMaxHealthMultiplierBonus(inventory.equippedHead, inventory.equippedChest, 0, 0))
    * (1 + Math.max(0, research.vitality ?? 0) * .02) - 1;
  const researchController = createResearchController({
    prestigeLevel: () => profile.prestigeLevel ?? 0, guildQuestBonus: () => 1, prestigePerks: () => perks,
    player, getRanks: () => research, isDueling: () => false, maxPlayerStat: Number.MAX_VALUE, saveProgress: noop, healthMultiplierBonus,
  });
  const minAttackInterval = () => challengeMinimumInterval(challenge);
  const movementMultiplier = () => researchController.movementSpeedMultiplier();
  const weapon = () => inventory.equippedRightHand || inventory.equippedLeftHand;

  let autoFarm!: AutoFarmController;
  let playerCombat!: PlayerCombatController;
  let playerController!: PlayerController;
  let kills = 0;
  const onDeath: (() => void)[] = [];
  const onBossDefeated: ((mapId: string) => void)[] = [];

  const personalBosses = createPersonalBosses({
    respawns: respawnMemory, fights: bossFightMemory, ready: () => true,
    mapId: () => currentMapId, identity: () => identity, bossRespawnRank: () => research.bossRespawn ?? 0,
    alive: () => player.hp > 0, now: () => clock.ms,
    defeated: mapId => {
      // The server's unlock, at once: no reducer round trip.
      const index = CAMPAIGN_MAP_IDS.indexOf(mapId);
      if (index >= 0) unlockAfterBoss(index);
      else if (isProceduralMap(mapId)) endlessCompleted = Math.max(endlessCompleted, proceduralMapNumber(mapId) ?? 0);
      for (const listener of onBossDefeated) listener(mapId);
    },
  });
  /** Damage taken lately, by what dealt it, as shares of max health: why each death happened. */
  let hits: { at: number; kind: string; share: number }[] = [];
  function taken<T>(kind: string, deal: () => T) {
    const before = player.hp;
    const result = deal();
    if (player.hp < before && player.maxHp > 0) hits.push({ at: clock.ms, kind, share: (before - Math.max(0, player.hp)) / player.maxHp });
    return result;
  }
  const proceduralBoss = createProceduralBossController({
    mapId: () => currentMapId, state: mapId => ({ ready: true, completed: endlessCompleted, boss: personalBosses.proceduralState(mapId) }),
    enemies, player, spawn: spawnFromSite,
    damagePlayer: (damage, source) => taken('boss', () => playerCombat.damagePlayer(damage, source)),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss), burst: noop, shot: projectileStore.spawnEnemyShot,
  });
  const enemySimulation = createEnemySimulation(enemies, projectileStore.spawnEnemyShot, player,
    () => ({ width: 1280, height: 720, zoom: 1 }), engageEnemy,
    (amount, source) => taken(source?.generatedBoss ? 'boss' : source && (source.definition ?? ENEMY_TYPES[source.type])?.elite ? 'elite' : 'regular',
      () => playerCombat.damagePlayer(amount, source)), {
      currentMapId: () => currentMapId, serverNowMs: () => clock.ms, localIdentity: () => identity,
      remotePlayers: () => [], playerMovementSpeed: () => player.speed * movementMultiplier(),
      pullAggro: enemy => autoFarm.pulls(enemy) || autoFarm.forced(enemy),
    });

  const farmProgress = createAutoFarmProgress({ mapId: () => currentMapId,
    base: () => ({ maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen }),
    equipment: () => ({ equippedHead: inventory.equippedHead, equippedChest: inventory.equippedChest, equippedRightHand: inventory.equippedRightHand, equippedLeftHand: inventory.equippedLeftHand }),
    research: () => research, upgradeLevel: () => 0, rewardMultiplier: () => researchController.rewardMultiplier(), minAttackInterval,
    criticalChance: () => researchController.criticalChance(), criticalMultiplier: () => researchController.criticalDamageMultiplier(),
    reflectOnly: () => Boolean(profile.reflectOnly),
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
    markPortalCutsceneSeen: noop,
    mapConfig: mapConfig as never,
    tutorialMapId: TUTORIAL_FOREST_MAP_ID, desertMapId: 'beginner_desert' as MapId, snowMapId: 'intermediate_snowlands' as MapId,
    lavaMapId: 'advanced_lava_wastes' as MapId, infernalMapId: 'infernal_depths' as MapId, waterMapId: 'water_reach' as MapId,
    dragonCutsceneSeenKey: '', snowlandsCutsceneSeenKey: '', lavaCutsceneSeenKey: '', infernalCutsceneSeenKey: '', waterCutsceneSeenKey: '', samuraiCutsceneSeenKey: '',
    getCurrentMapId: () => currentMapId, setCurrentMapId: setCurrentMap, prepareMapAssets: async () => {},
    player, camera: { x: 0, y: 0, zoom: 1 }, viewport: () => ({ width: 1280, height: 720 }), keys: { clear: noop }, stopTouchMove: noop,
    cutsceneOverlay: { hidden: true } as HTMLElement, resizeViewport: noop, isDueling: () => false, running: () => running,
    localMapState: () => ({ mapId: currentMapId, x: player.x, y: player.y, facing: player.facing }),
    // The server's move, at once; the destination's balance is installed before the map is built, as main.ts awaits it.
    changeMap: mapId => { installBalance(mapId); return true; },
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
    player, enemies, spawnSites, mapId: () => currentMapId, pullCamps: () => 1, forcedGroups: () => null,
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
    nowSeconds: () => gameTime, serverNowMs: () => clock.ms, localIdentity: () => identity,
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
    equippedWeapon: weapon, equippedHead: () => inventory.equippedHead, equippedChest: () => inventory.equippedChest,
    healthMultiplierBonus, minAttackInterval, reflectOnly: () => Boolean(profile.reflectOnly),
    effectiveArmor: researchController.effectiveArmor, isDueling: () => false,
    hitGeneratedBoss: (enemy, damage) => { if (!enemy.generatedBoss) return false; personalBosses.hit(currentMapId, damage); return true; },
    hitPersonalBoss: damage => { personalBosses.hit(currentMapId, damage); },
    scheduleEnemyRespawn: site => {
      regularEnemyRespawn.schedule(site);
      respawnMemory.remember(enemyRespawnKey(site), (site.respawnAt - gameTime) * 1000);
    },
    recordRegularEnemyDefeat: () => { kills += 1; }, incrementKills: noop,
    currentMapId: () => currentMapId, spawnBurst: noop, spawnParticle: noop, spawnDamageNumber: noop,
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
    mapSpawn: mapId => mapConfig[mapId].arrival,
    initialStats: { ...player },
    invalidateStaticWorld: noop, spawnFromSite,
    clearPlayerCombat: () => playerCombat.clearPendingThrow(),
    resetBosses: () => bossController.resetAll(),
    onResetUI: () => { gameTime = 0; },
    movement: dt => autoFarm.movement({ x: 0, y: 0, source: 'none' }, dt),
    isMapTransitioning: () => mapController.isMapTransitioning(),
    resolvePortalCollision: () => mapController.resolvePortalCollision(),
    resolveBossCollision: () => bossController.forMap(currentMapId)?.resolveCollision(),
    applyBossKnockback: dt => bossController.applyBossKnockback(dt),
    viewport: () => ({ width: 1280, height: 720, zoom: 1 }), cameraPosition: () => ({ x: 0, y: 0 }),
    isConnected: () => false, syncSpeed: noop, movementSpeedMultiplier: movementMultiplier,
    regenerationPerSecond: () => playerRegenerationPerSecond(player.regen, inventory, researchController.regenerationMultiplier(), () => 0),
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
  mapController.loadMap(currentMapId, mapConfig[currentMapId].arrival.x, mapConfig[currentMapId].arrival.y);
  refreshMapBalanceEnemies(runtimeMapBalance(currentMapId)!, spawnSites, enemies);
  startSession();

  // ---- Measurement ----
  const power = () => farmProgress.power();
  const startPower = power();
  const gain = createPowerGainMeter();
  const report: VirtualPlayerReport = {
    name: profile.name, simSeconds: 0, wallMs: 0, samples: [], visits: [], deaths: [], bossAttempts: [], travels: [],
    activity: {}, groups: {}, statuses: {}, bossStatuses: {}, kills: 0, stuck: [], startPower, endPower: startPower, endMap: currentMapId,
    autofarmStopped: [],
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
  onBossDefeated.push(() => { if (attempt) closeAttempt('won'); });

  function activityOf(status: string, phase: string) {
    if (!running) return 'dead';
    if (mapController.isMapTransitioning()) return 'travel';
    if (!autoFarm.state().active) return /moving/i.test(status) ? 'travel' : 'inactive';
    if (phase === 'boss') return /Fighting/.test(status) ? 'boss-fight' : 'boss-walk';
    if (phase === 'portal') return 'portal-walk';
    if (/^Farming|Defending|Holding ground|Pulling/.test(status)) return 'fight';
    if (/^Moving to/.test(status)) return 'walk';
    if (/Waiting for respawn/.test(status)) return 'wait';
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

  async function run(seconds: number, onProgress?: (report: VirtualPlayerReport) => void) {
    const wallStart = process.hrtime.bigint();
    const end = clock.ms + seconds * 1000;
    let nextSample = clock.ms;
    let nextProgress = clock.ms + 1_800_000;
    if (!autoFarm.state().active) autoFarm.start([]);
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
        report.samples.push({ t: Math.round(t()), map: currentMapId, power: power(), phase: state.phase, selected: state.selected,
          hp: player.maxHp > 0 ? player.hp / player.maxHp : 0, status: state.status, bossStatus: autoFarm.bossStatus() });
      }
      if (onProgress && clock.ms >= nextProgress) { nextProgress += 1_800_000; report.simSeconds = t(); onProgress(report); }
      if (options.duel && (!bossAlive() || report.deaths.length)) break;
    }
    report.simSeconds = t();
    report.wallMs += Number(process.hrtime.bigint() - wallStart) / 1e6;
    report.kills = kills;
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
  };
}

/**
 * A walk-away's counterfactual: the same build beside the same boss, at the
 * health shares it walked away with, fighting until one of them falls. The
 * controller is not changed: without the boss's health it cannot judge the
 * fight, so it never walks away.
 */
export async function bossDuel(profile: VirtualPlayerProfile, setup: BossDuelSetup, seconds = 300) {
  const duel = createVirtualPlayer({ ...profile, advance: true }, { duel: setup });
  try {
    duel.prepareDuel(setup);
    const report = await duel.run(seconds);
    const won = !duel.bossAlive() && report.deaths.length === 0;
    return { won, seconds: report.simSeconds, bossShare: duel.bossShare() };
  } finally { duel.dispose(); }
}
