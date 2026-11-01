import { residentDrawable } from "./resident-image";
import { decodedImage } from "./decoded-image";
import { isMeleeWeapon } from "../../weapon-combat";
import { paintArrowProjectile, paintRockProjectile, rockProjectileSize } from "./weapon-projectile-renderer";
import { ARROW_ART_ROTATION, ARROW_SPRITE_SIZE, arrowImage } from "./arrow-images";
export { rockProjectileSize } from "./weapon-projectile-renderer";
import { ENEMY_TYPES, type EnemyDefinition, type LoadedEnemySprite, type LoadedSpriteLayer } from "../../enemies";
import { clamp } from "../../math";
import type { RemotePlayer } from "../../../wildstat-coop";
import type { PlayerGender } from "../../../../shared/player-gender";
import type { Camera } from "./camera";
import { createEnemyOverheadPlates } from "./enemy-overhead-plate";
import type { TextSegment } from "../../canvas";
import type { RewardLabelContext } from "../reward-labels";
import { ownNamePlateEnabled } from "../../../ui/name-plate-setting";
import { headArtTopOffsetY } from "./overhead-plate";
import { GENERATED_BOSS_SIZE } from "../../procedural-maps";
import { attackPoseItem } from "../../../../shared/equipment-appearance";
import type { BossTarget, DuelCombatant, DuelScene, EnemyShot, EnemyState, PlayerState, Projectile } from "../types";
import { itemPresentation, projectileKindForWeapon } from "../../item-presentation";
import { localItemRefine } from "../../local-item-refines";
import { playerDeathPose, type PlayerDeathAnimationState } from "../player-death-animation";
import { finishedEquipmentSprite } from "../../player-appearance";
import type { StaticWorldSpriteFrame } from "./webgl-static-world-layer";
import { snapWorldRenderCoordinate } from "./render-space";
import { createTintedImageCanvas } from "./image-tint";
import { freezeCanvas, freezeEntry, type FrozenImage } from "./frozen-canvas";
import { drawTrainingDummy } from "./training-dummy-art";
import { boltSprite, drawBolt, staffBoltColor } from "../../staff-look";
import { createEnemyAnimationSampler } from "../enemies/enemy-animation";


type Viewport = { width: number; height: number };
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type OutlinedSegments = (segments: readonly TextSegment[], x: number, y: number, strokeWidth?: number) => void;
type EnemyLayerPlanPart =
  | { kind: "STATIC"; image: FrozenImage; x: number; y: number }
  | { kind: "AIMED"; layer: LoadedSpriteLayer };
const ENEMY_SPRITE_Y_OFFSET = -3;
const enemyLayerPlanCache = new WeakMap<LoadedEnemySprite, EnemyLayerPlanPart[]>();
const enemyBoundsCache = new WeakMap<LoadedEnemySprite, { top: number; bottom: number; height: number }>();
const enemyTintedLayerCache = new WeakMap<LoadedSpriteLayer, FrozenImage>();
const scaledEnemySpriteCache = new WeakMap<LoadedEnemySprite, Map<number, LoadedEnemySprite>>();

/**
 * A sprite drawn at another size, kept per source and scale, so caches keyed by the sprite
 * (its layer canvas and bitmap) are reused across frames.
 */
export function scaledEnemySprite(sprite: LoadedEnemySprite, scale: number): LoadedEnemySprite {
  if (scale === 1) return sprite;
  let sizes = scaledEnemySpriteCache.get(sprite);
  if (!sizes) scaledEnemySpriteCache.set(sprite, sizes = new Map());
  const cached = sizes.get(scale);
  if (cached) return cached;
  if (sizes.size >= 8) sizes.clear();
  const scaled = { ...sprite, size: sprite.size * scale };
  sizes.set(scale, scaled);
  return scaled;
}

function enemyLayerReady(layer: LoadedSpriteLayer) {
  return layer.image.complete && layer.image.naturalWidth > 0 && layer.image.naturalHeight > 0;
}

function tintedEnemyLayerImage(layer: LoadedSpriteLayer): CanvasImageSource {
  if (!layer.tint || typeof document === "undefined") return layer.image;
  const cached = enemyTintedLayerCache.get(layer);
  if (cached) return cached;
  const canvas = createTintedImageCanvas(layer.image, layer.w, layer.h, layer.tint);
  if (!canvas) return layer.image;
  enemyTintedLayerCache.set(layer, canvas);
  freezeEntry(enemyTintedLayerCache, layer, canvas);
  return canvas;
}

function cachedEnemyLayerPlan(sprite: LoadedEnemySprite) {
  const layers = sprite.layers;
  if (!layers?.length || !layers.every(enemyLayerReady)) return null;
  const cached = enemyLayerPlanCache.get(sprite);
  if (cached) return cached;
  if (typeof document === "undefined") return null;

  const plan: EnemyLayerPlanPart[] = [];
  let staticLayers: LoadedSpriteLayer[] = [];
  const flushStaticLayers = () => {
    if (!staticLayers.length) return true;
    const left = Math.floor(Math.min(...staticLayers.map((layer) => layer.x)));
    const top = Math.floor(Math.min(...staticLayers.map((layer) => layer.y + ENEMY_SPRITE_Y_OFFSET)));
    const right = Math.ceil(Math.max(...staticLayers.map((layer) => layer.x + layer.w)));
    const bottom = Math.ceil(Math.max(...staticLayers.map((layer) => layer.y + ENEMY_SPRITE_Y_OFFSET + layer.h)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, right - left);
    canvas.height = Math.max(1, bottom - top);
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.imageSmoothingEnabled = false;
    for (const layer of staticLayers) {
      context.drawImage(
        tintedEnemyLayerImage(layer),
        layer.x - left,
        layer.y + ENEMY_SPRITE_Y_OFFSET - top,
        layer.w,
        layer.h,
      );
    }
    const part = { kind: "STATIC" as const, image: canvas as FrozenImage, x: left, y: top };
    plan.push(part);
    freezeCanvas(canvas, bitmap => { part.image = bitmap; return true; });
    staticLayers = [];
    return true;
  };

  for (const layer of layers) {
    if (!layer.aimPivot) {
      staticLayers.push(layer);
      continue;
    }
    if (!flushStaticLayers()) return null;
    plan.push({ kind: "AIMED", layer });
  }
  if (!flushStaticLayers()) return null;
  enemyLayerPlanCache.set(sprite, plan);
  return plan;
}

export function enemyWeaponAimRotation(
  enemy: Pick<EnemyState, "x" | "y" | "facingX">,
  target: Pick<PlayerState, "x" | "y">,
  pivot = { x: 0, y: -ENEMY_SPRITE_Y_OFFSET },
) {
  // Enemy art is assembled facing right. Convert the world-space target into
  // that local coordinate system before the whole actor is mirrored. Aim from
  // the bow's grip, not the actor's centre, to avoid a near-target angle error.
  const dx = (target.x - enemy.x) * enemy.facingX - pivot.x;
  const dy = target.y - enemy.y - pivot.y - ENEMY_SPRITE_Y_OFFSET;
  return Math.atan2(dy, dx);
}

export function enemyWeaponLayerRotation(
  enemy: Pick<EnemyState, "x" | "y" | "facingX" | "engaged">,
  target: Pick<PlayerState, "x" | "y">,
  sourceOffsetRadians = 0,
  pivot?: { x: number; y: number },
) {
  return enemy.engaged ? sourceOffsetRadians + enemyWeaponAimRotation(enemy, target, pivot) : 0;
}

export function drawableEnemyLayers(layers: LoadedSpriteLayer[] | undefined) {
  return layers?.filter((layer) => layer.image.complete && layer.image.naturalWidth > 0) ?? [];
}

export function enemySpriteVerticalBounds(sprite: LoadedEnemySprite | undefined, enemyRadius: number) {
  if (sprite?.animation) {
    const cached = enemyBoundsCache.get(sprite);
    if (cached) return cached;
    const bounds = {
      top: sprite.animation.top + ENEMY_SPRITE_Y_OFFSET,
      bottom: sprite.animation.bottom + ENEMY_SPRITE_Y_OFFSET,
      height: sprite.animation.bottom - sprite.animation.top,
    };
    enemyBoundsCache.set(sprite, bounds);
    return bounds;
  }
  if (sprite?.layers?.length) {
    const cached = enemyBoundsCache.get(sprite);
    if (cached) return cached;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const layer of sprite.layers) {
      top = Math.min(top, layer.y + ENEMY_SPRITE_Y_OFFSET);
      bottom = Math.max(bottom, layer.y + ENEMY_SPRITE_Y_OFFSET + layer.h);
    }
    const bounds = { top, bottom, height: bottom - top };
    enemyBoundsCache.set(sprite, bounds);
    return bounds;
  }
  const image = sprite?.image;
  const fallbackHeight = Math.max(1, enemyRadius * 2);
  const height = image?.complete && image.naturalWidth > 0
    ? sprite?.height ?? (sprite?.size ?? fallbackHeight) * image.naturalHeight / image.naturalWidth
    : fallbackHeight;
  return {
    top: -height / 2 + ENEMY_SPRITE_Y_OFFSET,
    bottom: height / 2 + ENEMY_SPRITE_Y_OFFSET,
    height,
  };
}

export function enemyShadowOffsetY(sprite: LoadedEnemySprite | undefined, enemyRadius: number) {
  return Math.max(10, enemySpriteVerticalBounds(sprite, enemyRadius).bottom - 2);
}

export type ActorStatus = {
  x: number;
  y: number;
  /** The top of the head or worn helmet in world space; the plate sits above it. */
  headTop?: number;
  identity?: string;
  name: string;
  gender?: PlayerGender;
  nameColor: string;
  hp: number;
  maxHp: number;
  power: number | null;
  fillColor: string;
};

export function createActorRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => Viewport;
  devicePixelRatio: () => number;
  gameTime: () => number;
  nowMs: () => number;
  localDeath: () => PlayerDeathAnimationState | null;
  remoteDeath: (identity: string) => PlayerDeathAnimationState | null;
  /** `gameTime`, when given, holds the idle pose at that moment instead of the frame clock's. */
  drawPlayerAppearance: (actor: { skinTone?: number; x: number; y: number; facing: number; combatFacing?: number | null; moving?: boolean; gameTime?: number; throwClock?: number; swordSpinClock?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string; weaponItem?: string; itemRefine?: (itemId: string) => number }, alpha: number) => void;
  localHeadItem: () => string;
  localChestItem: () => string;
  localFeetItem: () => string;
  localRightHandItem: () => string;
  localLeftHandItem: () => string;
  /** The weapon the local player fights with; the hand items above may be a look of another kind. */
  localWeaponItem?: () => string;
  equipmentForIdentity: (identity: string | undefined) => { headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
  /** A piece's sprite, in its refine look when `refineLevel` is given (player-appearance.ts equipmentSprite). */
  itemSprite: (itemId: string | undefined, refineLevel?: number) => HTMLImageElement | undefined;
  enemySprites: Record<string, LoadedEnemySprite>;
  enemies: EnemyState[];
  activeBossTarget: () => BossTarget | null;
  remoteAttackRange: number;
  duelPlatformArt: HTMLImageElement;
  player: PlayerState;
  rewardMultiplier: () => number;
  rewardAmount?: (type: EnemyDefinition["reward"]["type"], amount: number) => number;
  /** What attack speed and crit enemies' labels are worked out from, so they show what a kill gives now. */
  rewardContext?: () => RewardLabelContext;
  enemyTextVisible: (enemy: EnemyState) => boolean;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  /** Text in several colours as one snapped sprite (canvas.ts): the reward under an enemy. */
  outlinedSegments: OutlinedSegments;
  drawShadow: DrawShadow;
  drawStatus: (status: ActorStatus) => void;
  drawIdentity: (identity: string | undefined, name: string, power: number | null, centerX: number, headTop: number, color: string, gender?: PlayerGender) => void;
  drawSpeechBubble: (identity: string | undefined, x: number, headTop: number) => void;
  publicName: (identity: string | undefined, name: string | undefined) => string;
  worldHealthBarHeight: number;
  /** The map being drawn: its labels and plates replace the last map's on the shared pages. */
  mapId?: () => string;
}) {
  const { ctx, camera } = options;
  const sampleEnemyAnimation = createEnemyAnimationSampler();
  const screenX = (worldX: number) => snapWorldRenderCoordinate(worldX - camera.x, camera.zoom, options.devicePixelRatio());
  const screenY = (worldY: number) => snapWorldRenderCoordinate(worldY - camera.y, camera.zoom, options.devicePixelRatio());
  const enemyPlates = createEnemyOverheadPlates(options);
  const projectileCircleSprites = new Map<string, HTMLCanvasElement>();
  let arrowProjectileSprite: HTMLCanvasElement | null | undefined;


  function drawArrow(x: number, y: number, angle: number, offset = 0) {
    paintArrowProjectile(ctx, x, y, angle, offset);
  }

  function drawRock(itemId: string | undefined, x: number, y: number, angle: number, offset = 0) {
    return paintRockProjectile(ctx, options.itemSprite(itemId), itemId, x, y, angle, offset);
  }

  function arrowSprite() {
    if (arrowProjectileSprite !== undefined) return arrowProjectileSprite;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const target = canvas.getContext("2d");
    if (!target) return (arrowProjectileSprite = null);
    paintArrowProjectile(target, canvas.width / 2, canvas.height / 2, 0);
    arrowProjectileSprite = canvas;
    return canvas;
  }

  function paintPixelCircle(target: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const step = 4;
    const radiusSquared = radius * radius;
    for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
      const halfWidth = Math.sqrt(Math.max(0, radiusSquared - offsetY * offsetY));
      target.fillRect(Math.floor(x - halfWidth), Math.floor(y + offsetY), Math.ceil(halfWidth * 2), step);
    }
  }

  function projectileCircleSprite(radius: number, enemy: boolean) {
    const safeRadius = Math.max(1, Math.ceil(radius));
    const key = `${enemy ? "enemy" : "player"}:${safeRadius}`;
    const cached = projectileCircleSprites.get(key);
    if (cached) return cached;
    const outerRadius = safeRadius + 2;
    const padding = 4;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = (outerRadius + padding) * 2;
    const target = canvas.getContext("2d");
    if (!target) return null;
    const center = canvas.width / 2;
    target.fillStyle = enemy ? "#d67cff" : "#5a250d";
    paintPixelCircle(target, center, center, outerRadius);
    target.fillStyle = enemy ? "#f3c5ff" : "#ffe76a";
    paintPixelCircle(target, center, center, safeRadius);
    projectileCircleSprites.set(key, canvas);
    return canvas;
  }

  /** What the local player's shots look like: the look's own when it is the weapon's kind, else the weapon's. */
  function localShotItem() {
    return attackPoseItem(options.localRightHandItem() || options.localLeftHandItem(), options.localWeaponItem?.());
  }

  function webGLProjectileFrame(projectile: Projectile | EnemyShot, enemy = false): StaticWorldSpriteFrame | null {
    const x = screenX(projectile.x);
    const y = screenY(projectile.y);
    const weaponItem = localShotItem();
    const projectileKind = enemy ? undefined : projectileKindForWeapon(weaponItem);
    let source: HTMLCanvasElement | HTMLImageElement | null = null;
    const ammo = !enemy && projectileKind === "ARROW" && "ammo" in projectile ? projectile.ammo : null;
    const art = ammo ? arrowImage(ammo) : null;
    if (art) source = art;
    else if (projectileKind === "ARROW") source = arrowSprite();
    else if (projectileKind === "BOLT") source = boltSprite(staffBoltColor(weaponItem));
    else if (projectileKind === "ROCK") {
      const image = options.itemSprite(weaponItem);
      if (image?.complete && image.naturalWidth > 0) source = image;
    } else source = projectileCircleSprite(projectile.r, enemy);
    if (!source) return null;
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const { width, height } = art ? { width: ARROW_SPRITE_SIZE, height: ARROW_SPRITE_SIZE } : projectileKind === "ROCK"
      ? rockProjectileSize(weaponItem, sourceWidth, sourceHeight)
      : { width: sourceWidth, height: sourceHeight };
    const rotation = projectileKind === "ARROW" || projectileKind === "ROCK" || projectileKind === "BOLT"
      ? Math.atan2(projectile.vy, projectile.vx) + (art ? ARROW_ART_ROTATION : 0)
      : undefined;
    return { source, left: x - width / 2, top: y - height / 2, width, height, rotation };
  }

  /** Where an actor's plate starts: the top of its head, or of the helmet drawn on it. */
  function headTopY(actor: { y: number; headItem?: string; itemRefine?: (itemId: string) => number }) {
    const headItem = actor.headItem || undefined;
    return actor.y + headArtTopOffsetY(headItem, options.itemSprite(headItem, headItem ? actor.itemRefine?.(headItem) : 0));
  }

  function drawPlayerSprite(
    actor: { skinTone?: number; x: number; y: number; facing: number; combatFacing?: number | null; moving?: boolean; gameTime?: number; throwClock?: number; swordSpinClock?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string; weaponItem?: string; itemRefine?: (itemId: string) => number },
    alpha = 1,
  ) {
    options.drawPlayerAppearance(actor, alpha);
  }

  function drawDetachedEquipment(
    itemId: string | undefined,
    x: number,
    y: number,
    rotation: number,
    facing: number,
    refineLevel = 0,
  ) {
    const image = options.itemSprite(itemId, refineLevel);
    const presentation = itemPresentation(itemId)?.world;
    if (!image?.complete || image.naturalWidth <= 0 || presentation?.kind !== "SPRITE") return;
    const width = (presentation.width ?? image.naturalWidth) * .6;
    const height = (presentation.height ?? image.naturalHeight) * .6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (Math.cos(facing) < 0) ctx.scale(-1, 1);
    ctx.drawImage(residentDrawable(finishedEquipmentSprite(itemId, image)), -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function drawDeadPlayer(
    actor: { skinTone?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string; itemRefine?: (itemId: string) => number },
    death: PlayerDeathAnimationState,
    alpha: number,
    persistFinalPose = false,
  ) {
    const identity = actor.identity ?? actor.id ?? death.id;
    const pose = playerDeathPose(death.startedAtMs, options.nowMs(), identity);
    if (!pose.active && !persistFinalPose) return false;
    const x = screenX(death.x);
    const y = screenY(death.y);
    const fallProgress = Math.min(1, Math.abs(pose.bodyRotation) / (Math.PI / 2));
    options.drawShadow(x + pose.direction * 22 * fallProgress, y + 32, 34 + 34 * fallProgress, .18 * alpha);

    ctx.save();
    ctx.translate(x, y + 29 + pose.bodyGroundOffsetY);
    ctx.rotate(pose.bodyRotation);
    ctx.scale(1, pose.bodyScaleY);
    drawPlayerSprite({
      ...actor,
      x: 0,
      y: -29,
      facing: death.facing,
      combatFacing: null,
      moving: false,
      // A fallen body is still: the idle head bob would keep the head nodding on the ground.
      gameTime: 0,
      throwClock: 0,
      headItem: "",
      rightHandItem: "",
      leftHandItem: "",
    }, alpha);
    ctx.restore();

    const groundX = x;
    const groundY = y + 29;
    const weapon = actor.rightHandItem || actor.leftHandItem;
    drawDetachedEquipment(
      actor.headItem,
      groundX + pose.helmetOffsetX,
      groundY - 49 + pose.helmetOffsetY,
      pose.helmetRotation,
      death.facing,
      actor.headItem ? actor.itemRefine?.(actor.headItem) : 0,
    );
    drawDetachedEquipment(
      weapon,
      groundX + pose.weaponOffsetX,
      groundY - 16 + pose.weaponOffsetY,
      pose.weaponRotation,
      death.facing,
      weapon ? actor.itemRefine?.(weapon) : 0,
    );
    return true;
  }

  function clientCombatFacing(actor: { x: number; y: number }) {
    let target: EnemyState | BossTarget | null = null;
    let bestDistanceSquared = options.remoteAttackRange * options.remoteAttackRange;
    for (const enemy of options.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - actor.x;
      const dy = enemy.y - actor.y;
      const candidateDistanceSquared = dx * dx + dy * dy;
      if (candidateDistanceSquared >= bestDistanceSquared) continue;
      bestDistanceSquared = candidateDistanceSquared;
      target = enemy;
    }
    const boss = options.activeBossTarget();
    if (boss && !boss.dead) {
      const centerDistance = Math.hypot(actor.x - boss.x, actor.y - boss.y);
      const edgeDistance = Math.max(0, centerDistance - boss.r);
      if (edgeDistance * edgeDistance < bestDistanceSquared) target = boss;
    }
    return target ? Math.atan2(target.y - actor.y, target.x - actor.x) : null;
  }

  function drawDuelArena(show: boolean, center: { x: number; y: number; r: number }) {
    if (!show) return;

    const x = screenX(center.x);
    const y = screenY(center.y);
    const radius = center.r * .75;
    if (options.duelPlatformArt.complete && options.duelPlatformArt.naturalWidth > 0) {
      const size = radius * 2.16;
      ctx.drawImage(options.duelPlatformArt, x - size / 2, y - size / 2, size, size);
      return;
    }
  }

  function drawDuelScene(scene: DuelScene) {
    for (const shot of scene.shots) {
      if (isMeleeWeapon(shot.weaponItem)) continue;
      const x = screenX(shot.x);
      const y = screenY(shot.y);
      const projectileKind = projectileKindForWeapon(shot.weaponItem);
      if (projectileKind === "ARROW") {
        drawArrow(x, y, shot.angle);
        continue;
      }
      if (projectileKind === "BOLT") {
        drawBolt(ctx, x, y, shot.angle, staffBoltColor(shot.weaponItem));
        continue;
      }
      if (projectileKind === "ROCK" && drawRock(shot.weaponItem, x, y, shot.angle)) continue;
      ctx.fillStyle = shot.color;
      options.pixelCircle(x, y, 6);
    }
    drawDuelCombatant(scene.challenger);
    drawDuelCombatant(scene.opponent);
  }

  function drawDuelCombatant(actor: DuelCombatant) {
    const x = screenX(actor.x);
    const y = screenY(actor.y);
    // Our own gear shows its refine looks; another player's refines are not known here, so theirs show the base look.
    const appearance = { ...options.equipmentForIdentity(actor.identity), ...actor, ...(actor.isLocal ? { itemRefine: localItemRefine } : {}) };
    const death = actor.deathStartedAtMs === undefined ? null : {
      id: actor.identity ?? actor.name,
      x: actor.x,
      y: actor.y,
      facing: actor.facing,
      startedAtMs: actor.deathStartedAtMs,
    };
    if (!death || !drawDeadPlayer(appearance, death, 1, true)) {
      options.drawShadow(x, y + 29, 34, actor.isLocal ? .21 : .17);
      drawPlayerSprite({ ...appearance, x, y }, 1);
    }
    // Duels always show both plates, whatever Show My Name Plate says.
    options.drawStatus({
      x,
      y,
      headTop: headTopY({ ...appearance, y }),
      identity: actor.identity,
      name: options.publicName(actor.identity, actor.name),
      gender: actor.gender,
      nameColor: actor.isLocal ? "#ffffff" : "#9eeeff",
      hp: actor.hp,
      maxHp: actor.maxHp,
      power: null,
      fillColor: actor.isLocal ? "#46cf5a" : "#55a9c6",
    });
  }

  function drawPlayer(identity: string | undefined, name: string, power: number) {
    const player = options.player;
    const equipment = {
      headItem: options.localHeadItem(),
      chestItem: options.localChestItem(),
      feetItem: options.localFeetItem(),
      rightHandItem: options.localRightHandItem(),
      leftHandItem: options.localLeftHandItem(),
      weaponItem: options.localWeaponItem?.(),
      itemRefine: localItemRefine,
    };
    const death = options.localDeath();
    if (death && drawDeadPlayer({ ...equipment, identity }, death, 1)) return;
    const x = screenX(player.x);
    const y = screenY(player.y);
    options.drawShadow(x, y + 29, 34, .21);
    drawPlayerSprite({ ...player, ...equipment, x, y, identity });
    const headTop = headTopY({ ...equipment, y });
    if (ownNamePlateEnabled()) options.drawStatus({
      x,
      y,
      headTop,
      identity,
      name,
      nameColor: "#ffffff",
      hp: player.hp,
      maxHp: player.maxHp,
      power,
      fillColor: "#46cf5a",
    });
    options.drawSpeechBubble(identity, x, headTop);
  }

  function drawRemotePlayer(other: RemotePlayer) {
    const viewport = options.viewport();
    const width = viewport.width / camera.zoom;
    const height = viewport.height / camera.zoom;

    const death = options.remoteDeath(other.id);
    const renderX = death?.x ?? other.x;
    const renderY = death?.y ?? other.y;
    const x = screenX(renderX);
    const y = screenY(renderY);
    if (x < -65 || y < -70 || x > width + 65 || y > height + 70) return;

    // A drawn player carries its own gear: looking it up rebuilt every player on the map, once per player drawn.
    const equipment = other;
    if (death && drawDeadPlayer(other, death, 1)) return;

    const regularEnemyCombat = other.regularEnemyCombat;
    const attack = regularEnemyCombat;
    const attackCritical = regularEnemyCombat?.critical;
    // Shots are the weapon's (known while fighting), whatever look is drawn.
    const shotItem = attackPoseItem(equipment.rightHandItem || equipment.leftHandItem, other.weaponItem);
    if (attack && !isMeleeWeapon(shotItem) && attack.projectileProgress > 0 && attack.projectileProgress < 1) {
      const dx = attack.targetX - other.x;
      const dy = attack.targetY - other.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      const startX = other.x + ux * 20;
      const startY = other.y + uy * 20;
      const endX = attack.targetX - ux * attack.targetRadius * .72;
      const endY = attack.targetY - uy * attack.targetRadius * .72;
      const progress = attack.projectileProgress * (2 - attack.projectileProgress);
      const projectileX = screenX(startX + (endX - startX) * progress);
      const projectileY = screenY(startY + (endY - startY) * progress);
      const visibleHits = Math.min(5, attack.hits);
      const weaponItem = shotItem;
      const projectileKind = projectileKindForWeapon(weaponItem);
      for (let index = 0; index < visibleHits; index += 1) {
        const offset = (index - (visibleHits - 1) / 2) * 9;
        if (attackCritical) {
          ctx.save();
          ctx.globalAlpha = .38;
          ctx.fillStyle = "#ffe36b";
          options.pixelCircle(projectileX, projectileY + offset, 10);
          ctx.restore();
        }
        if (projectileKind === "ARROW") drawArrow(projectileX, projectileY, Math.atan2(dy, dx), offset);
        else if (projectileKind === "BOLT") drawBolt(ctx, projectileX, projectileY + offset, Math.atan2(dy, dx), staffBoltColor(weaponItem));
        else if (projectileKind !== "ROCK" || !drawRock(weaponItem, projectileX, projectileY, Math.atan2(dy, dx), offset)) {
          ctx.save(); ctx.translate(projectileX, projectileY);
          ctx.fillStyle = "#ffe76a";
          options.pixelCircle(0, offset, 6);
          ctx.restore();
        }
      }
    }

    const weaponItem = equipment.rightHandItem || equipment.leftHandItem;
    const combatFacing = attack
      ? Math.atan2(attack.targetY - other.y, attack.targetX - other.x)
      : weaponItem ? clientCombatFacing(other) : null;
    options.drawShadow(x, y + 29, 34, .16);
    drawPlayerSprite({ ...other, x, y, facing: combatFacing ?? other.facing, combatFacing }, 1);
    const headTop = headTopY({ ...other, y });
    if (regularEnemyCombat) {
      options.drawStatus({
        x,
        y,
        headTop,
        identity: other.id,
        name: options.publicName(other.id, other.name),
        nameColor: "#9eeeff",
        hp: regularEnemyCombat.hp,
        maxHp: regularEnemyCombat.maxHp,
        power: Number.isFinite(other.power) ? other.power : 0,
        fillColor: "#55a9c6",
      });
    } else {
      options.drawIdentity(
        other.id,
        options.publicName(other.id, other.name),
        Number.isFinite(other.power) ? other.power : 0,
        x,
        headTop,
        "#9eeeff",
      );
    }
    options.drawSpeechBubble(other.id, x, headTop);
  }

  function drawRemotePlayers(players: RemotePlayer[]) {
    for (const other of players) drawRemotePlayer(other);
  }

  function drawLayeredEnemyPlaceholder(sprite: LoadedEnemySprite, bounds: { top: number; bottom: number }, color: string, visibility = 1) {
    const width = Math.max(22, sprite.size * .48);
    const headRadius = width * .28;
    const headY = bounds.top + headRadius + 5;
    const torsoTop = headY + headRadius * .55;
    const torsoBottom = bounds.bottom - 8;
    ctx.save();
    ctx.globalAlpha = .24 * visibility;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, headY, headRadius, headRadius * .9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-width / 2, torsoTop, width, Math.max(8, torsoBottom - torsoTop));
    ctx.fillRect(-width * .36, torsoBottom, width * .22, 8);
    ctx.fillRect(width * .14, torsoBottom, width * .22, 8);
    ctx.restore();
  }

  function drawEnemy(enemy: EnemyState, opacity = 1) {
    const deathProgress = clamp(enemy.remoteCombatDeathProgress ?? 0, 0, 1);
    const visibility = clamp(opacity * (1 - deathProgress), 0, 1);
    if (visibility <= 0) return;
    const viewport = options.viewport();
    const width = viewport.width / camera.zoom;
    const height = viewport.height / camera.zoom;
    const x = screenX(enemy.x);
    const y = screenY(enemy.y);
    if (enemy.trainingDummy) {
      if (x < -120 || y < -40 || x > width + 120 || y > height + 160) return;
      drawTrainingDummy(ctx, { x, y, zoom: camera.zoom, now: performance.now() / 1_000, dummy: enemy.trainingDummy, drawShadow: options.drawShadow, outlinedText: options.outlinedText });
      return;
    }
    const base = enemy.definition ?? ENEMY_TYPES[enemy.type];
    const sourceSprite = options.enemySprites[enemy.type];
    // An Endless boss is its map's enemy drawn at twice the size, as its hitbox is.
    const spriteScale = enemy.generatedBoss ? GENERATED_BOSS_SIZE : enemy.spriteScale ?? 1;
    const sprite = sourceSprite && scaledEnemySprite(sourceSprite, spriteScale);
    const margin = Math.max(80, sprite?.size ?? 0);
    if (x < -margin || y < -margin || x > width + margin || y > height + margin) return;
    const layers = sprite?.layers;
    const image = sprite?.image;
    const imageReady = Boolean(image?.complete && image.naturalWidth > 0);
    // Layered and atlas art draw at their own pixel size, so they take the scale on the canvas;
    // a single image takes it through its size.
    const artScale = layers ? spriteScale : 1;
    const unscaledBounds = enemySpriteVerticalBounds(sprite, enemy.r);
    const spriteBounds = artScale === 1 ? unscaledBounds
      : { top: unscaledBounds.top * artScale, bottom: unscaledBounds.bottom * artScale, height: unscaledBounds.height * artScale };
    const spriteHeight = spriteBounds.height;
    if (!sprite?.animation?.hasBakedShadow) {
      const shadowWidth = spriteScale !== 1 ? (sprite?.size ?? enemy.r * 2) * .6 : Math.max(34, Math.min(76, (sprite?.size ?? enemy.r * 2) * .9));
      const shadowY = y + enemyShadowOffsetY(sprite, enemy.r) * artScale;
      options.drawShadow(x, shadowY, shadowWidth, .36 * visibility);
    }

    ctx.save();
    ctx.translate(x, y);
    if (deathProgress > 0) {
      ctx.translate(0, deathProgress * 11);
      ctx.rotate(deathProgress * .42 * enemy.facingX);
      ctx.scale(1 + deathProgress * .16, Math.max(.08, 1 - deathProgress * .9));
    }
    if (enemy.facingX < 0) ctx.scale(-1, 1);

    const combatTarget = {
      x: enemy.combatTargetX ?? options.player.x,
      y: enemy.combatTargetY ?? options.player.y,
    };
    if (layers && sprite) {
      ctx.save();
      if (artScale !== 1) ctx.scale(artScale, artScale);
      ctx.globalAlpha = visibility;
      if (sprite.animation) {
        const animation = sprite.animation;
        const frame = sampleEnemyAnimation(enemy, animation, options.gameTime(), base.attackSpeed);
        const page = animation.pages[frame.page];
        if (page.image.complete && page.image.naturalWidth > 0 && page.image.naturalHeight > 0) {
          ctx.save();
          // Normalize source art around its fixed actor origin, independently
          // of world facing and any original aimed equipment layers.
          if (animation.sourceFacingX === -1) ctx.scale(-1, 1);
          ctx.drawImage(decodedImage(page.image), frame.x, frame.y, frame.w, frame.h,
            animation.x, animation.y + ENEMY_SPRITE_Y_OFFSET + (sprite.visualOffsetY ?? 0), animation.w, animation.h);
          ctx.restore();
        } else {
          drawLayeredEnemyPlaceholder(sprite, spriteBounds, base.outline, visibility);
        }
      }
      const layerPlan = cachedEnemyLayerPlan(sprite);
      if (layerPlan) {
        for (const part of layerPlan) {
          if (part.kind === "STATIC") {
            ctx.drawImage(part.image, part.x, part.y);
            continue;
          }
          const layer = part.layer;
          const pivot = layer.aimPivot;
          if (!pivot) continue;
          ctx.save();
          ctx.translate(pivot.x, pivot.y + ENEMY_SPRITE_Y_OFFSET);
          ctx.rotate(enemyWeaponLayerRotation(enemy, combatTarget, layer.aimOffsetRadians, pivot));
          ctx.drawImage(
            residentDrawable(tintedEnemyLayerImage(layer)),
            layer.x - pivot.x,
            layer.y - pivot.y,
            layer.w,
            layer.h,
          );
          ctx.restore();
        }
      } else {
        const readyLayers = drawableEnemyLayers(layers);
        if (!sprite.animation && readyLayers.length < layers.length) drawLayeredEnemyPlaceholder(sprite, spriteBounds, base.outline, visibility);
        for (const layer of readyLayers) {
          if (layer.aimPivot) {
            ctx.save();
            ctx.translate(layer.aimPivot.x, layer.aimPivot.y + ENEMY_SPRITE_Y_OFFSET);
            ctx.rotate(enemyWeaponLayerRotation(enemy, combatTarget, layer.aimOffsetRadians, layer.aimPivot));
            ctx.drawImage(
              residentDrawable(tintedEnemyLayerImage(layer)),
              layer.x - layer.aimPivot.x,
              layer.y - layer.aimPivot.y,
              layer.w,
              layer.h,
            );
            ctx.restore();
          } else {
            ctx.drawImage(residentDrawable(tintedEnemyLayerImage(layer)), layer.x, layer.y + ENEMY_SPRITE_Y_OFFSET, layer.w, layer.h);
          }
        }
      }
      ctx.restore();
    } else if (imageReady && image && sprite) {
      ctx.globalAlpha = visibility;
      ctx.drawImage(
        residentDrawable(image),
        -sprite.size / 2,
        -spriteHeight / 2 + ENEMY_SPRITE_Y_OFFSET,
        sprite.size,
        spriteHeight,
      );
    } else {
      ctx.globalAlpha = visibility;
      ctx.fillStyle = base.outline;
      options.pixelCircle(0, 0, enemy.r + 3);
      ctx.fillStyle = enemy.hurt > 0 ? "#fff3d0" : base.color;
      options.pixelCircle(0, 0, enemy.r);
    }
    // Slowed (Frost Nova, or a chill card): a pale blue glaze over the body and a frost ring at its feet.
    if (enemy.cardStatus?.slow && deathProgress <= 0) {
      const glaze = (sprite?.size ?? enemy.r * 2) * .42;
      // Plain blending: an additive glaze per slowed enemy, every frame, is slow to draw in Firefox.
      ctx.globalAlpha = .22 * visibility;
      ctx.fillStyle = "#bfeaff";
      ctx.beginPath(); ctx.ellipse(0, (spriteBounds.top + spriteBounds.bottom) / 2, glaze, (spriteBounds.bottom - spriteBounds.top) * .5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .7 * visibility;
      ctx.strokeStyle = "#bdeeff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, spriteBounds.bottom - 2, glaze, glaze * .32, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    if (enemy.hideStatus || !options.enemyTextVisible(enemy) || deathProgress > 0) return;

    enemyPlates.draw(enemy, x, y, spriteBounds.top, spriteBounds.bottom, sprite?.size ?? enemy.r * 2, visibility);
  }

  function drawProjectile(projectile: Projectile | EnemyShot, enemy = false) {
    const x = screenX(projectile.x);
    const y = screenY(projectile.y);
    const weaponItem = localShotItem();
    const projectileKind = !enemy
      ? projectileKindForWeapon(weaponItem)
      : undefined;
    if (projectileKind === "ARROW") {
      const angle = Math.atan2(projectile.vy, projectile.vx), ammo = "ammo" in projectile ? projectile.ammo : null;
      const art = ammo ? arrowImage(ammo) : null;
      // A crafted arrow flies as its own art (arrow-images.ts).
      if (art) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle + ARROW_ART_ROTATION);
        ctx.drawImage(residentDrawable(art), -ARROW_SPRITE_SIZE / 2, -ARROW_SPRITE_SIZE / 2, ARROW_SPRITE_SIZE, ARROW_SPRITE_SIZE);
        ctx.restore();
      } else drawArrow(x, y, angle);
      return;
    }
    if (projectileKind === "BOLT") {
      drawBolt(ctx, x, y, Math.atan2(projectile.vy, projectile.vx), staffBoltColor(weaponItem));
      return;
    }
    if (projectileKind === "ROCK" && drawRock(weaponItem, x, y, Math.atan2(projectile.vy, projectile.vx))) return;
    ctx.fillStyle = enemy ? "#d67cff" : "#5a250d";
    options.pixelCircle(x, y, projectile.r + 2);
    ctx.fillStyle = enemy ? "#f3c5ff" : "#ffe76a";
    options.pixelCircle(x, y, projectile.r);
  }

  return {
    drawDuelArena,
    drawDuelScene,
    drawPlayer,
    drawRemotePlayer,
    drawRemotePlayers,
    drawEnemy,
    drawProjectile,
    webGLProjectileFrame,
  };
}
