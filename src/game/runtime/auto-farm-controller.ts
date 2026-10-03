import { isMeleeWeapon, weaponAttackRange } from "../weapon-combat";
import { WORLD } from '../constants';
import { monotonicNowMs } from '../../app/trusted-clock';
import { ENEMY_TYPES, rewardStatLabel, type EnemyDefinition, type EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';
import type { Circle, EnemyState, PlayerState, Position } from './types';
import type { Movement } from './player-input-controller';
import { isEnemyAttackingPlayer } from './enemy-threat';
import { farmRoute } from './auto-farm-navigation';
import { rangedEnemyHoldBand } from './ranged-enemy-range';
import { compareAutoFarmTargets, enemyRewardStat, farmGroupMatches, farmStatGroup, readAutoFarmPriority, readAutoFarmPull, writeAutoFarmPriority, writeAutoFarmPull, type AutoFarmGroup, type AutoFarmPriority } from './auto-farm-priority';
import type { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import {
  AUTO_REPLAN_SECONDS, BOSS_READY_HIT_SHARE, BOSS_RETRY_MS, bestFarmCandidate, bossReady, decodeFarmPlan, encodeFarmPlan, nextRouteKey, readFarmAdvance, readFarmRoute,
  writeFarmAdvance, writeFarmRoute, type FarmEvaluation, type FarmReward,
} from './auto-farm-plan';

export type AutoFarmController = ReturnType<typeof createAutoFarmController>;
const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });
export const AUTO_FARM_DEFEAT_LIMIT = 5;
export const AUTO_FARM_DEFEAT_WINDOW_MS = 180_000;
/** Clearance kept outside a ranged enemy's back-away distance when standing to shoot it. */
export const AUTO_FARM_RANGED_STANDOFF_MARGIN = 10;
/** How far inside its full reach autofarm stops: enough that a target at the stop point is still in range. */
export const AUTO_FARM_REACH_MARGIN = 6;
/** How long a pulled group may take to arrive before autofarm walks out to it. */
export const PULL_WAIT_SECONDS = 4;

/**
 * Where autofarm stops walking (`stop`) and how far the destination may then
 * drift before it walks again (`resume`). Both sit inside the weapon's reach.
 *
 * A ranged enemy backs away from a player closer than its hold band, and the
 * band scales with the player's attack range while the plain 78% stop does
 * not keep pace: past the base range the stop point lands inside the band, so
 * the enemy retreats one step, the player follows one step, and the walk
 * flickers on and off every few frames. Standing just outside the band, and
 * not walking again until the destination is well past the stop point, keeps
 * both sides still.
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
  // (0.867): walk only until the target is in range, never closer. The old
  // stop sat 22% of the base reach inside it.
  let stop = Math.max(8, reach - AUTO_FARM_REACH_MARGIN);
  const kind = options.enemy ? options.destination.type : undefined;
  const ranged = kind !== undefined && (options.destination.definition ?? ENEMY_TYPES[kind])?.ranged;
  if (ranged && !options.melee) {
    const band = rangedEnemyHoldBand(options.playerAttackRange, options.playerRadius + (options.destination.r ?? 0) + 4);
    stop = Math.min(reach, Math.max(stop, band.retreatBelow + AUTO_FARM_RANGED_STANDOFF_MARGIN));
  }
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
}) {
  let priority: AutoFarmPriority = readAutoFarmPriority(options.priorityStorage);
  let pullAll = readAutoFarmPull(options.priorityStorage);
  let advance = readFarmAdvance(options.priorityStorage);
  /** The player's camps in order; empty is Auto. */
  let plan: string[] = [];
  /** What it is doing now: a camp, the boss, or walking to the next map. */
  let phase: 'farm' | 'boss' | 'portal' = 'farm';
  let travellingTo: string | null = null;
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
    if (defeats.length >= AUTO_FARM_DEFEAT_LIMIT) { defeats = []; stop(`Autofarm stopped after ${AUTO_FARM_DEFEAT_LIMIT} defeats in a row`); }
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
      start(decodeFarmPlan(choice));
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
    const all = choices();
    if (plan.length) {
      // A camp with respawns is never empty for long, so the route moves on
      // once it has taken a camp's worth of kills here, or found it empty.
      const current = all.find(entry => entry.key === selected);
      const done = current && groupKills >= current.total;
      const alive = (key: string) => key === selected && done ? 0 : all.find(entry => entry.key === key)?.alive ?? 0;
      const key = nextRouteKey(plan, alive, selected);
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
    const evaluate = options.evaluate ?? (() => ({ power: 0, fightSeconds: null, hitShare: null }));
    const key = bestFarmCandidate(all.map(entry => ({
      key: entry.key, alive: entry.alive,
      reward: entry.reward ?? ENEMY_TYPES[entry.type].reward,
      // The walk is paid in full: a camp across the map has to be worth it.
      secondsPerKill: entry.hp / dps + (entry.key === selected || !Number.isFinite(entry.nearest) ? 0 : entry.nearest / speed),
    })), evaluate, advance && Boolean(options.mapBoss?.()), selected);
    if (key) select(key);
  }

  /** Boss, next map or a camp. Moving on needs the toggle; the boss also needs the build to be ready for it. */
  function choosePhase(dt: number) {
    // Reflect Only leaves the boss to the player: the fight is won by taking its hits, which readiness does not model.
    if (advance && !options.reflectOnly?.()) {
      const portal = options.nextPortal?.();
      if (portal) { phase = 'portal'; travellingTo = portal.destination; return; }
      const boss = options.mapBoss?.();
      const evaluation = options.evaluate?.();
      if (boss && !boss.dead && evaluation && bossReady(evaluation) && now() >= bossRetryAt) { phase = 'boss'; travellingTo = null; return; }
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
  function start(next: string | readonly string[]) {
    if (options.connection && options.connection() !== 'ready') {
      stop('Connect to the server to farm'); return false;
    }
    const reason = options.unavailable();
    if (reason) { stop(reason); return false; }
    const keys = [...new Set((typeof next === 'string' ? decodeFarmPlan(next) : [...next]).map(normalizeKey))];
    const available = new Set<string>(choices().map(choice => choice.key));
    const kept = keys.filter(key => available.has(key));
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
    writeFarmRoute(startedMap, plan, options.priorityStorage);
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
   * A portal autofarm walked into on purpose carries the farm across: it picks
   * up on the new map with the route saved for it, or Auto. Any other travel
   * ends it, as before.
   */
  function travelStarted() {
    if (!active || phase !== 'portal' || !travellingTo || !startedIdentity) { stop('Map changed · choose an enemy'); return; }
    const intent = { identity: startedIdentity, map: travellingTo, choice: encodeFarmPlan(readFarmRoute(travellingTo, options.priorityStorage)) };
    stop('Moving to the next map');
    pendingResume = intent;
    options.resumeStore?.write(intent);
    status = 'Moving to the next map';
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
    const portal = phase === 'portal' ? options.nextPortal?.() ?? null : null;
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
    // With the group pulled and on its way, stand and let it come; walk out
    // only if nothing has reached range for a few seconds (stuck, or ranged).
    const reach = weaponAttackRange(options.equippedWeapon?.(), player.attackRange);
    if (phase === 'farm' && pullAll && !threat) {
      const coming = enemies.some(enemy => validEnemy(enemy) && enemy.engaged);
      const inReach = enemies.some(enemy => validEnemy(enemy) && distance(enemy) <= reach + enemy.r);
      pullWait = coming && !inReach ? pullWait + dt : 0;
      if (coming && (inReach || pullWait < PULL_WAIT_SECONDS)) { holding = true; route = []; status = inReach ? 'Farming' : 'Pulling'; return idle(); }
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
    // A campaign boss is hit at its surface (its narrower radius, to be safe);
    // an Endless boss is a regular enemy, hit at its centre unless melee.
    const bossReach = !enemy && boss ? (boss.isBoss ? Math.min(boss.r, boss.ry ?? boss.r) : isMeleeWeapon(weapon) ? boss.r : 0) : 0;
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
    const remaining = distance(destination);
    // A pixel of slack: arriving at the stop point by floating-point steps can land a hair outside it.
    holding = remaining <= (holding ? standoff.resume : standoff.stop) + 1;
    if (holding && !portal) {
      status = threat ? 'Defending' : boss ? 'Fighting the boss' : target ? 'Farming' : 'Waiting for respawn';
      route = [];
      routeClock = 0;
      return idle();
    }
    const goal = remaining > 0 ? {
      x: destination.x + (player.x - destination.x) / remaining * range,
      y: destination.y + (player.y - destination.y) / remaining * range,
    } : { x: destination.x, y: destination.y };
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
          route = farmRoute(player, { x: destination.x + Math.cos(angle) * range, y: destination.y + Math.sin(angle) * range }, obstacles, WORLD, player.r);
          if (route.length) break;
        }
      }
      if (!route.length) route = farmRoute(player, destination, obstacles, WORLD, player.r);
      lastGoal = goal;
      routeClock = .5;
    }
    while (route.length && distance(route[0]) < 2) route.shift();
    const waypoint = route[0];
    if (!waypoint) { status = 'Waiting for a clear route'; return idle(); }
    status = threat ? 'Moving to attacker' : portal ? 'Heading to the next map' : boss ? 'Moving to the boss' : target ? 'Moving to enemy' : 'Moving to spawn';
    const length = distance(waypoint);
    const magnitude = Math.min(1, length / Math.max(1, options.speed() * dt));
    return { x: (waypoint.x - player.x) / length * magnitude, y: (waypoint.y - player.y) / length * magnitude, source: 'steer' };
  }

  return { start, stop, defeated, refresh, choices, movement, travelStarted,
    state: () => ({ active, selected, selectedLabel, plan: [...plan], phase, advance,
      status: active && !recovering && options.paused() ? 'Paused' : status }),
    /** The camp being farmed; null at the boss or on the way out, so the boss and anything in the way are fair game. */
    targetType: () => active && !manualControl && phase === 'farm' ? selectedType : null,
    targetCamp: () => active && !manualControl && phase === 'farm' ? selectedCamp : null,
    advance: () => advance,
    setAdvance(next: boolean) {
      advance = next;
      writeFarmAdvance(next, options.priorityStorage);
    },
    /** Why it will or won't take on the boss, in a word or two for the panel. */
    bossStatus() {
      if (options.reflectOnly?.()) return 'Off in Reflect Only';
      if (options.nextPortal?.()) return 'Next map open';
      if (options.nextMapTooHard?.()) return 'Next map too hard';
      const boss = options.mapBoss?.();
      const evaluation = options.evaluate?.();
      if (!boss || !evaluation || evaluation.fightSeconds === null) return '';
      if (bossReady(evaluation)) return now() < bossRetryAt ? 'Retrying soon' : 'Ready';
      return (evaluation.hitShare ?? 0) > BOSS_READY_HIT_SHARE ? 'Needs defense' : 'Needs damage';
    },
    /** The route saved for this map, for the panel to show. */
    savedPlan: () => readFarmRoute(options.mapId(), options.priorityStorage),
    priority: () => priority,
    pullAll: () => pullAll,
    setPullAll(next: boolean) {
      pullAll = next;
      writeAutoFarmPull(next, options.priorityStorage);
    },
    /** With "aggro on spawn" ticked, every live enemy of the farmed group comes for the player, from anywhere. */
    // Steering by hand keeps the pull: the group follows the player while they move.
    pulls: (enemy: EnemyState) => pullAll && active && phase === 'farm' && !recovering && !pendingResume && !options.paused() && validEnemy(enemy),
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
