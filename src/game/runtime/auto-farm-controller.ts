import { WORLD } from '../constants';
import type { EnemyKind } from '../enemies';
import type { SpawnSite } from '../world';
import type { Circle, EnemyState, PlayerState, Position } from './types';
import type { Movement } from './player-input-controller';
import { isEnemyAttackingPlayer } from './enemy-threat';
import { farmRoute } from './auto-farm-navigation';

export type AutoFarmController = ReturnType<typeof createAutoFarmController>;
const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });

export function createAutoFarmController(options: {
  player: PlayerState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  mapId: () => string;
  localIdentity?: () => string | undefined;
  unavailable: () => string | null;
  paused: () => boolean;
  speed: () => number;
  obstacles: () => Circle[];
}) {
  let selected: EnemyKind | null = null;
  let active = false;
  let startedMap = '';
  let status = 'Choose an enemy to begin';
  let target: EnemyState | null = null;
  let route: Position[] = [];
  let routeClock = 0;
  let lastGoal: Position | null = null;
  const { player, enemies, spawnSites } = options;
  const distance = (point: Position) => Math.hypot(point.x - player.x, point.y - player.y);
  const validEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && enemy.type === selected && enemy.hp > 0;

  function choices() {
    const counts = new Map<EnemyKind, { type: EnemyKind; alive: number; total: number }>();
    for (const site of spawnSites) {
      const choice = counts.get(site.type) ?? { type: site.type, alive: 0, total: 0 };
      choice.total++;
      counts.set(site.type, choice);
    }
    for (const enemy of enemies) if (!enemy.dead && !enemy.remoteCombatGhost && enemy.hp > 0) {
      const choice = counts.get(enemy.type);
      if (choice) choice.alive++;
    }
    return [...counts.values()];
  }

  function stop(reason = 'Autofarm stopped') {
    active = false;
    target = null;
    route = [];
    lastGoal = null;
    status = reason;
  }

  function refresh() {
    if (!active) return;
    const reason = options.unavailable();
    if (startedMap !== options.mapId()) stop('Map changed · choose an enemy');
    else if (reason) stop(reason);
  }

  function start(type: EnemyKind) {
    const reason = options.unavailable();
    if (reason) { stop(reason); return false; }
    if (!spawnSites.some(site => site.type === type)) { stop('No matching enemies in this map'); return false; }
    selected = type;
    active = true;
    startedMap = options.mapId();
    target = null;
    route = [];
    routeClock = 0;
    lastGoal = null;
    status = 'Finding enemy';
    return true;
  }

  function movement(manual: Movement, dt: number): Movement {
    refresh();
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
      if (isEnemyAttackingPlayer(enemy, options.localIdentity?.()) && (!threat || distance(enemy) < distance(threat))) threat = enemy;
    }
    let destination: Position | null = threat ?? target;
    if (!destination) {
      for (const site of spawnSites) if (site.type === selected && (!destination || distance(site) < distance(destination))) destination = site;
    }
    if (!destination) { stop('No matching enemies in this map'); return idle(); }
    const range = Math.max(8, player.attackRange * .78);
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
    return { x: (waypoint.x - player.x) / length * magnitude, y: (waypoint.y - player.y) / length * magnitude, source: 'keyboard' };
  }

  return { start, stop, refresh, choices, movement,
    state: () => ({ active, selected, status: active && options.paused() ? 'Paused' : status }),
    targetType: () => active ? selected : null,
  };
}
