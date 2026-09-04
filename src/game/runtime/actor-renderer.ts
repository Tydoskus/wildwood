import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition, type LoadedEnemySprite, type LoadedSpriteLayer } from "../enemies";
import { clamp } from "../math";
import { formatCompactNumber } from "../../ui/number-format";
import type { RemotePlayer } from "../../wildstat-coop";
import type { PlayerGender } from "../../../shared/player-gender";
import type { Camera } from "./camera";
import { healthBarTextY } from "./health-bar-layout";
import type { BossTarget, DuelCombatant, DuelScene, EnemyShot, EnemyState, PlayerState, Projectile } from "./types";
import { itemPresentation, projectileKindForWeapon } from "../item-presentation";
import { playerDeathPose, type PlayerDeathAnimationState } from "./player-death-animation";
import type { StaticWorldSpriteFrame } from "./webgl-static-world-layer";
import { drawScreenSpaceAt, snapWorldRenderCoordinate } from "./render-space";
import { createTintedImageCanvas } from "./image-tint";
import { PLAYER_WORLD_SCALE } from "../player-render-scale";
import { createEnemyAnimationSampler } from "./enemy-animation";

export function rockProjectileSize(itemId: string | undefined, naturalWidth: number, naturalHeight: number) {
  const held = itemPresentation(itemId)?.world;
  return {
    width: (held?.kind === "SPRITE" ? held.width ?? naturalWidth : naturalWidth) * PLAYER_WORLD_SCALE,
    height: (held?.kind === "SPRITE" ? held.height ?? naturalHeight : naturalHeight) * PLAYER_WORLD_SCALE,
  };
}

type Viewport = { width: number; height: number };
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type LabelBitmap = { canvas: HTMLCanvasElement; width: number; height: number; anchorY: number };
type LabelSegment = { text: string; color: string };
type EnemyLayerPlanPart =
  | { kind: "STATIC"; canvas: HTMLCanvasElement; x: number; y: number }
  | { kind: "AIMED"; layer: LoadedSpriteLayer };
const ENEMY_SPRITE_Y_OFFSET = -3;
const enemyLayerPlanCache = new WeakMap<LoadedEnemySprite, EnemyLayerPlanPart[]>();
const enemyBoundsCache = new WeakMap<LoadedEnemySprite, { top: number; bottom: number; height: number }>();
const enemyTintedLayerCache = new WeakMap<LoadedSpriteLayer, HTMLCanvasElement>();

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
    plan.push({ kind: "STATIC", canvas, x: left, y: top });
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
) {
  // Enemy art is assembled facing right. Convert the world-space target into
  // that local coordinate system before the whole actor is mirrored.
  return Math.atan2(target.y - enemy.y, (target.x - enemy.x) * enemy.facingX);
}

export function enemyWeaponLayerRotation(
  enemy: Pick<EnemyState, "x" | "y" | "facingX" | "engaged">,
  target: Pick<PlayerState, "x" | "y">,
  sourceOffsetRadians = 0,
) {
  return sourceOffsetRadians + (enemy.engaged ? enemyWeaponAimRotation(enemy, target) : 0);
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
  drawPlayerAppearance: (actor: { x: number; y: number; facing: number; combatFacing?: number | null; moving?: boolean; throwClock?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string }, alpha: number) => void;
  localHeadItem: () => string;
  localChestItem: () => string;
  localFeetItem: () => string;
  localRightHandItem: () => string;
  localLeftHandItem: () => string;
  equipmentForIdentity: (identity: string | undefined) => { headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
  itemSprite: (itemId: string | undefined) => HTMLImageElement | undefined;
  enemySprites: Record<string, LoadedEnemySprite>;
  enemies: EnemyState[];
  activeBossTarget: () => BossTarget | null;
  remoteAttackRange: number;
  duelPlatformArt: HTMLImageElement;
  player: PlayerState;
  rewardMultiplier: () => number;
  enemyTextVisible: (enemy: EnemyState) => boolean;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  drawShadow: DrawShadow;
  drawStatus: (status: ActorStatus) => void;
  drawIdentity: (identity: string | undefined, name: string, power: number | null, centerX: number, bottom: number, color: string, gender?: PlayerGender) => void;
  drawSpeechBubble: (identity: string | undefined, x: number, y: number) => void;
  publicName: (identity: string | undefined, name: string | undefined) => string;
  worldHealthBarHeight: number;
}) {
  const { ctx, camera } = options;
  const sampleEnemyAnimation = createEnemyAnimationSampler();
  const screenX = (worldX: number) => snapWorldRenderCoordinate(worldX - camera.x, camera.zoom, options.devicePixelRatio());
  const screenY = (worldY: number) => snapWorldRenderCoordinate(worldY - camera.y, camera.zoom, options.devicePixelRatio());
  const enemyLabelCache = new Map<string, { name: LabelBitmap; reward: LabelBitmap }>();
  const enemyLabelFont = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
  const projectileCircleSprites = new Map<string, HTMLCanvasElement>();
  let arrowProjectileSprite: HTMLCanvasElement | null | undefined;

  function paintArrow(target: CanvasRenderingContext2D, x: number, y: number, angle: number, offset = 0) {
    target.save();
    target.translate(x, y);
    target.rotate(angle);
    target.translate(0, offset);
    target.lineCap = "round";
    target.strokeStyle = "#160b07";
    target.lineWidth = 5;
    target.beginPath(); target.moveTo(-10, 0); target.lineTo(8, 0); target.stroke();
    target.strokeStyle = "#f4ce84";
    target.lineWidth = 2;
    target.beginPath(); target.moveTo(-10, 0); target.lineTo(8, 0); target.stroke();
    target.fillStyle = "#160b07";
    target.beginPath(); target.moveTo(13, 0); target.lineTo(5, -6); target.lineTo(5, 6); target.closePath(); target.fill();
    target.fillStyle = "#d7e8ee";
    target.beginPath(); target.moveTo(10, 0); target.lineTo(6, -3); target.lineTo(6, 3); target.closePath(); target.fill();
    target.strokeStyle = "#160b07";
    target.lineWidth = 3;
    target.beginPath(); target.moveTo(-9, 0); target.lineTo(-13, -4); target.moveTo(-9, 0); target.lineTo(-13, 4); target.stroke();
    target.restore();
  }

  function drawArrow(x: number, y: number, angle: number, offset = 0) {
    paintArrow(ctx, x, y, angle, offset);
  }

  function drawRock(itemId: string | undefined, x: number, y: number, angle: number, offset = 0) {
    const image = options.itemSprite(itemId);
    if (!image?.complete || image.naturalWidth <= 0) return false;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const { width, height } = rockProjectileSize(itemId, image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, -width / 2, offset - height / 2, width, height);
    ctx.restore();
    return true;
  }

  function arrowSprite() {
    if (arrowProjectileSprite !== undefined) return arrowProjectileSprite;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const target = canvas.getContext("2d");
    if (!target) return (arrowProjectileSprite = null);
    paintArrow(target, canvas.width / 2, canvas.height / 2, 0);
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

  function webGLProjectileFrame(projectile: Projectile | EnemyShot, enemy = false): StaticWorldSpriteFrame | null {
    const x = screenX(projectile.x);
    const y = screenY(projectile.y);
    const weaponItem = options.localRightHandItem() || options.localLeftHandItem();
    const projectileKind = enemy ? undefined : projectileKindForWeapon(weaponItem);
    let source: HTMLCanvasElement | HTMLImageElement | null = null;
    if (projectileKind === "ARROW") source = arrowSprite();
    else if (projectileKind === "ROCK") {
      const image = options.itemSprite(weaponItem);
      if (image?.complete && image.naturalWidth > 0) source = image;
    } else source = projectileCircleSprite(projectile.r, enemy);
    if (!source) return null;
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const { width, height } = projectileKind === "ROCK"
      ? rockProjectileSize(weaponItem, sourceWidth, sourceHeight)
      : { width: sourceWidth, height: sourceHeight };
    const rotation = projectileKind === "ARROW" || projectileKind === "ROCK"
      ? Math.atan2(projectile.vy, projectile.vx)
      : undefined;
    return { source, left: x - width / 2, top: y - height / 2, width, height, rotation };
  }

  function createLabelBitmap(segments: LabelSegment[], baseline: CanvasTextBaseline): LabelBitmap {
    const scale = 3;
    const paddingX = 5;
    const paddingY = 3;
    const canvas = document.createElement("canvas");
    const labelCtx = canvas.getContext("2d");
    if (!labelCtx) return { canvas, width: 0, height: 0, anchorY: 0 };
    labelCtx.font = enemyLabelFont;
    const textWidth = segments.reduce((width, segment) => width + labelCtx.measureText(segment.text).width, 0);
    const width = Math.ceil(textWidth + paddingX * 2);
    const height = 19;
    canvas.width = width * scale;
    canvas.height = height * scale;
    labelCtx.setTransform(scale, 0, 0, scale, 0, 0);
    labelCtx.font = enemyLabelFont;
    labelCtx.textAlign = "left";
    labelCtx.textBaseline = baseline;
    labelCtx.lineJoin = "round";
    labelCtx.lineWidth = 4;
    let x = paddingX;
    const y = baseline === "top" ? paddingY : height - paddingY;
    for (const segment of segments) {
      labelCtx.strokeStyle = "#000";
      labelCtx.strokeText(segment.text, x, y);
      labelCtx.fillStyle = segment.color;
      labelCtx.fillText(segment.text, x, y);
      x += labelCtx.measureText(segment.text).width;
    }
    return { canvas, width, height, anchorY: y };
  }

  function enemyLabels(type: string, reward: EnemyDefinition["reward"]) {
    const cacheKey = `${type}:${reward.amount}`;
    const cached = enemyLabelCache.get(cacheKey);
    if (cached) return cached;
    const labels = {
      name: createLabelBitmap([{ text: type, color: "#f5e9c4" }], "bottom"),
      reward: createLabelBitmap([
        { text: rewardAmountLabel(reward), color: "#ffffff" },
        { text: " ", color: "#ffffff" },
        { text: rewardStatLabel(reward), color: REWARD_DATA[reward.type].color },
      ], "top"),
    };
    enemyLabelCache.set(cacheKey, labels);
    return labels;
  }

  function drawPlayerSprite(
    actor: { x: number; y: number; facing: number; combatFacing?: number | null; moving?: boolean; throwClock?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string },
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
  ) {
    const image = options.itemSprite(itemId);
    const presentation = itemPresentation(itemId)?.world;
    if (!image?.complete || image.naturalWidth <= 0 || presentation?.kind !== "SPRITE") return;
    const width = (presentation.width ?? image.naturalWidth) * .6;
    const height = (presentation.height ?? image.naturalHeight) * .6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (Math.cos(facing) < 0) ctx.scale(-1, 1);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function drawDeadPlayer(
    actor: { identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string },
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
      throwClock: 0,
      headItem: "",
      rightHandItem: "",
      leftHandItem: "",
    }, alpha);
    ctx.restore();

    const groundX = x;
    const groundY = y + 29;
    drawDetachedEquipment(
      actor.headItem,
      groundX + pose.helmetOffsetX,
      groundY - 49 + pose.helmetOffsetY,
      pose.helmetRotation,
      death.facing,
    );
    drawDetachedEquipment(
      actor.rightHandItem || actor.leftHandItem,
      groundX + pose.weaponOffsetX,
      groundY - 16 + pose.weaponOffsetY,
      pose.weaponRotation,
      death.facing,
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

    ctx.save();
    ctx.fillStyle = "#697174";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#aeb8ba";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(235,239,238,.46)";
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.arc(x, y, radius - 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawDuelScene(scene: DuelScene) {
    for (const shot of scene.shots) {
      const x = screenX(shot.x);
      const y = screenY(shot.y);
      const projectileKind = projectileKindForWeapon(shot.weaponItem);
      if (projectileKind === "ARROW") {
        drawArrow(x, y, shot.angle);
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
    const appearance = { ...options.equipmentForIdentity(actor.identity), ...actor };
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
    options.drawStatus({
      x,
      y,
      identity: actor.identity,
      name: actor.name,
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
    };
    const death = options.localDeath();
    if (death && drawDeadPlayer({ ...equipment, identity }, death, 1)) return;
    const x = screenX(player.x);
    const y = screenY(player.y);
    options.drawShadow(x, y + 29, 34, .21);
    drawPlayerSprite({ ...player, ...equipment, x, y, identity });
    options.drawStatus({
      x,
      y,
      identity,
      name,
      nameColor: "#ffffff",
      hp: player.hp,
      maxHp: player.maxHp,
      power,
      fillColor: "#46cf5a",
    });
    options.drawSpeechBubble(identity, x, y);
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

    const equipment = options.equipmentForIdentity(other.id);
    if (death && drawDeadPlayer({ ...other, ...equipment }, death, 1)) return;

    const regularEnemyCombat = other.regularEnemyCombat;
    const attack = other.bossAttack ?? regularEnemyCombat;
    const attackCritical = !other.bossAttack && regularEnemyCombat?.critical;
    if (attack && attack.projectileProgress > 0 && attack.projectileProgress < 1) {
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
      const weaponItem = equipment.rightHandItem || equipment.leftHandItem;
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
    drawPlayerSprite({ ...other, ...equipment, x, y, facing: combatFacing ?? other.facing, combatFacing }, 1);
    if (regularEnemyCombat) {
      options.drawStatus({
        x,
        y,
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
        y - 49,
        "#9eeeff",
      );
    }
    options.drawSpeechBubble(other.id, x, y);
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
    if (x < -80 || y < -80 || x > width + 80 || y > height + 80) return;

    const base = ENEMY_TYPES[enemy.type];
    const sprite = options.enemySprites[enemy.type];
    const layers = sprite?.layers;
    const image = sprite?.image;
    const imageReady = Boolean(image?.complete && image.naturalWidth > 0);
    const spriteBounds = enemySpriteVerticalBounds(sprite, enemy.r);
    const spriteHeight = spriteBounds.height;
    if (!sprite?.animation?.hasBakedShadow) {
      const shadowWidth = Math.max(34, Math.min(76, (sprite?.size ?? enemy.r * 2) * .9));
      const shadowY = y + enemyShadowOffsetY(sprite, enemy.r);
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
      ctx.globalAlpha = (enemy.hurt > 0 ? .7 : 1) * visibility;
      if (sprite.animation) {
        const animation = sprite.animation;
        const frame = sampleEnemyAnimation(enemy, animation, options.gameTime(), base.attackSpeed);
        const page = animation.pages[frame.page];
        if (page.image.complete && page.image.naturalWidth > 0 && page.image.naturalHeight > 0) {
          ctx.save();
          // Normalize source art around its fixed actor origin, independently
          // of world facing and any original aimed equipment layers.
          if (animation.sourceFacingX === -1) ctx.scale(-1, 1);
          ctx.drawImage(page.image, frame.x, frame.y, frame.w, frame.h,
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
            ctx.drawImage(part.canvas, part.x, part.y);
            continue;
          }
          const layer = part.layer;
          const pivot = layer.aimPivot;
          if (!pivot) continue;
          ctx.save();
          ctx.translate(pivot.x, pivot.y + ENEMY_SPRITE_Y_OFFSET);
          ctx.rotate(enemyWeaponLayerRotation(enemy, combatTarget, layer.aimOffsetRadians));
          ctx.drawImage(
            tintedEnemyLayerImage(layer),
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
            ctx.rotate(enemyWeaponLayerRotation(enemy, combatTarget, layer.aimOffsetRadians));
            ctx.drawImage(
              tintedEnemyLayerImage(layer),
              layer.x - layer.aimPivot.x,
              layer.y - layer.aimPivot.y,
              layer.w,
              layer.h,
            );
            ctx.restore();
          } else {
            ctx.drawImage(tintedEnemyLayerImage(layer), layer.x, layer.y + ENEMY_SPRITE_Y_OFFSET, layer.w, layer.h);
          }
        }
      }
    } else if (imageReady && image && sprite) {
      ctx.globalAlpha = (enemy.hurt > 0 ? .7 : 1) * visibility;
      ctx.drawImage(
        image,
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
    ctx.restore();

    if (!options.enemyTextVisible(enemy) || deathProgress > 0) return;

    const spriteTop = spriteBounds.top;
    const spriteBottom = spriteBounds.bottom;
    const rewardY = spriteBottom * camera.zoom + 13;
    const barW = Math.max(56, Math.min(94, (sprite?.size ?? enemy.r * 2) * 1.26)) * 1.05;
    const barH = options.worldHealthBarHeight;
    const barX = -barW / 2;
    const barCenterX = barX + barW / 2;
    const barY = spriteTop * camera.zoom - 14;
    const displayedHp = enemy.remoteCombatHp ?? enemy.hp;
    const hpRatio = clamp(displayedHp / enemy.maxHp, 0, 1);
    const hpLabel = `${formatCompactNumber(Math.max(0, Math.ceil(displayedHp)))} / ${formatCompactNumber(Math.ceil(enemy.maxHp))}`;

    drawScreenSpaceAt(ctx, camera.zoom, x, y, () => {
      ctx.globalAlpha = visibility;
      ctx.fillStyle = "rgba(0,0,0,.86)";
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = "#472225";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = enemy.hurt > 0 ? "#fff1b6" : "#55d568";
      ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

      ctx.textAlign = "center";
      const labels = enemyLabels(enemy.type, { ...enemy.reward, amount: enemy.reward.amount * options.rewardMultiplier() });
      ctx.drawImage(labels.name.canvas, -labels.name.width / 2, barY - 4 - labels.name.anchorY, labels.name.width, labels.name.height);

      ctx.font = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      ctx.textBaseline = "middle";
      options.outlinedText(hpLabel, barCenterX, healthBarTextY(barY, barH), "#ffffff", 2);

      if (!enemy.remoteCombatGhost) {
        ctx.drawImage(labels.reward.canvas, -labels.reward.width / 2, rewardY - labels.reward.anchorY, labels.reward.width, labels.reward.height);
      }
    });
  }

  function drawProjectile(projectile: Projectile | EnemyShot, enemy = false) {
    const x = screenX(projectile.x);
    const y = screenY(projectile.y);
    const weaponItem = options.localRightHandItem() || options.localLeftHandItem();
    const projectileKind = !enemy
      ? projectileKindForWeapon(weaponItem)
      : undefined;
    if (projectileKind === "ARROW") {
      drawArrow(x, y, Math.atan2(projectile.vy, projectile.vx));
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
