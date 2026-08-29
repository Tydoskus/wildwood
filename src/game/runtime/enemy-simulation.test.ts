import { describe, expect, it } from "vitest";
import type { RemotePlayer } from "../../wildwood-coop";
import { remoteBossAttackStartedAtMs } from "../../coop/services/remote-boss-attack";
import { ENEMY_CROWD_SPACING_RATIO, separateEnemyCrowd } from "./enemy-crowd-separation";
import { createEnemySimulation } from "./enemy-simulation";
import type { EnemyState, PlayerState } from "./types";

function playerAt(x: number, y: number): PlayerState {
  return {
    x, y, r: 18, speed: 0, hp: 100, baseMaxHp: 100, maxHp: 100, damage: 1, attackRate: 1,
    projectileSpeed: 1, projectileCount: 1, attackRange: 155, knockback: 0,
    armor: 0, regen: 0, attackClock: 0, throwClock: 0, hurtClock: 0, facing: 0, combatFacing: null, moving: false,
  };
}

function idleEnemyAt(x: number, y: number): EnemyState {
  return {
    type: "Bramble", siteId: 1, campName: "TEST", x, y, homeX: x, homeY: y,
    vx: 0, vy: 0, r: 14, hp: 42, maxHp: 42, speed: 210, damage: 14,
    reward: { type: "health", amount: 28 }, aggroRadius: 0, leashRange: 420,
    engaged: false, leashing: false, facingX: 1, wandering: false,
    wanderTargetX: x, wanderTargetY: y, wanderWait: 99, attackClock: 0,
    moveSpeedRecovery: 3, hurt: 0, dead: false, phase: 0, idleUpdateElapsed: 0,
  };
}

function remotePlayerAt(x: number, y: number): RemotePlayer {
  return {
    id: "remote-player",
    name: "REMOTE",
    power: 500,
    x,
    y,
    simulationX: x,
    simulationY: y,
    speed: 180,
    facing: 0,
    moving: false,
    feetItem: "",
    headItem: "",
    chestItem: "",
    rightHandItem: "starter_bow",
    leftHandItem: "",
  };
}

const remoteCombatStats = {
  damage: 24,
  maxHp: 220,
  armor: 0,
  regen: 0,
  attackInterval: .5,
  projectileSpeed: 780,
  projectileCount: 1,
  attackRange: 280,
  criticalChance: 0,
  criticalDamageMultiplier: 1.05,
};

function engage(enemy: EnemyState, targetId: string | null = null, startedAtTick = 0) {
  enemy.engaged = true;
  enemy.leashing = false;
  enemy.aggroTargetId = targetId;
  enemy.aggroStartedAtTick = startedAtTick;
}

describe("deterministic enemy simulation", () => {
  it("only lets ranged enemies fire from inside the player's attack edge", () => {
    const shotsAtDistance = (distance: number) => {
      const local = playerAt(100, 100);
      local.attackRange = 200;
      const enemy = idleEnemyAt(local.x + distance, local.y);
      enemy.type = "Dune Archer";
      enemy.r = 17;
      enemy.speed = 0;
      engage(enemy, "local-player");
      const shots: unknown[] = [];
      const simulation = createEnemySimulation(
        [enemy],
        (...shot) => { shots.push(shot); },
        local,
        () => ({ width: 800, height: 800, zoom: 1 }),
        engage,
        () => false,
        { localIdentity: () => "local-player", localAggroPosition: () => local },
      );

      simulation.update(.001);
      return shots.length;
    };

    expect(shotsAtDistance(186)).toBe(0);
    expect(shotsAtDistance(185)).toBe(1);
  });

  it("deterministically separates enemies that reach the exact same position", () => {
    const first = idleEnemyAt(300, 300);
    const second = idleEnemyAt(300, 300);
    second.siteId = 2;
    const repeatFirst = { ...first };
    const repeatSecond = { ...second };

    separateEnemyCrowd([first, second]);
    separateEnemyCrowd([repeatFirst, repeatSecond]);

    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeCloseTo(
      (first.r + second.r) * ENEMY_CROWD_SPACING_RATIO,
      8,
    );
    expect([repeatFirst.x, repeatFirst.y, repeatSecond.x, repeatSecond.y]).toEqual([
      first.x,
      first.y,
      second.x,
      second.y,
    ]);
  });

  it("breaks from the shared consensus pose and follows the actual local player after aggro", () => {
    const enemy = idleEnemyAt(300, 300);
    engage(enemy, "local-player");
    const local = playerAt(100, 300);
    const simulation = createEnemySimulation(
      [enemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        localIdentity: () => "local-player",
        localAggroPosition: () => ({ x: 500, y: 300 }),
      },
    );

    simulation.update(1 / 60);

    expect(enemy.x).toBeLessThan(300);
    expect(enemy.combatTargetX).toBe(local.x);
    expect(enemy.combatTargetY).toBe(local.y);
  });

  it("keeps locally engaged enemies visibly separated around the player", () => {
    const first = idleEnemyAt(132, 100);
    const second = idleEnemyAt(132, 100);
    second.siteId = 2;
    engage(first, "local-player");
    engage(second, "local-player");
    const local = playerAt(100, 100);
    const simulation = createEnemySimulation(
      [first, second],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      { localIdentity: () => "local-player", localAggroPosition: () => local },
    );

    simulation.update(1 / 60);

    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeCloseTo(
      (first.r + second.r) * ENEMY_CROWD_SPACING_RATIO,
      8,
    );
    expect(Math.hypot(first.x - local.x, first.y - local.y)).toBeGreaterThanOrEqual(first.r + local.r);
    expect(Math.hypot(second.x - local.x, second.y - local.y)).toBeGreaterThanOrEqual(second.r + local.r);
  });

  it("does not flicker an engaged ranged enemy when acquisition exceeds its authored leash", () => {
    const enemy = idleEnemyAt(100, 100);
    enemy.type = "Moonblade Reaper";
    enemy.aggroRadius = 460;
    enemy.leashRange = 420;
    engage(enemy, "local-player");
    const local = playerAt(550, 100);
    const simulation = createEnemySimulation(
      [enemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      { localIdentity: () => "local-player", localAggroPosition: () => local },
    );

    simulation.update(1 / 60);

    expect(enemy.engaged).toBe(true);
    expect(enemy.leashing).toBe(false);
    expect(enemy.aggroTargetId).toBe("local-player");
  });

  it("evaluates the same ambient pose regardless of client update count", () => {
    const first = idleEnemyAt(1_000, 1_000);
    const second = idleEnemyAt(1_000, 1_000);
    const now = 1_800_000_000_000;
    const create = (enemy: EnemyState) => createEnemySimulation(
      [enemy],
      () => {},
      playerAt(3_000, 3_000),
      () => ({ width: 320, height: 600, zoom: 1 }),
      engage,
      () => false,
      { currentMapId: () => "tutorial_forest", serverNowMs: () => now },
    );
    const oneStep = create(first);
    const manySteps = create(second);

    oneStep.update(1 / 60);
    for (let index = 0; index < 20; index += 1) manySteps.update(1 / 60);

    expect(second.x).toBeCloseTo(first.x, 8);
    expect(second.y).toBeCloseTo(first.y, 8);
    expect(second.phase).toBeCloseTo(first.phase, 8);
    expect(second.facingX).toBe(first.facingX);
  });

  it("reconstructs nearby remote boss attacks without a server attack event", () => {
    const local = playerAt(1_000, 1_000);
    const remote = remotePlayerAt(300, 500);
    const sharedBoss = {
      kind: "dragon" as const,
      encounter: 8n,
      alive: true,
      x: 500,
      y: 500,
      radius: 100,
    };
    let now = 20_000;
    now = remoteBossAttackStartedAtMs({
      boss: sharedBoss,
      playerId: remote.id,
      attackInterval: remoteCombatStats.attackInterval,
      serverNowMs: now,
    }) + 50;
    const simulation = createEnemySimulation(
      [],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => now,
        remotePlayers: () => [remote],
        remoteCombatStats: () => remoteCombatStats,
        remoteBoss: () => sharedBoss,
      },
    );

    simulation.update(1 / 60);

    expect(simulation.renderRemotePlayers([remote])[0]).toMatchObject({
      facing: 0,
      bossAttack: {
        targetX: sharedBoss.x,
        targetY: sharedBoss.y,
        targetRadius: sharedBoss.radius,
        hits: remoteCombatStats.projectileCount,
      },
    });
  });

  it("creates an independent remote ghost without taking over the local enemy", () => {
    const enemy = idleEnemyAt(100, 100);
    const local = playerAt(500, 500);
    const remote = remotePlayerAt(900, 900);
    let now = 1_800_000_000_000;
    const simulation = createEnemySimulation(
      [enemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => now,
        localIdentity: () => "local-player",
        localAggroPosition: () => local,
        remotePlayers: () => [remote],
        remoteCombatStats: () => remoteCombatStats,
      },
    );

    simulation.update(1 / 60);
    expect(enemy.engaged).toBe(false);
    expect(simulation.renderRemotePlayers([remote])[0].regularEnemyCombat).toBeUndefined();

    remote.x = enemy.x + 30;
    remote.y = enemy.y;
    remote.simulationX = remote.x;
    remote.simulationY = remote.y;
    simulation.update(1 / 60);

    expect(enemy).toMatchObject({ engaged: false });
    expect(simulation.renderRemotePlayers([remote])[0].regularEnemyCombat).toMatchObject({
      enemySiteId: enemy.siteId,
      targetRadius: enemy.r,
    });
    expect(simulation.remoteCombatGhosts()[0]).toMatchObject({
      siteId: enemy.siteId,
      remoteCombatGhost: true,
      engaged: true,
      aggroTargetId: remote.id,
    });

    now += 2_000;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()[0].remoteCombatHp).toBeLessThan(enemy.maxHp);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(enemy.engaged).toBe(false);
  });

  it("creates a ghost when the remote player's real attack range reaches the enemy", () => {
    const enemy = idleEnemyAt(100, 100);
    const local = playerAt(500, 500);
    const remote = remotePlayerAt(900, 900);
    const simulation = createEnemySimulation(
      [enemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => 1_800_000_000_000,
        localIdentity: () => "local-player",
        localAggroPosition: () => local,
        remotePlayers: () => [remote],
        remoteCombatStats: () => remoteCombatStats,
      },
    );

    simulation.update(1 / 60);
    remote.x = enemy.x + remoteCombatStats.attackRange - 1;
    remote.y = enemy.y;
    remote.simulationX = remote.x;
    remote.simulationY = remote.y;
    simulation.update(1 / 60);

    expect(simulation.remoteCombatGhosts()).toHaveLength(1);
    expect(simulation.remoteCombatGhosts()[0].aggroTargetId).toBe(remote.id);
    expect(enemy.engaged).toBe(false);
  });

  it("keeps a remote ghost past an authored leash when the player's attack edge acquired it", () => {
    const enemy = idleEnemyAt(100, 100);
    const local = playerAt(500, 500);
    const remote = remotePlayerAt(1_800, 1_800);
    const stats = { ...remoteCombatStats, attackRange: 500 };
    const simulation = createEnemySimulation(
      [enemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => 1_800_000_000_000,
        localIdentity: () => "local-player",
        localAggroPosition: () => local,
        remotePlayers: () => [remote],
        remoteCombatStats: () => stats,
      },
    );

    simulation.update(1 / 60);
    remote.x = enemy.x + 475;
    remote.y = enemy.y;
    remote.simulationX = remote.x;
    remote.simulationY = remote.y;
    simulation.update(1 / 60);

    expect(simulation.remoteCombatGhosts()).toHaveLength(1);
    expect(simulation.remoteCombatGhosts()[0].aggroTargetId).toBe(remote.id);
  });

  it("starts a later independent ghost engagement at full displayed player health", () => {
    const firstEnemy = idleEnemyAt(100, 100);
    firstEnemy.damage = 1_000;
    const secondEnemy = idleEnemyAt(900, 100);
    secondEnemy.siteId = 2;
    const local = playerAt(500, 500);
    const remote = remotePlayerAt(1_800, 1_800);
    let now = 1_800_000_000_000;
    const stats = { ...remoteCombatStats, maxHp: 100, damage: 1, attackInterval: 10 };
    const simulation = createEnemySimulation(
      [firstEnemy, secondEnemy],
      () => {},
      local,
      () => ({ width: 1_200, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => now,
        localIdentity: () => "local-player",
        localAggroPosition: () => local,
        remotePlayers: () => [remote],
        remoteCombatStats: () => stats,
      },
    );

    simulation.update(1 / 60);
    remote.x = firstEnemy.x;
    remote.y = firstEnemy.y;
    remote.simulationX = remote.x;
    remote.simulationY = remote.y;
    simulation.update(1 / 60);

    now += 1_100;
    simulation.update(1 / 60);
    expect(simulation.renderRemotePlayers([remote])[0].regularEnemyCombat?.hp).toBe(0);

    now += 900;
    simulation.update(1 / 60);
    remote.x = secondEnemy.x;
    remote.y = secondEnemy.y;
    remote.simulationX = remote.x;
    remote.simulationY = remote.y;
    simulation.update(1 / 60);

    expect(simulation.renderRemotePlayers([remote])[0].regularEnemyCombat).toMatchObject({
      hp: 100,
      maxHp: 100,
    });
  });

  it("lets a ghost reach zero, animate, and disappear without rewarding the observer", () => {
    const enemy = idleEnemyAt(100, 100);
    const local = playerAt(500, 500);
    const remote = remotePlayerAt(100, 100);
    let now = 1_800_000_000_000;
    const simulation = createEnemySimulation(
      [enemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => now,
        localIdentity: () => "local-player",
        localAggroPosition: () => local,
        remotePlayers: () => [remote],
        remoteCombatStats: () => ({ ...remoteCombatStats, damage: 1_000, attackInterval: .5 }),
      },
    );

    simulation.update(1 / 60);
    now += 1_000;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()[0]).toMatchObject({
      remoteCombatHp: 0,
      remoteCombatDeathProgress: 0,
    });
    expect(enemy).toMatchObject({ hp: enemy.maxHp, dead: false, engaged: false });

    now += 700;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()).toHaveLength(0);
    expect(enemy).toMatchObject({ hp: enemy.maxHp, dead: false });
  });

  it("keeps living sibling ghosts through one death and a brief missing remote-player sample", () => {
    const firstEnemy = idleEnemyAt(100, 100);
    firstEnemy.maxHp = 10;
    firstEnemy.hp = 10;
    const secondEnemy = idleEnemyAt(200, 100);
    secondEnemy.siteId = 2;
    secondEnemy.maxHp = 10;
    secondEnemy.hp = 10;
    const local = playerAt(500, 500);
    const remote = remotePlayerAt(100, 100);
    let now = 1_800_000_000_000;
    let remoteVisible = true;
    const simulation = createEnemySimulation(
      [firstEnemy, secondEnemy],
      () => {},
      local,
      () => ({ width: 800, height: 800, zoom: 1 }),
      engage,
      () => false,
      {
        currentMapId: () => "tutorial_forest",
        serverNowMs: () => now,
        localIdentity: () => "local-player",
        localAggroPosition: () => local,
        remotePlayers: () => remoteVisible ? [remote] : [],
        remoteCombatStats: () => ({ ...remoteCombatStats, damage: 100, attackInterval: .5 }),
      },
    );

    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()).toHaveLength(2);

    now += 1_000;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()).toHaveLength(2);
    const defeatedGhost = simulation.remoteCombatGhosts().find((ghost) => ghost.remoteCombatHp === 0);
    const survivingGhost = simulation.remoteCombatGhosts().find((ghost) => ghost.remoteCombatHp === 10);
    expect(defeatedGhost).toMatchObject({
      remoteCombatHp: 0,
      remoteCombatDeathProgress: 0,
    });
    expect(survivingGhost).toBeDefined();

    remoteVisible = false;
    now += 100;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()).toHaveLength(2);

    now += 600;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts().map((ghost) => ghost.siteId)).toEqual([survivingGhost?.siteId]);

    remoteVisible = true;
    now += 100;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts().map((ghost) => ghost.siteId)).toEqual([survivingGhost?.siteId]);

    remoteVisible = false;
    now += 100;
    simulation.update(1 / 60);
    now += 2_000;
    simulation.update(1 / 60);
    expect(simulation.remoteCombatGhosts()).toHaveLength(0);
  });
});
