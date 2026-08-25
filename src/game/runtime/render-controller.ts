import { clamp } from "../math";
import { DUEL_ARENA } from "../duel";
import type { MapPlayerMarker, RemotePlayer } from "../../wildwood-coop";
import type { Camera } from "./camera";
import type { DuelScene, EnemyShot, PlayerState, Projectile } from "./types";

type BootsPickup = { x: number; y: number; r: number; collected: boolean };

export type RenderController = {
  render: () => void;
  drawBootPickup: () => void;
};

export function snapToDevicePixel(value: number, pixelRatio: number) {
  const scale = Number.isFinite(pixelRatio) ? Math.max(1, pixelRatio) : 1;
  return Math.round(value * scale) / scale;
}

/** Owns frame rendering order. Main supplies scene and UI boundaries. */
export function createRenderController(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  player: PlayerState;
  bootsPickup: BootsPickup;
  viewport: () => { width: number; height: number; dpr: number };
  pixelCircle: (x: number, y: number, radius: number) => void;
  remotePlayers: () => RemotePlayer[];
  mapPlayerMarkers: () => MapPlayerMarker[];
  isDueling: () => boolean;
  isArenaScene: () => boolean;
  isReplayActive: () => boolean;
  replayScene: () => DuelScene | null;
  liveScene: () => DuelScene | null;
  heldScene: () => DuelScene | null;
  duelResultHeld: () => boolean;
  setRenderedDuelScene: (scene: DuelScene | null) => void;
  setDuelCountdown: (countdown: number) => void;
  drawProfileCharacterPreview: () => void;
  updateSpeechBubbles: () => void;
  drawGround: () => void;
  drawStaticWorld: (offsetX?: number, offsetY?: number) => void;
  drawDuelArena: (active: boolean, arena: typeof DUEL_ARENA) => void;
  drawDuelScene: (scene: DuelScene) => void;
  drawDecor: () => void;
  drawBossTelegraphs: () => void;
  drawSpiderTelegraphs: () => void;
  drawFrostclawTelegraphs: () => void;
  drawMagmaliskTelegraphs: () => void;
  drawProjectile: (projectile: Projectile | EnemyShot, enemy: boolean) => void;
  drawDepthSortedWorld: (remotePlayers: RemotePlayer[], includePortal: boolean) => void;
  drawMinimap: (players: MapPlayerMarker[]) => void;
  drawCutscenePortal: () => void;
  drawParticles: (ctx: CanvasRenderingContext2D, camera: Camera) => void;
  drawDamageNumbers: (ctx: CanvasRenderingContext2D, camera: Camera) => void;
  currentMapIsTutorial: () => boolean;
  currentMapIsDesert: () => boolean;
  currentMapIsSnow: () => boolean;
  currentMapIsLava: () => boolean;
  portalCutsceneActive: () => boolean;
  portalBlackoutOpacity: () => number;
  screenShake: () => number;
  screenShakeEnabled: () => boolean;
  attackRangeVisible: () => boolean;
  flash: () => number;
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
}): RenderController {
  const {
    ctx, camera, player, bootsPickup, viewport, pixelCircle, remotePlayers, mapPlayerMarkers,
    isDueling, isArenaScene, isReplayActive, replayScene, liveScene, heldScene, duelResultHeld,
    setRenderedDuelScene, setDuelCountdown, drawProfileCharacterPreview, updateSpeechBubbles,
    drawGround, drawStaticWorld, drawDuelArena, drawDuelScene, drawDecor, drawBossTelegraphs,
    drawSpiderTelegraphs, drawFrostclawTelegraphs, drawMagmaliskTelegraphs, drawProjectile, drawDepthSortedWorld, drawMinimap, drawCutscenePortal,
    drawParticles, drawDamageNumbers, currentMapIsTutorial, currentMapIsDesert, currentMapIsSnow, currentMapIsLava, portalCutsceneActive,
    portalBlackoutOpacity, screenShake, screenShakeEnabled, attackRangeVisible, flash, projectiles, enemyShots,
  } = options;

  function drawBootPickup() {
    if (bootsPickup.collected) return;
    const { width, height } = viewport();
    const visibleW = width / camera.zoom;
    const visibleH = height / camera.zoom;
    const x = Math.floor(bootsPickup.x - camera.x);
    const y = Math.floor(bootsPickup.y - camera.y);
    if (x < -40 || y < -40 || x > visibleW + 40 || y > visibleH + 40) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,206,76,.18)";
    pixelCircle(0, 0, 25);
    ctx.fillStyle = "#4b2919";
    ctx.fillRect(-15, -7, 11, 17);
    ctx.fillRect(4, -7, 11, 17);
    ctx.fillStyle = "#d58b32";
    ctx.fillRect(-14, -10, 10, 13);
    ctx.fillRect(5, -10, 10, 13);
    ctx.fillStyle = "#ffe47b";
    ctx.fillRect(-14, 5, 14, 6);
    ctx.fillRect(3, 5, 14, 6);
    ctx.restore();
  }

  function drawAttackRange() {
    if (attackRangeVisible() && !isDueling()) {
      const x = player.x - camera.x;
      const y = player.y - camera.y;
      ctx.save();
      ctx.strokeStyle = "rgba(104,180,212,.33)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 11]);
      ctx.beginPath();
      ctx.arc(x, y, player.attackRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawVignette() {
    const { width, height } = viewport();
    const x = (player.x - camera.x) * camera.zoom;
    const y = (player.y - camera.y) * camera.zoom;
    const farthestCorner = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
    const innerRadius = clamp(player.attackRange * camera.zoom * 1.08, 56, farthestCorner * .72);
    const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, farthestCorner);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,.33)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function positionDuelCamera() {
    const { width, height } = viewport();
    const zoom = Math.min(1, Math.max(.65, Math.min(width, height) / 820));
    camera.zoom = zoom;
    camera.x = DUEL_ARENA.x - width / zoom / 2;
    camera.y = DUEL_ARENA.y - height / zoom / 2;
  }

  function renderDuelScene(scene: DuelScene) {
    setRenderedDuelScene(scene);
    positionDuelCamera();
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    drawGround();
    const floatY = Math.sin(performance.now() / 1000 * 1.2) * 7;
    ctx.save();
    ctx.translate(0, floatY);
    drawDuelArena(true, DUEL_ARENA);
    drawDuelScene(scene);
    drawDamageNumbers(ctx, camera);
    ctx.restore();
    ctx.restore();
    setDuelCountdown(scene.countdown);
    drawVignette();
  }

  function render() {
    const { width, height, dpr } = viewport();
    ctx.clearRect(0, 0, width, height);
    drawProfileCharacterPreview();
    const remotes = remotePlayers();
    updateSpeechBubbles();
    const replay = replayScene();
    if (isReplayActive() && replay) { renderDuelScene(replay); return; }
    const held = heldScene();
    if (duelResultHeld() && held) { renderDuelScene(held); return; }
    const live = liveScene();
    if (isDueling() && live) { renderDuelScene(live); return; }
    setRenderedDuelScene(null);
    ctx.save();
    const shake = screenShake();
    const shakeX = screenShakeEnabled() && shake > .2 ? snapToDevicePixel((Math.random() * 2 - 1) * shake, dpr) : 0;
    const shakeY = screenShakeEnabled() && shake > .2 ? snapToDevicePixel((Math.random() * 2 - 1) * shake, dpr) : 0;
    if (shakeX !== 0 || shakeY !== 0) ctx.translate(shakeX, shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    drawStaticWorld();
    drawDuelArena(isArenaScene(), DUEL_ARENA);
    if (!isDueling()) drawDecor();
    if (!isDueling() && currentMapIsTutorial()) drawBossTelegraphs();
    if (!isDueling() && currentMapIsDesert()) drawSpiderTelegraphs();
    if (!isDueling() && currentMapIsSnow()) drawFrostclawTelegraphs();
    if (!isDueling() && currentMapIsLava()) drawMagmaliskTelegraphs();
    drawAttackRange();
    for (const projectile of projectiles) drawProjectile(projectile, false);
    for (const shot of enemyShots) drawProjectile(shot, true);
    const cutscene = portalCutsceneActive();
    drawDepthSortedWorld(remotes, !cutscene);
    drawParticles(ctx, camera);
    drawDamageNumbers(ctx, camera);
    ctx.restore();
    if (!isDueling() && !cutscene) drawMinimap(mapPlayerMarkers());
    if (flash() > 0) {
      ctx.fillStyle = `rgba(255,55,40,${flash() * .75})`;
      ctx.fillRect(0, 0, width, height);
    }
    drawVignette();
    if (cutscene) {
      ctx.fillStyle = `rgba(0,0,0,${portalBlackoutOpacity()})`;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.scale(camera.zoom, camera.zoom);
      drawCutscenePortal();
      ctx.restore();
    }
  }

  return { render, drawBootPickup };
}
