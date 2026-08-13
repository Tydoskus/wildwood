import { ENEMY_TYPES, REWARD_DATA, rewardLabel, type LoadedEnemySprite } from "../enemies";
import { clamp } from "../math";
import { formatCompactNumber } from "../../ui/number-format";
import type { RemotePlayer } from "../../wildwood-coop";
import type { Camera } from "./camera";
import type { DuelCombatant, DuelScene, EnemyShot, EnemyState, PlayerState, Projectile } from "./types";

type Viewport = { width: number; height: number };
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type PixelCircle = (x: number, y: number, radius: number) => void;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;

export type ActorStatus = {
  x: number;
  y: number;
  identity?: string;
  name: string;
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
  drawPlayerAppearance: (actor: { x: number; y: number; facing: number; moving?: boolean; throwClock?: number; identity?: string; id?: string; feetItem?: string }, alpha: number) => void;
  localFeetItem: () => string;
  enemySprites: Record<string, LoadedEnemySprite>;
  duelPlatformArt: HTMLImageElement;
  player: PlayerState;
  pixelCircle: PixelCircle;
  outlinedText: OutlinedText;
  drawShadow: DrawShadow;
  drawStatus: (status: ActorStatus) => void;
  drawSpeechBubble: (identity: string | undefined, x: number, y: number) => void;
  publicName: (identity: string | undefined, name: string | undefined) => string;
  worldHealthBarHeight: number;
}) {
  const { ctx, camera } = options;

  function drawPlayerSprite(
    actor: { x: number; y: number; facing: number; moving?: boolean; throwClock?: number; identity?: string; id?: string; feetItem?: string },
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
    options.drawShadow(x, y + 29, 27, actor.isLocal ? .21 : .17);
    drawPlayerSprite({ ...actor, x, y }, actor.isLocal ? 1 : .88);
    options.drawStatus({
      x,
      y,
      identity: actor.identity,
      name: actor.name,
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
    options.drawShadow(x, y + 29, 27, .21);
    drawPlayerSprite({ ...player, x, y, identity, feetItem: options.localFeetItem() });
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

  function drawRemotePlayers(players: RemotePlayer[]) {
    const viewport = options.viewport();
    const width = viewport.width / camera.zoom;
    const height = viewport.height / camera.zoom;

    for (const other of players) {
      const x = Math.floor(other.x - camera.x);
      const y = Math.floor(other.y - camera.y);
      if (x < -65 || y < -70 || x > width + 65 || y > height + 70) continue;

      options.drawShadow(x, y + 29, 27, .16);
      drawPlayerSprite({ ...other, x, y }, .82);
      options.drawStatus({
        x,
        y,
        identity: other.id,
        name: options.publicName(other.id, other.name),
        nameColor: "#9eeeff",
        hp: other.hp,
        maxHp: other.maxHp,
        power: Number.isFinite(other.power) ? other.power : 0,
        fillColor: "#55a9c6",
      });
      options.drawSpeechBubble(other.id, x, y);
    }
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

    const reward = REWARD_DATA[enemy.reward.type];
    const visualRadius = Math.max(enemy.r, spriteHeight / 2);
    const rewardY = y + visualRadius + 10;
    const barW = Math.max(56, Math.min(94, (sprite?.size ?? enemy.r * 2) * 1.26));
    const barH = options.worldHealthBarHeight;
    const barX = Math.round(x - barW / 2);
    const barY = Math.round(y - spriteHeight / 2 - 17);
    const hpRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    const hpLabel = `${formatCompactNumber(Math.max(0, Math.ceil(enemy.hp)))} / ${formatCompactNumber(Math.ceil(enemy.maxHp))} HP`;

    ctx.fillStyle = "rgba(0,0,0,.86)";
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = "#472225";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = enemy.hurt > 0 ? "#fff1b6" : "#55d568";
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    options.outlinedText(enemy.type, x, barY - 4, "#f5e9c4", 2);

    ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "middle";
    options.outlinedText(hpLabel, x, barY + barH / 2, "#ffffff", 2);

    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "top";
    options.outlinedText(rewardLabel(enemy.reward), x, rewardY, reward.color, 2);
    ctx.restore();
  }

  function drawProjectile(projectile: Projectile | EnemyShot, enemy = false) {
    const x = Math.floor(projectile.x - camera.x);
    const y = Math.floor(projectile.y - camera.y);
    ctx.fillStyle = enemy ? "#d67cff" : "#5a250d";
    options.pixelCircle(x, y, projectile.r + 2);
    ctx.fillStyle = enemy ? "#f3c5ff" : "#ffe76a";
    options.pixelCircle(x, y, projectile.r);
  }

  return {
    drawDuelArena,
    drawDuelScene,
    drawPlayer,
    drawRemotePlayers,
    drawEnemy,
    drawProjectile,
  };
}
