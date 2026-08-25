import { TAU, WORLD } from "../constants";
import { ENEMY_TYPES } from "../enemies";
import type { MapPlayerMarker } from "../../wildwood-coop";
import type { Camera } from "./camera";
import type { DragonBossState, EnemyState, FrostclawBossState, MagmaliskBossState, PlayerState, SpiderBossState } from "./types";
import type { MapId, WorldDecor, WorldPath } from "../world";
import {
  paintStaticTile,
  paintStaticTilePlaceholder,
  type StaticTileImage,
  type StaticTileScene,
  type StaticTileTreeBounds,
} from "./static-tile-painter";

type Viewport = { width: number; height: number };
type Portal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type EmptyArch = Omit<Portal, "destination">;
type TreeSpriteBounds = StaticTileTreeBounds;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type RockDecor = Extract<WorldDecor, { type: "rock" }>;
type DesertGrassDecor = Extract<WorldDecor, { type: "desertGrass" }>;
type SnowPineDecor = Extract<WorldDecor, { type: "snowPine" }>;
type SnowTuftDecor = Extract<WorldDecor, { type: "snowTuft" }>;
type UpgradeBenchDecor = Extract<WorldDecor, { type: "upgradeBench" }>;
type LavaRockDecor = Extract<WorldDecor, { type: "lavaRock" }>;
type CharredTreeDecor = Extract<WorldDecor, { type: "charredTree" }>;
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
  lavaMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  player: PlayerState;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  duelSpaceBackground: HTMLImageElement;
  treeSpritesheet: HTMLImageElement;
  actorShadowSprite: HTMLImageElement;
  treeSpriteBounds: () => TreeSpriteBounds[];
  portalArch: HTMLImageElement;
  portalSwirl: HTMLImageElement;
  snowPine: HTMLImageElement;
  upgradeBench: HTMLImageElement;
  upgradeBenchStatus: () => { itemSprite?: HTMLImageElement; timer: string } | null;
  lavaPools: HTMLImageElement[];
  lavaRocks: HTMLImageElement[];
  charredTrees: HTMLImageElement[];
  drawShadow: DrawShadow;
  outlinedText: OutlinedText;
};

export function createWorldRenderer(options: WorldRendererOptions) {
  const { ctx, camera } = options;
  const STATIC_TILE_SIZE = 640;
  const STATIC_TILE_MIN_LIMIT = 12;
  const STATIC_TILE_CACHE_PADDING = 4;
  const MINIMAP_FRAME_INTERVAL_MS = 125;
  type CachedStaticTile = HTMLCanvasElement | ImageBitmap;
  type StaticTileWorkerResult =
    | { type: "tile"; generation: number; key: string; bitmap: ImageBitmap }
    | { type: "error"; generation: number; key: string }
    | { type: "unsupported" };
  const staticTiles = new Map<string, CachedStaticTile>();
  const pendingStaticTiles = new Set<string>();
  const staticTilePlaceholders = new Map<string, HTMLCanvasElement>();
  const minimapCanvas = document.createElement("canvas");
  const minimapCtx = minimapCanvas.getContext("2d");
  const staticTileWorker = (() => {
    if (typeof Worker === "undefined") return null;
    try {
      return new Worker(new URL("./static-tile-worker.ts", import.meta.url), { type: "module" });
    } catch {
      return null;
    }
  })();
  let staticTileWorkerEnabled = Boolean(staticTileWorker);
  let staticTileGeneration = 0;
  let configuredWorkerGeneration = -1;
  let sceneGeneration = -1;
  let cachedStaticScene: StaticTileScene | null = null;
  let minimapCacheKey = "";
  let nextMinimapFrameAt = 0;
  let staticTileLimit = STATIC_TILE_MIN_LIMIT;
  const viewport = () => options.getViewport();
  const visibleSize = () => ({ width: viewport().width / camera.zoom, height: viewport().height / camera.zoom });

  function mapColors() {
    const desert = options.getMapId() === options.desertMapId;
    const snow = options.getMapId() === options.snowMapId;
    const lava = options.getMapId() === options.lavaMapId;
    return {
      ground: lava ? "#f5b255" : snow ? "#bfddeb" : desert ? "#d9a95f" : "#31945b",
      path: lava ? "#df754b" : snow ? "#8fb7d0" : desert ? "#c48b4b" : "#8b6551",
      pathDetail: lava ? "rgba(104,31,26,.24)" : snow ? "rgba(61,104,137,.18)" : desert ? "rgba(111,65,32,.15)" : "rgba(68,38,29,.12)",
    };
  }

  function staticScene() {
    if (cachedStaticScene && sceneGeneration === staticTileGeneration) return cachedStaticScene;
    const lava = options.getMapId() === options.lavaMapId;
    cachedStaticScene = {
      tileSize: STATIC_TILE_SIZE,
      colors: mapColors(),
      paths: options.paths,
      decor: options.decor,
      treeBounds: options.treeSpriteBounds(),
      snowPineAspect: options.snowPine.naturalWidth > 0
        ? options.snowPine.naturalWidth / options.snowPine.naturalHeight
        : 0,
      lavaRockUrls: lava ? options.lavaRocks.map((image) => image.currentSrc || image.src).filter(Boolean) : [],
      lavaPoolUrls: lava ? options.lavaPools.map((image) => image.currentSrc || image.src).filter(Boolean) : [],
    };
    sceneGeneration = staticTileGeneration;
    return cachedStaticScene;
  }

  function closeStaticTile(tile: CachedStaticTile) {
    if (typeof ImageBitmap !== "undefined" && tile instanceof ImageBitmap) tile.close();
  }

  function trimStaticTiles() {
    while (staticTiles.size > staticTileLimit) {
      const oldestKey = staticTiles.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = staticTiles.get(oldestKey);
      staticTiles.delete(oldestKey);
      if (oldest) closeStaticTile(oldest);
    }
  }

  function cacheStaticTile(key: string, tile: CachedStaticTile) {
    const previous = staticTiles.get(key);
    if (previous && previous !== tile) closeStaticTile(previous);
    staticTiles.delete(key);
    staticTiles.set(key, tile);
    trimStaticTiles();
  }

  function disableStaticTileWorker() {
    if (!staticTileWorkerEnabled) return;
    staticTileWorkerEnabled = false;
    staticTileWorker?.terminate();
    pendingStaticTiles.clear();
    staticTilePlaceholders.clear();
  }

  staticTileWorker?.addEventListener("message", ({ data }: MessageEvent<StaticTileWorkerResult>) => {
    if (data.type === "unsupported") {
      disableStaticTileWorker();
      return;
    }
    if (data.type === "error") {
      if (data.generation === staticTileGeneration) pendingStaticTiles.delete(data.key);
      disableStaticTileWorker();
      return;
    }
    if (data.generation !== staticTileGeneration) {
      data.bitmap.close();
      return;
    }
    pendingStaticTiles.delete(data.key);
    staticTilePlaceholders.delete(data.key);
    cacheStaticTile(data.key, data.bitmap);
  });
  staticTileWorker?.addEventListener("error", disableStaticTileWorker);
  if (!options.actorShadowSprite.complete) options.actorShadowSprite.addEventListener("load", invalidateStaticWorld, { once: true });
  if (!options.snowPine.complete) options.snowPine.addEventListener("load", invalidateStaticWorld, { once: true });
  for (const image of [...options.lavaRocks, ...options.lavaPools]) {
    if (!image.complete) image.addEventListener("load", invalidateStaticWorld, { once: true });
  }

  function staticImages(images: readonly HTMLImageElement[]): StaticTileImage[] {
    return images.flatMap((image) => image.complete && image.naturalWidth > 0
      ? [{ source: image, width: image.naturalWidth, height: image.naturalHeight }]
      : []);
  }

  function configureStaticTileWorker(scene: StaticTileScene) {
    if (!staticTileWorkerEnabled || !staticTileWorker || configuredWorkerGeneration === staticTileGeneration) return;
    staticTileWorker.postMessage({
      type: "configure",
      generation: staticTileGeneration,
      scene,
      shadowUrl: options.actorShadowSprite.currentSrc || options.actorShadowSprite.src,
    });
    configuredWorkerGeneration = staticTileGeneration;
  }

  function createTileCanvas() {
    const tile = document.createElement("canvas");
    tile.width = STATIC_TILE_SIZE;
    tile.height = STATIC_TILE_SIZE;
    return tile;
  }

  function staticTile(tileX: number, tileY: number): CachedStaticTile {
    const key = `${options.getMapId()}:${tileX}:${tileY}`;
    const cached = staticTiles.get(key);
    if (cached) {
      staticTiles.delete(key);
      staticTiles.set(key, cached);
      return cached;
    }
    const scene = staticScene();
    if (staticTileWorkerEnabled && staticTileWorker) {
      configureStaticTileWorker(scene);
      if (!pendingStaticTiles.has(key)) {
        pendingStaticTiles.add(key);
        staticTileWorker.postMessage({ type: "paint", generation: staticTileGeneration, key, tileX, tileY });
      }
      const existingPlaceholder = staticTilePlaceholders.get(key);
      if (existingPlaceholder) return existingPlaceholder;
      const placeholder = createTileCanvas();
      const placeholderContext = placeholder.getContext("2d");
      if (placeholderContext) paintStaticTilePlaceholder(placeholderContext, scene, tileX, tileY);
      staticTilePlaceholders.set(key, placeholder);
      return placeholder;
    }
    const tile = createTileCanvas();
    const tileContext = tile.getContext("2d");
    if (tileContext) {
      const shadow = options.actorShadowSprite.complete && options.actorShadowSprite.naturalWidth > 0
        ? options.actorShadowSprite
        : undefined;
      paintStaticTile(tileContext, scene, tileX, tileY, shadow, staticImages(options.lavaRocks), staticImages(options.lavaPools));
    }
    cacheStaticTile(key, tile);
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
    trimStaticTiles();
  }

  function invalidateStaticWorld() {
    for (const tile of staticTiles.values()) closeStaticTile(tile);
    staticTiles.clear();
    pendingStaticTiles.clear();
    staticTilePlaceholders.clear();
    staticTileGeneration += 1;
    configuredWorkerGeneration = -1;
    sceneGeneration = -1;
    cachedStaticScene = null;
    minimapCacheKey = "";
    nextMinimapFrameAt = 0;
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
    const colors = mapColors();
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, visible.width, visible.height);
    for (const path of options.paths) {
      const x = Math.floor(path.x - camera.x);
      const y = Math.floor(path.y - camera.y);
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, path.w, path.h);
      ctx.fillStyle = colors.pathDetail;
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

  function drawUpgradeBench(bench: UpgradeBenchDecor) {
    const visible = visibleSize();
    const x = Math.round(bench.x - camera.x);
    const y = Math.round(bench.y - camera.y);
    if (x < -120 || y < -160 || x > visible.width + 120 || y > visible.height + 50) return;
    if (!options.upgradeBench.complete || options.upgradeBench.naturalWidth <= 0) return;
    const width = Math.round(180 * bench.s);
    const height = Math.round(width * options.upgradeBench.naturalHeight / options.upgradeBench.naturalWidth);
    // The generated sprite has generous transparent padding below its feet;
    // Lift the shadow into the sprite's padded feet so the bench stays planted.
    options.drawShadow(x, y - 21, Math.round(width * .68), .2);
    ctx.drawImage(options.upgradeBench, Math.round(x - width / 2), Math.round(y - height), width, height);
    const upgrade = options.upgradeBenchStatus();
    if (upgrade?.itemSprite?.complete && upgrade.itemSprite.naturalWidth > 0) {
      const maxWidth = 44;
      const maxHeight = 34;
      const scale = Math.min(maxWidth / upgrade.itemSprite.naturalWidth, maxHeight / upgrade.itemSprite.naturalHeight);
      const itemWidth = Math.max(1, Math.round(upgrade.itemSprite.naturalWidth * scale));
      const itemHeight = Math.max(1, Math.round(upgrade.itemSprite.naturalHeight * scale));
      const itemCenterX = x - Math.round(width * .1);
      const itemCenterY = Math.round(y - height + height * .39);
      ctx.save();
      ctx.shadowColor = "rgba(116,225,255,.8)";
      ctx.shadowBlur = 8;
      ctx.drawImage(upgrade.itemSprite, Math.round(itemCenterX - itemWidth / 2), Math.round(itemCenterY - itemHeight / 2), itemWidth, itemHeight);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const labelY = Math.round(y - height - (upgrade ? 21 : 7) + Math.sin(options.getGameTime() * 2.2) * 2);
    options.outlinedText(bench.label, x, labelY, "#f5e9c4", 4);
    if (upgrade) {
      ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      options.outlinedText(upgrade.timer, x, labelY + 16, "#8fe7ff", 4);
    }
    ctx.restore();
  }

  function drawLavaRock(rock: LavaRockDecor) {
    const image = options.lavaRocks[rock.variant % options.lavaRocks.length];
    if (!image?.complete || image.naturalWidth <= 0) return;
    const visible = visibleSize();
    const x = Math.round(rock.x - camera.x);
    const y = Math.round(rock.y - camera.y);
    const width = Math.round(150 * rock.s);
    const height = Math.round(width * image.naturalHeight / image.naturalWidth);
    if (x + width / 2 < -50 || x - width / 2 > visible.width + 50 || y < -50 || y - height > visible.height + 50) return;
    ctx.drawImage(image, x - width / 2, y - height, width, height);
  }

  function drawCharredTree(tree: CharredTreeDecor) {
    const image = options.charredTrees[tree.variant % options.charredTrees.length];
    if (!image?.complete || image.naturalWidth <= 0) return;
    const visible = visibleSize();
    const x = Math.round(tree.x - camera.x);
    const y = Math.round(tree.y - camera.y);
    const height = Math.round(150 * tree.s);
    const width = Math.round(height * image.naturalWidth / image.naturalHeight);
    if (x + width / 2 < -50 || x - width / 2 > visible.width + 50 || y < -50 || y - height > visible.height + 50) return;
    ctx.drawImage(image, x - width / 2, y - height, width, height);
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

  function drawDecor() {
    // Lava pools and rocks are fixed, non-interactive scenery baked into the
    // cached ground tiles. Nothing in lava decor needs per-frame drawing.
  }

  function minimapRoundedRect(target: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    const corner = Math.min(radius, width / 2, height / 2);
    target.beginPath();
    target.moveTo(x + corner, y);
    target.arcTo(x + width, y, x + width, y + height, corner);
    target.arcTo(x + width, y + height, x, y + height, corner);
    target.arcTo(x, y + height, x, y, corner);
    target.arcTo(x, y, x + width, y, corner);
    target.closePath();
  }

  function renderMinimapFrame(remotePlayers: MapPlayerMarker[], size: number, view: Viewport) {
    if (!minimapCtx) return;
    const dpr = options.getDevicePixelRatio();
    const cacheKey = `${options.getMapId()}:${size}:${dpr}`;
    const pixelSize = Math.round(size * dpr);
    if (minimapCanvas.width !== pixelSize || minimapCanvas.height !== pixelSize) {
      minimapCanvas.width = pixelSize;
      minimapCanvas.height = pixelSize;
    } else {
      minimapCtx.setTransform(1, 0, 0, 1, 0, 0);
      minimapCtx.clearRect(0, 0, pixelSize, pixelSize);
    }
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    minimapCtx.imageSmoothingEnabled = false;
    const draw = minimapCtx;
    draw.save(); draw.fillStyle = "rgba(12,18,15,.82)"; draw.strokeStyle = "rgba(255,255,255,.25)"; draw.lineWidth = 2; minimapRoundedRect(draw, 0, 0, size, size, 10); draw.fill(); draw.stroke();
    const innerX = 5; const innerY = 5; const innerSize = size - 10; const sx = innerSize / WORLD.w; const sy = innerSize / WORLD.h;
    draw.save(); minimapRoundedRect(draw, 5, 5, size - 10, size - 10, 7); draw.clip();
    const desert = options.getMapId() === options.desertMapId;
    const snow = options.getMapId() === options.snowMapId;
    const colors = mapColors();
    draw.fillStyle = colors.ground; draw.fillRect(innerX, innerY, innerSize, innerSize);
    draw.fillStyle = colors.path; for (const path of options.paths) draw.fillRect(innerX + path.x * sx, innerY + path.y * sy, path.w * sx, path.h * sy);
    draw.fillStyle = "#ff5d5d"; for (const enemy of options.enemies) { const marker = ENEMY_TYPES[enemy.type].elite ? 5 : 3; draw.fillRect(innerX + enemy.x * sx - 1, innerY + enemy.y * sy - 1, marker, marker); }

    const drawPortalMarker = (portal: Portal) => {
      const px = Math.round(innerX + portal.x * sx); const py = Math.round(innerY + portal.y * sy);
      const unlocked = options.portalIsUnlocked(portal);
      draw.fillStyle = "#132433"; draw.fillRect(px - 4, py - 5, 9, 8);
      draw.fillStyle = unlocked ? "#d8fbff" : "#89949b"; draw.fillRect(px - 3, py - 5, 7, 2); draw.fillRect(px - 4, py - 3, 2, 6); draw.fillRect(px + 3, py - 3, 2, 6);
      draw.fillStyle = unlocked ? "#5fe3ff" : "#3f4a50"; draw.fillRect(px - 2, py - 3, 5, 6);
      if (unlocked) { draw.fillStyle = "#efffff"; draw.fillRect(px, py - 2, 1, 4); }
    };
    drawPortalMarker(options.activePortal());
    const secondary = options.secondaryPortal();
    if (secondary) drawPortalMarker(secondary);

    const mapBoss = options.getMapId() === options.tutorialMapId
      ? { state: options.boss, color: "#ff6b52" }
      : desert
        ? { state: options.spiderBoss, color: "#e9ac4e" }
        : snow
          ? { state: options.frostclawBoss, color: "#67dcff" }
          : options.getMapId() === options.lavaMapId
            ? { state: options.magmaliskBoss, color: "#ff752f" }
            : null;
    if (mapBoss) {
      const bx = Math.round(innerX + mapBoss.state.x * sx); const by = Math.round(innerY + mapBoss.state.y * sy);
      draw.globalAlpha = mapBoss.state.dead ? .46 : 1;
      draw.fillStyle = "#101820"; draw.fillRect(bx - 5, by - 4, 11, 9);
      draw.fillStyle = mapBoss.color; draw.fillRect(bx - 4, by - 3, 9, 6); draw.fillRect(bx - 3, by - 5, 2, 2); draw.fillRect(bx + 2, by - 5, 2, 2); draw.fillRect(bx - 3, by + 3, 2, 2); draw.fillRect(bx + 2, by + 3, 2, 2);
      draw.fillStyle = "#fff"; draw.fillRect(bx - 2, by - 1, 2, 2); draw.fillRect(bx + 2, by - 1, 2, 2);
      draw.globalAlpha = 1;
    }

    draw.fillStyle = "#58e878"; for (const player of remotePlayers) draw.fillRect(innerX + player.x * sx - 2, innerY + player.y * sy - 2, 5, 5);
    draw.fillStyle = "#fff"; draw.fillRect(innerX + options.player.x * sx - 2, innerY + options.player.y * sy - 2, 5, 5);
    draw.strokeStyle = "rgba(255,255,255,.52)"; draw.lineWidth = 1; draw.strokeRect(innerX + camera.x * sx, innerY + camera.y * sy, (view.width / camera.zoom) * sx, (view.height / camera.zoom) * sy); draw.restore(); draw.restore();
    minimapCacheKey = cacheKey;
  }

  function drawMinimap(remotePlayers: MapPlayerMarker[]) {
    const view = viewport();
    const size = Math.round(Math.min(126, Math.max(118, view.width * .17)));
    const cacheKey = `${options.getMapId()}:${size}:${options.getDevicePixelRatio()}`;
    const now = performance.now();
    if (cacheKey !== minimapCacheKey || now >= nextMinimapFrameAt) {
      renderMinimapFrame(remotePlayers, size, view);
      nextMinimapFrameAt = now + MINIMAP_FRAME_INTERVAL_MS;
    }
    if (minimapCanvas.width > 0 && minimapCanvas.height > 0) ctx.drawImage(minimapCanvas, view.width - size, 0, size, size);
  }

  return { drawGround, drawStaticWorld, invalidateStaticWorld, drawTree, drawCactus, drawSnowPine, drawUpgradeBench, drawLavaRock, drawCharredTree, drawPortal, drawCutscenePortal, drawSecondaryPortal, drawDecor, drawMinimap };
}
