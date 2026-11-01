// The combat-hits scene: damage numbers over a crowd, projectiles in flight and skill effects, at the phone framing.
import { BASE_ATTACK_RANGE } from "../../src/game/constants";
import { createCanvasPrimitives } from "../../src/game/canvas";
import { targetCameraZoom } from "../../src/game/runtime/render/camera";
import { createCombatEffects, DAMAGE_NUMBER_FADE_DURATION, DAMAGE_NUMBER_RISE_DURATION } from "../../src/game/runtime/combat-effects";
import type { EnemyShot, Projectile } from "../../src/game/runtime/types";
import type { ArrowId } from "../../shared/arrows";
import { arrowArtSource, arrowImage } from "../../src/game/runtime/render/arrow-images";
import { STARTER_BOW, STARTER_STAFF, STARTER_STONE } from "../../shared/items";
import { drawUntilStable, resetRandom } from "./determinism";
import { createWorld, enemySprites, fakeEnemy, label, resetCanvas, sceneCanvas, section, type FakePlayer, type SceneCanvas } from "./world";

const PHONE_ZOOM = targetCameraZoom(BASE_ATTACK_RANGE, { width: 390, height: 780 });
const WIDTH = 390;
const CROWD = ["Spitter", "Bramble", "Needle", "Striker", "Mossback", "King Slime"];
const ME: FakePlayer = { id: "me", name: "Rymel", power: 4_200, hp: 620, maxHp: 1_000, rightHandItem: STARTER_BOW, chestItem: "rare_light_armor" };

/** Where the crowd stands, in world units, around a player at (`px`, `py`). */
function crowdAt(px: number, py: number) {
  return CROWD.map((kind, index) => {
    const angle = -Math.PI * .85 + index * Math.PI * .34;
    return { kind, x: px + Math.cos(angle) * 150, y: py + Math.sin(angle) * 90 - 40 };
  });
}

type Panel = { scene: SceneCanvas; draw: () => void };

/**
 * One moment of a fight: the player in a crowd, white numbers on the enemies, yellow crits, red damage the
 * player took and a burst of hits on one enemy fanned out; `age` seconds after they were spawned.
 */
async function damagePanel(title: string, age: number, sprites: Awaited<ReturnType<typeof enemySprites>>): Promise<Panel> {
  const height = 300;
  const scene = sceneCanvas(section(title), WIDTH, height);
  const world = await createWorld(scene.ctx, { zoom: PHONE_ZOOM, viewport: { width: WIDTH, height }, players: [ME], enemySprites: sprites });
  const outlined = createCanvasPrimitives(scene.ctx).outlinedWorldText;
  const z = PHONE_ZOOM;
  const px = WIDTH / 2 / z, py = 210 / z;
  const crowd = crowdAt(px, py);
  return {
    scene,
    draw() {
      // The same hits each draw, so every pass lands on the same frame.
      resetRandom();
      const effects = createCombatEffects();
      crowd.forEach((enemy, index) => effects.spawnDamageNumber(enemy.x, enemy.y - 30, [12.5, 841, 2.35, 1_450, 64, 9_800][index], index % 3 === 1));
      for (let hit = 0; hit < 6; hit += 1) effects.spawnDamageNumber(crowd[5].x, crowd[5].y - 50, 30 + hit * 7, hit === 2);
      effects.spawnDamageNumber(px, py - 40, 57, false, true);
      effects.spawnDamageNumber(px + 4, py - 40, 0.5, false, true);
      if (age > 0) effects.update(age);
      resetCanvas(scene);
      const { ctx } = scene;
      ctx.save();
      ctx.scale(z, z);
      for (const enemy of crowd) world.actor.drawEnemy(fakeEnemy(enemy.kind, enemy.x, enemy.y, { hideStatus: true }));
      world.drawLocalPlayer(ME, px, py);
      effects.drawDamageNumbers(ctx, world.camera, outlined, scene.dpr);
      ctx.restore();
    },
  };
}

/** Each weapon's projectile in flight (a thrown stone, an arrow, crafted arrows, a staff bolt) and an enemy's shot, in four directions. */
async function projectilePanel(): Promise<Panel> {
  const height = 500;
  const scene = sceneCanvas(section("Projectiles · stone, arrow, crafted arrows and staff bolt from the player; an enemy's shot"), WIDTH, height);
  const rows: { name: string; weapon: string; enemy?: boolean; ammo?: ArrowId }[] = [
    { name: "stone", weapon: STARTER_STONE }, { name: "arrow", weapon: STARTER_BOW },
    { name: "fire", weapon: STARTER_BOW, ammo: "fire_arrow" }, { name: "star", weapon: STARTER_BOW, ammo: "star_arrow" },
    { name: "bolt", weapon: STARTER_STAFF }, { name: "enemy", weapon: STARTER_BOW, enemy: true },
  ];
  // Crafted arrows fly as their art, once it has loaded.
  for (const row of rows) if (row.ammo) await new Promise(resolve => { const image = new Image(); image.onload = image.onerror = resolve; image.src = arrowArtSource(row.ammo!); });
  for (const row of rows) if (row.ammo) arrowImage(row.ammo);
  await new Promise(resolve => setTimeout(resolve, 50));
  const world = await createWorld(scene.ctx, { zoom: 1, viewport: { width: WIDTH, height }, players: [ME] });
  const directions = [[1, 0], [0, 1], [-1, -1], [1, -.5]];
  return {
    scene,
    draw() {
      resetCanvas(scene);
      const { ctx } = scene;
      rows.forEach((row, index) => {
        const y = 40 + index * 80;
        label(ctx, row.name, 6, y - 6, "left");
        // Drawing the player first puts the weapon in hand, which picks the projectile.
        world.drawLocalPlayer({ ...ME, rightHandItem: row.weapon }, -200, -200);
        directions.forEach(([vx, vy], column) => {
          const shot = { x: 110 + column * 75, y, r: 6, vx: vx * 400, vy: vy * 400, damage: 1, critical: false, life: 1, trail: 1, ammo: row.ammo ?? null };
          world.actor.drawProjectile(shot as Projectile | EnemyShot, Boolean(row.enemy));
        });
      });
    },
  };
}

/**
 * Bow, sword and staff skill effects partway through: Arrow Storm's arcing volley, a streak and a jagged chain,
 * a sword spin, a sword wave and a deflected shot, a staff burst, Meteor's warning and Frost Nova; with a burst
 * of particles.
 */
async function skillPanel(title: string, age: number): Promise<Panel> {
  const height = 320;
  const scene = sceneCanvas(section(title), WIDTH, height);
  const world = await createWorld(scene.ctx, { zoom: 1, viewport: { width: WIDTH, height } });
  return {
    scene,
    draw() {
      resetRandom();
      const effects = createCombatEffects();
      for (let index = 0; index < 6; index += 1) effects.spawnArcingArrow(40, 60, 180, 60, index, "#8fe3ff");
      effects.spawnSkillStreak(220, 30, 360, 90, "#8fe3ff", 4, .3);
      effects.spawnSkillStreak(220, 110, 360, 60, "#c9a8ff", 3, .3, true);
      effects.spawnSwordSpin(70, 200, 50, .6);
      effects.spawnSwordWave(150, 200, 260, 200, 40, .5);
      effects.spawnDeflectedShot(300, 180, 360, 250, .3);
      effects.spawnStaffBurst(60, 280, 36, "#ff9a3c");
      effects.spawnMeteor(170, 275, 40, .4);
      effects.spawnFrostNova(300, 275, 44);
      effects.spawnBurst(200, 140, "#ffe36b", 14, 90);
      if (age > 0) effects.update(age);
      resetCanvas(scene);
      effects.drawParticles(scene.ctx, world.camera, scene.dpr);
      effects.drawDamageNumbers(scene.ctx, world.camera, () => {}, scene.dpr);
    },
  };
}

/** Damage numbers in a crowd as they rise, stop and fade; projectiles; skill effects partway through. */
export async function combatHits() {
  const sprites = await enemySprites(CROWD);
  const panels = [
    await damagePanel("Hits · just landed: white dealt, yellow crits, red taken, a burst fanned out", 0, sprites),
    await damagePanel("Hits · half risen", DAMAGE_NUMBER_RISE_DURATION / 2, sprites),
    await damagePanel("Hits · risen and half faded", DAMAGE_NUMBER_RISE_DURATION + DAMAGE_NUMBER_FADE_DURATION / 2, sprites),
    await damagePanel("Hits · gone two seconds later", 2, sprites),
    await projectilePanel(),
    await skillPanel("Skills · a tenth of a second in", .1),
    await skillPanel("Skills · a quarter second in", .25),
  ];
  await drawUntilStable(() => panels.forEach(panel => panel.draw()));
}
