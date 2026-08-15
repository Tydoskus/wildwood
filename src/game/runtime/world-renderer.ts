import { TAU, WORLD } from "../constants";
import { ENEMY_TYPES } from "../enemies";
import type { RemotePlayer } from "../../wildwood-coop";
import type { Camera } from "./camera";
import type { EnemyState, PlayerState } from "./types";
import type { MapId, WorldDecor, WorldPath } from "../world";

type Viewport = { width: number; height: number };
type Portal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type EmptyArch = Omit<Portal, "destination">;
type TreeSpriteBounds = { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number; canopyWidth: number };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type RoundRect = (x: number, y: number, width: number, height: number, radius: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type RockDecor = Extract<WorldDecor, { type: "rock" }>;
type DesertGrassDecor = Extract<WorldDecor, { type: "desertGrass" }>;
type SnowPineDecor = Extract<WorldDecor, { type: "snowPine" }>;
type SnowTuftDecor = Extract<WorldDecor, { type: "snowTuft" }>;
type GrassDecor = Extract<WorldDecor, { type: "grass" }>;
type PetalDecor = Extract<WorldDecor, { type: "petal" }>;

export type WorldRendererOptions = {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  getViewport: () => Viewport;
  getDevicePixelRatio: () => number;
  getMapId: () => MapId;
  getGameTime: () => number;
  isArenaScene: () => boolean;
  mapName: (mapId: MapId) => string;
  activePortal: () => Portal;
  cutscenePortal: () => Portal;
  secondaryPortal: () => Portal | null;
  portalIsUnlocked: (portal: Portal) => boolean;
  portalRevealIntensity: () => number;
  portalDestinationOpacity: () => number;
  tutorialMapId: MapId;
  desertMapId: MapId;
  snowMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  player: PlayerState;
  duelSpaceBackground: HTMLImageElement;
  treeSpritesheet: HTMLImageElement;
  actorShadowSprite: HTMLImageElement;
  treeSpriteBounds: () => TreeSpriteBounds[];
  portalArch: HTMLImageElement;
  portalSwirl: HTMLImageElement;
  snowPine: HTMLImageElement;
  drawShadow: DrawShadow;
  outlinedText: OutlinedText;
  roundRect: RoundRect;
};

export function createWorldRenderer(options: WorldRendererOptions) {
  const { ctx, camera } = options;
  const STATIC_TILE_SIZE = 640;
  const STATIC_TILE_MIN_LIMIT = 12;
  const STATIC_TILE_CACHE_PADDING = 4;
  const TREE_SHADOW_CANOPY_WIDTH_RATIO = .9;
  const SNOW_PINE_GROUND_OFFSET_RATIO = .09;
  const staticTiles = new Map<string, HTMLCanvasElement>();
  let staticTileLimit = STATIC_TILE_MIN_LIMIT;
  const viewport = () => options.getViewport();
  const visibleSize = () => ({ width: viewport().width / camera.zoom, height: viewport().height / camera.zoom });

  function mapColors() {
    const desert = options.getMapId() === options.desertMapId;
    const snow = options.getMapId() === options.snowMapId;
    return {
      ground: snow ? "#bfddeb" : desert ? "#d9a95f" : "#31945b",
      path: snow ? "#8fb7d0" : desert ? "#c48b4b" : "#8b6551",
      pathDetail: snow ? "rgba(61,104,137,.18)" : desert ? "rgba(111,65,32,.15)" : "rgba(68,38,29,.12)",
    };
  }

  function staticTile(tileX: number, tileY: number) {
    const key = `${options.getMapId()}:${tileX}:${tileY}`;
    const cached = staticTiles.get(key);
    if (cached) {
      staticTiles.delete(key);
      staticTiles.set(key, cached);
      return cached;
    }
    const tile = document.createElement("canvas");
    tile.width = STATIC_TILE_SIZE;
    tile.height = STATIC_TILE_SIZE;
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) return tile;
    tileCtx.imageSmoothingEnabled = false;
    const originX = tileX * STATIC_TILE_SIZE;
    const originY = tileY * STATIC_TILE_SIZE;
    const colors = mapColors();
    const drawStaticShadow = (x: number, y: number, width: number, alpha: number) => {
      const height = Math.max(8, Math.round(width * 33 / 86));
      if (x + width / 2 < 0 || x - width / 2 > STATIC_TILE_SIZE || y + height / 2 < 0 || y - height / 2 > STATIC_TILE_SIZE) return;
      tileCtx.save();
      tileCtx.globalAlpha = alpha;
      if (options.actorShadowSprite.complete && options.actorShadowSprite.naturalWidth > 0) {
        tileCtx.drawImage(options.actorShadowSprite, Math.round(x - width / 2), Math.round(y - height / 2), Math.round(width), height);
      } else {
        tileCtx.fillStyle = "#102719";
        tileCtx.beginPath();
        tileCtx.ellipse(x, y, width / 2, height / 2, 0, 0, TAU);
        tileCtx.fill();
      }
      tileCtx.restore();
    };
    tileCtx.fillStyle = colors.ground;
    tileCtx.fillRect(0, 0, STATIC_TILE_SIZE, STATIC_TILE_SIZE);
    for (const path of options.paths) {
      tileCtx.fillStyle = colors.path;
      tileCtx.fillRect(path.x - originX, path.y - originY, path.w, path.h);
      tileCtx.fillStyle = colors.pathDetail;
      for (let y = path.y + 7; y < path.y + path.h; y += 18) {
        for (let x = path.x + ((y / 18) % 2 ? 4 : 12); x < path.x + path.w; x += 24) tileCtx.fillRect(x - originX, y - originY, 2, 2);
      }
    }
    for (const decor of options.decor) {
      const x = Math.round(decor.x - originX);
      const y = Math.round(decor.y - originY);
      if (x < -50 || y < -50 || x > STATIC_TILE_SIZE + 50 || y > STATIC_TILE_SIZE + 50) continue;
      if (decor.type === "grass") {
        tileCtx.fillStyle = decor.variant % 2 ? "#237b49" : "#267f4c";
        tileCtx.fillRect(x - 1, y - 5, 2, 7); tileCtx.fillRect(x - 5, y - 2, 2, 5); tileCtx.fillRect(x + 3, y - 3, 2, 6); if (decor.variant > 1) tileCtx.fillRect(x + 6, y, 2, 3);
      } else if (decor.type === "petal") {
        tileCtx.fillStyle = ["#d9f4df", "#f3f0c6", "#ccebea"][decor.variant % 3];
        tileCtx.fillRect(x - 3, y - 1, 7, 3); tileCtx.fillRect(x - 1, y - 3, 3, 7); tileCtx.fillStyle = "rgba(255,255,255,.72)"; tileCtx.fillRect(x, y, 1, 1);
      } else if (decor.type === "desertGrass") {
        tileCtx.fillStyle = decor.variant % 2 ? "#8b7b3d" : "#a28a43";
        tileCtx.fillRect(x - 1, y - 6, 2, 7); tileCtx.fillRect(x - 5, y - 3, 2, 5); tileCtx.fillRect(x + 3, y - 4, 2, 6);
      } else if (decor.type === "snowTuft") {
        tileCtx.fillStyle = decor.variant % 2 ? "rgba(255,255,255,.78)" : "rgba(221,242,255,.76)";
        tileCtx.fillRect(x - 2, y - 1, 5, 2); tileCtx.fillRect(x, y - 3, 2, 5);
      } else if (decor.type === "rock") {
        const w = Math.round(35 * decor.s); const h = Math.round(22 * decor.s);
        tileCtx.fillStyle = "rgba(0,0,0,.11)"; tileCtx.beginPath(); tileCtx.ellipse(x, y + 2, w * .6, Math.max(3, w * .23), 0, 0, TAU); tileCtx.fill();
        tileCtx.fillStyle = "#79543d"; tileCtx.beginPath(); tileCtx.moveTo(x - w / 2, y); tileCtx.lineTo(x - w * .32, y - h * .72); tileCtx.lineTo(x + w * .2, y - h); tileCtx.lineTo(x + w / 2, y - h * .28); tileCtx.lineTo(x + w * .38, y); tileCtx.closePath(); tileCtx.fill();
        tileCtx.fillStyle = "#b77b4b"; tileCtx.beginPath(); tileCtx.moveTo(x - w * .32, y - h * .72); tileCtx.lineTo(x + w * .2, y - h); tileCtx.lineTo(x + w * .12, y - h * .45); tileCtx.closePath(); tileCtx.fill();
      }
    }
    // Tall decor stays live for depth sorting. Its unchanging ground shadows
    // render once in the static tile, underneath every player and enemy.
    for (const decor of options.decor) {
      const x = Math.round(decor.x - originX);
      const y = Math.round(decor.y - originY);
      if (decor.type === "tree") {
        const source = options.treeSpriteBounds()[decor.variant % 16];
        if (!source) continue;
        const drawSize = Math.round(154 * decor.s);
        const scale = drawSize / source.h;
        const shadowX = Math.round(x + (source.groundCenter - source.w / 2) * scale);
        const canopyWidth = source.canopyWidth * scale;
        drawStaticShadow(shadowX, y, Math.max(24, Math.round(canopyWidth * TREE_SHADOW_CANOPY_WIDTH_RATIO)), .14);
      } else if (decor.type === "cactus") {
        drawStaticShadow(x, y - 2, Math.round(46 * decor.s), .12);
      } else if (decor.type === "snowPine" && options.snowPine.naturalWidth > 0) {
        const height = Math.round(185 * decor.s);
        const width = Math.round(height * options.snowPine.naturalWidth / options.snowPine.naturalHeight);
        drawStaticShadow(x, y - Math.round(height * SNOW_PINE_GROUND_OFFSET_RATIO), Math.round(width * .75), .13);
      }
    }
    staticTiles.set(key, tile);
    while (staticTiles.size > staticTileLimit) staticTiles.delete(staticTiles.keys().next().value!);
    return tile;
  }

  function drawStaticWorld() {
    if (options.isArenaScene()) {
      drawGround();
      return;
    }
    const visible = visibleSize();
    const startX = Math.floor(camera.x / STATIC_TILE_SIZE) - 1;
    const startY = Math.floor(camera.y / STATIC_TILE_SIZE) - 1;
    const endX = Math.floor((camera.x + visible.width) / STATIC_TILE_SIZE) + 1;
    const endY = Math.floor((camera.y + visible.height) / STATIC_TILE_SIZE) + 1;
    // Keep every tile required by this camera view plus a small movement edge.
    // A fixed limit below the visible count turns camera movement into an LRU
    // rebuild loop, repeatedly redrawing the world tiles each frame.
    staticTileLimit = Math.max(
      STATIC_TILE_MIN_LIMIT,
      (endX - startX + 1) * (endY - startY + 1) + STATIC_TILE_CACHE_PADDING,
    );
    const snapTileEdge = (coordinate: number, offset: number) =>
      Math.round((coordinate - offset) * camera.zoom * options.getDevicePixelRatio()) /
      (camera.zoom * options.getDevicePixelRatio());
    for (let tileY = startY; tileY <= endY; tileY += 1) {
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        if (tileX < 0 || tileY < 0 || tileX * STATIC_TILE_SIZE >= WORLD.w || tileY * STATIC_TILE_SIZE >= WORLD.h) continue;
        const left = snapTileEdge(tileX * STATIC_TILE_SIZE, camera.x);
        const top = snapTileEdge(tileY * STATIC_TILE_SIZE, camera.y);
        const right = snapTileEdge((tileX + 1) * STATIC_TILE_SIZE, camera.x);
        const bottom = snapTileEdge((tileY + 1) * STATIC_TILE_SIZE, camera.y);
        ctx.drawImage(staticTile(tileX, tileY), left, top, right - left, bottom - top);
      }
    }
    while (staticTiles.size > staticTileLimit) staticTiles.delete(staticTiles.keys().next().value!);
  }

  function invalidateStaticWorld() {
    staticTiles.clear();
  }

  function drawGround() {
    const visible = visibleSize();
    if (options.isArenaScene()) {
      if (options.duelSpaceBackground.complete && options.duelSpaceBackground.naturalWidth > 0) {
        ctx.fillStyle = "#050713";
        ctx.fillRect(0, 0, visible.width, visible.height);
        const rotateForPortrait = visible.height > visible.width;
        const backgroundW = rotateForPortrait ? options.duelSpaceBackground.naturalHeight : options.duelSpaceBackground.naturalWidth;
        const backgroundH = rotateForPortrait ? options.duelSpaceBackground.naturalWidth : options.duelSpaceBackground.naturalHeight;
        const scale = Math.max(visible.width / backgroundW, visible.height / backgroundH);
        const drawW = options.duelSpaceBackground.naturalWidth * scale;
        const drawH = options.duelSpaceBackground.naturalHeight * scale;
        ctx.save();
        ctx.translate(visible.width / 2, visible.height / 2);
        if (rotateForPortrait) ctx.rotate(Math.PI / 2);
        ctx.drawImage(options.duelSpaceBackground, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
        return;
      }
      ctx.fillStyle = "#03050a";
      ctx.fillRect(0, 0, visible.width, visible.height);
      const spacing = 42;
      for (let y = -spacing; y < visible.height + spacing; y += spacing) {
        for (let x = -spacing; x < visible.width + spacing; x += spacing) {
          const seed = ((Math.floor(x / spacing) * 73 + Math.floor(y / spacing) * 151) >>> 0);
          if (seed % 5 !== 0) continue;
          const size = seed % 17 === 0 ? 3 : 2;
          ctx.fillStyle = seed % 11 === 0 ? "#b7c9ff" : "#eef3ff";
          ctx.fillRect(x + (seed % 29), y + ((seed >>> 5) % 31), size, size);
        }
      }
      return;
    }
    const desert = options.getMapId() === options.desertMapId;
    const snow = options.getMapId() === options.snowMapId;
    ctx.fillStyle = snow ? "#bfddeb" : desert ? "#d9a95f" : "#31945b";
    ctx.fillRect(0, 0, visible.width, visible.height);
    for (const path of options.paths) {
      const x = Math.floor(path.x - camera.x);
      const y = Math.floor(path.y - camera.y);
      ctx.fillStyle = snow ? "#8fb7d0" : desert ? "#c48b4b" : "#8b6551";
      ctx.fillRect(x, y, path.w, path.h);
      ctx.fillStyle = snow ? "rgba(61,104,137,.18)" : desert ? "rgba(111,65,32,.15)" : "rgba(68,38,29,.12)";
      for (let yy = y + 7; yy < y + path.h; yy += 18) {
        for (let xx = x + ((yy / 18) % 2 ? 4 : 12); xx < x + path.w; xx += 24) ctx.fillRect(xx, yy, 2, 2);
      }
    }
  }

  function drawTree(tree: TreeDecor) {
    const visible = visibleSize();
    const x = Math.floor(tree.x - camera.x);
    const y = Math.floor(tree.y - camera.y);
    const drawSize = Math.round(154 * tree.s);
    const halfWidth = Math.ceil(drawSize / 2);
    const cullPadding = drawSize + 32;
    if (x + halfWidth < -cullPadding || x - halfWidth > visible.width + cullPadding || y < -cullPadding || y - drawSize > visible.height + cullPadding) return;
    if (!options.treeSpritesheet.complete || options.treeSpritesheet.naturalWidth <= 0) return;
    const source = options.treeSpriteBounds()[tree.variant % 16];
    if (!source) return;
    const drawWidth = Math.round(drawSize * source.w / source.h);
    ctx.drawImage(options.treeSpritesheet, source.x, source.y, source.w, source.h, Math.round(x - drawWidth / 2), Math.round(y - drawSize), drawWidth, drawSize);
  }

  function drawPortalAt(portal: Portal, cutscene = false) {
    if (!options.portalArch.complete || options.portalArch.naturalWidth <= 0) return;
    const x = Math.round(portal.x - camera.x);
    const y = Math.round(portal.y - camera.y);
    options.drawShadow(x, y - 4, Math.round(portal.width * .68), .14);
    const cutsceneIntensity = cutscene ? options.portalRevealIntensity() : -1;
    const cutsceneActive = cutsceneIntensity >= 0;
    const portalIntensity = cutsceneActive ? cutsceneIntensity : options.portalIsUnlocked(portal) ? 1 : 0;
    if (portalIntensity > 0 && options.portalSwirl.complete && options.portalSwirl.naturalWidth > 0) {
      // Ease through the sprite sequence instead of abruptly reversing at
      // either end. The swirl now settles into and out of each turn.
      const cycle = options.getGameTime() / 3;
      const sweep = .5 - Math.cos(cycle * TAU) * .5;
      const frame = Math.round(sweep * 15);
      const cell = options.portalSwirl.naturalWidth / 4;
      const width = Math.round(portal.width * .59 * 1.265 * 1.05);
      const height = Math.round(portal.height * .75 * 1.265);
      ctx.save();
      ctx.globalAlpha = portalIntensity;
      ctx.drawImage(options.portalSwirl, (frame % 4) * cell, Math.floor(frame / 4) * cell, cell, cell, Math.round(x - width / 2), Math.round(y - height - 5), width, height);
      ctx.restore();
    }
    ctx.drawImage(options.portalArch, Math.round(x - portal.width / 2), Math.round(y - portal.height), portal.width, portal.height);
    const destinationOpacity = cutsceneActive ? options.portalDestinationOpacity() : options.portalIsUnlocked(portal) ? 1 : 0;
    if (destinationOpacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = destinationOpacity;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    options.outlinedText(options.mapName(portal.destination), x, Math.round(y - portal.height - 8 + Math.sin(options.getGameTime() * 2.4) * 3), "#f5e9c4", 4);
    ctx.restore();
  }

  function drawPortal() {
    drawPortalAt(options.activePortal());
  }

  function drawCutscenePortal() {
    drawPortalAt(options.cutscenePortal(), true);
  }

  function drawSecondaryPortal() {
    const portal = options.secondaryPortal();
    if (portal) drawPortalAt(portal);
  }

  function drawCactus(cactus: CactusDecor) {
    const visible = visibleSize();
    const x = Math.round(cactus.x - camera.x);
    const y = Math.round(cactus.y - camera.y);
    if (x < -90 || y < -100 || x > visible.width + 90 || y > visible.height + 50) return;
    const h = Math.round(68 * cactus.s);
    const w = Math.max(10, Math.round(15 * cactus.s));
    ctx.fillStyle = "#245a36"; ctx.fillRect(x - w / 2 - 2, y - h, w + 4, h);
    ctx.fillStyle = "#3f8050"; ctx.fillRect(x - w / 2, y - h, w - 2, h - 4);
    ctx.fillStyle = "#70a961"; ctx.fillRect(x - w / 2 + 2, y - h + 4, 3, h - 10);
    const armY = y - Math.round(h * .58);
    const direction = cactus.variant % 2 ? -1 : 1;
    ctx.fillStyle = "#245a36";
    ctx.fillRect(x + direction * (w / 2 - 1), armY, direction * Math.round(19 * cactus.s), Math.round(10 * cactus.s));
    ctx.fillRect(x + direction * Math.round(16 * cactus.s), armY - Math.round(18 * cactus.s), Math.round(10 * cactus.s), Math.round(27 * cactus.s));
    ctx.fillStyle = "#3f8050";
    ctx.fillRect(x + direction * Math.round(14 * cactus.s), armY - Math.round(16 * cactus.s), direction * Math.round(8 * cactus.s), Math.round(23 * cactus.s));
  }

  function drawRock(rock: RockDecor) {
    const visible = visibleSize(); const x = Math.round(rock.x - camera.x); const y = Math.round(rock.y - camera.y);
    if (x < -60 || y < -60 || x > visible.width + 60 || y > visible.height + 40) return;
    const w = Math.round(35 * rock.s); const h = Math.round(22 * rock.s);
    options.drawShadow(x, y, Math.round(w * 1.2), .11);
    ctx.fillStyle = "#79543d"; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * .32, y - h * .72); ctx.lineTo(x + w * .2, y - h); ctx.lineTo(x + w / 2, y - h * .28); ctx.lineTo(x + w * .38, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b77b4b"; ctx.beginPath(); ctx.moveTo(x - w * .32, y - h * .72); ctx.lineTo(x + w * .2, y - h); ctx.lineTo(x + w * .12, y - h * .45); ctx.closePath(); ctx.fill();
  }

  function drawDesertGrass(grass: DesertGrassDecor) {
    const visible = visibleSize(); const x = Math.round(grass.x - camera.x); const y = Math.round(grass.y - camera.y);
    if (x < -10 || y < -10 || x > visible.width + 10 || y > visible.height + 10) return;
    ctx.fillStyle = grass.variant % 2 ? "#8b7b3d" : "#a28a43"; ctx.fillRect(x - 1, y - 6, 2, 7); ctx.fillRect(x - 5, y - 3, 2, 5); ctx.fillRect(x + 3, y - 4, 2, 6);
  }

  function drawSnowPine(tree: SnowPineDecor) {
    const visible = visibleSize(); const x = Math.round(tree.x - camera.x); const y = Math.round(tree.y - camera.y);
    if (x < -150 || y < -230 || x > visible.width + 150 || y > visible.height + 60) return;
    if (!options.snowPine.complete || options.snowPine.naturalWidth <= 0) return;
    const height = Math.round(185 * tree.s);
    const width = Math.round(height * options.snowPine.naturalWidth / options.snowPine.naturalHeight);
    ctx.drawImage(options.snowPine, x - width / 2, y - height, width, height);
  }

  function drawSnowTuft(tuft: SnowTuftDecor) {
    const visible = visibleSize(); const x = Math.round(tuft.x - camera.x); const y = Math.round(tuft.y - camera.y);
    if (x < -8 || y < -8 || x > visible.width + 8 || y > visible.height + 8) return;
    ctx.fillStyle = tuft.variant % 2 ? "rgba(255,255,255,.78)" : "rgba(221,242,255,.76)";
    ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillRect(x, y - 3, 2, 5);
  }

  function drawGrass(grass: GrassDecor) {
    const visible = visibleSize(); const x = Math.floor(grass.x - camera.x); const y = Math.floor(grass.y - camera.y);
    if (x < -8 || y < -8 || x > visible.width + 8 || y > visible.height + 8) return;
    ctx.fillStyle = grass.variant % 2 ? "#237b49" : "#267f4c"; ctx.fillRect(x - 1, y - 5, 2, 7); ctx.fillRect(x - 5, y - 2, 2, 5); ctx.fillRect(x + 3, y - 3, 2, 6); if (grass.variant > 1) ctx.fillRect(x + 6, y, 2, 3);
  }

  function drawPetal(petal: PetalDecor) {
    const visible = visibleSize(); const x = Math.floor(petal.x - camera.x); const y = Math.floor(petal.y - camera.y);
    if (x < -8 || y < -8 || x > visible.width + 8 || y > visible.height + 8) return;
    ctx.fillStyle = ["#d9f4df", "#f3f0c6", "#ccebea"][petal.variant % 3]; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.fillRect(x, y, 1, 1);
  }

  function drawDecor() {}

  function drawMinimap(remotePlayers: RemotePlayer[]) {
    const view = viewport(); const size = Math.min(126, Math.max(118, view.width * .17)); const x = view.width - size; const y = 0;
    ctx.save(); ctx.fillStyle = "rgba(12,18,15,.82)"; ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; options.roundRect(x, y, size, size, 10); ctx.fill(); ctx.stroke();
    const sx = size / WORLD.w; const sy = size / WORLD.h;
    ctx.save(); options.roundRect(x + 5, y + 5, size - 10, size - 10, 7); ctx.clip();
    const desert = options.getMapId() === options.desertMapId;
    const snow = options.getMapId() === options.snowMapId;
    ctx.fillStyle = snow ? "#bfddeb" : desert ? "#d9a95f" : "#31945b"; ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
    ctx.fillStyle = snow ? "#8fb7d0" : desert ? "#c48b4b" : "#8b6551"; for (const path of options.paths) ctx.fillRect(x + path.x * sx, y + path.y * sy, path.w * sx, path.h * sy);
    ctx.fillStyle = "#ff5d5d"; for (const enemy of options.enemies) { const marker = ENEMY_TYPES[enemy.type].elite ? 5 : 3; ctx.fillRect(x + enemy.x * sx - 1, y + enemy.y * sy - 1, marker, marker); }
    ctx.fillStyle = "#58e878"; for (const player of remotePlayers) ctx.fillRect(x + player.x * sx - 2, y + player.y * sy - 2, 5, 5);
    ctx.fillStyle = "#fff"; ctx.fillRect(x + options.player.x * sx - 2, y + options.player.y * sy - 2, 5, 5);
    ctx.strokeStyle = "rgba(255,255,255,.52)"; ctx.lineWidth = 1; ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, (view.width / camera.zoom) * sx, (view.height / camera.zoom) * sy); ctx.restore(); ctx.restore();
  }

  return { drawGround, drawStaticWorld, invalidateStaticWorld, drawTree, drawCactus, drawSnowPine, drawPortal, drawCutscenePortal, drawSecondaryPortal, drawDecor, drawMinimap };
}
