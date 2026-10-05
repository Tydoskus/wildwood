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
import { compareAutoFarmTargets, enemyRewardStat, farmGroupMatches, farmStatGroup, readAutoFarmPriority, readAutoFarmPull, writeAutoFarmPriority, writeAutoFarmPull, type AutoFarmGroup, type AutoFarmPriority } from './auto-farm-priority';
import type { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import {
  AUTO_REPLAN_SECONDS, BOSS_READY_DAMAGE_SHARE, BOSS_READY_FIGHT_SECONDS, BOSS_RETRY_MS, bossReady, pickRankedCandidate, rankFarmCandidates, decodeFarmPlan, encodeFarmPlan, nextRouteKey,
  readFarmAdvance, readFarmChoice, routeEntry, routeEntryText, writeFarmAdvance, writeFarmChoice, type FarmEvaluation, type FarmReward,
} from './auto-farm-plan';

export type AutoFarmController = ReturnType<typeof createAutoFarmController>;
const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });
export const AUTO_FARM_DEFEAT_LIMIT = 5;
export const AUTO_FARM_DEFEAT_WINDOW_MS = 180_000;
/** After walking back a map from repeated defeats, how long before it may go forward again. */
export const RETREAT_HOLD_MS = 20 * 60_000;
/** Freshly moved forward, this many defeats this soon send it straight back: the map was too much after all. */
export const ARRIVAL_DEFEAT_LIMIT = 2;
export const ARRIVAL_PROBATION_MS = 10 * 60_000;
/** How far inside its full reach autofarm stops: enough that a target at the stop point is still in range. */
export const AUTO_FARM_REACH_MARGIN = 6;
/** A waypoint this close is reached; the stop point gets the same slack. */
const WAYPOINT_REACHED = 2;
/** How long a pulled group may take to arrive before autofarm walks out to it. */
export const PULL_WAIT_SECONDS = 4;

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
  resumeStore?: ReturnType<typeof createAutoFarmResumeStore>;
  unavailable: () => string | null;
  paused: () => boolean;
  speed: () => number;
  obstacles: () => Circle[];
  priorityStorage?: () => Pick<Storage, 'getItem' | 'setItem'> | undefined;
  /** The build now, or after one more kill's reward: power, boss fight time and how hard the boss hits it. */
  evaluate?: (reward?: FarmReward) => FarmEvaluation;
  /** Damage per second against regular enemies, for how long a kill takes. */
  farmDps?: () => number;
  /** This map's boss while it stands (null once it is down or respawning). */
  mapBoss?: () => (Position & { r: number; dead?: boolean; isBoss?: boolean; ry?: number; hitboxOffsetY?: number }) | null;
  /** The next map exists and is unlocked but this build would not survive farming it. */
  nextMapTooHard?: () => boolean;
  /** Reflect Only: the bow does nothing, so enemies must be stood among to be hit and hit back. */
  reflectOnly?: () => boolean;
  /** The unlocked portal forward to the next map, at its trigger point. */
  nextPortal?: () => (Position & { destination: string }) | null;
  /** The portal back to the previous map, for a farm that keeps dying here. */
  previousPortal?: () => (Position & { destination: string }) | null;
  /** How close fighting a stat group comes to killing the player: above .75, Auto keeps away. */
  campDanger?: (group: AutoFarmGroup) => number;
  /** Whether beating this map's boss opens a locked way forward; it is not fought otherwise. */
  bossUnlocksNext?: () => boolean;
  /** How many picked camps (stat groups) Pull aggroes at once: one, one more per Aggro win, and none during a run. */
  pullCamps?: () => number;
  /** During an Aggro run: the stat groups the player picked and how many must chase them on every map, farming or not. */
  forcedGroups?: () => { groups: readonly string[]; needed: number } | null;
}) {
  let priority: AutoFarmPriority = readAutoFarmPriority(options.priorityStorage);
  // A camp is a stat group: every enemy on the map paying one stat, as the panel offers them.
  // Pull's groups: the one being farmed, then the route's next picks, one more per Aggro win.
  let pulled = new Set<string>(), pulledKey = '';
  /** Auto's camps best first, from its last look: on Auto, Pull's extra camps are the next best. */
  let autoOrder: string[] = [];
  function pulledGroups() {
    // Zero during an Aggro run: its own chasing groups are the run's pull.
    const count = Math.max(0, options.pullCamps?.() ?? 1), key = `${selected}|${count}|${plan.join()}|${autoOrder.join()}`;
    if (key === pulledKey) return pulled;
    const keys = planKeys(), at = Math.max(0, keys.indexOf(selected ?? ''));
    // A route pulls its next picks; Auto pulled only the camp it farmed, whatever the Aggro wins.
    const order = [selected, ...(plan.length ? [...keys.slice(at + 1), ...keys.slice(0, at)] : autoOrder)]
      .filter((group): group is string => Boolean(group));
    pulled = new Set([...new Set(order)].slice(0, count)); pulledKey = key;
    return pulled;
  }
  /**
   * Pull brings every group it farms (the route's groups, or every camp Auto
   * would farm): all of it comes to the player, so walking to camps or
   * cycling between them only wastes time (Ryan). It stands and fights.
   */
  function pullCoversFarm() {
    if (!pullAll || !active || manualControl || phase !== 'farm') return false;
    const groups = plan.length ? planKeys() : autoOrder;
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
    const chosen = forced.groups.filter(group => here.includes(group)).slice(0, forced.needed);
    for (const group of here) if (chosen.length < forced.needed && !chosen.includes(group)) chosen.push(group);
    if (chosen.length !== forcedSet.size || chosen.some(group => !forcedSet.has(group))) forcedSet = new Set(chosen);
    return forcedSet;
  }
  let pullAll = readAutoFarmPull(options.priorityStorage);
  let advance = readFarmAdvance(options.priorityStorage);
  /** The player's route entries in order (camp keys, with weights); empty is Auto. */
  let plan: string[] = [];
  const planKeys = () => plan.map(entry => routeEntry(entry).key);
  /** What it is doing now: a camp, the boss, or walking to another map. */
  let phase: 'farm' | 'boss' | 'portal' = 'farm';
  let travellingTo: string | null = null;
  /** Walking back a map after too many defeats, and the map it may not return to before `until`. */
  let retreating = false;
  let forwardBlocked: { mapId: string; until: number } | null = null;
  /** When autofarm last walked forward a map, for the arrival probation. */
  let advancedAt: number | null = null;
  let bossRetryAt = 0;
  let planClock = 0;
  /** Kills of the current camp since it was chosen: a route moves on after a camp's worth. */
  let groupKills = 0;
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
  const { player, enemies, spawnSites } = options;
  const distance = (point: Position) => Math.hypot(point.x - player.x, point.y - player.y);
  const validEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && selectedType !== null
    && farmGroupMatches(enemy, selectedType) && (!selectedCamp || enemy.campName === selectedCamp) && enemy.hp > 0;

  /**
   * One choice per stat (0.873): a player farming health wants health, so a
   * camp's regulars and elites, and every camp paying it, are one entry.
   */
  const choiceKey = (site: Pick<SpawnSite, 'type' | 'definition'>) => farmStatGroup(enemyRewardStat(site));
  function choices() {
    const counts = new Map<string, { key: AutoFarmGroup; type: EnemyKind; kinds: EnemyKind[]; label: string; camp: string | null;
      alive: number; total: number; reward: EnemyDefinition['reward']; maxReward: number; hp: number; nearest: number }>();
    for (const site of spawnSites) {
      const key = choiceKey(site), definition = site.definition ?? ENEMY_TYPES[site.type];
      const choice = counts.get(key) ?? { key, type: site.type, kinds: [], label: rewardStatLabel(definition.reward), camp: null,
        alive: 0, total: 0, reward: { ...definition.reward }, maxReward: definition.reward.amount, hp: 0, nearest: Infinity };
      choice.total++;
      if (!choice.kinds.includes(site.type)) choice.kinds.push(site.type);
      choice.reward.amount = Math.min(choice.reward.amount, definition.reward.amount);
      choice.maxReward = Math.max(choice.maxReward, definition.reward.amount);
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

  /** A key saved before 0.873 named an enemy kind ("Bramble") or a generated camp ("Bramble:Health Camp"): its stat now. */
  function normalizeKey(key: string) {
    if (key.startsWith('stat:')) return key;
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
    // Beaten at the boss: farm on and come back to it later, rather than walk into it again.
    if (phase === 'boss') { bossRetryAt = at + BOSS_RETRY_MS; phase = 'farm'; }
    defeats = defeats.filter(previous => at - previous < AUTO_FARM_DEFEAT_WINDOW_MS);
    defeats.push(at);
    const probation = advancedAt !== null && at - advancedAt < ARRIVAL_PROBATION_MS;
    if (defeats.length < (probation ? ARRIVAL_DEFEAT_LIMIT : AUTO_FARM_DEFEAT_LIMIT)) return;
    advancedAt = null;
    defeats = [];
    // Too strong here: farm the map before it for a while rather than stop (players woke to a dead farm).
    const back = options.previousPortal?.();
    if (!back) { stop(`Autofarm stopped after ${AUTO_FARM_DEFEAT_LIMIT} defeats in a row`); return; }
    retreating = true;
    forwardBlocked = { mapId: options.mapId(), until: at + RETREAT_HOLD_MS };
    status = 'Too strong here · moving back a map';
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
      const choice = pendingResume.choice;
      pendingResume = null;
      // Picks carried from another map keep the stats this map pays; with none
      // of them here, Auto. Either way the pick itself is remembered as it was.
      const available = new Set<string>(choices().map(entry => entry.key));
      const plan = decodeFarmPlan(choice);
      const kept = plan.filter(entry => available.has(normalizeKey(routeEntry(entry).key)));
      start(kept, false);
    }
  }

  function select(key: string) {
    const choice = choices().find(entry => entry.key === key);
    if (!choice) return false;
    if (selected !== key) { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; groupKills = 0; pullWait = 0; }
    selected = key;
    selectedType = choice.key;
    selectedCamp = choice.camp;
    selectedLabel = choice.label;
    return true;
  }

  /** The camp to farm now: the player's route if they set one, otherwise Auto's pick. */
  function chooseCamp(dt: number) {
    // Everything farmed is already coming: no camp to change to.
    if (selected && plan.length && pullCoversFarm()) return;
    const all = choices();
    if (plan.length) {
      // A camp with respawns is never empty for long, so the route moves on
      // once it has taken a camp's worth of kills here for each of its pips,
      // or found it empty.
      const current = all.find(entry => entry.key === selected);
      const weight = routeEntry(plan.find(entry => routeEntry(entry).key === selected) ?? '').weight;
      const done = current && groupKills >= current.total * weight;
      // A pipped camp waits out its respawn until it has had its share; one pip moves on when it is empty.
      const alive = (key: string) => key !== selected ? all.find(entry => entry.key === key)?.alive ?? 0
        : done ? 0 : Math.max(weight > 1 ? 1 : 0, current?.alive ?? 0);
      const key = nextRouteKey(planKeys(), alive, selected);
      if (key) select(key);
      return;
    }
    planClock -= dt;
    const current = all.find(entry => entry.key === selected);
    // Choosing again often meant walking between camps half the time.
    if (current && current.alive > 0 && planClock > 0) return;
    planClock = AUTO_REPLAN_SECONDS;
    const dps = Math.max(1e-9, options.farmDps?.() ?? player.damage);
    const speed = Math.max(1, options.speed());
    const evaluate = options.evaluate ?? (() => ({ power: 0, fightSeconds: null, hitShare: null, fightDamageShare: null }));
    const ranked = rankFarmCandidates(all.map(entry => ({
      key: entry.key, alive: entry.alive,
      reward: entry.reward ?? ENEMY_TYPES[entry.type].reward,
      // The walk is paid in full: a camp across the map has to be worth it.
      secondsPerKill: entry.hp / dps + (entry.key === selected || !Number.isFinite(entry.nearest) ? 0 : entry.nearest / speed),
      danger: options.campDanger?.(entry.key),
    })), evaluate, advance && Boolean(options.mapBoss?.()));
    autoOrder = ranked.map(entry => entry.key);
    if (selected && autoOrder.includes(selected) && pullCoversFarm()) return;
    const key = pickRankedCandidate(ranked, selected);
    if (key) select(key);
  }

  /** Boss, next map or a camp. Moving on needs the toggle; the boss also needs the build to be ready for it. */
  /** The portal it is walking to: back a map after repeated defeats, otherwise forward unless that map just beat it. */
  function exitPortal() {
    if (retreating) return options.previousPortal?.() ?? null;
    const portal = options.nextPortal?.();
    return portal && !(forwardBlocked && forwardBlocked.mapId === portal.destination && now() < forwardBlocked.until) ? portal : null;
  }
  function choosePhase(dt: number) {
    if (retreating) {
      const back = exitPortal();
      if (back) { phase = 'portal'; travellingTo = back.destination; return; }
      retreating = false;
    }
    // Reflect Only leaves the boss to the player: the fight is won by taking its hits, which readiness does not model.
    if (advance && !options.reflectOnly?.()) {
      const portal = exitPortal();
      if (portal) { phase = 'portal'; travellingTo = portal.destination; return; }
      const boss = options.mapBoss?.();
      const evaluation = options.evaluate?.();
      if (boss && !boss.dead && options.bossUnlocksNext?.() !== false && evaluation && bossReady(evaluation) && now() >= bossRetryAt) {
        phase = 'boss'; travellingTo = null; return;
      }
    }
    if (phase !== 'farm') { target = null; route = []; lastGoal = null; routeClock = 0; holding = false; }
    phase = 'farm';
    travellingTo = null;
    chooseCamp(dt);
  }

  /**
   * Starts farming: a single camp, the player's camps in order, or Auto
   * (an empty plan, or "auto"). A plain camp key is the plan it always was.
   */
  /** `remember` is false when autofarm restarts itself: only the player's own pick is saved. */
  function start(next: string | readonly string[], remember = true) {
    if (options.connection && options.connection() !== 'ready') {
      stop('Connect to the server to farm'); return false;
    }
    const reason = options.unavailable();
    if (reason) { stop(reason); return false; }
    const entries = (typeof next === 'string' ? decodeFarmPlan(next) : [...next]).map(routeEntry)
      .map(entry => ({ ...entry, key: normalizeKey(entry.key) }));
    const keys = [...new Set(entries.map(entry => entry.key))];
    const available = new Set<string>(choices().map(choice => choice.key));
    const kept = keys.filter(key => available.has(key))
      .map(key => routeEntryText(key, Math.max(...entries.filter(entry => entry.key === key).map(entry => entry.weight))));
    if (keys.length && !kept.length) { stop('No matching enemies in this map'); return false; }
    if (!available.size) { stop('No matching enemies in this map'); return false; }
    plan = kept;
    selected = null;
    planClock = 0;
    phase = 'farm';
    travellingTo = null;
    active = true;
    manualControl = false;
    startedMap = options.mapId();
    startedIdentity = options.localIdentity?.();
    pendingResume = null;
    if (remember) writeFarmChoice(plan, options.priorityStorage);
    if (startedIdentity) options.resumeStore?.write({ identity: startedIdentity, map: startedMap, choice: encodeFarmPlan(plan) });
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
   * player's last pick, the same on every map (it used to switch to whatever
   * that map was last farmed with). Any other travel ends it, as before.
   */
  function travelStarted() {
    if (!active || phase !== 'portal' || !travellingTo || !startedIdentity) { stop('Map changed · choose an enemy'); return; }
    const intent = { identity: startedIdentity, map: travellingTo, choice: encodeFarmPlan(readFarmChoice(startedMap, options.priorityStorage)) };
    const label = retreating ? 'Moving back a map' : 'Moving to the next map';
    advancedAt = retreating ? null : now();
    stop(label);
    pendingResume = intent;
    options.resumeStore?.write(intent);
    status = label;
  }

  function pullsEnemy(enemy: EnemyState) {
    return pullAll && active && phase === 'farm' && !recovering && !pendingResume && !options.paused()
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
      else if (seenAlive.delete(enemy)) { groupKills++; pullWait = 0; }
    }
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
    // On the way to the boss or the next map it shoots what it passes but
    // chases nobody: a group camp's attackers respawn faster than they die,
    // and turning to each one meant never arriving. A pulled group is coming
    // anyway, so walking out to meet each of them only zig-zags.
    if (phase === 'farm' && !pullAll) for (const enemy of enemies) {
      if (!enemy.generatedBoss && isEnemyAttackingPlayer(enemy, options.localIdentity?.()) && (!threat || distance(enemy) < distance(threat))) threat = enemy;
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
      weaponRange: weaponAttackRange(weapon, player.attackRange) + bossReach,
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
    // "Waiting for a clear route", beside a boss that never moves.
    holding = remaining <= (holding ? standoff.resume : standoff.stop) + WAYPOINT_REACHED;
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
    const length = distance(waypoint);
    const magnitude = Math.min(1, length / Math.max(1, options.speed() * dt));
    return { x: (waypoint.x - player.x) / length * magnitude, y: (waypoint.y - player.y) / length * magnitude, source: 'steer' };
  }

  return { start, stop, defeated, refresh, choices, movement, travelStarted,
    state: () => ({ active, selected, selectedLabel, plan: [...plan], phase, advance,
      status: active && !recovering && options.paused() ? 'Paused' : status }),
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
    /** Why it will or won't take on the boss, in a word or two for the panel. */
    bossStatus() {
      if (options.reflectOnly?.()) return 'Off in Reflect Only';
      if (retreating) return 'Moving back a map';
      if (exitPortal()) return 'Next map open';
      if (options.nextMapTooHard?.()) return 'Next map too hard';
      if (options.bossUnlocksNext?.() === false) return 'Boss beaten';
      const boss = options.mapBoss?.();
      const evaluation = options.evaluate?.();
      if (!boss || !evaluation || evaluation.fightSeconds === null) return '';
      if (bossReady(evaluation)) return now() < bossRetryAt ? 'Retrying soon' : 'Ready';
      // Whichever limit is further off: the fight is too long, or it hits too hard over it.
      return (evaluation.fightDamageShare ?? 0) / BOSS_READY_DAMAGE_SHARE > (evaluation.fightSeconds ?? 0) / BOSS_READY_FIGHT_SECONDS ? 'Needs defense' : 'Needs damage';
    },
    /** The route saved for this map, for the panel to show. */
    savedPlan: () => readFarmChoice(options.mapId(), options.priorityStorage),
    priority: () => priority,
    pullAll: () => pullAll,
    /** False during an Aggro run, when Pull is off. */
    pullAvailable: () => (options.pullCamps?.() ?? 1) > 0,
    setPullAll(next: boolean) {
      pullAll = next;
      writeAutoFarmPull(next, options.priorityStorage);
    },
    /**
     * With "aggro on spawn" ticked, every live enemy of the farmed stat comes
     * for the player from anywhere; each Aggro challenge win adds the route's
     * next pick to the pull.
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
