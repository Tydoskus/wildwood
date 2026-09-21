import { isMeleeWeapon, weaponAttackRange } from "../weapon-combat";
import { isProceduralMap } from '../../../shared/procedural-maps';
import { WORLD } from '../constants';
import type { EnemyDefinition, EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';
import type { Circle, EnemyState, PlayerState, Position } from './types';
import type { Movement } from './player-input-controller';
import { isEnemyAttackingPlayer } from './enemy-threat';
import { farmRoute } from './auto-farm-navigation';
import type { createAutoFarmResumeStore } from '../../app/auto-farm-resume';

export type AutoFarmController = ReturnType<typeof createAutoFarmController>;
const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });
export const AUTO_FARM_DEFEAT_LIMIT = 5;
export const AUTO_FARM_DEFEAT_WINDOW_MS = 180_000;

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
}) {
  let selected: string | null = null;
  let selectedType: EnemyKind | null = null;
  let selectedCamp: string | null = null;
  let selectedLabel = "";
  let active = false;
  let manualControl = false;
  let pendingResume = options.resumeStore?.read() ?? null;
  let startedMap = '';
  let startedIdentity: string | undefined;
  let recovering = false;
  let readySince: number | null = null;
  const now = options.now ?? (() => performance.now());
  let status = 'Choose an enemy to begin';
  let target: EnemyState | null = null;
  let route: Position[] = [];
  let routeClock = 0;
  let lastGoal: Position | null = null;
  const { player, enemies, spawnSites } = options;
  const distance = (point: Position) => Math.hypot(point.x - player.x, point.y - player.y);
  const validEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.type === selectedType && (!selectedCamp || enemy.campName === selectedCamp) && enemy.hp > 0;

  const choiceKey = (site: Pick<SpawnSite, 'type' | 'campName'>) =>
    isProceduralMap(options.mapId()) ? `${site.type}:${site.campName}` : site.type;
  function choices() {
    const counts = new Map<string, { key: string; type: EnemyKind; label: string; camp: string | null;
      alive: number; total: number; reward?: EnemyDefinition['reward']; maxReward?: number }>();
    for (const site of spawnSites) {
      const key = choiceKey(site), camp = isProceduralMap(options.mapId()) ? site.campName : null;
      const choice = counts.get(key) ?? { key, type: site.type, label: camp ?? site.type, camp,
        alive: 0, total: 0, ...(site.definition ? { reward: { ...site.definition.reward }, maxReward: site.definition.reward.amount } : {}) };
      choice.total++;
      if (choice.reward && site.definition) {
        choice.reward.amount = Math.min(choice.reward.amount, site.definition.reward.amount);
        choice.maxReward = Math.max(choice.maxReward ?? 0, site.definition.reward.amount);
      }
      counts.set(key, choice);
    }
    for (const enemy of enemies) if (!enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0) {
      const choice = counts.get(choiceKey(enemy));
      if (choice) choice.alive++;
    }
    return [...counts.values()];
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
    defeats = defeats.filter(previous => at - previous < AUTO_FARM_DEFEAT_WINDOW_MS);
    defeats.push(at);
    if (defeats.length >= AUTO_FARM_DEFEAT_LIMIT) { defeats = []; stop(`Autofarm stopped after ${AUTO_FARM_DEFEAT_LIMIT} defeats in a row`); }
  }

  function stop(reason = 'Autofarm stopped') {
    pendingResume = null;
    options.resumeStore?.clear();
    active = false;
    manualControl = false;
    recovering = false;
    readySince = null;
    target = null;
    route = [];
    lastGoal = null;
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
      if (!recovering) { target = null; route = []; lastGoal = null; routeClock = 0; }
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
      const key = pendingResume.choice;
      pendingResume = null;
      start(key);
    }
  }

  function start(key: string) {
    if (options.connection && options.connection() !== 'ready') {
      stop('Connect to the server to farm'); return false;
    }
    const reason = options.unavailable();
    if (reason) { stop(reason); return false; }
    const choice = choices().find(choice => choice.key === key);
    if (!choice) { stop('No matching enemies in this map'); return false; }
    selected = key;
    selectedType = choice.type;
    selectedCamp = choice.camp;
    selectedLabel = choice.label;
    active = true;
    manualControl = false;
    startedMap = options.mapId();
    startedIdentity = options.localIdentity?.();
    pendingResume = null;
    if (startedIdentity) options.resumeStore?.write({ identity: startedIdentity, map: startedMap, choice: key });
    recovering = false;
    readySince = null;
    target = null;
    route = [];
    routeClock = 0;
    lastGoal = null;
    status = 'Finding enemy';
    return true;
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
      }
      return manual;
    }
    if (!active || options.paused()) return manual;
    if (!target || !validEnemy(target) || !enemies.includes(target)) {
      target = null;
      for (const enemy of enemies) if (validEnemy(enemy) && (!target || distance(enemy) < distance(target))) target = enemy;
      routeClock = 0;
    }
    let threat: EnemyState | null = null;
    for (const enemy of enemies) {
      if (!enemy.generatedBoss && isEnemyAttackingPlayer(enemy, options.localIdentity?.()) && (!threat || distance(enemy) < distance(threat))) threat = enemy;
    }
    let destination: Position | null = threat ?? target;
    if (!destination) {
      for (const site of spawnSites) if (choiceKey(site) === selected && (!destination || distance(site) < distance(destination))) destination = site;
    }
    if (!destination) { stop('No matching enemies in this map'); return idle(); }
    const weapon = options.equippedWeapon?.();
    const range = Math.max(8, weaponAttackRange(weapon, player.attackRange) * .78) +
      (isMeleeWeapon(weapon) ? (threat ?? target)?.r ?? 0 : 0);
    const remaining = distance(destination);
    if (remaining <= range) {
      status = threat ? 'Defending' : target ? 'Farming' : 'Waiting for respawn';
      route = [];
      routeClock = 0;
      return idle();
    }
    const goal = {
      x: destination.x + (player.x - destination.x) / remaining * range,
      y: destination.y + (player.y - destination.y) / remaining * range,
    };
    routeClock -= dt;
    if (routeClock <= 0 || !lastGoal || Math.hypot(goal.x - lastGoal.x, goal.y - lastGoal.y) > 60) {
      const obstacles = options.obstacles();
      route = farmRoute(player, goal, obstacles, WORLD, player.r);
      // The nearest firing position can fall inside a portal avoidance circle.
      // Approach the enemy along a full route instead; range checks still stop us early.
      if (!route.length) route = farmRoute(player, destination, obstacles, WORLD, player.r);
      lastGoal = goal;
      routeClock = .5;
    }
    while (route.length && distance(route[0]) < 2) route.shift();
    const waypoint = route[0];
    if (!waypoint) { status = 'Waiting for a clear route'; return idle(); }
    status = threat ? 'Moving to attacker' : target ? 'Moving to enemy' : 'Moving to spawn';
    const length = distance(waypoint);
    const magnitude = Math.min(1, length / Math.max(1, options.speed() * dt));
    return { x: (waypoint.x - player.x) / length * magnitude, y: (waypoint.y - player.y) / length * magnitude, source: 'steer' };
  }

  return { start, stop, defeated, refresh, choices, movement,
    state: () => ({ active, selected, selectedLabel, status: active && !recovering && options.paused() ? 'Paused' : status }),
    targetType: () => active && !manualControl ? selectedType : null,
    targetCamp: () => active && !manualControl ? selectedCamp : null,
  };
}
