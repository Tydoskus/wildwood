import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition, type LoadedEnemySprite } from "../enemies";
import { clamp } from "../math";
import { formatCompactNumber } from "../../ui/number-format";
import type { RemotePlayer } from "../../wildwood-coop";
import type { PlayerGender } from "../../../shared/player-gender";
import type { Camera } from "./camera";
import { healthBarTextY } from "./health-bar-layout";
import type { DuelCombatant, DuelScene, EnemyShot, EnemyState, PlayerState, Projectile } from "./types";

type Viewport = { width: number; height: number };
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type LabelBitmap = { canvas: HTMLCanvasElement; width: number; height: number; anchorY: number };
type LabelSegment = { text: string; color: string };

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
  gameTime: () => number;
  drawPlayerAppearance: (actor: { x: number; y: number; facing: number; moving?: boolean; throwClock?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string }, alpha: number) => void;
  localHeadItem: () => string;
  localChestItem: () => string;
  localFeetItem: () => string;
  localRightHandItem: () => string;
  localLeftHandItem: () => string;
  equipmentForIdentity: (identity: string | undefined) => { headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
  playerStone: HTMLImageElement;
  enemySprites: Record<string, LoadedEnemySprite>;
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
  const enemyLabelCache = new Map<string, { name: LabelBitmap; reward: LabelBitmap }>();
  const enemyLabelFont = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';

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
    actor: { x: number; y: number; facing: number; moving?: boolean; throwClock?: number; identity?: string; id?: string; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string },
    alpha = 1,
  ) {
    options.drawPlayerAppearance(actor, alpha);
  }

  function drawDuelArena(show: boolean, center: { x: number; y: number; r: number }) {
    if (!show) return;

    const x = center.x - camera.x;
    const y = center.y - camera.y;
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
      ctx.fillStyle = shot.color;
      options.pixelCircle(shot.x - camera.x, shot.y - camera.y, 6);
    }
    drawDuelCombatant(scene.challenger);
    drawDuelCombatant(scene.opponent);
  }

  function drawDuelCombatant(actor: DuelCombatant) {
    const x = Math.floor(actor.x - camera.x);
    const y = Math.floor(actor.y - camera.y);
    options.drawShadow(x, y + 29, 34, actor.isLocal ? .21 : .17);
    drawPlayerSprite({ ...options.equipmentForIdentity(actor.identity), ...actor, x, y }, 1);
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
    const x = Math.floor(player.x - camera.x);
    const y = Math.floor(player.y - camera.y);
    options.drawShadow(x, y + 29, 34, .21);
    drawPlayerSprite({ ...player, x, y, identity, headItem: options.localHeadItem(), chestItem: options.localChestItem(), feetItem: options.localFeetItem(), rightHandItem: options.localRightHandItem(), leftHandItem: options.localLeftHandItem() });
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

    const x = Math.floor(other.x - camera.x);
    const y = Math.floor(other.y - camera.y);
    if (x < -65 || y < -70 || x > width + 65 || y > height + 70) return;

    options.drawShadow(x, y + 29, 34, .16);
    drawPlayerSprite({ ...other, x, y }, 1);
    options.drawIdentity(
      other.id,
      options.publicName(other.id, other.name),
      Number.isFinite(other.power) ? other.power : 0,
      x,
      Math.round(y - 49),
      "#9eeeff",
    );
    options.drawSpeechBubble(other.id, x, y);
  }

  function drawRemotePlayers(players: RemotePlayer[]) {
    for (const other of players) drawRemotePlayer(other);
  }

  function drawEnemy(enemy: EnemyState) {
    const viewport = options.viewport();
    const width = viewport.width / camera.zoom;
    const height = viewport.height / camera.zoom;
    const x = Math.floor(enemy.x - camera.x);
    const y = Math.floor(enemy.y - camera.y);
    if (x < -80 || y < -80 || x > width + 80 || y > height + 80) return;

    const base = ENEMY_TYPES[enemy.type];
    const sprite = options.enemySprites[enemy.type];
    const layers = sprite?.layers;
    const image = sprite?.image;
    const spriteReady = layers
      ? layers.every((layer) => layer.image.complete && layer.image.naturalWidth > 0)
      : Boolean(image?.complete && image.naturalWidth > 0);
    const spriteHeight = spriteReady && image
      ? (sprite.height ?? sprite.size * image.naturalHeight / image.naturalWidth)
      : enemy.r * 2;
    const shadowWidth = Math.max(34, Math.min(76, (sprite?.size ?? enemy.r * 2) * .9));
    const shadowY = y + Math.max(10, Math.min(30, spriteHeight / 2 - 4));
    options.drawShadow(x, shadowY, shadowWidth, .36);

    ctx.save();
    ctx.translate(x, y);
    if (enemy.facingX < 0) ctx.scale(-1, 1);

    if (spriteReady) {
      ctx.globalAlpha = enemy.hurt > 0 ? .7 : 1;
      if (layers) {
        for (const layer of layers) {
          ctx.drawImage(layer.image, layer.x, layer.y - 3, layer.w, layer.h);
        }
      } else if (image) {
        ctx.drawImage(
          image,
          -sprite.size / 2,
          -spriteHeight / 2 - 3,
          sprite.size,
          spriteHeight,
        );
      }
    } else {
      ctx.fillStyle = base.outline;
      options.pixelCircle(0, 0, enemy.r + 3);
      ctx.fillStyle = enemy.hurt > 0 ? "#fff3d0" : base.color;
      options.pixelCircle(0, 0, enemy.r);
    }
    ctx.restore();

    if (!options.enemyTextVisible(enemy)) return;

    let spriteTop = -spriteHeight / 2 - 3;
    let spriteBottom = spriteHeight / 2 - 3;
    if (layers) {
      spriteTop = Number.POSITIVE_INFINITY;
      spriteBottom = Number.NEGATIVE_INFINITY;
      for (const layer of layers) {
        spriteTop = Math.min(spriteTop, layer.y - 3);
        spriteBottom = Math.max(spriteBottom, layer.y - 3 + layer.h);
      }
    }
    const rewardY = Math.round(y + spriteBottom + 13);
    const barW = Math.max(56, Math.min(94, (sprite?.size ?? enemy.r * 2) * 1.26)) * 1.05;
    const barH = options.worldHealthBarHeight;
    const barX = Math.round(x - barW / 2);
    const barCenterX = barX + barW / 2;
    const barY = Math.round(y + spriteTop - 14);
    const hpRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    const hpLabel = `${formatCompactNumber(Math.max(0, Math.ceil(enemy.hp)))} / ${formatCompactNumber(Math.ceil(enemy.maxHp))}`;

    ctx.fillStyle = "rgba(0,0,0,.86)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#472225";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = enemy.hurt > 0 ? "#fff1b6" : "#55d568";
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    const labels = enemyLabels(enemy.type, { ...enemy.reward, amount: enemy.reward.amount * options.rewardMultiplier() });
    ctx.drawImage(labels.name.canvas, Math.round(x - labels.name.width / 2), Math.round(barY - 4 - labels.name.anchorY), labels.name.width, labels.name.height);

    ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "middle";
    options.outlinedText(hpLabel, barCenterX, healthBarTextY(barY, barH), "#ffffff", 2);

    ctx.drawImage(labels.reward.canvas, Math.round(x - labels.reward.width / 2), Math.round(rewardY - labels.reward.anchorY), labels.reward.width, labels.reward.height);
    ctx.restore();
  }

  function drawProjectile(projectile: Projectile | EnemyShot, enemy = false) {
    const x = Math.floor(projectile.x - camera.x);
    const y = Math.floor(projectile.y - camera.y);
    if (!enemy && options.playerStone.complete && options.playerStone.naturalWidth > 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.drawImage(options.playerStone, -options.playerStone.naturalWidth / 2, -options.playerStone.naturalHeight / 2);
      ctx.restore();
      return;
    }
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
  };
}
