import { isMeleeWeapon, weaponAttackRange } from "../weapon-combat";
import { WORLD } from '../constants';
import { monotonicNowMs, wallClockNowMs } from '../../app/trusted-clock';
import { ENEMY_TYPES, rewardStatLabel, type EnemyDefinition, type EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';
import type { Circle, EnemyShot, EnemyState, PlayerState, Position } from './types';
import type { Movement } from './player-input-controller';
import { isEnemyAttackingPlayer } from './enemy-threat';
import { farmRoute } from './auto-farm-navigation';
import { bossSurfaceDistance, bossVerticalRadius } from '../../../shared/boss-hitbox';
import { DODGE_PAD, KITE_GAP, KITE_ROOM, evadePoint, shotDanger } from './auto-farm-dodge';
import { carryFarmGroup, compareAutoFarmTargets, farmGroupMatches, farmGroupOf, farmStatGroup, readAutoFarmPriority, soulFarmReward, readAutoFarmPull, writeAutoFarmPriority, writeAutoFarmPull, type AutoFarmGroup, type AutoFarmPriority } from './auto-farm-priority';
import type { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import {
  AUTO_FARM_CHOICE, AUTO_REPLAN_SECONDS, pickRankedCandidate, rankFarmCandidates, decodeFarmPlan, encodeFarmPlan, farmWeight, routeChoice, shareFarmKey,
  readFarmAdvance, readFarmChoice, writeFarmAdvance, writeFarmChoice, type FarmChoice, type FarmEvaluation, type FarmReward, type FarmWeights,
} from './auto-farm-plan';
import {
  BOSS_READY_HEALTH, PROBATION_MS, DIED_TO_GROUP_MS, FARM_PUSHES, bossFightRates, bossReadiness, bossRetryKey, type MeasuredBossFight, createPowerGainMeter, createRetryMemory,
  probationVerdict, readFarmPush, rescaleBossFight, shouldLeaveBoss, writeFarmPush, type FarmPush,
} from './auto-farm-brain';
import { formatCompactNumber } from '../../../shared/compact-number';
import { formatTimerMs } from '../../../shared/timer-format';
import { isSoulMap, SOUL_STAT_DETAILS, type SoulStatId } from '../../../shared/soul-dimension';
import { soulStatOfCampName } from '../soul-world';

export type AutoFarmController = ReturnType<typeof createAutoFarmController>;
const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });
export const AUTO_FARM_DEFEAT_LIMIT = 5;
export const AUTO_FARM_DEFEAT_WINDOW_MS = 180_000;
/** A death this soon after walking away from a boss is the boss's: its retry wait is already set. */
const BOSS_LEAVE_GRACE_MS = 15_000;
const READY_STATUSES = new Set(['Next Map Open', 'Boss Next']);
/** How far inside its full reach autofarm stops: enough that a target at the stop point is still in range. */
export const AUTO_FARM_REACH_MARGIN = 6;
/** A waypoint this close is reached; the stop point gets the same slack. */
const WAYPOINT_REACHED = 2;
/** How long a pulled group may take to arrive before autofarm walks out to it. */
export const PULL_WAIT_SECONDS = 4;
/** How often a step out of an attack, or back from a melee enemy, is chosen again. */
const EVADE_REPLAN_SECONDS = .1;
/** How far ahead a walk looks for an attack about to land, in seconds of walking. */
const WALK_LOOKAHEAD_SECONDS = .25;
/** An enemy hit this big a share of max health is stepped out of even at full health. */
const BITE_SHARE = .05;
/**
 * A campaign boss is fought from this close to its hitbox, whatever the
 * weapon's reach: its cones widen from its body, so near it one is a short
 * sidestep, and at the edge of a bow's reach a run that cannot be made in time.
 */
const BOSS_STAND_GAP = 40;

/** What autofarm fights: an enemy, a campaign boss's hitbox (isBoss) or an Endless boss, hit at its centre. */
type Fight = Position & { r: number; ry?: number; hitboxOffsetY?: number; isBoss?: boolean };

/**
 * Where autofarm stops walking (`stop`) and how far the destination may then
 * drift before it walks again (`resume`). Both sit inside the weapon's reach.
 * Ranged enemies no longer back away from a player inside their range, so the
 * edge of reach suits them as it does everything else.
 */
export function autoFarmStandoff(options: {
  weaponRange: number;
  playerAttackRange: number;
  melee: boolean;
  playerRadius: number;
  destination: Position & { r?: number; type?: EnemyKind; definition?: EnemyDefinition };
  enemy: boolean;
}) {
  const reachPadding = options.melee && options.enemy ? options.destination.r ?? 0 : 0;
  const reach = Math.max(8, options.weaponRange) + reachPadding;
  // Fight from the edge of the full reach, research and Long Shot included
  // (0.867): walk only until the target is in range, never closer.
  const stop = Math.max(8, reach - AUTO_FARM_REACH_MARGIN);
  // Walk again a little before the target leaves reach, so the shot is never lost.
  return { stop, resume: stop + (reach - stop) / 2 };
}

export function createAutoFarmController(options: {
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  mapId: () => string;
  equippedWeapon?: () => string;
  localIdentity?: () => string | undefined;
  connection?: () => 'ready' | 'recovering' | 'ended';
  now?: () => number;
  /** The wall clock retry waits are kept by, so they survive a reload. */
  wallNow?: () => number;
  resumeStore?: ReturnType<typeof createAutoFarmResumeStore>;
  unavailable: () => string | null;
  paused: () => boolean;
  speed: () => number;
  obstacles: () => Circle[];
  priorityStorage?: () => Pick<Storage, 'getItem' | 'setItem'> | undefined;
  /** The build's power now, or after one more kill's reward. */
  evaluate?: (reward?: FarmReward) => FarmEvaluation;
  /** The live build's power, as the profile shows it before rounding. */
  power?: () => number;
  /** Damage per second against regular enemies, for how long a kill takes. */
  farmDps?: () => number;
  /** This map's boss while it stands (null once it is down or respawning), with its health to judge the fight by. */
  mapBoss?: () => (Fight & { hp?: number; maxHp?: number; dead?: boolean }) | null;
  /** Damage per second against the boss as the player stands, Boss Slayer included: how long a first fight would take. */
  bossDps?: () => number;
  /** Seconds until a boss attack already in play would hit a player at (x, y), every shape `pad` wider; Infinity when none will. */
  bossDanger?: (x: number, y: number, pad: number) => number;
  /** Enemy shots in flight: they fly straight, so they can be stepped out of. */
  enemyShots?: readonly EnemyShot[];
  /** Reflect Only: the bow does nothing, so enemies must be stood among to be hit and hit back. */
  reflectOnly?: () => boolean;
  /** The unlocked portal forward to the next map, at its trigger point. */
  nextPortal?: () => (Position & { destination: string }) | null;
  /** The portal back to the previous map, for a farm that keeps dying here. */
  previousPortal?: () => (Position & { destination: string }) | null;
  /** Whether beating this map's boss opens a locked way forward; it is not fought otherwise. */
  bossUnlocksNext?: () => boolean;
  /** How many picked camps (stat groups) Pull aggroes at once: one, one more per Aggro win, and none during a run. */
  pullCamps?: () => number;
  /** During an Aggro run: the stat groups the player picked and how many must chase them on every map, farming or not. */
  forcedGroups?: () => { groups: readonly string[]; needed: number } | null;
}) {
  let priority: AutoFarmPriority = readAutoFarmPriority(options.priorityStorage);
  // A camp is a stat group: every enemy on the map paying one stat, as the panel offers them.
  // Pull's groups: the one being farmed, then the next largest sliders (or Auto's next best), one more per Aggro win.
  let pulled = new Set<string>(), pulledKey = '';
  /** Auto's camps best first, from its last look: on Auto, Pull's extra camps are the next best. */
  let autoOrder: string[] = [];
  function pulledGroups() {
    // Zero during an Aggro run: its own chasing groups are the run's pull.
    const count = Math.max(0, options.pullCamps?.() ?? 1), key = `${selected}|${count}|${weightOrder.join()}|${autoOrder.join()}`;
    if (key === pulledKey) return pulled;
    const order = [selected, ...(weights ? weightOrder : autoOrder)].filter((group): group is string => Boolean(group));
    pulled = new Set([...new Set(order)].slice(0, count)); pulledKey = key;
    return pulled;
  }
  /**
   * Pull brings every group it farms (every slider above 0%, or every camp Auto
   * would farm): all of it comes to the player, so walking to camps or
   * cycling between them only wastes time (Ryan). It stands and fights.
   */
  function pullCoversFarm() {
    if (!pullAll || !active || manualControl || phase !== 'farm') return false;
    const groups = weights ? weightOrder : autoOrder;
    if (!groups.length) return false;
    const pulledNow = pulledGroups();
    return groups.every(group => pulledNow.has(group));
  }
  const pulledEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0 && pulledGroups().has(choiceKey(enemy));

  // An Aggro run's groups (aggro-picks.ts), read at most twice a second. A run always has its count:
  // picks this map lacks (or none yet) are filled from its other groups, in order, so nothing is left unchased.
  let forcedSet = new Set<string>(), forcedCheckedAt = -Infinity;
  function forcedGroups() {
    const at = now();
    if (at - forcedCheckedAt < 500) return forcedSet;
    forcedCheckedAt = at;
    const forced = options.forcedGroups?.();
    if (!forced) { if (forcedSet.size) forcedSet = new Set(); return forcedSet; }
    const here: string[] = [...new Set(spawnSites.map(site => choiceKey(site)))];
    // A run's picks are run stats; the Soul Dimension has each as its soul stat.
    const chosen = forced.groups.map(normalizeKey).filter(group => here.includes(group)).slice(0, forced.needed);
    for (const group of here) if (chosen.length < forced.needed && !chosen.includes(group)) chosen.push(group);
    if (chosen.length !== forcedSet.size || chosen.some(group => !forcedSet.has(group))) forcedSet = new Set(chosen);
    return forcedSet;
  }
  let pullAll = readAutoFarmPull(options.priorityStorage);
  let advance = readFarmAdvance(options.priorityStorage);
  /** The player's sliders (FarmWeights); null is Auto. */
  let weights: FarmWeights | null = null;
  /** This map's groups above 0%, the largest slider first, from the start. */
  let weightOrder: string[] = [];
  /** Seconds spent farming each group on this map (walking to it included), for its share. */
  let spent = new Map<string, number>(), spentMap = '';
  /** What it is doing now: a camp, the boss, or walking to another map. */
  let phase: 'farm' | 'boss' | 'portal' = 'farm';
  let travellingTo: string | null = null;
  /** Walking back a map: too many defeats, or a new map that did not hold up. */
  let retreating = false;
  let push = readFarmPush(options.priorityStorage);
  const wallNow = options.wallNow ?? wallClockNowMs;
  const retries = createRetryMemory(options.priorityStorage, wallNow);
  const gain = createPowerGainMeter();
  /** A map just walked forward to, on trial (auto-farm-brain.ts probationVerdict), with the gain rate of the map before. */
  let probation: { mapId: string; since: number; previousRate: number | null } | null = null;
  /**
   * The boss fight under way, measured from the moment it set off for the boss,
   * and again from when it first stood in reach of it; and when it last walked away.
   */
  let bossFight: { at: number; bossStart: number; playerStart: number; reached?: { at: number; boss: number; player: number } } | null = null;
  let bossLeftAt = -Infinity;
  /** The last boss fight lost or left here, as measured at the boss: while that boss holds the way forward, Auto farms for what the fight lacked. */
  let lostFight: MeasuredBossFight | null = null;
  /** When the player last died to each of this map's groups ("map|group"). */
  const diedTo = new Map<string, number>();
  let planClock = 0;
  /** Auto is farming for the boss (bossToBeat), not for power: for the status line. */
  let bossFarming = false;
  /** The boss is ready but the player is not: it starts no new fight while it heals. */
  let healing = false;
  const seenAlive = new WeakSet<EnemyState>();
  /** How long it has stood waiting for a pulled group that never arrives. */
  let pullWait = 0;
  let selected: string | null = null;
  let selectedType: AutoFarmGroup | null = null;
  let selectedCamp: string | null = null;
  let selectedLabel = "";
  let active = false;
  let manualControl = false;
  let pendingResume = options.resumeStore?.read() ?? null;
  let startedMap = '';
  let startedIdentity: string | undefined;
  let recovering = false;
  let readySince: number | null = null;
  // The captured clock, so a faster performance.now cannot empty the death-loop window.
  const now = options.now ?? monotonicNowMs;
  let status = 'Choose an enemy to begin';
  let target: EnemyState | null = null;
  let route: Position[] = [];
  let routeClock = 0;
  let lastGoal: Position | null = null;
  // True while standing in range; walking resumes only past the resume distance.
  let holding = false;
  /** Where a step out of an attack, or back from a melee enemy, is going (chosen again every EVADE_REPLAN_SECONDS), and whether it is kiting. */
  let evadeTo: Position | null = null, evadeClock = 0, kiting = false;
  const { player, enemies, spawnSites } = options;
  const distance = (point: Position) => Math.hypot(point.x - player.x, point.y - player.y);
  const validEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && selectedType !== null
    && farmGroupMatches(enemy, selectedType) && (!selectedCamp || enemy.campName === selectedCamp) && enemy.hp > 0;

  /**
   * One choice per stat (0.873): a player farming health wants health, so a
   * camp's regulars and elites, and every camp paying it, are one entry. In
   * the Soul Dimension, one per soul stat the player's tier has woken.
   */
  const choiceKey = (site: Pick<SpawnSite, 'type' | 'definition' | 'campName'>) => farmGroupOf(site);
  function choices() {
    const counts = new Map<string, { key: AutoFarmGroup; type: EnemyKind; kinds: EnemyKind[]; label: string; camp: string | null;
      alive: number; total: number; reward: FarmReward; maxReward: number; hp: number; nearest: number; soul: SoulStatId | null }>();
    for (const site of spawnSites) {
      const key = choiceKey(site), definition = site.definition ?? ENEMY_TYPES[site.type];
      // A soul enemy pays its soul stat, flat, and nothing to the run: what it is worth is that stat.
      const soul = soulStatOfCampName(site.campName), reward: FarmReward = soul ? soulFarmReward(soul) : definition.reward;
      const choice = counts.get(key) ?? { key, type: site.type, kinds: [], label: soul ? `Soul ${SOUL_STAT_DETAILS[soul].label}` : rewardStatLabel(reward), camp: null,
        alive: 0, total: 0, reward: { ...reward }, maxReward: reward.amount, hp: 0, nearest: Infinity, soul };
      choice.total++;
      if (!choice.kinds.includes(site.type)) choice.kinds.push(site.type);
      choice.reward.amount = Math.min(choice.reward.amount, reward.amount);
      choice.maxReward = Math.max(choice.maxReward, reward.amount);
      // The average enemy's health, for how long a kill takes.
      choice.hp += (definition.hp - choice.hp) / choice.total;
      counts.set(key, choice);
    }
    for (const enemy of enemies) if (!enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0) {
      const choice = counts.get(choiceKey(enemy));
      if (choice) { choice.alive++; choice.nearest = Math.min(choice.nearest, distance(enemy)); }
    }
    return [...counts.values()];
  }

  /**
   * A key saved before 0.873 named an enemy kind ("Bramble") or a generated camp ("Bramble:Health Camp"): its stat now.
   * A stat picked on a campaign map is its soul stat in the Soul Dimension, and back (carryFarmGroup).
   */
  function normalizeKey(key: string) {
    if (key.startsWith('stat:') || key.startsWith('soul:')) return carryFarmGroup(key, isSoulMap(options.mapId()));
    const [kind, camp] = key.split(':') as [EnemyKind, string?];
    const site = spawnSites.find(entry => entry.type === kind && (!camp || entry.campName === camp));
    return site ? choiceKey(site) : ENEMY_TYPES[kind] ? farmStatGroup(ENEMY_TYPES[kind].reward.type) : key;
  }

  /**
   * Death does not end a farm: the session stops running while the player is
   * down, which refresh() already treats as a recovery, keeping the chosen camp
   * and picking it up again after the respawn. What death must not become is a
   * loop. A player farming a camp that is too strong for them would die, walk
   * back and die again all night, each death a server call and a broadcast, so
   * this many defeats inside the window ends the farm.
   */
  let defeats: number[] = [];
  function defeated() {
    if (!active && !pendingResume) return;
    const at = now();
    // Beaten at the boss: farm on, and try it again once the fight projects a
    // win. A boss death is the boss's alone; the map's own deaths are counted below.
    if (phase === 'boss' || at - bossLeftAt < BOSS_LEAVE_GRACE_MS) {
      if (phase === 'boss') leaveBoss(at);
      return;
    }
    // Auto looks again after the respawn, past the group that did it.
    if (phase === 'farm' && selected) { diedTo.set(`${options.mapId()}|${selected}`, at); planClock = 0; }
    defeats = defeats.filter(previous => at - previous < AUTO_FARM_DEFEAT_WINDOW_MS);
    defeats.push(at);
    if (defeats.length < AUTO_FARM_DEFEAT_LIMIT) return;
    // Too strong here: farm the map before it. With none (the first map, or
    // Reflect Only, which never walks forward again) it farms on, past the
    // groups that did it: players woke to a dead or stranded farm.
    defeats = [];
    if (!options.reflectOnly?.()) goBack('Too strong here · moving back a map');
  }

  const identityKey = () => startedIdentity ?? options.localIdentity?.() ?? '';
  // Power is read for every decision; the build changes a kill at a time, so twice a second is plenty.
  let powerAt = -Infinity, powerNow = 0;
  function currentPower() {
    const at = now();
    if (at - powerAt >= 500 || at < powerAt) { powerAt = at; powerNow = options.power?.() ?? options.evaluate?.().power ?? 0; }
    return powerNow;
  }
  const retryGate = (key: string) => retries.get(identityKey(), key, currentPower());
  /** Whether `key` may be tried now: the power its last failure asked for, and its wait over. */
  const retryReady = (key: string) => { const gate = retryGate(key); return currentPower() >= gate.power && wallNow() >= gate.at; };
  const waitMs = (minutes: number) => minutes * 60_000;
  /**
   * Walks back a map, and the map it leaves now needs more power than this
   * build has, and a wait, before it is tried again. Nothing with no map behind it.
   */
  function goBack(reason: string) {
    probation = null;
    if (!options.previousPortal?.()) return;
    retries.raise(identityKey(), options.mapId(), currentPower(), FARM_PUSHES[push].retry, waitMs(FARM_PUSHES[push].waitMinutes));
    retreating = true;
    status = reason;
  }
  /**
   * Walks away from (or was beaten by) the boss: farm on. The next try waits
   * half a map's wait (doubling with each failure, so it can never loop), and
   * then goes once the fight, as measured at the boss, projects a win in time.
   */
  function leaveBoss(at: number) {
    const boss = options.mapBoss?.(), reached = bossFight?.reached, stats = options.evaluate?.().stats;
    const left = boss?.maxHp && boss.hp !== undefined ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 1;
    // Only a fight that reached the boss measured it: a walk in worn down by the camps on the way did not.
    // One that never scratched it still says how far behind the damage was: as near nothing as can be.
    if (reached && at - reached.at >= 1_000 && stats && player.maxHp > 0) {
      const rates = bossFightRates({ seconds: (at - reached.at) / 1_000, bossStart: reached.boss, boss: left, playerStart: reached.player, player: Math.max(0, player.hp) / player.maxHp });
      lostFight = { mapId: options.mapId(), stats, boss: Math.max(1e-6, rates.boss), player: rates.player };
    }
    retries.raise(identityKey(), bossRetryKey(options.mapId()), currentPower(), 1, waitMs(FARM_PUSHES[push].waitMinutes / 2));
    bossLeftAt = at;
    bossFight = null;
    planClock = 0;
    phase = 'farm';
    target = null; route = []; lastGoal = null; routeClock = 0; holding = false; evadeTo = null;
  }

  function stop(reason = 'Autofarm stopped') {
    pendingResume = null;
    travellingTo = null;
    retreating = false;
    phase = 'farm';
    options.resumeStore?.clear();
    active = false;
    manualControl = false;
    recovering = false;
    readySince = null;
    target = null;
    route = [];
    lastGoal = null;
    holding = false;
    bossFight = null;
    evadeTo = null;
    status = reason;
  }

  function refresh() {
    if (!active && !pendingResume) return;
    const identity = options.localIdentity?.();
    const connection = options.connection?.() ?? 'ready';
    if (connection === 'ended') { stop('Autofarm stopped for sign-in'); return; }
    if (connection === 'recovering') {
      // Keep only the player's intent; old targets and paths may belong to a
      // discarded world snapshot. No retries or server work belong here.
      if (!recovering) { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; }
      recovering = true;
      readySince = null;
      status = 'Reconnecting · farming will resume';
      return;
    }
    if (recovering || pendingResume) {
      // Let a restored connection settle without retry timers or catch-up work.
      readySince ??= now();
      if (now() - readySince < 1_000) return;
      recovering = false;
      readySince = null;
      status = 'Finding enemy';
    }
    // Restored identity, map, unlocks and equipment are meaningful only after
    // hydration settles. A temporary spawn map must not erase the intent.
    if ((pendingResume?.map ?? startedMap) !== options.mapId()) { stop('Map changed · choose an enemy'); return; }
    const expectedIdentity = pendingResume?.identity ?? startedIdentity;
    if (expectedIdentity && identity !== expectedIdentity) { stop('Character changed'); return; }
    const reason = options.unavailable();
    if (reason) { stop(reason); return; }
    if (pendingResume) {
      const carried = decodeFarmPlan(pendingResume.choice);
      pendingResume = null;
      // Sliders carried from another map farm the stats this map pays; with
      // none of them above 0% here, Auto. Either way the choice is kept as it was.
      const kept = carried && normalizeWeights(carried);
      start(kept && choices().some(entry => farmWeight(kept, entry.key) > 0) ? { auto: false, weights: kept } : AUTO_FARM_CHOICE, false);
    }
  }

  function select(key: string) {
    const choice = choices().find(entry => entry.key === key);
    if (!choice) return false;
    if (selected !== key) { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; pullWait = 0; }
    selected = key;
    selectedType = choice.key;
    selectedCamp = choice.camp;
    selectedLabel = choice.label;
    return true;
  }

  /** The camp to farm now: the one furthest behind its slider's share if the player set them, otherwise Auto's pick. */
  function chooseCamp(dt: number) {
    // Everything farmed is already coming: no camp to change to.
    if (selected && weights && pullCoversFarm()) return;
    const all = choices();
    if (weights) {
      const shares = weights;
      if (spentMap !== options.mapId()) { spent = new Map(); spentMap = options.mapId(); }
      if (selected) spent.set(selected, (spent.get(selected) ?? 0) + dt);
      planClock -= dt;
      // Looks again every so often, not every kill, or as soon as its group is empty; with every group empty it waits where it is.
      const current = all.find(entry => entry.key === selected && farmWeight(shares, entry.key) > 0);
      const anyAlive = all.some(entry => entry.alive > 0 && farmWeight(shares, entry.key) > 0);
      if (current && (current.alive > 0 ? planClock > 0 : !anyAlive)) return;
      planClock = AUTO_REPLAN_SECONDS;
      const key = shareFarmKey(all.map(entry => ({ key: entry.key, weight: farmWeight(shares, entry.key), alive: entry.alive })), group => spent.get(group) ?? 0);
      if (key) select(key);
      return;
    }
    planClock -= dt;
    const current = all.find(entry => entry.key === selected);
    // Choosing again often meant walking between camps half the time.
    if (current && current.alive > 0 && planClock > 0) return;
    planClock = AUTO_REPLAN_SECONDS;
    const powerOf: (reward?: FarmReward) => FarmEvaluation = options.evaluate ?? (() => ({ power: 0 }));
    // A boss that beat this build holds the way forward: how ready its fight would be stands in for power.
    const fight = bossToBeat();
    bossFarming = Boolean(fight && powerOf().stats);
    const evaluate = fight && bossFarming ? (reward?: FarmReward) => ({ power: bossReadiness(rescaleBossFight(fight, powerOf(reward).stats!)) }) : powerOf;
    const at = now();
    const died = (key: string) => at - (diedTo.get(`${options.mapId()}|${key}`) ?? -Infinity) < DIED_TO_GROUP_MS;
    // The most power per second of farming: the kill and the walk to it.
    const dps = Math.max(1e-9, options.farmDps?.() ?? player.damage);
    const speed = Math.max(1, options.speed());
    const reach = weaponAttackRange(options.equippedWeapon?.(), player.attackRange);
    // A group that just killed the player is left alone while another has enemies.
    // Soul Crit Damage adds no power to weigh: it is farmed only when the player routes it.
    const weighed = all.some(entry => entry.soul !== 'critDamage') ? all.filter(entry => entry.soul !== 'critDamage') : all;
    const pool = weighed.some(entry => entry.alive > 0 && !died(entry.key)) ? weighed.filter(entry => !died(entry.key)) : weighed;
    const ranked = rankFarmCandidates(pool.map(entry => ({
      key: entry.key, alive: entry.alive,
      reward: entry.reward ?? ENEMY_TYPES[entry.type].reward,
      // The walk is paid in full, the farmed group's too (it used to be free,
      // so Auto kept a group spread across the map and walked most of the night).
      secondsPerKill: entry.hp / dps + (Number.isFinite(entry.nearest) ? Math.max(0, entry.nearest - reach) / speed : 0),
    })), evaluate);
    autoOrder = ranked.map(entry => entry.key);
    if (selected && autoOrder.includes(selected) && pullCoversFarm()) return;
    const key = pickRankedCandidate(ranked, selected);
    if (key) select(key);
  }

  /** On trial here: the map was just walked forward to. */
  const onProbation = () => probation !== null && probation.mapId === options.mapId();
  /** The portal it is walking to: back a map, or forward once the build has the power that map's last try asked for. */
  function exitPortal() {
    if (retreating) return options.previousPortal?.() ?? null;
    const portal = options.nextPortal?.();
    return portal && retryReady(portal.destination) ? portal : null;
  }
  /**
   * Boss, next map or a camp. Moving on needs the toggle; the boss also a
   * fight that projects a win in time. The boss may be tried on trial: beating
   * it ends the trial, since the map is plainly held.
   */
  function choosePhase(dt: number) {
    if (probation && probation.mapId !== options.mapId()) probation = null;
    // A boss beaten here (or one that holds nothing back) shows the map is held: the trial is over.
    // A strong build used to wait out the whole trial before it could even try the boss.
    if (probation && options.bossUnlocksNext?.() === false) probation = null;
    if (probation) {
      const verdict = probationVerdict(probation, now(), gain.rate(now(), options.mapId()), push);
      if (verdict === 'back') goBack('Farming slower here · moving back a map');
      else if (verdict === 'stay') probation = null;
    }
    if (retreating) {
      const back = exitPortal();
      if (back) { phase = 'portal'; travellingTo = back.destination; return; }
      retreating = false;
    }
    // Reflect Only leaves the boss to the player: the fight is won by taking its hits.
    healing = false;
    if (advance && !options.reflectOnly?.()) {
      const portal = exitPortal();
      if (portal) { phase = 'portal'; travellingTo = portal.destination; return; }
      const boss = bossWanted();
      if (boss === 'go') { phase = 'boss'; travellingTo = null; return; }
      healing = boss === 'heal';
    }
    if (phase !== 'farm') { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; }
    phase = 'farm';
    travellingTo = null;
    chooseCamp(dt);
  }

  /**
   * The boss is fought, as a player would, once the fight projects a win
   * inside BOSS_FIGHT_SECONDS and healed up ('heal' until then); after a loss,
   * not before its wait.
   */
  function bossWanted(): 'go' | 'heal' | null {
    const boss = options.mapBoss?.();
    if (!boss || boss.dead || options.bossUnlocksNext?.() === false) return null;
    // A fight under way goes on until it is won, or judged not worth going on with (judgeBossFight).
    if (phase === 'boss') return 'go';
    if (wallNow() < retryGate(bossRetryKey(options.mapId())).at || bossReady() < 1) return null;
    return player.hp >= player.maxHp * BOSS_READY_HEALTH ? 'go' : 'heal';
  }
  /** The lost fight to farm for: this map's, while its boss still holds the way forward. */
  const bossToBeat = () => lostFight?.mapId === options.mapId() && advance && !options.reflectOnly?.()
    && options.bossUnlocksNext?.() === true && Boolean(options.mapBoss?.()) ? lostFight : null;
  let readyAt = -Infinity, readyNow = 0;
  /**
   * How ready the boss fight is (bossReadiness), twice a second: the fight last
   * measured here as the build now would fight it or, before one, the build's
   * damage against the boss's health, the player's survival unknown.
   */
  function bossReady() {
    const at = now();
    if (at - readyAt < 500 && at >= readyAt) return readyNow;
    readyAt = at;
    const boss = options.mapBoss?.(), fight = bossToBeat(), stats = fight && options.evaluate?.().stats;
    if (!boss || !(player.maxHp > 0)) return readyNow = 0;
    const share = boss.maxHp && boss.hp !== undefined ? Math.max(0, boss.hp / boss.maxHp) : 1;
    const rates = fight && stats ? rescaleBossFight(fight, stats) : { boss: (options.bossDps?.() ?? 0) / Math.max(1, boss.maxHp ?? boss.hp ?? 1), player: 0 };
    return readyNow = bossReadiness(rates, { boss: share, player: Math.max(0, player.hp) / player.maxHp });
  }
  /**
   * Projects the boss fight from its real health and the player's: walk away
   * from one being lost, before dying (from the moment it set off, so a player
   * worn down by the camps on the way turns back too), or from one that, at
   * the boss, no longer projects a win in time.
   */
  function judgeBossFight(boss: Fight & { hp?: number; maxHp?: number }) {
    if (!boss.maxHp || boss.hp === undefined || !(player.maxHp > 0)) return false;
    const at = now(), bossShare = boss.hp / boss.maxHp, playerShare = player.hp / player.maxHp;
    bossFight ??= { at, bossStart: bossShare, playerStart: playerShare };
    if (!bossFight.reached && reaches(boss, player)) bossFight.reached = { at, boss: bossShare, player: playerShare };
    const { reached } = bossFight, since = (start: number) => (at - start) / 1_000;
    if (!shouldLeaveBoss({ seconds: since(bossFight.at), bossStart: bossFight.bossStart, boss: bossShare, playerStart: bossFight.playerStart, player: playerShare },
      reached && { seconds: since(reached.at), bossStart: reached.boss, boss: bossShare, playerStart: reached.player, player: playerShare })) return false;
    leaveBoss(at);
    return true;
  }

  /** Whether `fight` is in the weapon's reach from `point`, measured as combat measures it and autofarm stands for it. */
  function reaches(fight: Fight, point: Position) {
    const weapon = options.equippedWeapon?.(), reach = weaponAttackRange(weapon, player.attackRange);
    if (fight.isBoss) return bossSurfaceDistance(point.x - fight.x, point.y - fight.y, fight.r, fight.ry, fight.hitboxOffsetY) <= reach;
    return Math.hypot(point.x - fight.x, point.y - fight.y) <= reach + (isMeleeWeapon(weapon) ? fight.r : 0);
  }

  /** Seconds until a boss attack in play would hit the player at `point`. */
  const bossDangerAt = (point: Position) => options.bossDanger?.(point.x, point.y, DODGE_PAD) ?? Infinity;
  /**
   * A regular enemy's shot or blow is worth stepping out of when it would take
   * a real bite, or once the player is hurt at all: at full health regeneration
   * is keeping up with the rest, and standing farms faster. Reflect Only takes
   * every enemy hit, so it steps out of none.
   */
  const worthAvoiding = (damage: number) => !options.reflectOnly?.() && (player.hp < player.maxHp || damage >= player.maxHp * BITE_SHARE);
  /** Seconds until a boss attack, or an enemy shot worth avoiding, would hit the player at a point. */
  function dangerNow() {
    const shots = (options.enemyShots ?? []).filter(shot => worthAvoiding(shot.damage));
    return (point: Position) => Math.min(bossDangerAt(point), shots.length ? shotDanger(shots, point, player.r + DODGE_PAD) : Infinity);
  }
  /** Where it can stand: inside the map, clear of the boss's body and of the portals it must not walk into. */
  function standableNow() {
    const body = options.mapBoss?.();
    const portals = options.obstacles().filter(circle => !body || Math.hypot(circle.x - body.x, circle.y - body.y) > 4);
    return (point: Position) => point.x >= player.r && point.y >= player.r && point.x <= WORLD.w - player.r && point.y <= WORLD.h - player.r
      && (!body || (body.isBoss ? bossSurfaceDistance(point.x - body.x, point.y - body.y, body.r, body.ry, body.hitboxOffsetY) : Math.hypot(point.x - body.x, point.y - body.y) - body.r) >= player.r)
      && portals.every(circle => Math.hypot(point.x - circle.x, point.y - circle.y) > circle.r);
  }
  /** Spots around the boss from its body out to the edge of reach, so a step out of an attack can keep shooting. */
  function aroundBoss(boss: Fight) {
    const weapon = options.equippedWeapon?.(), reach = weaponAttackRange(weapon, player.attackRange) - AUTO_FARM_REACH_MARGIN;
    const edge = boss.isBoss ? reach : reach + (isMeleeWeapon(weapon) ? boss.r : 0) - boss.r, nearest = player.r + DODGE_PAD;
    const centreY = boss.y + (boss.hitboxOffsetY ?? 0), vertical = bossVerticalRadius(boss.r, boss.ry), spots: Position[] = [];
    for (const share of [0, .5, 1]) for (let turn = 0; turn < 16; turn++) {
      const angle = turn * Math.PI / 8, ux = Math.cos(angle), uy = Math.sin(angle);
      const scale = (nearest + Math.max(0, edge - nearest) * share + boss.r) / Math.hypot(ux, uy * boss.r / vertical);
      spots.push({ x: boss.x + ux * scale, y: centreY + uy * scale });
    }
    return spots;
  }
  /**
   * A step out of an attack about to land, kept within reach of `fight` where it
   * can be; with a bow, a step back from a melee enemy closing in (kiting).
   * Null when neither is needed: the farm carries on as it was.
   */
  function evasion(fight: Fight | null, boss: Fight | null, dt: number): Movement | null {
    evadeClock -= dt;
    const dangerAt = dangerNow(), threatened = dangerAt(player) < Infinity;
    if (evadeTo && distance(evadeTo) < WAYPOINT_REACHED) evadeTo = null;
    if (evadeClock <= 0 || (evadeTo && dangerAt(evadeTo) < Infinity)) {
      evadeClock = EVADE_REPLAN_SECONDS;
      // A melee weapon fights what reaches it, Reflect Only needs its hits, and the walk to a portal never turns back.
      const kite = phase !== 'portal' && !isMeleeWeapon(options.equippedWeapon?.());
      const chasers: EnemyState[] = [], idle: EnemyState[] = [];
      for (const enemy of enemies) {
        if (enemy.dead || enemy.generatedBoss || enemy.remoteCombatGhost || distance(enemy) > KITE_ROOM + 400) continue;
        if (!isEnemyAttackingPlayer(enemy, options.localIdentity?.())) { if (!enemy.engaged) idle.push(enemy); }
        else if (kite && !(enemy.definition ?? ENEMY_TYPES[enemy.type]).ranged && worthAvoiding(enemy.damage)) chasers.push(enemy);
      }
      evadeTo = evadePoint({ from: { x: player.x, y: player.y }, speed: Math.max(1, options.speed()), r: player.r, standable: standableNow(), danger: dangerAt,
        chasers, idle, kiteGap: kiting ? KITE_ROOM : KITE_GAP, inReach: point => !fight || reaches(fight, point), extra: boss ? aroundBoss(boss) : [] });
      kiting = Boolean(evadeTo) && !threatened;
    }
    if (!evadeTo) return null;
    holding = false; route = []; routeClock = 0;
    status = kiting ? 'Kiting' : 'Dodging';
    return steer(evadeTo, dt);
  }
  function steer(point: Position, dt: number): Movement {
    const length = distance(point);
    if (!(length > 0)) return idle();
    const magnitude = Math.min(1, length / Math.max(1, options.speed() * dt));
    return { x: (point.x - player.x) / length * magnitude, y: (point.y - player.y) / length * magnitude, source: 'steer' };
  }

  /** Keys saved under an older name, or carried between the campaign and the Soul Dimension, as this map names them; a merge keeps the larger. */
  function normalizeWeights(next: FarmWeights) {
    const out: Record<string, number> = {};
    for (const key of Object.keys(next)) { const group = normalizeKey(key); out[group] = Math.max(out[group] ?? 0, farmWeight(next, key)); }
    return out;
  }

  /**
   * Starts farming: Auto, or the player's sliders. An old route (a camp key,
   * or keys in order, an empty list being Auto) still reads, as its sliders.
   * `remember` is false when autofarm restarts itself: only the player's own choice is saved.
   */
  function start(next: FarmChoice | string | readonly string[], remember = true) {
    if (options.connection && options.connection() !== 'ready') {
      stop('Connect to the server to farm'); return false;
    }
    const reason = options.unavailable();
    if (reason) { stop(reason); return false; }
    const legacy = typeof next === 'string' ? decodeFarmPlan(next) : undefined;
    const choice: FarmChoice = Array.isArray(next) ? routeChoice(next) : legacy !== undefined
      ? (legacy ? { auto: false, weights: legacy } : AUTO_FARM_CHOICE) : next as FarmChoice;
    const shares = normalizeWeights(choice.weights);
    const available = choices().map(entry => entry.key);
    const order = choice.auto ? [] : available.filter(key => farmWeight(shares, key) > 0).sort((a, b) => farmWeight(shares, b) - farmWeight(shares, a));
    if (!available.length || (!choice.auto && !order.length)) { stop('No matching enemies in this map'); return false; }
    weights = choice.auto ? null : shares;
    weightOrder = order;
    spent = new Map(); spentMap = options.mapId();
    selected = null;
    planClock = 0;
    phase = 'farm';
    travellingTo = null;
    active = true;
    manualControl = false;
    startedMap = options.mapId();
    startedIdentity = options.localIdentity?.();
    pendingResume = null;
    if (remember) writeFarmChoice({ auto: choice.auto, weights: shares }, options.priorityStorage, options.mapId());
    if (startedIdentity) options.resumeStore?.write({ identity: startedIdentity, map: startedMap, choice: encodeFarmPlan(weights) });
    recovering = false;
    readySince = null;
    target = null;
    route = [];
    routeClock = 0;
    lastGoal = null;
    holding = false;
    chooseCamp(0);
    status = 'Finding enemy';
    return Boolean(selected);
  }

  /**
   * A portal autofarm walked into on purpose carries the farm across with the
   * player's last choice, the same on every map (it used to switch to whatever
   * that map was last farmed with). Any other travel ends it, as before.
   */
  function travelStarted() {
    if (!active || phase !== 'portal' || !travellingTo || !startedIdentity) { stop('Map changed · choose an enemy'); return; }
    const saved = readFarmChoice(startedMap, options.priorityStorage);
    const intent = { identity: startedIdentity, map: travellingTo, choice: encodeFarmPlan(saved.auto ? null : saved.weights) };
    const label = retreating ? 'Moving back a map' : 'Moving to the next map';
    // Forward: the new map is on trial against how fast this one was growing the build.
    probation = retreating ? null : { mapId: travellingTo, since: now(), previousRate: gain.rate(now(), startedMap) };
    stop(label);
    pendingResume = intent;
    options.resumeStore?.write(intent);
    status = label;
  }

  function pullsEnemy(enemy: EnemyState) {
    return pullAll && active && phase === 'farm' && !healing && !recovering && !pendingResume && !options.paused()
      && !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0 && pulledGroups().has(choiceKey(enemy));
  }

  function movement(manual: Movement, dt: number): Movement {
    refresh();
    manualControl = Boolean(manual.x || manual.y);
    if (recovering || pendingResume) return idle();
    if (manual.x || manual.y) {
      if (active) {
        status = 'Manual control';
        route = [];
        lastGoal = null;
        routeClock = 0;
        holding = false;
      }
      return manual;
    }
    if (!active || options.paused()) return manual;
    for (const enemy of enemies) {
      if (selectedType === null || enemy.generatedBoss || !farmGroupMatches(enemy, selectedType)) continue;
      if (!enemy.dead && enemy.hp > 0) seenAlive.add(enemy);
      else if (seenAlive.delete(enemy)) pullWait = 0;
    }
    gain.sample(now(), currentPower(), options.mapId());
    choosePhase(dt);
    if (phase !== 'boss') bossFight = null;
    const boss = phase === 'boss' ? options.mapBoss?.() ?? null : null;
    if (boss && judgeBossFight(boss)) return idle();
    const portal = phase === 'portal' ? exitPortal() : null;
    if (phase !== 'farm') target = null;
    else if (!target || !validEnemy(target) || !enemies.includes(target)) {
      target = null;
      for (const enemy of enemies) {
        if (validEnemy(enemy) && (!target || compareAutoFarmTargets(priority, enemy, distance(enemy), target, distance(target)) < 0)) target = enemy;
      }
      routeClock = 0;
    }
    let threat: EnemyState | null = null;
    // On the way to the boss or the next map it shoots what it passes but
    // chases nobody: a group camp's attackers respawn faster than they die,
    // and turning to each one meant never arriving. A pulled group is coming
    // anyway, so walking out to meet each of them only zig-zags.
    if (phase === 'farm' && !pullAll) for (const enemy of enemies) {
      if (!enemy.generatedBoss && isEnemyAttackingPlayer(enemy, options.localIdentity?.()) && (!threat || distance(enemy) < distance(threat))) threat = enemy;
    }
    // Out of what is about to land, and back from melee enemies on a bow, before anything else: still shooting.
    const evade = evasion(boss ?? threat ?? target, boss, dt);
    if (evade) return evade;
    // Healing up for the boss: what attacks it is fought (or kited) as ever, but nothing new is gone after or pulled.
    if (phase === 'farm' && healing && !enemies.some(enemy => isEnemyAttackingPlayer(enemy, options.localIdentity?.()))) {
      holding = true; route = []; status = 'Healing for the boss';
      return idle();
    }
    // Everything it farms comes to it: it stands its ground (Ryan: no walking out, whatever arrives).
    if (phase === 'farm' && pullCoversFarm()) {
      const reachAll = weaponAttackRange(options.equippedWeapon?.(), player.attackRange);
      const inReach = enemies.some(enemy => pulledEnemy(enemy) && distance(enemy) <= reachAll + enemy.r);
      holding = true; route = []; status = inReach ? 'Farming' : enemies.some(pulledEnemy) ? 'Pulling' : 'Waiting for respawn';
      return idle();
    }
    // With the group on its way (pulled, or already chasing), stand and let it
    // come; walk out only if nothing has reached range for a few seconds
    // (stuck, or ranged). Waiting for `engaged` alone, it stepped out for a
    // frame after every kill, before Pull's aggro landed on the next group.
    const reach = weaponAttackRange(options.equippedWeapon?.(), player.attackRange);
    if (phase === 'farm' && !threat) {
      const coming = enemies.some(enemy => validEnemy(enemy) && (enemy.engaged || (pullAll && pullsEnemy(enemy))));
      const inReach = enemies.some(enemy => validEnemy(enemy) && distance(enemy) <= reach + enemy.r);
      pullWait = coming && !inReach ? pullWait + dt : 0;
      if (coming && (inReach || pullWait < PULL_WAIT_SECONDS)) { holding = true; route = []; status = inReach ? 'Farming' : pullAll ? 'Pulling' : 'Holding ground'; return idle(); }
    }
    // Walking to the portal, nothing stops it but a fight that finds it.
    // A boss is aimed at its hitbox, not its sprite's foot.
    const bossPoint = boss ? { x: boss.x, y: boss.y + (boss.hitboxOffsetY ?? 0) } : null;
    let destination: Position | null = threat ?? target ?? portal ?? bossPoint;
    if (!destination) {
      for (const site of spawnSites) if (choiceKey(site) === selected && (!destination || distance(site) < distance(destination))) destination = site;
    }
    if (!destination) { stop('No matching enemies in this map'); return idle(); }
    const weapon = options.equippedWeapon?.();
    const enemy = threat ?? target;
    // A campaign boss is hit at the surface of its hitbox, an oval off its feet,
    // and measured exactly as combat measures it: parking by its narrower radius
    // left a squat boss out of range above and below. An Endless boss is a
    // regular enemy, hit at its centre unless melee.
    const hitbox = !enemy && boss?.isBoss ? boss : null;
    const bossReach = !enemy && boss && !hitbox && isMeleeWeapon(weapon) ? boss.r : 0;
    let standoff = !enemy && portal ? { stop: 0, resume: 0 } : autoFarmStandoff({
      weaponRange: hitbox ? Math.min(weaponAttackRange(weapon, player.attackRange), BOSS_STAND_GAP + AUTO_FARM_REACH_MARGIN) : weaponAttackRange(weapon, player.attackRange) + bossReach,
      playerAttackRange: player.attackRange,
      melee: isMeleeWeapon(weapon),
      playerRadius: player.r,
      destination: enemy ?? destination,
      enemy: Boolean(enemy),
    });
    if (enemy && options.reflectOnly?.()) {
      // Nothing the bow does lands here: stand at the enemy so it attacks, and Reflect does the killing.
      const contact = player.r + enemy.r + 6;
      standoff = { stop: contact, resume: contact + 20 };
    } else if (enemy && (enemy.vx * (enemy.x - player.x) + enemy.vy * (enemy.y - player.y)) > 0 && Math.hypot(enemy.vx, enemy.vy) > 10) {
      // Walking away: close in further, or every step it takes puts it back out of range before a shot.
      standoff = { stop: standoff.stop * .6, resume: standoff.stop * .8 };
    }
    const range = standoff.stop;
    const remaining = hitbox ? bossSurfaceDistance(player.x - hitbox.x, player.y - hitbox.y, hitbox.r, hitbox.ry, hitbox.hitboxOffsetY) : distance(destination);
    // Where to stand, in a direction from the destination, to be `range` from it (or from the boss's surface).
    const standAt = (angle: number) => {
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const reachFromCentre = hitbox ? (range + hitbox.r) / Math.hypot(ux, uy * hitbox.r / bossVerticalRadius(hitbox.r, hitbox.ry)) : range;
      return { x: destination.x + ux * reachFromCentre, y: destination.y + uy * reachFromCentre };
    };
    // Slack as wide as the waypoint drop below (2px): a step landing 1-2px short
    // dropped the last waypoint without arriving, and it stood there for good,
    // "Waiting for a clear route", beside a boss that never moves. A squat
    // hitbox's surface distance is stretched vertically, and the slack with it.
    const slack = WAYPOINT_REACHED * (hitbox ? Math.max(1, hitbox.r / bossVerticalRadius(hitbox.r, hitbox.ry)) : 1);
    holding = remaining <= (holding ? standoff.resume : standoff.stop) + slack;
    if (holding && !portal) {
      status = threat ? 'Defending' : boss ? 'Fighting the boss' : target ? 'Farming' : 'Waiting for respawn';
      route = [];
      routeClock = 0;
      return idle();
    }
    const goal = distance(destination) > 0 ? standAt(Math.atan2(player.y - destination.y, player.x - destination.x)) : { x: destination.x, y: destination.y };
    routeClock -= dt;
    if (routeClock <= 0 || !lastGoal || Math.hypot(goal.x - lastGoal.x, goal.y - lastGoal.y) > 60) {
      // Its own goal is no obstacle: the portal it is walking into, the boss it is going to fight.
      const goalPoint = portal ?? boss;
      const obstacles = options.obstacles().filter(circle => !goalPoint || Math.hypot(circle.x - goalPoint.x, circle.y - goalPoint.y) > 4 + (boss ? boss.r : 0) && !(portal && Math.hypot(circle.x - portal.x, circle.y - portal.y) <= circle.r));
      route = farmRoute(player, goal, obstacles, WORLD, player.r);
      // The nearest firing position can fall inside a portal avoidance circle.
      // Try other firing positions at the same range around the target, nearest
      // first, then the target itself; range checks still stop us early.
      if (!route.length) {
        const away = Math.atan2(player.y - destination.y, player.x - destination.x);
        for (const turn of [1, -1, 2, -2, 3, -3, 4]) {
          const angle = away + turn * Math.PI / 4;
          route = farmRoute(player, standAt(angle), obstacles, WORLD, player.r);
          if (route.length) break;
        }
      }
      if (!route.length) route = farmRoute(player, destination, obstacles, WORLD, player.r);
      lastGoal = goal;
      routeClock = .5;
    }
    while (route.length && distance(route[0]) < WAYPOINT_REACHED) route.shift();
    const waypoint = route[0];
    if (!waypoint) { status = 'Waiting for a clear route'; return idle(); }
    status = threat ? 'Moving to attacker' : portal ? (retreating ? 'Moving back a map' : 'Heading to the next map') : boss ? 'Moving to the boss' : target ? 'Moving to enemy' : 'Moving to spawn';
    // Never walk into a boss attack about to land: it waits for it to pass, as a player would.
    // A shot is only a line, crossed in a moment: one coming at the player is stepped out of instead.
    const length = distance(waypoint), look = Math.min(length, options.speed() * WALK_LOOKAHEAD_SECONDS) / length;
    if (bossDangerAt({ x: player.x + (waypoint.x - player.x) * look, y: player.y + (waypoint.y - player.y) * look }) < Infinity) { status = 'Waiting out an attack'; return idle(); }
    return steer(waypoint, dt);
  }

  /** What the boss and next-map switch will do next, in a word or two for the panel. */
  function bossStatus() {
    if (options.reflectOnly?.()) return 'Off In Reflect Only';
    if (retreating) return 'Moving Back A Map';
    if (onProbation()) return `Trying Next Map · ${formatTimerMs(probation!.since + PROBATION_MS - now())}`;
    // What the next map's try still waits for: more power first, then the time.
    const gate = (label: string, key: string) => {
      const { power, at } = retryGate(key);
      if (currentPower() < power) return `${label} At ${formatCompactNumber(Math.ceil(power))}`;
      const wait = at - wallNow();
      return wait > 0 ? `${label} In ${formatTimerMs(wait)}` : null;
    };
    const portal = options.nextPortal?.();
    if (portal) return gate('Next Map', portal.destination) ?? 'Next Map Open';
    if (options.bossUnlocksNext?.() === false) return 'Boss Beaten';
    const boss = options.mapBoss?.();
    if (!boss || boss.dead) return '';
    const wait = retryGate(bossRetryKey(options.mapId())).at - wallNow();
    if (wait > 0) return `Boss In ${formatTimerMs(wait)}`;
    return bossReady() >= 1 ? 'Boss Next' : 'Boss Needs More Power';
  }

  return { start, stop, defeated, refresh, choices, movement, travelStarted,
    state: () => ({ active, selected, selectedLabel, weights: weights && { ...weights }, phase, advance,
      // On Auto, what it farms and why: "Farming Armor · Best Gain".
      status: active && !recovering && options.paused() ? 'Paused'
        : active && !weights && phase === 'farm' && status === 'Farming' ? `Farming ${selectedLabel} · ${bossFarming ? 'For The Boss' : 'Best Gain'}` : status }),
    /** The camp being farmed; null at the boss or on the way out, so the boss and anything in the way are fair game. */
    targetType: () => active && !manualControl && phase === 'farm' ? selectedType : null,
    /** What combat aims at: the farmed camp, or, with every farmed group pulled, whatever is nearest. */
    attackType: () => active && !manualControl && phase === 'farm' && !pullCoversFarm() ? selectedType : null,
    targetCamp: () => active && !manualControl && phase === 'farm' ? selectedCamp : null,
    advance: () => advance,
    setAdvance(next: boolean) {
      advance = next;
      writeFarmAdvance(next, options.priorityStorage);
    },
    bossStatus,
    /** Whether the switch's next step is ready to go ('Next Map Open', 'Boss Next'): the panel shows it lit. */
    bossStatusReady: () => READY_STATUSES.has(bossStatus()),
    push: () => push,
    setPush(next: FarmPush) {
      push = next;
      writeFarmPush(next, options.priorityStorage);
    },
    /** The choice saved for this map, for the panel to show: a campaign slider shows as its soul stat's in the Soul Dimension. */
    savedChoice: (): FarmChoice => { const saved = readFarmChoice(options.mapId(), options.priorityStorage); return { auto: saved.auto, weights: normalizeWeights(saved.weights) }; },
    priority: () => priority,
    /**
     * The Target rule combat aims by: while farming (a pulled crowd too) and all
     * through an Aggro run, where every chasing group comes at once and the
     * player picks it in the Aggro window. Steering by hand otherwise aims at the nearest.
     */
    attackPriority: (): AutoFarmPriority => (active && !manualControl && phase === 'farm') || forcedGroups().size ? priority : 'closest',
    pullAll: () => pullAll,
    /** False during an Aggro run, when Pull is off. */
    pullAvailable: () => (options.pullCamps?.() ?? 1) > 0,
    setPullAll(next: boolean) {
      pullAll = next;
      writeAutoFarmPull(next, options.priorityStorage);
    },
    /**
     * With "aggro on spawn" ticked, every live enemy of the farmed stat comes
     * for the player from anywhere; each Aggro challenge win adds the next
     * largest slider (or Auto's next best) to the pull.
     */
    // Steering by hand keeps the pull: the group follows the player while they move.
    pulls: (enemy: EnemyState) => pullsEnemy(enemy),
    /** An Aggro run's groups on this map: they chase the player from arrival, whatever autofarm is doing. */
    forced: (enemy: EnemyState) => !enemy.dead && !enemy.generatedBoss && !enemy.remoteCombatGhost && forcedGroups().has(choiceKey(enemy)),
    setPriority(next: AutoFarmPriority) {
      if (next === priority) return;
      priority = next;
      writeAutoFarmPriority(next, options.priorityStorage);
      // Choose again under the new rule rather than finishing the old target.
      target = null;
      routeClock = 0;
    },
  };
}
