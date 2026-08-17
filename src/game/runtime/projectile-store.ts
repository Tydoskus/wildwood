import type { EnemyShot, Projectile } from "./types";

export const MAX_PLAYER_PROJECTILES = 256;
export const MAX_ENEMY_SHOTS = 192;

function blankProjectile(): Projectile {
  return { x: 0, y: 0, vx: 0, vy: 0, r: 0, damage: 0, critical: false, hitLife: 0, life: 0, trail: 0 };
}

function blankEnemyShot(): EnemyShot {
  return { x: 0, y: 0, vx: 0, vy: 0, r: 0, damage: 0, life: 0 };
}

/** Reuses short-lived projectile objects and enforces visual/combat budgets. */
export function createProjectileStore() {
  const projectiles: Projectile[] = [];
  const enemyShots: EnemyShot[] = [];
  const projectilePool: Projectile[] = [];
  const enemyShotPool: EnemyShot[] = [];
  let projectileReplacement = 0;
  let enemyShotReplacement = 0;

  function acquirePlayerProjectile() {
    if (projectiles.length < MAX_PLAYER_PROJECTILES) {
      const projectile = projectilePool.pop() ?? blankProjectile();
      projectiles.push(projectile);
      return projectile;
    }
    const projectile = projectiles[projectileReplacement % projectiles.length];
    projectileReplacement = (projectileReplacement + 1) % MAX_PLAYER_PROJECTILES;
    return projectile;
  }

  function acquireEnemyShot() {
    if (enemyShots.length < MAX_ENEMY_SHOTS) {
      const shot = enemyShotPool.pop() ?? blankEnemyShot();
      enemyShots.push(shot);
      return shot;
    }
    const shot = enemyShots[enemyShotReplacement % enemyShots.length];
    enemyShotReplacement = (enemyShotReplacement + 1) % MAX_ENEMY_SHOTS;
    return shot;
  }

  function spawnEnemyShot(x: number, y: number, vx: number, vy: number, radius: number, damage: number, life: number) {
    const shot = acquireEnemyShot();
    shot.x = x;
    shot.y = y;
    shot.vx = vx;
    shot.vy = vy;
    shot.r = radius;
    shot.damage = damage;
    shot.life = life;
  }

  function compactPlayerProjectiles() {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      if (projectiles[index].life > 0) continue;
      const expired = projectiles[index];
      const last = projectiles.pop()!;
      if (index < projectiles.length) projectiles[index] = last;
      if (projectilePool.length < MAX_PLAYER_PROJECTILES) projectilePool.push(expired);
    }
  }

  function compactEnemyShots() {
    for (let index = enemyShots.length - 1; index >= 0; index -= 1) {
      if (enemyShots[index].life > 0) continue;
      const expired = enemyShots[index];
      const last = enemyShots.pop()!;
      if (index < enemyShots.length) enemyShots[index] = last;
      if (enemyShotPool.length < MAX_ENEMY_SHOTS) enemyShotPool.push(expired);
    }
  }

  function clear() {
    while (projectiles.length) {
      const projectile = projectiles.pop()!;
      if (projectilePool.length < MAX_PLAYER_PROJECTILES) projectilePool.push(projectile);
    }
    while (enemyShots.length) {
      const shot = enemyShots.pop()!;
      if (enemyShotPool.length < MAX_ENEMY_SHOTS) enemyShotPool.push(shot);
    }
    projectileReplacement = 0;
    enemyShotReplacement = 0;
  }

  return {
    projectiles,
    enemyShots,
    acquirePlayerProjectile,
    acquireEnemyShot,
    spawnEnemyShot,
    compactPlayerProjectiles,
    compactEnemyShots,
    clear,
  };
}

export type ProjectileStore = ReturnType<typeof createProjectileStore>;
