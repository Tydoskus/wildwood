import {
  generateMap,
  generatedBossStats,
  isProceduralMap,
} from "../../../shared/procedural-maps";
import { ENEMY_TYPES } from "../enemies";
import { generatedBossArt } from "../procedural-maps";
import type { EnemyState, PlayerState } from "./types";
import type { SpawnSite } from "../world";

type BossRow = {
  key: string;
  mapId: string;
  encounter: bigint;
  hp: number;
  maxHp: number;
  respawnAtMicros: bigint;
};
export function createProceduralBossController(options: {
  mapId: () => string;
  state: (mapId: string) => { boss: BossRow | null; ready?: boolean; completed?: number };
  revealPortal?: () => boolean;
  enemies: EnemyState[];
  player: PlayerState;
  spawn: (site: SpawnSite) => void;
  damagePlayer: (damage: number) => boolean;
  burst: (
    x: number,
    y: number,
    color: string,
    count?: number,
    speed?: number,
  ) => void;
  shot: (
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    damage: number,
    life: number,
  ) => void;
}) {
  let mapId = "",
    boss: EnemyState | null = null,
    encounter = 0n,
    bossKey = "";
  let attackElapsed = 0,
    pulseFired = false,
    shotElapsed = 0;
  let observedCompleted: number | null = null, pendingReveal = false;
  let definition: ReturnType<typeof generateMap> | null = null;
  function resetAttacks() {
    attackElapsed = shotElapsed = 0;
    pulseFired = false;
    if (boss) boss.attackAnimationElapsed = undefined;
  }
  function discardBoss() {
    if (boss) boss.dead = true;
    boss = null;
    resetAttacks();
  }
  function update(dt: number) {
    const next = options.mapId();
    const snapshot = options.state(next);
    if (next !== mapId) {
      mapId = next;
      observedCompleted = null;
      pendingReveal = false;
      definition = isProceduralMap(mapId) ? generateMap(mapId) : null;
      discardBoss();
      encounter = 0n;
      bossKey = "";
    }
    if (!isProceduralMap(mapId)) return;
    if (snapshot.ready !== false && snapshot.completed !== undefined) {
      if (observedCompleted !== null && observedCompleted < definition!.number && snapshot.completed >= definition!.number)
        pendingReveal = true;
      observedCompleted = snapshot.completed;
    }
    if (pendingReveal && options.player.hp > 0 && options.revealPortal?.()) pendingReveal = false;
    const map = definition!,
      row = snapshot.boss;
    if (!row || row.mapId !== mapId) {
      discardBoss();
      return;
    }
    if (
      !boss ||
      !options.enemies.includes(boss) ||
      encounter !== row.encounter ||
      bossKey !== row.key
    ) {
      if (boss) boss.dead = true;
      if (row.hp <= 0) return;
      const kind = generatedBossArt(mapId),
        stats = generatedBossStats(map);
      options.spawn({
        id: -1,
        ...map.boss,
        type: kind,
        campName: `Warden - ${map.number}`,
        leashRange: 900,
        alive: false,
        respawnAt: 0,
        definition: {
          ...ENEMY_TYPES[kind],
          ...stats,
          r: 95,
          speed: 0,
          elite: true,
          reward: stats.rewards[0],
        },
      });
      boss = options.enemies[options.enemies.length - 1];
      boss.generatedBoss = true;
      boss.bossRewards = stats.rewards;
      encounter = row.encounter;
      bossKey = row.key;
      resetAttacks();
    }
    boss.hp = row.hp;
    boss.maxHp = row.maxHp;
    boss.hurt = Math.max(0, boss.hurt - dt);
    if (row.hp <= 0) {
      if (!boss.dead) options.burst(boss.x, boss.y, "#f7edce", 35, 150);
      boss.dead = true;
      return;
    }
    const distance = Math.hypot(
      options.player.x - boss.x,
      options.player.y - boss.y,
    );
    if (distance > 850 || options.player.hp <= 0) {
      boss.engaged = false;
      resetAttacks();
      return;
    }
    boss.engaged = true;
    boss.facingX = options.player.x < boss.x ? -1 : 1;
    // The fight is local. A network clock adjustment must not restart its windup.
    const step = Math.max(0, Math.min(dt, 0.1));
    if (boss.attackAnimationElapsed !== undefined)
      boss.attackAnimationElapsed += step;
    attackElapsed += step;
    shotElapsed += step;
    if (attackElapsed >= 6) {
      attackElapsed %= 6;
      pulseFired = false;
    }
    if (attackElapsed >= 1.4 && !pulseFired) {
      pulseFired = true;
      boss.attackAnimationElapsed = 0;
      if (distance < 330 + options.player.r) options.damagePlayer(boss.damage);
    }
    if (shotElapsed >= 1.6) {
      shotElapsed %= 1.6;
      boss.attackAnimationElapsed = 0;
      const angle = Math.atan2(
        options.player.y - boss.y,
        options.player.x - boss.x,
      );
      options.shot(
        boss.x,
        boss.y - 25,
        Math.cos(angle) * 230,
        Math.sin(angle) * 230,
        10,
        boss.damage * 0.3,
        4,
      );
    }
    if (distance < boss.r + options.player.r) {
      const angle = Math.atan2(
        options.player.y - boss.y,
        options.player.x - boss.x,
      );
      options.player.x = boss.x + Math.cos(angle) * (boss.r + options.player.r);
      options.player.y = boss.y + Math.sin(angle) * (boss.r + options.player.r);
    }
  }
  return {
    update,
    boss: () => (boss && !boss.dead && options.mapId() === mapId ? boss : null),
    draw(ctx: CanvasRenderingContext2D, camera: { x: number; y: number }) {
      if (
        !boss ||
        boss.dead ||
        options.mapId() !== mapId ||
        options.player.hp <= 0
      )
        return;
      const phase = attackElapsed;
      if (
        phase > 1.65 ||
        Math.hypot(options.player.x - boss.x, options.player.y - boss.y) > 850
      )
        return;
      ctx.save();
      ctx.translate(boss.x - camera.x, boss.y - camera.y);
      ctx.fillStyle =
        phase < 1.4 ? "rgba(224,88,87,.14)" : "rgba(255,190,117,.5)";
      ctx.strokeStyle = "#ae5356";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 330, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, 330 * Math.min(1, phase / 1.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
  };
}
