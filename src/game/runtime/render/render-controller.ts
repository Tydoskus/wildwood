import { clamp } from "../../math";
import { DUEL_ARENA } from "../../duel";
import type { MapPlayerMarker, RemotePlayer } from "../../../wildstat-coop";
import type { Camera } from "./camera";
import type { DuelScene, EnemyShot, PlayerState, Projectile } from "../types";
import type { StaticWorldColorQuadFrame, StaticWorldSpriteFrame } from "./webgl-static-world-layer";
import { snapWorldRenderCoordinate } from "./render-space";
import { freezeCanvas, releaseFrozen, type FrozenImage } from "./frozen-canvas";
import type { WorldSpriteCapture } from "./world-sprite-capture";

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
  duelAssetsReady: () => boolean;
  isReplayActive: () => boolean;
  replayScene: () => DuelScene | null;
  liveScene: () => DuelScene | null;
  heldScene: () => DuelScene | null;
  duelResultHeld: () => boolean;
  setRenderedDuelScene: (scene: DuelScene | null) => void;
  setDuelCountdown: (countdown: number) => void;
  drawProfileCharacterPreview: () => void;
  worldOccluded?: () => boolean;
  updateSpeechBubbles: () => void;
  drawMapHazards?: () => void;
  drawGround: () => void;
  drawStaticWorld: (
    sprites?: readonly StaticWorldSpriteFrame[],
    colorQuads?: readonly StaticWorldColorQuadFrame[],
  ) => boolean;
  drawDuelArena: (active: boolean, arena: typeof DUEL_ARENA) => void;
  drawDuelScene: (scene: DuelScene) => void;
  drawDecor: () => void;
  /** The current map's boss attacks, under the actors. */
  drawBossTelegraphs: () => void;
  drawProjectile: (projectile: Projectile | EnemyShot, enemy: boolean) => void;
  drawDepthSortedWorld: (remotePlayers: RemotePlayer[], includePortal: boolean) => void;
  drawMinimap: (players: MapPlayerMarker[]) => void;
  drawCutscenePortal: () => void;
  drawParticles: (ctx: CanvasRenderingContext2D, camera: Camera) => void;
  drawDamageNumbers: (ctx: CanvasRenderingContext2D, camera: Camera) => void;
  currentMapIsInfernal: () => boolean;
  portalCutsceneActive: () => boolean;
  portalBlackoutOpacity: () => number;
  attackRangeVisible: () => boolean;
  weaponAttackRange?: () => number;
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  webGLProjectileBatch: () => { frames: readonly StaticWorldSpriteFrame[]; complete: boolean };
  webGLParticleBatch: () => { frames: readonly StaticWorldColorQuadFrame[]; complete: boolean };
  /** Sends the world's decor, actors, bosses, portals, effects and minimap to the WebGL layer when it is drawing. */
  worldSprites?: WorldSpriteCapture | null;
  /** Drawing calls that have reached the canvas so far (switchable-context.ts); -1 when it cannot tell. */
  canvasDraws?: () => number;
}): RenderController {
  const {
    ctx, camera, player, bootsPickup, viewport, pixelCircle, remotePlayers, mapPlayerMarkers,
    isDueling, isArenaScene, isReplayActive, replayScene, liveScene, heldScene, duelResultHeld,
    setRenderedDuelScene, setDuelCountdown, drawProfileCharacterPreview, updateSpeechBubbles,
    drawGround, drawStaticWorld, drawDuelArena, drawDuelScene, drawDecor, drawBossTelegraphs,
    drawProjectile, drawDepthSortedWorld, drawMinimap, drawCutscenePortal,
    drawParticles, drawDamageNumbers, currentMapIsInfernal, portalCutsceneActive,
    portalBlackoutOpacity, attackRangeVisible, projectiles, enemyShots, webGLProjectileBatch, webGLParticleBatch,
  } = options;

  function drawBootPickup() {
    if (bootsPickup.collected) return;
    const { width, height, dpr } = viewport();
    const visibleW = width / camera.zoom;
    const visibleH = height / camera.zoom;
    const x = snapWorldRenderCoordinate(bootsPickup.x - camera.x, camera.zoom, dpr);
    const y = snapWorldRenderCoordinate(bootsPickup.y - camera.y, camera.zoom, dpr);
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

  function strokeAttackRange(target: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    target.save();
    // Stretched so a whole number of dashes fits the ring, or the last one comes out a different length.
    const dashes = Math.max(1, Math.round(Math.PI * 2 * radius / 22));
    const stretch = Math.PI * 2 * radius / (dashes * 22);
    target.setLineDash([8 * stretch, 14 * stretch]);
    target.lineDashOffset = 0;
    target.lineCap = "round";
    target.beginPath();
    target.arc(x, y, radius, 0, Math.PI * 2);
    target.strokeStyle = "rgba(215,239,250,.55)";
    target.lineWidth = 2;
    target.stroke();
    target.restore();
  }
  // A dashed stroke each frame is slow in Firefox's software canvas: the ring is drawn once and copied,
  // and drawn again only when the range, zoom or pixel ratio changes.
  // A new canvas for each new ring, never a resized one (see world-renderer.ts's minimap).
  let rangeCanvas = typeof document === "undefined" ? null : document.createElement("canvas");
  let rangeKey = "", rangeHalf = 0;
  /** The ring as drawn: its canvas, then that canvas frozen into a bitmap. */
  let rangeImage: FrozenImage | null = null;
  function drawAttackRange() {
    if (attackRangeVisible() && !isDueling()) {
      const { dpr } = viewport();
      const x = snapWorldRenderCoordinate(player.x - camera.x, camera.zoom, dpr);
      const y = snapWorldRenderCoordinate(player.y - camera.y, camera.zoom, dpr);
      const radius = options.weaponAttackRange?.() ?? player.attackRange;
      const scale = camera.zoom * dpr, key = `${radius}|${scale}`;
      if (rangeCanvas && key !== rangeKey && rangeKey) rangeCanvas = document.createElement("canvas");
      const cache = rangeCanvas?.getContext("2d");
      if (!rangeCanvas || !cache) { strokeAttackRange(ctx, x, y, radius); return; }
      if (key !== rangeKey) {
        rangeKey = key;
        const halfPixels = Math.ceil((radius + 3) * scale);
        rangeHalf = halfPixels / scale;
        rangeCanvas.width = rangeCanvas.height = Math.max(1, halfPixels * 2);
        cache.setTransform(scale, 0, 0, scale, halfPixels, halfPixels);
        strokeAttackRange(cache, 0, 0, radius);
        releaseFrozen(rangeImage);
        const ring = rangeCanvas;
        rangeImage = ring;
        freezeCanvas(ring, bitmap => {
          if (rangeImage !== ring) return false;
          rangeImage = bitmap;
          // The next ring gets a new canvas, so this one's pixels can go now.
          ring.width = ring.height = 0;
          return true;
        });
      }
      ctx.drawImage(rangeImage ?? rangeCanvas, x - rangeHalf, y - rangeHalf, rangeHalf * 2, rangeHalf * 2);
    }
  }

  // The vignette is a CSS gradient on an element over the canvas, moved with a transform: no canvas work at all.
  // In the canvas it would be a full-screen copy every frame, and a full-screen canvas reallocated and repainted
  // whenever the player moved on screen (camera held at a map edge), over half a millisecond in Firefox's software canvas.
  let vignetteFrame: HTMLDivElement | null = null, vignetteSky: HTMLDivElement | null = null;
  let vignetteLook = "", vignetteX = NaN, vignetteY = NaN, vignetteWanted = false, vignetteShown = false;
  function vignetteElement() {
    if (vignetteSky || typeof document === "undefined" || !ctx.canvas?.isConnected) return vignetteSky;
    const frame = document.createElement("div");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:0;top:0;z-index:1;pointer-events:none;overflow:hidden;display:none";
    const sky = document.createElement("div");
    sky.style.cssText = "position:absolute;left:0;top:0;will-change:transform";
    frame.append(sky);
    ctx.canvas.insertAdjacentElement("afterend", frame);
    vignetteFrame = frame;
    return vignetteSky = sky;
  }
  function showVignette(on: boolean) {
    if (!vignetteFrame || on === vignetteShown) return;
    vignetteShown = on;
    vignetteFrame.style.display = on ? "block" : "none";
  }
  function drawVignette() {
    if (currentMapIsInfernal() && !isDueling()) return;
    const { width, height } = viewport();
    const x = Math.round((player.x - camera.x) * camera.zoom);
    const y = Math.round((player.y - camera.y) * camera.zoom);
    // Darkest at the corners of a centred view; off centre (a map edge) the far side stays at that darkness.
    const outerRadius = Math.ceil(Math.hypot(width, height) / 2);
    const innerRadius = Math.round(clamp(player.attackRange * camera.zoom * 1.08, 56, outerRadius * .72));
    const sky = vignetteElement();
    if (!sky || !vignetteFrame) {
      const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,.33)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    vignetteWanted = true;
    // Twice the view, centred on the player: it covers the view wherever the player stands in it.
    const look = `${width}x${height}:${innerRadius}`;
    if (look !== vignetteLook) {
      vignetteLook = look;
      vignetteX = NaN;
      vignetteFrame.style.width = `${width}px`;
      vignetteFrame.style.height = `${height}px`;
      sky.style.width = `${width * 2}px`;
      sky.style.height = `${height * 2}px`;
      sky.style.background = `radial-gradient(circle ${outerRadius}px at ${width}px ${height}px, rgba(0,0,0,0) ${innerRadius}px, rgba(0,0,0,.33) ${outerRadius}px)`;
    }
    // Its edge is hundreds of pixels soft, so a 1px follow cannot be seen; each move restyles a layer twice the view.
    if (Math.abs(x - vignetteX) < 2 && Math.abs(y - vignetteY) < 2) return;
    vignetteX = x; vignetteY = y;
    sky.style.transform = `translate3d(${x - width}px,${y - height}px,0)`;
  }

  function drawNightMask() {
    if (!currentMapIsInfernal()) return;
    const { width, height, dpr } = viewport();
    const x = snapToDevicePixel((player.x - camera.x) * camera.zoom, dpr);
    const y = snapToDevicePixel((player.y - camera.y) * camera.zoom, dpr);
    const fullRadius = Math.max(72, player.attackRange * camera.zoom * .92);
    const revealRadius = Math.max(fullRadius + 48, player.attackRange * camera.zoom * 1.8);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, revealRadius);
    gradient.addColorStop(0, "rgba(2,1,6,.12)");
    gradient.addColorStop(Math.min(.95, fullRadius / revealRadius), "rgba(2,1,6,.2)");
    gradient.addColorStop(1, "rgba(2,1,6,.9)");
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
    if (!options.duelAssetsReady()) {
      const { width, height } = viewport();
      setRenderedDuelScene(null);
      setDuelCountdown(0);
      ctx.save();
      ctx.fillStyle = "#050713";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#eef3ff";
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("LOADING ARENA…", width / 2, height / 2);
      ctx.restore();
      return;
    }
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
    if ((scene.hitMultiplier ?? 1) > 1 && scene.countdown === 0) {
      const { width, height } = viewport();
      ctx.save();
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd38a";
      ctx.fillText(`ESCALATION · HITS ×${scene.hitMultiplier!.toFixed(1)}`, width / 2, height * .72);
      ctx.restore();
    }
    // Arena lighting is uniform. The world vignette follows the exploration
    // player, so its off-arena position does not darken replays.
  }

  // A canvas that drew nothing last frame is still empty: leaving it alone spares the browser re-uploading the whole
  // screen of it, which is most of the cost of a frame the WebGL layer drew.
  let canvasHasPixels = true;
  let canvasSize = "";
  function renderFrame() {
    const { width, height, dpr } = viewport();
    // A mobile browser can restore a covered/background canvas with default
    // state and unchanged dimensions. Re-establish logical pixels before
    // clearing or drawing, including the first frame after closing a menu.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const size = `${ctx.canvas?.width}x${ctx.canvas?.height}`;
    if (canvasHasPixels || size !== canvasSize || !options.canvasDraws) ctx.clearRect(0, 0, width, height);
    canvasSize = size;
    drawProfileCharacterPreview();
    // Opaque menus already cover the world. Keep their previews alive without
    // repainting the terrain, actors, effects, minimap, and WebGL layers below.
    if (options.worldOccluded?.()) return;
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
    ctx.scale(camera.zoom, camera.zoom);
    const projectileBatch = webGLProjectileBatch();
    const particleBatch = webGLParticleBatch();
    const staticWorldRenderedByWebGL = drawStaticWorld(
      projectileBatch.complete ? projectileBatch.frames : [],
      particleBatch.complete ? particleBatch.frames : [],
    );
    ctx.restore();
    const projectilesRenderedByWebGL = staticWorldRenderedByWebGL && projectileBatch.complete;
    const particlesRenderedByWebGL = staticWorldRenderedByWebGL && particleBatch.complete;
    const cutscene = portalCutsceneActive();
    const overWorld = !isDueling() && !cutscene;
    // Everything over the ground, in order: what the WebGL layer draws when it can, else the canvas.
    const drawWorld = () => {
      ctx.save();
      ctx.scale(camera.zoom, camera.zoom);
      drawDuelArena(isArenaScene(), DUEL_ARENA);
      if (!isDueling()) { drawDecor(); options.drawMapHazards?.(); }
      if (!isDueling()) drawBossTelegraphs();
      drawAttackRange();
      if (!projectilesRenderedByWebGL) {
        for (const projectile of projectiles) drawProjectile(projectile, false);
        for (const shot of enemyShots) drawProjectile(shot, true);
      }
      drawDepthSortedWorld(remotes, !cutscene);
      if (!particlesRenderedByWebGL) drawParticles(ctx, camera);
      drawDamageNumbers(ctx, camera);
      ctx.restore();
      if (overWorld) { drawNightMask(); drawMinimap(mapPlayerMarkers()); }
    };
    const sprites = options.worldSprites;
    if (staticWorldRenderedByWebGL && sprites?.begin()) {
      let recorded = true;
      try { drawWorld(); }
      catch (error) {
        recorded = false;
        if (!sprites.abort(error)) throw error;
        drawWorld();
      }
      if (recorded && !sprites.commit()) {
        // The layer may just have turned itself off and hidden the ground it drew: the canvas draws the ground first.
        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);
        drawStaticWorld(projectileBatch.complete ? projectileBatch.frames : [], particleBatch.complete ? particleBatch.frames : []);
        ctx.restore();
        drawWorld();
      }
    } else drawWorld();
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

  function render() {
    vignetteWanted = false;
    const drawsBefore = options.canvasDraws?.() ?? -1;
    // The camera drawn from sits on a whole device pixel, so every object rounds the same way against the ground and
    // none shifts a pixel against it. It is placed from the player's own rounded pixel, so the player stays as steady
    // on screen as the smooth camera kept them. Its own smooth position comes back after the frame.
    const { dpr } = viewport(), cameraX = camera.x, cameraY = camera.y, scale = camera.zoom * dpr;
    if (Number.isFinite(scale) && scale > 0) {
      const onPixel = (at: number, from: number) => (Math.round(at * scale) - Math.round((at - from) * scale)) / scale;
      camera.x = onPixel(player.x, cameraX);
      camera.y = onPixel(player.y, cameraY);
    }
    try {
      renderFrame();
      showVignette(vignetteWanted);
      const drawsAfter = options.canvasDraws?.() ?? -1;
      canvasHasPixels = drawsBefore < 0 || drawsAfter !== drawsBefore;
    }
    catch (error) {
      // Clear leaked clipping, transforms, filters and save-stack entries before retrying.
      // Assigning the backing width resets the existing context without changing layout.
      ctx.canvas.width = ctx.canvas.width;
      canvasHasPixels = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      throw error;
    }
    finally {
      // A duel's camera is placed by its scene; anywhere else the glide carries on from where it was.
      if (!isDueling() && !isReplayActive() && !duelResultHeld()) { camera.x = cameraX; camera.y = cameraY; }
    }
  }
  return { render, drawBootPickup };
}
