import { isMeleeWeapon, weaponAttackRange } from "../weapon-combat";
import { WORLD } from '../constants';
import { monotonicNowMs } from '../../app/trusted-clock';
import { ENEMY_TYPES, rewardStatLabel, type EnemyDefinition, type EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';
import type { Circle, EnemyState, PlayerState, Position } from './types';
import type { Movement } from './player-input-controller';
import { isEnemyAttackingPlayer } from './enemy-threat';
import { farmRoute } from './auto-farm-navigation';
import { bossSurfaceDistance, bossVerticalRadius } from '../../../shared/boss-hitbox';
import { carryFarmGroup, compareAutoFarmTargets, farmGroupMatches, farmGroupOf, farmStatGroup, readAutoFarmPriority, soulFarmReward, readAutoFarmPull, writeAutoFarmPriority, writeAutoFarmPull, type AutoFarmGroup, type AutoFarmPriority } from './auto-farm-priority';
import type { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import {
  SHARE_REPLAN_SECONDS, decodeFarmPlan, encodeFarmPlan, legacyShares, readBossPower, writeBossPower, readMovePower, writeMovePower, powerStep, readFarmAdvance, readFightBosses, readSavedShares, sharesForGroups, shareFarmKey,
  writeFarmAdvance, writeFightBosses, writeSavedShares, type FarmReward, type FarmShares,
} from './auto-farm-plan';
import { formatCompactNumber } from '../../../shared/compact-number';
import { isSoulMap, SOUL_STAT_DETAILS, type SoulStatId } from '../../../shared/soul-dimension';
import { soulStatOfCampName } from '../soul-world';

export type AutoFarmController = ReturnType<typeof createAutoFarmController>;
const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });
/** How far inside its full reach autofarm stops: enough that a target at the stop point is still in range. */
export const AUTO_FARM_REACH_MARGIN = 6;
/** A waypoint this close is reached; the stop point gets the same slack. */
const WAYPOINT_REACHED = 2;
/** How long a pulled group may take to arrive before autofarm walks out to it. */
export const PULL_WAIT_SECONDS = 4;
/** How long after a boss win the way forward is looked at: the unlock reaches the map's portals in a moment. */
const BOSS_WIN_SETTLE_MS = 5_000;
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
  // Fight from the edge of the full reach, research and Long Shot included: walk only until the target is in range.
  const stop = Math.max(8, reach - AUTO_FARM_REACH_MARGIN);
  // Walk again a little before the target leaves reach, so the shot is never lost.
  return { stop, resume: stop + (reach - stop) / 2 };
}

/**
 * Autofarm, with simple rules a player can predict (Ryan: "easy simple tools
 * that common sense would say is good"):
 * - Stats: each stat group farmed for its slider's share of the time, the
 *   sliders adding up to 100%, 0% never farmed.
 * - Move On: to the next map once power reaches Move At times its
 *   recommended power.
 * - Fight Bosses: the boss once power reaches Fight At times its recommended
 *   power, fought until it or the player is down. A boss already beaten is left
 *   alone.
 * - Deaths: it respawns and goes on with the same settings. Nothing is
 *   remembered, nothing is retried later, it never steps back a map.
 * - Pull Whole Group: the whole camp at once, or one enemy at a time.
 * It walks to its target and fights standing.
 */
export function createAutoFarmController(options: {
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  mapId: () => string;
  equippedWeapon?: () => string;
  localIdentity?: () => string | undefined;
  connection?: () => 'ready' | 'recovering' | 'ended';
  now?: () => number;
  resumeStore?: ReturnType<typeof createAutoFarmResumeStore>;
  unavailable: () => string | null;
  paused: () => boolean;
  speed: () => number;
  obstacles: () => Circle[];
  priorityStorage?: () => Pick<Storage, 'getItem' | 'setItem'> | undefined;
  /** The live build's power, as the profile shows it before rounding. */
  power?: () => number;
  /** A map's recommended power (auto-farm-power.ts); null when it has none. */
  mapPower?: (mapId: string) => number | null;
  /** This map's boss's recommended power; null when it has none (the map's own is used). */
  bossPower?: () => number | null;
  /** This map's boss while it stands (null once it is down or respawning). */
  mapBoss?: () => (Fight & { dead?: boolean }) | null;
  /** Reflect Only: the bow does nothing, so enemies must be stood among to be hit and hit back. */
  reflectOnly?: () => boolean;
  /** The unlocked portal forward to the next map, at its trigger point. */
  nextPortal?: () => (Position & { destination: string }) | null;
  /** The portal back to the previous map. */
  previousPortal?: () => (Position & { destination: string }) | null;
  /** Whether beating this map's boss opens a locked way forward. */
  bossUnlocksNext?: () => boolean;
  /** How many picked camps (stat groups) Pull aggroes at once: one, one more per Aggro win, and none during a run. */
  pullCamps?: () => number;
  /** During an Aggro run: the stat groups the player picked and how many must chase them on every map, farming or not. */
  forcedGroups?: () => { groups: readonly string[]; needed: number } | null;
}) {
  const { player, enemies, spawnSites } = options;
  const now = options.now ?? monotonicNowMs;
  let priority: AutoFarmPriority = readAutoFarmPriority(options.priorityStorage);
  let pullAll = readAutoFarmPull(options.priorityStorage);
  let advance = readFarmAdvance(options.priorityStorage);
  let fightBosses = readFightBosses(options.priorityStorage);
  /** The sliders under the switches: the share of the next map's power, and of the boss's, to have before going (1 is even). */
  let movePower = readMovePower(options.priorityStorage);
  let bossPower = readBossPower(options.priorityStorage);
  /** This map's sliders, and its groups above 0%, the largest first. */
  let shares: FarmShares = {};
  let order: string[] = [];
  /** Seconds spent farming each group on this map (walking to it included), for its share. */
  let spent = new Map<string, number>(), spentMap = '';
  /** What it is doing now: a camp, the boss, or walking to another map. */
  let phase: 'farm' | 'boss' | 'portal' = 'farm';
  let travellingTo: string | null = null;
  /** A boss beaten that left the way forward shut: not fought again on that map. */
  const opensNothing = new Set<string>();
  let bossWin: { mapId: string; at: number } | null = null;
  let planClock = 0;
  /** How long it has stood waiting for a pulled group that never arrives. */
  let pullWait = 0;
  let selected: string | null = null;
  let selectedType: AutoFarmGroup | null = null;
  let selectedLabel = "";
  let active = false;
  let manualControl = false;
  let pendingResume = options.resumeStore?.read() ?? null;
  let startedMap = '';
  let startedIdentity: string | undefined;
  let recovering = false;
  let readySince: number | null = null;
  let status = 'Choose stats to begin';
  let target: EnemyState | null = null;
  let route: Position[] = [];
  let routeClock = 0;
  let lastGoal: Position | null = null;
  // True while standing in range; walking resumes only past the resume distance.
  let holding = false;
  const distance = (point: Position) => Math.hypot(point.x - player.x, point.y - player.y);
  const validEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && selectedType !== null
    && farmGroupMatches(enemy, selectedType) && enemy.hp > 0;
  // Power is read for every decision; the build changes a kill at a time, so twice a second is plenty.
  let powerAt = -Infinity, powerNow = 0;
  function currentPower() {
    const at = now();
    if (at - powerAt >= 500 || at < powerAt) { powerAt = at; powerNow = options.power?.() ?? 0; }
    return powerNow;
  }

  /**
   * One choice per stat: a camp's regulars and elites, and every camp paying
   * it, are one entry. In the Soul Dimension, one per soul stat the player's tier has woken.
   */
  const choiceKey = (site: Pick<SpawnSite, 'type' | 'definition' | 'campName'>) => farmGroupOf(site);
  function choices() {
    const counts = new Map<string, { key: AutoFarmGroup; type: EnemyKind; kinds: EnemyKind[]; label: string;
      alive: number; total: number; reward: FarmReward; maxReward: number; soul: SoulStatId | null }>();
    for (const site of spawnSites) {
      const key = choiceKey(site), definition = site.definition ?? ENEMY_TYPES[site.type];
      // A soul enemy pays its soul stat, flat, and nothing to the run.
      const soul = soulStatOfCampName(site.campName), reward: FarmReward = soul ? soulFarmReward(soul) : definition.reward;
      const choice = counts.get(key) ?? { key, type: site.type, kinds: [], label: soul ? `Soul ${SOUL_STAT_DETAILS[soul].label}` : rewardStatLabel(reward),
        alive: 0, total: 0, reward: { ...reward }, maxReward: reward.amount, soul };
      choice.total++;
      if (!choice.kinds.includes(site.type)) choice.kinds.push(site.type);
      choice.reward.amount = Math.min(choice.reward.amount, reward.amount);
      choice.maxReward = Math.max(choice.maxReward, reward.amount);
      counts.set(key, choice);
    }
    for (const enemy of enemies) if (!enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0) {
      const choice = counts.get(choiceKey(enemy));
      if (choice) choice.alive++;
    }
    return [...counts.values()];
  }
  const groups = () => choices().map(entry => entry.key);

  /** A stat picked on a campaign map is its soul stat in the Soul Dimension, and back (carryFarmGroup); an enemy kind saved before 0.873 is its stat. */
  function normalizeKey(key: string) {
    if (key.startsWith('stat:') || key.startsWith('soul:')) return carryFarmGroup(key, isSoulMap(options.mapId()));
    const [kind] = key.split(':') as [EnemyKind];
    return ENEMY_TYPES[kind] ? farmStatGroup(ENEMY_TYPES[kind].reward.type) : key;
  }
  /** Shares saved under another map's names, as this map names its groups; a merge keeps the larger. */
  function normalizeShares(next: FarmShares | null) {
    if (!next) return null;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(next)) { const group = normalizeKey(key); out[group] = Math.max(out[group] ?? 0, value); }
    return out;
  }
  /** The sliders saved for this map's groups (an even split when none is), the 0-200% ones of before migrated. */
  function savedShares(): FarmShares {
    const here = groups(), mapId = options.mapId();
    const saved = normalizeShares(readSavedShares(mapId, options.priorityStorage)) ?? legacyShares(here, mapId, options.priorityStorage, normalizeKey);
    return sharesForGroups(saved, here);
  }

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
    const chosen = forced.groups.map(normalizeKey).filter(group => here.includes(group)).slice(0, forced.needed);
    for (const group of here) if (chosen.length < forced.needed && !chosen.includes(group)) chosen.push(group);
    if (chosen.length !== forcedSet.size || chosen.some(group => !forcedSet.has(group))) forcedSet = new Set(chosen);
    return forcedSet;
  }

  // Pull's groups: the one being farmed, then the next largest sliders, one more per Aggro win.
  let pulled = new Set<string>(), pulledKey = '';
  function pulledGroups() {
    // Zero during an Aggro run: its own chasing groups are the run's pull.
    const count = Math.max(0, options.pullCamps?.() ?? 1), key = `${selected}|${count}|${order.join()}`;
    if (key === pulledKey) return pulled;
    pulled = new Set([...new Set([selected, ...order].filter((group): group is string => Boolean(group)))].slice(0, count)); pulledKey = key;
    return pulled;
  }
  /** Pull brings every group it farms: all of it comes to the player, so walking to camps would only waste time. It stands and fights. */
  function pullCoversFarm() {
    if (!pullAll || !active || manualControl || phase !== 'farm' || !order.length) return false;
    const pulledNow = pulledGroups();
    return order.every(group => pulledNow.has(group));
  }
  const pulledEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0 && pulledGroups().has(choiceKey(enemy));
  /** Pull Whole Group on: every enemy of the pulled groups comes, while it farms. */
  const pullsEnemy = (enemy: EnemyState) => pullAll && active && phase === 'farm' && !recovering && !pendingResume && !options.paused() && pulledEnemy(enemy);

  // ---- Move On ----
  /** The power Move On waits for: Move At times the map's recommended power. */
  const mapNeeds = (mapId: string) => (options.mapPower?.(mapId) ?? 0) * movePower;
  /** The next map's portal, once power reaches what Move At asks of it. */
  function exitPortal() {
    if (!advance || options.reflectOnly?.()) return null;
    const portal = options.nextPortal?.();
    return portal && currentPower() >= mapNeeds(portal.destination) ? portal : null;
  }

  // ---- Fight Bosses ----
  /** The power Fight Bosses waits for: Fight At times the boss's recommended power. */
  const bossNeeds = () => (options.bossPower?.() ?? options.mapPower?.(options.mapId()) ?? 0) * bossPower;
  /** Beaten, as far as it can tell: the way forward it holds is open, or a win here opened nothing. */
  const bossBeaten = () => options.bossUnlocksNext?.() === false || opensNothing.has(options.mapId());
  /** Whether to fight the boss now: Fight Bosses on, a boss standing that is not beaten, and power enough (a fight under way goes on). */
  function bossWanted() {
    const boss = options.mapBoss?.(), mapId = options.mapId();
    // A fight that ended with the boss gone was won: whether that opened anything is read a few seconds on.
    if (phase === 'boss' && (!boss || boss.dead)) bossWin = { mapId, at: now() };
    if (bossWin && bossWin.mapId === mapId && now() - bossWin.at >= BOSS_WIN_SETTLE_MS) {
      if (options.bossUnlocksNext?.() === true) opensNothing.add(mapId);
      bossWin = null;
    }
    if (!fightBosses || options.reflectOnly?.() || !boss || boss.dead || bossBeaten()) return false;
    // A fight under way goes on until the boss or the player is down.
    return phase === 'boss' || currentPower() >= bossNeeds();
  }

  /**
   * Death does not end a farm: the session stops running while the player is
   * down, which refresh() treats as a recovery, picking it up after the
   * respawn with the same settings. Nothing is remembered and nothing waits:
   * the switches and their sliders say what it does next.
   */
  function defeated() {
    if (!active && !pendingResume) return;
    if (phase === 'boss') { phase = 'farm'; target = null; route = []; lastGoal = null; routeClock = 0; holding = false; }
  }

  function stop(reason = 'Autofarm stopped') {
    pendingResume = null;
    travellingTo = null;
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
    status = reason;
  }

  function refresh() {
    if (!active && !pendingResume) return;
    const identity = options.localIdentity?.();
    const connection = options.connection?.() ?? 'ready';
    if (connection === 'ended') { stop('Autofarm stopped for sign-in'); return; }
    if (connection === 'recovering') {
      // Keep only the player's intent; old targets and paths may belong to a discarded world snapshot.
      if (!recovering) { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; }
      recovering = true;
      readySince = null;
      status = 'Reconnecting · farming will resume';
      return;
    }
    if (recovering || pendingResume) {
      // Let a restored connection settle first.
      readySince ??= now();
      if (now() - readySince < 1_000) return;
      recovering = false;
      readySince = null;
      status = 'Finding enemy';
    }
    // Restored identity, map, unlocks and equipment are meaningful only after hydration settles.
    // A farm that finds itself on another map (however it got there) carries on there with the same sliders.
    if (!pendingResume && startedMap !== options.mapId() && startedIdentity)
      pendingResume = { identity: startedIdentity, map: options.mapId(), choice: encodeFarmPlan(readSavedShares(startedMap, options.priorityStorage) ?? shares) };
    const expectedIdentity = pendingResume?.identity ?? startedIdentity;
    if (expectedIdentity && identity !== expectedIdentity) { stop('Character changed'); return; }
    const reason = options.unavailable();
    if (reason) { stop(reason); return; }
    if (pendingResume) {
      // Town, home, a map with no enemies: it waits, and farms again on the next map that has some.
      if (!groups().length) { active = false; status = 'Farming resumes on a map with enemies'; return; }
      // The sliders carried from the map before, as this map names its stats; nothing of them here is an even split.
      const carried = normalizeShares(decodeFarmPlan(pendingResume.choice));
      pendingResume = null;
      start(sharesForGroups(carried, groups()), false);
    }
  }

  function select(key: string) {
    const choice = choices().find(entry => entry.key === key);
    if (!choice) return false;
    if (selected !== key) { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; pullWait = 0; }
    selected = key;
    selectedType = choice.key;
    selectedLabel = choice.label;
    return true;
  }

  /** The group furthest behind its share of the farming time; looked at again every so often, or as soon as its group is empty. */
  function chooseCamp(dt: number) {
    // Everything farmed is already coming: no camp to change to.
    if (selected && pullCoversFarm()) return;
    const all = choices();
    if (spentMap !== options.mapId()) { spent = new Map(); spentMap = options.mapId(); }
    if (selected) spent.set(selected, (spent.get(selected) ?? 0) + dt);
    planClock -= dt;
    const current = all.find(entry => entry.key === selected && (shares[entry.key] ?? 0) > 0);
    const anyAlive = all.some(entry => entry.alive > 0 && (shares[entry.key] ?? 0) > 0);
    if (current && (current.alive > 0 ? planClock > 0 : !anyAlive)) return;
    planClock = SHARE_REPLAN_SECONDS;
    const key = shareFarmKey(all.map(entry => ({ key: entry.key, weight: shares[entry.key] ?? 0, alive: entry.alive })), group => spent.get(group) ?? 0);
    if (key) select(key);
  }

  /** Back a map, the next map, the boss, or a camp. */
  function choosePhase(dt: number) {
    const portal = exitPortal();
    if (portal) { phase = 'portal'; travellingTo = portal.destination; return; }
    if (bossWanted()) { phase = 'boss'; travellingTo = null; return; }
    if (phase !== 'farm') { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; }
    phase = 'farm';
    travellingTo = null;
    chooseCamp(dt);
  }

  /**
   * Starts farming on the sliders (`next`: shares, or a group or list of
   * groups for an even split of them, an empty list every group here).
   * `remember` is false when autofarm restarts itself: only the player's own choice is saved.
   */
  function start(next: FarmShares | readonly string[] | string, remember = true) {
    if (options.connection && options.connection() !== 'ready') { stop('Connect to the server to farm'); return false; }
    const reason = options.unavailable();
    if (reason) { stop(reason); return false; }
    const here = groups();
    const list = typeof next === 'string' ? [next] : Array.isArray(next) ? next as readonly string[] : null;
    const listed = list ? (list.length ? list.map(normalizeKey) : here) : null;
    const picked = listed ? Object.fromEntries(listed.map(key => [key, 1])) : normalizeShares(next as FarmShares);
    // Only what was picked: a group not on this map, or every one here at 0%, is nothing to farm.
    if (!here.some(key => (picked?.[key] ?? 0) > 0)) { stop('No matching enemies in this map'); return false; }
    const chosen = sharesForGroups(picked, here);
    const nextOrder = here.filter(key => (chosen[key] ?? 0) > 0).sort((a, b) => chosen[b] - chosen[a]);
    shares = chosen;
    order = nextOrder;
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
    if (remember) writeSavedShares(shares, options.mapId(), options.priorityStorage);
    if (startedIdentity) options.resumeStore?.write({ identity: startedIdentity, map: startedMap, choice: encodeFarmPlan(shares) });
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
   * Any travel carries the farm across with the same settings: autofarm's own
   * Move On, a portal the player walks into, a teleport. It used to end on
   * any travel but its own, and a player farming by hand had to start it again.
   */
  function travelStarted() {
    if (!active && !pendingResume) return;
    if (!startedIdentity) { stop('Map changed · choose stats'); return; }
    // The player's sliders as last set, not this map's split of them: a stat this map lacks is farmed again where it is paid.
    const intent = { identity: startedIdentity, map: travellingTo ?? '', choice: encodeFarmPlan(readSavedShares(startedMap, options.priorityStorage) ?? shares) };
    const label = travellingTo ? 'Moving to the next map' : 'Changing map';
    stop(label);
    pendingResume = intent;
    options.resumeStore?.write(intent);
    status = label;
  }

  function movement(manual: Movement, dt: number): Movement {
    refresh();
    manualControl = Boolean(manual.x || manual.y);
    if (recovering) return idle();
    // Waiting to resume on another map, the player can still walk (a town has nothing to farm).
    if (pendingResume && !manual.x && !manual.y) return idle();
    if (manual.x || manual.y) {
      if (active) { status = 'Manual control'; route = []; lastGoal = null; routeClock = 0; holding = false; }
      return manual;
    }
    if (!active || options.paused()) return manual;
    choosePhase(dt);
    const boss = phase === 'boss' ? options.mapBoss?.() ?? null : null;
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
    // On the way to the boss or the next map it shoots what it passes but chases nobody. A pulled group is coming anyway.
    if (phase === 'farm' && !pullAll) for (const enemy of enemies) {
      if (!enemy.generatedBoss && isEnemyAttackingPlayer(enemy, options.localIdentity?.()) && (!threat || distance(enemy) < distance(threat))) threat = enemy;
    }
    // Everything it farms comes to it: it stands its ground.
    if (phase === 'farm' && pullCoversFarm()) {
      const reachAll = weaponAttackRange(options.equippedWeapon?.(), player.attackRange);
      const inReach = enemies.some(enemy => pulledEnemy(enemy) && distance(enemy) <= reachAll + enemy.r);
      holding = true; route = []; status = inReach ? 'Farming' : enemies.some(pulledEnemy) ? 'Pulling' : 'Waiting for respawn';
      return idle();
    }
    // With the group on its way (pulled, or already chasing), stand and let it come; walk out only if nothing has reached range for a few seconds.
    const reach = weaponAttackRange(options.equippedWeapon?.(), player.attackRange);
    if (phase === 'farm' && !threat) {
      const coming = enemies.some(enemy => validEnemy(enemy) && (enemy.engaged || pullsEnemy(enemy)));
      const inReach = enemies.some(enemy => validEnemy(enemy) && distance(enemy) <= reach + enemy.r);
      pullWait = coming && !inReach ? pullWait + dt : 0;
      if (coming && (inReach || pullWait < PULL_WAIT_SECONDS)) { holding = true; route = []; status = inReach ? 'Farming' : pullAll ? 'Pulling' : 'Holding ground'; return idle(); }
    }
    // A boss is aimed at its hitbox, not its sprite's foot.
    const bossPoint = boss ? { x: boss.x, y: boss.y + (boss.hitboxOffsetY ?? 0) } : null;
    let destination: Position | null = threat ?? target ?? portal ?? bossPoint;
    if (!destination) {
      for (const site of spawnSites) if (choiceKey(site) === selected && (!destination || distance(site) < distance(destination))) destination = site;
    }
    if (!destination) { stop('No matching enemies in this map'); return idle(); }
    const weapon = options.equippedWeapon?.();
    const enemy = threat ?? target;
    // A campaign boss is hit at the surface of its hitbox, an oval off its feet; an Endless boss is a regular enemy, hit at its centre unless melee.
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
    // Slack as wide as the waypoint drop below: a step landing 1-2px short dropped the last waypoint without arriving,
    // and it stood there for good. A squat hitbox's surface distance is stretched vertically, and the slack with it.
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
      // The nearest firing position can fall inside a portal's avoidance circle: other positions at the same range, then the target itself.
      if (!route.length) {
        const away = Math.atan2(player.y - destination.y, player.x - destination.x);
        for (const turn of [1, -1, 2, -2, 3, -3, 4]) {
          route = farmRoute(player, standAt(away + turn * Math.PI / 4), obstacles, WORLD, player.r);
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
    status = threat ? 'Moving to attacker' : portal ? 'Heading to the next map' : boss ? 'Moving to the boss' : target ? 'Moving to enemy' : 'Moving to spawn';
    const length = distance(waypoint), magnitude = Math.min(1, length / Math.max(1, options.speed() * dt));
    return { x: (waypoint.x - player.x) / length * magnitude, y: (waypoint.y - player.y) / length * magnitude, source: 'steer' };
  }

  const atPower = (power: number) => formatCompactNumber(Math.ceil(power));
  /** Move On's line: going, the power the next map asks, or the boss it waits for. */
  function moveStatus() {
    if (options.reflectOnly?.()) return 'Off In Reflect Only';
    if (phase === 'portal') return 'Moving On';
    const portal = options.nextPortal?.();
    if (portal) { const needs = mapNeeds(portal.destination); return currentPower() >= needs ? 'Moving On' : `Next Map At ${atPower(needs)}`; }
    // The way forward is shut until this map's boss is beaten.
    if (options.bossUnlocksNext?.() === true && !opensNothing.has(options.mapId())) return 'Boss Needed';
    return '';
  }
  /** Fight Bosses' line: fighting, beaten, or the power the boss asks (told quietly with the switch off). */
  function bossLine() {
    if (options.reflectOnly?.()) return 'Off In Reflect Only';
    if (phase === 'boss') return 'Fighting Boss';
    if (bossBeaten()) return 'Boss Beaten';
    const boss = options.mapBoss?.();
    if (!boss || boss.dead) return '';
    const needs = bossNeeds();
    return currentPower() >= needs ? 'Boss Next' : `Boss At ${atPower(needs)}`;
  }

  return { start, stop, defeated, refresh, choices, movement, travelStarted,
    state: () => ({ active, selected, selectedLabel, shares: { ...shares }, phase, advance, fightBosses,
      status: active && !recovering && options.paused() ? 'Paused' : status }),
    /** The camp being farmed; null at the boss or on the way out, so the boss and anything in the way are fair game. */
    targetType: () => active && !manualControl && phase === 'farm' ? selectedType : null,
    /** What combat aims at: the farmed camp, or, with every farmed group pulled, whatever is nearest. */
    attackType: () => active && !manualControl && phase === 'farm' && !pullCoversFarm() ? selectedType : null,
    targetCamp: () => null,
    advance: () => advance,
    setAdvance(next: boolean) { advance = next; writeFarmAdvance(next, options.priorityStorage); },
    fightBosses: () => fightBosses,
    setFightBosses(next: boolean) { fightBosses = next; writeFightBosses(next, options.priorityStorage); },
    /** Move On's slider, 0.1x to 10x the next map's power. */
    movePower: () => movePower,
    setMovePower(next: number) { movePower = powerStep(next); writeMovePower(movePower, options.priorityStorage); },
    /** Fight Bosses' slider, 0.1x to 10x the boss's power. */
    bossPower: () => bossPower,
    setBossPower(next: number) { bossPower = powerStep(next); writeBossPower(bossPower, options.priorityStorage); },
    moveStatus,
    /** Whether Move On is going now: the panel shows it lit. */
    moveReady: () => moveStatus() === 'Moving On',
    bossStatus: bossLine,
    bossReady: () => ['Boss Next', 'Fighting Boss'].includes(bossLine()),
    /** The sliders saved for this map, for the panel to show. */
    savedShares,
    priority: () => priority,
    /**
     * The Target rule combat aims by: while farming (a pulled crowd too) and all
     * through an Aggro run. Steering by hand otherwise aims at the nearest.
     */
    attackPriority: (): AutoFarmPriority => (active && !manualControl && phase === 'farm') || forcedGroups().size ? priority : 'closest',
    pullAll: () => pullAll,
    /** False during an Aggro run, when Pull is off. */
    pullAvailable: () => (options.pullCamps?.() ?? 1) > 0,
    setPullAll(next: boolean) { pullAll = next; writeAutoFarmPull(next, options.priorityStorage); },
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
