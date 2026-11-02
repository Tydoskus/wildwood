// Canvas scenes: overhead plates, gear on characters, enemies' frames and the parts-built enemies.
import { BASE_ATTACK_RANGE } from "../../src/game/constants";
import { targetCameraZoom } from "../../src/game/runtime/render/camera";
import { enemySpriteVerticalBounds } from "../../src/game/runtime/render/actor-renderer";
import { MAP_ENEMY_SPRITE_GROUPS } from "../../src/game/runtime/render/map-asset-groups";
import { setEnemyHpNumbersEnabled } from "../../src/game/runtime/enemy-hp-setting";
import { setOwnNamePlateEnabled } from "../../src/game/runtime/name-plate-setting";
import { ENEMY_SPRITE_LAYOUTS } from "../../src/game/enemy-sprite-layouts.mjs";
import { ENEMY_TYPES, type EnemyKind } from "../../src/game/enemies";
import type { EnemyState } from "../../src/game/runtime/types";
import { PLAYER_GENDER_FEMALE, PLAYER_GENDER_MALE } from "../../shared/player-gender";
import { drawUntilStable } from "./determinism";
import { chatLine, createWorld, enemySprites, fakeEnemy, label, resetCanvas, sceneCanvas, section, type FakePlayer } from "./world";
import { gear } from "./scenes-gear";

/** The phone framing: a 390 × 780 canvas at the base attack range (camera.ts). */
const PHONE_ZOOM = targetCameraZoom(BASE_ATTACK_RANGE, { width: 390, height: 780 });

const PLATE_PLAYERS: (FakePlayer & { local?: boolean })[] = [
  { id: "p-local", local: true, name: "Rymel", power: 12_345, hp: 840, maxHp: 1_200, guildTag: "TheG", prestige: 3, gender: PLAYER_GENDER_MALE, skinTone: 2, headItem: "heroic_medium_helmet", chestItem: "heroic_medium_armor", rightHandItem: "heroic_bow" },
  { id: "p-guest", name: "Guest4821", guest: true, prestige: 1, gender: PLAYER_GENDER_FEMALE, power: 980, hp: 90, maxHp: 1_500, fighting: true, skinTone: 4 },
  { id: "p-long", name: "Jiggly_Puppy_Gqyp", power: 1_234_567, hp: 1, maxHp: 1, prestige: 12, gender: PLAYER_GENDER_FEMALE, skinTone: 1, headItem: "legendary_magic_helmet", chestItem: "legendary_magic_armor", rightHandItem: "legendary_staff" },
  { id: "p-dev", name: "rymel", developer: true, guildTag: "TheG", power: 0, hp: 3_300, maxHp: 5_000, fighting: true, gender: PLAYER_GENDER_MALE, chat: "plates look even now?", skinTone: 0, headItem: "eternal_heavy_helmet", chestItem: "eternal_heavy_armor", rightHandItem: "eternal_sword" },
  { id: "p-plain", name: "Wanderer", power: 30, hp: 30, maxHp: 30, fighting: true, skinTone: 5 },
  { id: "p-guest2", name: "Guest0007", guest: true, power: 45_600, hp: 1, maxHp: 1, skinTone: 3, headItem: "crude_light_helmet" },
];

const PLATE_ENEMIES = ["Spitter", "Dune Raider", "Whiteout Reaper"];

/** Several players and enemies with their plates, at the phone camera framing. */
async function plates() {
  const width = 390, height = 900;
  const host = section(`Plates · phone framing, zoom ${PHONE_ZOOM.toFixed(3)} · dpr ${window.devicePixelRatio}`);
  const scene = sceneCanvas(host, width, height);
  const animated = Object.keys(ENEMY_SPRITE_LAYOUTS).find(kind => ENEMY_SPRITE_LAYOUTS[kind].animation && ENEMY_TYPES[kind as EnemyKind]);
  const enemyKinds = [...PLATE_ENEMIES, ...(animated ? [animated] : [])];
  const sprites = await enemySprites([...new Set(enemyKinds)]);
  const world = await createWorld(scene.ctx, { zoom: PHONE_ZOOM, viewport: { width, height }, players: PLATE_PLAYERS, enemySprites: sprites });
  const z = PHONE_ZOOM;
  const draw = () => {
    resetCanvas(scene);
    const { ctx } = scene;
    world.updateSpeechBubbles();
    ctx.save();
    ctx.scale(z, z);
    PLATE_PLAYERS.forEach((player, index) => {
      const x = (index % 2 ? 285 : 105) / z;
      const y = (170 + Math.floor(index / 2) * 150) / z;
      if (player.local) world.drawLocalPlayer(player, x, y);
      else world.drawRemotePlayer(player, x, y);
    });
    // Two rows of enemies: bars without numbers, then with (Settings > Enemy HP Numbers).
    [false, true].forEach((numbers, row) => {
      setEnemyHpNumbersEnabled(numbers);
      const kinds = row ? [animated ?? PLATE_ENEMIES[0], PLATE_ENEMIES[2], PLATE_ENEMIES[1]] : PLATE_ENEMIES;
      kinds.forEach((kind, column) => {
        const ratio = [1, .5, .08][column];
        const enemy = fakeEnemy(kind, (75 + column * 120) / z, (680 + row * 150) / z);
        enemy.hp = Math.max(1, Math.round(enemy.maxHp * ratio));
        world.actor.drawEnemy(enemy);
      });
    });
    setEnemyHpNumbersEnabled(true);
    ctx.restore();
  };
  const panels = [await ownPlateOff(), await chatBubbles(), await helmetHeights(), await webkitMetrics()];
  await drawUntilStable(() => { draw(); panels.forEach(panel => panel()); });
}

type PlatePlayer = FakePlayer & { local?: boolean };

/** A row of players at the phone framing, each at its own spot; returns the drawer. */
async function plateRow(title: string, players: PlatePlayer[], options: Parameters<typeof createWorld>[1] extends infer O ? Partial<O> : never = {}, height = 260) {
  const width = 390;
  const scene = sceneCanvas(section(title), width, height);
  const world = await createWorld(scene.ctx, { zoom: PHONE_ZOOM, viewport: { width, height }, players, ...options });
  const z = PHONE_ZOOM;
  return (before?: () => void, after?: () => void) => {
    before?.();
    resetCanvas(scene);
    world.updateSpeechBubbles();
    scene.ctx.save();
    scene.ctx.scale(z, z);
    players.forEach((player, index) => {
      const x = (width / players.length) * (index + .5) / z, y = (height - 50) / z;
      if (player.local) world.drawLocalPlayer(player, x, y);
      else world.drawRemotePlayer(player, x, y);
    });
    scene.ctx.restore();
    after?.();
  };
}

/** Settings > Show My Name Plate off: only the player's own plate goes; its chat bubble and other plates stay. */
async function ownPlateOff() {
  const me: PlatePlayer = { id: "own-off", local: true, name: "Hidden Me", power: 2_222, hp: 50, maxHp: 100, chat: "my plate is off", headItem: "rare_light_helmet" };
  const other: PlatePlayer = { id: "own-other", name: "Still Shown", power: 3_333, hp: 70, maxHp: 100, fighting: true };
  const draw = await plateRow("Plates · Show My Name Plate off: no plate over me, my bubble stays, others keep theirs", [me, other]);
  return () => draw(() => setOwnNamePlateEnabled(false), () => setOwnNamePlateEnabled(true));
}

/**
 * Chat bubbles: the newest three of a player's messages stacked, newest nearest the head; an expired one, a
 * system notice and a duel announcement never show.
 */
async function chatBubbles() {
  const talker: PlatePlayer = { id: "talker", name: "Chatty", power: 4_444, hp: 1, maxHp: 1 };
  const quiet: PlatePlayer = { id: "quiet", name: "Quiet", power: 5_555, hp: 1, maxHp: 1 };
  const chat = [
    chatLine(talker, "too old to show", 8_000, 1), chatLine(talker, "oldest still up", 7_000, 2), chatLine(talker, "middle", 3_000, 3),
    chatLine(talker, "newer", 2_000, 4), chatLine(talker, "newest", 1_000, 5),
    { ...chatLine(quiet, "Quiet has logged in.", 1_000, 6), sender: "system", senderName: "" },
    { ...chatLine(quiet, "A duel finished.", 1_000, 7), sender: "duel", senderName: "DUEL", replayId: 1n },
  ];
  return plateRow("Plates · chat bubbles: newest three stacked, newest nearest; system and duel notices stay in chat", [talker, quiet], { chat }, 330);
}

/** The plate sits over the top of the art: a bare head, a felt cap, an antler hood, the tallest helmet; and Invisible. */
async function helmetHeights() {
  const players: PlatePlayer[] = [
    { id: "bare", name: "Bare", power: 10, hp: 1, maxHp: 1 },
    { id: "cap", name: "Cap", power: 20, hp: 1, maxHp: 1, headItem: "crude_light_helmet" },
    { id: "antlers", name: "Antlers", power: 30, hp: 1, maxHp: 1, headItem: "mythic_light_helmet" },
    { id: "tallest", name: "Tallest", power: 40, hp: 1, maxHp: 1, headItem: "celestial_medium_helmet" },
    { id: "hiding", local: true, name: "Hiding", power: 50, hp: 60, maxHp: 100, headItem: "celestial_medium_helmet" },
  ];
  return plateRow("Plates · over a bare head, a cap, an antler hood, the tallest helmet; my own plate while Invisible", players, { invisible: id => id === "hiding" });
}

/**
 * Plates as Safari measures text: no glyph bounds (zero ascent), only the font box. Text must still sit on its
 * lines, not jump up or clip.
 */
async function webkitMetrics() {
  const players: PlatePlayer[] = [
    { id: "wk-guest", name: "Guest7313", guest: true, power: 6_161, hp: 40, maxHp: 100, fighting: true },
    { id: "wk-desc", name: "Jiggly_gpqy", power: 7_171, hp: 1, maxHp: 1, gender: PLAYER_GENDER_FEMALE },
    { id: "wk-me", local: true, name: "Safari Me", power: 8_181, hp: 90, maxHp: 100 },
  ];
  const draw = await plateRow("Plates · Safari's text metrics (no glyph bounds): the font-box fallback", players);
  const proto = CanvasRenderingContext2D.prototype;
  const real = proto.measureText;
  const webkit = function (this: CanvasRenderingContext2D, text: string) {
    const metrics = real.call(this, text);
    return { width: metrics.width, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0, fontBoundingBoxAscent: metrics.fontBoundingBoxAscent,
      fontBoundingBoxDescent: metrics.fontBoundingBoxDescent } as TextMetrics;
  };
  return () => draw(() => { proto.measureText = webkit; }, () => { proto.measureText = real; });
}

type Motion = "idle" | "walk" | "attack";

/**
 * One enemy at one frame of one motion, through drawEnemy and its animation sampler: a first, clipped-out
 * draw starts the motion, the second lands on the middle of frame `frame`. `extra` is the rest of its state
 * (a death under way, a hit).
 */
function drawEnemyFrame(world: Awaited<ReturnType<typeof createWorld>>, ctx: CanvasRenderingContext2D, kind: string, motion: Motion, frame: number, x: number, y: number, facingX: -1 | 1 = 1, extra: Partial<EnemyState> = {}) {
  const animation = ENEMY_SPRITE_LAYOUTS[kind].animation!;
  const clip = animation.animations[motion];
  const start = 100;
  const enemy = fakeEnemy(kind, x, y, { hideStatus: true, facingX, vx: motion === "walk" ? 50 * facingX : 0 });
  const definition = ENEMY_TYPES[kind as EnemyKind] ?? enemy.definition!;
  const middle = (frame + .5) * clip.frameDurationMs;
  if (motion === "attack") {
    const attackDuration = Math.min(clip.durationMs / 1_000, .8 / Math.max(.01, definition.attackSpeed));
    enemy.attackAnimationElapsed = middle / clip.durationMs * attackDuration;
  }
  world.setGameTime(start);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 0, 0);
  ctx.clip();
  world.actor.drawEnemy(enemy);
  ctx.restore();
  Object.assign(enemy, extra);
  world.setGameTime(motion === "attack" ? start : start + middle / 1_000);
  world.actor.drawEnemy(enemy);
}

type EnemyCell = { name: string; motion: Motion; frame: number; facingX: -1 | 1; extra?: Partial<EnemyState> };
/** Idle and walk loops, the attack from its start, the same facing left, and the death fade. */
function enemyCells(kind: string): EnemyCell[] {
  const middle = (motion: Motion) => Math.floor(ENEMY_SPRITE_LAYOUTS[kind].animation!.animations[motion].frames.length / 2);
  return [
    { name: "idle 0", motion: "idle", frame: 0, facingX: 1 }, { name: `idle ${middle("idle")}`, motion: "idle", frame: middle("idle"), facingX: 1 },
    { name: `walk ${middle("walk")}`, motion: "walk", frame: middle("walk"), facingX: 1 },
    { name: "attack 0", motion: "attack", frame: 0, facingX: 1 }, { name: `attack ${middle("attack")}`, motion: "attack", frame: middle("attack"), facingX: 1 },
    { name: "← walk", motion: "walk", frame: middle("walk"), facingX: -1 }, { name: "← attack", motion: "attack", frame: middle("attack"), facingX: -1 },
    { name: "dying", motion: "idle", frame: 0, facingX: 1, extra: { remoteCombatDeathProgress: .5 } },
  ];
}

/** Map → its enemy kinds, then "unplaced" for kinds no authored map lists (Endless and the like). */
function kindsByMap(filter: (kind: string) => boolean) {
  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const [mapId, kinds] of Object.entries(MAP_ENEMY_SPRITE_GROUPS as Record<string, readonly string[]>)) {
    const picked = kinds.filter(kind => ENEMY_SPRITE_LAYOUTS[kind] && filter(kind) && !seen.has(kind));
    picked.forEach(kind => seen.add(kind));
    if (picked.length) groups.set(mapId, picked);
  }
  const rest = Object.keys(ENEMY_SPRITE_LAYOUTS).filter(kind => filter(kind) && !seen.has(kind));
  if (rest.length) groups.set("unplaced", rest);
  return groups;
}

/** Every atlas-animated enemy: idle, walk and attack at fixed frames, grouped by map. */
async function enemies() {
  const groups = kindsByMap(kind => Boolean(ENEMY_SPRITE_LAYOUTS[kind].animation));
  const sprites = await enemySprites([...groups.values()].flat());
  const labelWidth = 120;
  const draws: (() => void)[] = [];
  for (const [mapId, kinds] of groups) {
    const cells = kinds.map(enemyCells);
    const columns = Math.max(...cells.map(row => row.length));
    // Frames carry transparent margins: a cell narrower than the widest frame still holds its art.
    const cellWidth = Math.min(Math.max(...kinds.map(kind => ENEMY_SPRITE_LAYOUTS[kind].animation!.w)) + 12, Math.floor((1280 - labelWidth) / columns));
    const rowHeights = kinds.map(kind => { const animation = ENEMY_SPRITE_LAYOUTS[kind].animation!; return animation.bottom - animation.top + 34; });
    const width = labelWidth + columns * cellWidth, height = rowHeights.reduce((sum, value) => sum + value, 0);
    const host = section(`Enemies · ${mapId} · idle and walk loops, the attack, facing left, dying`);
    const scene = sceneCanvas(host, width, height);
    const world = await createWorld(scene.ctx, { zoom: 1, viewport: { width, height }, enemySprites: sprites });
    draws.push(() => {
      resetCanvas(scene);
      let top = 0;
      kinds.forEach((kind, row) => {
        const bounds = enemySpriteVerticalBounds(sprites[kind], ENEMY_TYPES[kind as EnemyKind]?.r ?? 18);
        label(scene.ctx, kind, 6, top + 6, "left");
        cells[row].forEach(({ name, motion, frame, facingX, extra }, column) => {
          const x = labelWidth + (column + .5) * cellWidth;
          drawEnemyFrame(world, scene.ctx, kind, motion, frame, x, top + 28 - bounds.top, facingX, extra);
          label(scene.ctx, name, x, top + 4);
        });
        top += rowHeights[row];
      });
    });
  }
  await drawUntilStable(() => draws.forEach(draw => draw()));
}

/** The parts-built enemies (goblins, skeletons, slimes and the rest without an atlas), by family. */
async function parts() {
  const families = new Map<string, string[]>();
  for (const [kind, layout] of Object.entries(ENEMY_SPRITE_LAYOUTS)) {
    if (layout.animation) continue;
    const list = families.get(layout.family) ?? [];
    list.push(kind);
    families.set(layout.family, list);
  }
  const sprites = await enemySprites([...families.values()].flat());
  const labelWidth = 120, cellWidth = 120;
  // Aimed at a target up and right, down and right, and up and left (dx, dy from the enemy).
  const poses = [
    { name: "right", facingX: 1 as const, engaged: false, target: [200, -120] },
    { name: "left", facingX: -1 as const, engaged: false, target: [200, -120] },
    { name: "aim ↗", facingX: 1 as const, engaged: true, target: [200, -120] },
    { name: "aim ↘", facingX: 1 as const, engaged: true, target: [200, 120] },
    { name: "aim ↖", facingX: -1 as const, engaged: true, target: [-200, -120] },
    { name: "hit", facingX: 1 as const, engaged: false, target: [200, -120], extra: { hurt: .1 } },
    { name: "dying", facingX: 1 as const, engaged: false, target: [200, -120], extra: { remoteCombatDeathProgress: .5 } },
  ];
  const draws: (() => void)[] = [];
  for (const [family, kinds] of families) {
    const rowHeights = kinds.map(kind => { const bounds = enemySpriteVerticalBounds(sprites[kind], ENEMY_TYPES[kind as EnemyKind]?.r ?? 18); return Math.ceil(bounds.bottom - bounds.top) + 30; });
    const width = labelWidth + poses.length * cellWidth, height = rowHeights.reduce((sum, value) => sum + value, 0);
    const host = section(`Parts · ${family}`);
    const scene = sceneCanvas(host, width, height);
    const world = await createWorld(scene.ctx, { zoom: 1, viewport: { width, height }, enemySprites: sprites });
    draws.push(() => {
      resetCanvas(scene);
      let top = 0;
      kinds.forEach((kind, row) => {
        const bounds = enemySpriteVerticalBounds(sprites[kind], ENEMY_TYPES[kind as EnemyKind]?.r ?? 18);
        label(scene.ctx, kind, 6, top + 6, "left");
        poses.forEach((pose, column) => {
          const x = labelWidth + (column + .5) * cellWidth, y = top + 20 - bounds.top;
          const enemy = fakeEnemy(kind, x, y, { hideStatus: true, facingX: pose.facingX, engaged: pose.engaged, combatTargetX: x + pose.target[0], combatTargetY: y + pose.target[1], ...pose.extra });
          world.setGameTime(0);
          world.actor.drawEnemy(enemy);
          label(scene.ctx, pose.name, x, top + 4);
        });
        top += rowHeights[row];
      });
    });
  }
  await drawUntilStable(() => draws.forEach(draw => draw()));
}

export const WORLD_SCENES: Record<string, () => Promise<void>> = { plates, gear, enemies, parts };
