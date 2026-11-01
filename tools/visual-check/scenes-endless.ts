// Endless bosses: each Endless enemy beside its boss, hitboxes outlined.
import { GENERATED_ENEMY_ART } from "../../shared/procedural-enemy-art";
import { GENERATED_BOSS_SIZE, generatedEnemyRadius } from "../../src/game/procedural-maps";
import type { EnemyKind } from "../../src/game/enemies";
import { drawUntilStable } from "./determinism";
import { createWorld, enemySprites, fakeEnemy, label, resetCanvas, sceneCanvas, section } from "./world";

/** Each Endless art kind as a map enemy and as its boss, with the hitbox circle over each. */
export async function endlessBosses() {
  const kinds = [...GENERATED_ENEMY_ART];
  const sprites = await enemySprites(kinds);
  const labelWidth = 150, cell = 260, rowHeight = 220;
  const width = labelWidth + 2 * cell, height = kinds.length * rowHeight;
  const scene = sceneCanvas(section("Endless bosses · the map enemy and its boss, hitbox outlined"), width, height);
  const world = await createWorld(scene.ctx, { zoom: 1, viewport: { width, height }, enemySprites: sprites });
  const ring = (x: number, y: number, r: number) => {
    scene.ctx.save(); scene.ctx.strokeStyle = "#ff3b8d"; scene.ctx.lineWidth = 2;
    scene.ctx.beginPath(); scene.ctx.arc(x, y, r, 0, Math.PI * 2); scene.ctx.stroke(); scene.ctx.restore();
  };
  await drawUntilStable(() => {
    resetCanvas(scene);
    world.setGameTime(0);
    kinds.forEach((kind, row) => {
      const y = row * rowHeight + rowHeight * .62, r = generatedEnemyRadius(kind as EnemyKind);
      label(scene.ctx, kind, 6, row * rowHeight + 6, "left");
      const enemyX = labelWidth + cell * .5, bossX = labelWidth + cell * 1.5;
      world.actor.drawEnemy(fakeEnemy(kind, enemyX, y, { hideStatus: true, r }));
      ring(enemyX, y, r);
      label(scene.ctx, `enemy r ${r}`, enemyX, row * rowHeight + 6);
      const bossR = r * GENERATED_BOSS_SIZE;
      world.actor.drawEnemy(fakeEnemy(kind, bossX, y, { hideStatus: true, r: bossR, generatedBoss: true }));
      ring(bossX, y, bossR);
      label(scene.ctx, `boss r ${bossR}`, bossX, row * rowHeight + 6);
    });
  });
}
