import { TAU, WORLD } from "../constants";
import { ENEMY_TYPES } from "../enemies";
import { drawPortalMapMarker, portalDestinationTextColor } from "../portal-presentation";
import type { MapPlayerMarker } from "../../wildwood-coop";
import type { Camera } from "./camera";
import type { DragonBossState, EnemyState, FrostclawBossState, GloomrootBossState, MagmaliskBossState, PlayerState, SpiderBossState, TidewyrmBossState } from "./types";
import { SAMURAI_GARDEN_MAP_ID, type MapId, type WorldDecor, type WorldPath } from "../world";
import type { StaticWorldColorQuadFrame, StaticWorldLayer, StaticWorldSpriteFrame, StaticWorldTileFrame } from "./webgl-static-world-layer";
import {
  paintStaticTile,
  type StaticTileImage,
  type StaticTileScene,
  type StaticTileTreeBounds,
} from "./static-tile-painter";
import { snapWorldRenderCoordinate } from "./render-space";

export { snapWorldRenderCoordinate } from "./render-space";

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

const STATIC_TILE_SIZE = 640;

export function staticWorldTileRange(
  cameraX: number,
  cameraY: number,
  visibleWidth: number,
  visibleHeight: number,
  padding = 1,
) {
  const maximumTileX = Math.ceil(WORLD.w / STATIC_TILE_SIZE) - 1;
  const maximumTileY = Math.ceil(WORLD.h / STATIC_TILE_SIZE) - 1;
  return {
    startX: Math.max(0, Math.floor(cameraX / STATIC_TILE_SIZE) - padding),
    startY: Math.max(0, Math.floor(cameraY / STATIC_TILE_SIZE) - padding),
    endX: Math.min(maximumTileX, Math.floor((cameraX + visibleWidth) / STATIC_TILE_SIZE) + padding),
    endY: Math.min(maximumTileY, Math.floor((cameraY + visibleHeight) / STATIC_TILE_SIZE) + padding),
  };
}

export type WorldRendererOptions = {
  ctx: CanvasRenderingContext2D;
  staticWorldLayer?: StaticWorldLayer | null;
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
  infernalMapId: MapId;
  waterMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  player: PlayerState;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  duelSpaceBackground: HTMLImageElement;
  treeSpritesheet: HTMLImageElement;
  nightTreeSpritesheet: HTMLImageElement;
  actorShadowSprite: HTMLImageElement;
  treeSpriteBounds: () => TreeSpriteBounds[];
  nightTreeSpriteBounds: () => TreeSpriteBounds[];
  portalArch: HTMLImageElement;
  portalSwirls: Record<MapId, HTMLImageElement>;
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
  const STATIC_TILE_MIN_LIMIT = 12;
  const STATIC_TILE_CACHE_PADDING = 4;
  const STATIC_TILE_WORKER_CONCURRENCY = 2;
  const LAVA_ROCK_BUCKET_SIZE = 640;
  const LAVA_ROCK_CULL_PADDING = 200;
  const MINIMAP_FRAME_INTERVAL_MS = 125;
  type CachedStaticTile = HTMLCanvasElement | ImageBitmap;
  type StaticTileWorkerResult =
    | { type: "tile"; generation: number; key: string; bitmap: ImageBitmap }
    | { type: "error"; generation: number; key: string }
    | { type: "unsupported" };
  type StaticTileWorkerRequest = {
    generation: number;
    key: string;
    tileX: number;
    tileY: number;
  };
  const staticTiles = new Map<string, CachedStaticTile>();
  const pendingStaticTiles = new Set<string>();
  const queuedStaticTileRequests: StaticTileWorkerRequest[] = [];
  const activeStaticTileRequests = new Set<string>();
  const staticTileWaiters = new Set<() => void>();
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
  let staticTilePlaceholder: HTMLCanvasElement | null = null;
  let staticTilePlaceholderGeneration = -1;
  let lavaRockBucketGeneration = -1;
  const lavaRockBuckets = new Map<string, LavaRockDecor[]>();
  const visibleLavaRocks: LavaRockDecor[] = [];
  const gpuWorldSprites: StaticWorldSpriteFrame[] = [];
  let lavaRocksRenderedByWebGL = false;
  const viewport = () => options.getViewport();
  const visibleSize = () => ({ width: viewport().width / camera.zoom, height: viewport().height / camera.zoom });
  const snapToWorldPixel = (value: number) => snapWorldRenderCoordinate(value, camera.zoom, options.getDevicePixelRatio());
  const isLavaTerrain = () => options.getMapId() === options.lavaMapId;

  function mapColors() {
    const desert = options.getMapId() === options.desertMapId;
    const snow = options.getMapId() === options.snowMapId;
    const lava = options.getMapId() === options.lavaMapId;
    const infernal = options.getMapId() === options.infernalMapId;
    const water = options.getMapId() === options.waterMapId;
    const samurai = options.getMapId() === SAMURAI_GARDEN_MAP_ID;
    return {
      ground: samurai ? "#78a76f" : water ? "#238c9a" : infernal ? "#100e17" : lava ? "#f5b255" : snow ? "#bfddeb" : desert ? "#d9a95f" : "#31945b",
      path: samurai ? "#d9c8ae" : water ? "#d5c58e" : infernal ? "#261a26" : lava ? "#df754b" : snow ? "#8fb7d0" : desert ? "#c48b4b" : "#8b6551",
      pathDetail: samurai ? "rgba(102,69,75,.2)" : water ? "rgba(255,248,198,.26)" : infernal ? "rgba(138,70,76,.2)" : lava ? "rgba(104,31,26,.24)" : snow ? "rgba(61,104,137,.18)" : desert ? "rgba(111,65,32,.15)" : "rgba(68,38,29,.12)",
    };
  }

  function staticScene() {
    if (cachedStaticScene && sceneGeneration === staticTileGeneration) return cachedStaticScene;
    const lava = isLavaTerrain();
    cachedStaticScene = {
      tileSize: STATIC_TILE_SIZE,
      colors: mapColors(),
      paths: options.paths,
      decor: lava ? options.decor.filter((decor) => decor.type !== "lavaRock") : options.decor,
      treeBounds: options.getMapId() === options.infernalMapId
        ? options.nightTreeSpriteBounds()
        : options.treeSpriteBounds(),
      snowPineAspect: options.snowPine.naturalWidth > 0
        ? options.snowPine.naturalWidth / options.snowPine.naturalHeight
        : 0,
      lavaPoolUrls: lava ? options.lavaPools.map((image) => image.currentSrc || image.src).filter(Boolean) : [],
    };
    sceneGeneration = staticTileGeneration;
    return cachedStaticScene;
  }

  function closeStaticTile(tile: CachedStaticTile) {
    if ("close" in tile) {
      tile.close();
      return;
    }
    // Canvas backing stores are graphics resources too. Resizing to zero
    // releases their pixel allocation immediately instead of waiting for GC.
    tile.width = 0;
    tile.height = 0;
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
    for (const notify of staticTileWaiters) notify();
  }

  function touchStaticTile(key: string) {
    const tile = staticTiles.get(key);
    if (!tile) return;
    staticTiles.delete(key);
    staticTiles.set(key, tile);
  }

  function disableStaticTileWorker() {
    if (!staticTileWorkerEnabled) return;
    staticTileWorkerEnabled = false;
    staticTileWorker?.terminate();
    pendingStaticTiles.clear();
    queuedStaticTileRequests.length = 0;
    activeStaticTileRequests.clear();
    for (const notify of staticTileWaiters) notify();
  }

  function staticTileRequestId(generation: number, key: string) {
    return `${generation}\u0000${key}`;
  }

  function dispatchStaticTileRequests() {
    if (!staticTileWorkerEnabled || !staticTileWorker || document.hidden) return;
    while (activeStaticTileRequests.size < STATIC_TILE_WORKER_CONCURRENCY && queuedStaticTileRequests.length > 0) {
      const request = queuedStaticTileRequests.shift();
      if (!request || request.generation !== staticTileGeneration) continue;
      activeStaticTileRequests.add(staticTileRequestId(request.generation, request.key));
      staticTileWorker.postMessage({ type: "paint", ...request });
    }
  }

  function finishStaticTileRequest(generation: number, key: string) {
    activeStaticTileRequests.delete(staticTileRequestId(generation, key));
  }

  staticTileWorker?.addEventListener("message", ({ data }: MessageEvent<StaticTileWorkerResult>) => {
    if (data.type === "unsupported") {
      disableStaticTileWorker();
      return;
    }
    if (data.type === "error") {
      finishStaticTileRequest(data.generation, data.key);
      if (data.generation === staticTileGeneration) pendingStaticTiles.delete(data.key);
      disableStaticTileWorker();
      return;
    }
    finishStaticTileRequest(data.generation, data.key);
    if (data.generation !== staticTileGeneration) {
      data.bitmap.close();
      dispatchStaticTileRequests();
      return;
    }
    pendingStaticTiles.delete(data.key);
    cacheStaticTile(data.key, data.bitmap);
    dispatchStaticTileRequests();
  });
  staticTileWorker?.addEventListener("error", disableStaticTileWorker);
  if (!options.actorShadowSprite.complete) options.actorShadowSprite.addEventListener("load", invalidateStaticWorld, { once: true });
  if (!options.snowPine.complete) options.snowPine.addEventListener("load", invalidateStaticWorld, { once: true });
  for (const image of options.lavaPools) {
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

  function sharedStaticTilePlaceholder(scene: StaticTileScene) {
    if (staticTilePlaceholder && staticTilePlaceholderGeneration === staticTileGeneration) {
      return staticTilePlaceholder;
    }
    if (staticTilePlaceholder) closeStaticTile(staticTilePlaceholder);
    const placeholder = document.createElement("canvas");
    placeholder.width = 1;
    placeholder.height = 1;
    const context = placeholder.getContext("2d");
    if (context) {
      context.fillStyle = scene.colors.ground;
      context.fillRect(0, 0, 1, 1);
    }
    staticTilePlaceholder = placeholder;
    staticTilePlaceholderGeneration = staticTileGeneration;
    return placeholder;
  }

  function tileKey(tileX: number, tileY: number) {
    return `${options.getMapId()}:${tileX}:${tileY}`;
  }

  function staticTile(tileX: number, tileY: number): CachedStaticTile {
    const key = tileKey(tileX, tileY);
    const cached = staticTiles.get(key);
    if (cached) {
      touchStaticTile(key);
      return cached;
    }
    const scene = staticScene();
    if (staticTileWorkerEnabled && staticTileWorker) {
      configureStaticTileWorker(scene);
      if (!pendingStaticTiles.has(key)) {
        pendingStaticTiles.add(key);
        queuedStaticTileRequests.push({ generation: staticTileGeneration, key, tileX, tileY });
      }
      // Also resumes a queue that paused while the page was hidden.
      dispatchStaticTileRequests();
      // A single ground-color pixel is enough while the worker paints. The old
      // per-tile 640×640 placeholders duplicated the complete visible working
      // set in graphics memory before any finished tiles arrived.
      return sharedStaticTilePlaceholder(scene);
    }
    const tile = createTileCanvas();
    const tileContext = tile.getContext("2d");
    if (tileContext) {
      const shadow = options.actorShadowSprite.complete && options.actorShadowSprite.naturalWidth > 0
        ? options.actorShadowSprite
        : undefined;
      paintStaticTile(tileContext, scene, tileX, tileY, shadow, staticImages(options.lavaPools));
    }
    cacheStaticTile(key, tile);
    return tile;
  }

  function drawStaticWorld(
    offsetX = 0,
    offsetY = 0,
    extraSprites: readonly StaticWorldSpriteFrame[] = [],
    colorQuads: readonly StaticWorldColorQuadFrame[] = [],
  ) {
    lavaRocksRenderedByWebGL = false;
    if (options.isArenaScene()) {
      options.staticWorldLayer?.hide();
      drawGround();
      return false;
    }
    const visible = visibleSize();
    const preloadRange = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height);
    const visibleRange = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height, 0);
    // Keep every tile required by this camera view plus a small movement edge.
    // A fixed limit below the visible count turns camera movement into an LRU
    // rebuild loop, repeatedly redrawing the world tiles each frame.
    staticTileLimit = Math.max(
      STATIC_TILE_MIN_LIMIT,
      (preloadRange.endX - preloadRange.startX + 1)
        * (preloadRange.endY - preloadRange.startY + 1)
        + STATIC_TILE_CACHE_PADDING,
    );
    const gpuTiles: StaticWorldTileFrame[] = [];
    const visibleTileKeys: string[] = [];
    const useWebGL = Boolean(options.staticWorldLayer?.active());
    // Build the visible working set first so startup and camera movement never
    // wait behind offscreen preload work.
    for (let tileY = visibleRange.startY; tileY <= visibleRange.endY; tileY += 1) {
      for (let tileX = visibleRange.startX; tileX <= visibleRange.endX; tileX += 1) {
        const left = snapToWorldPixel(tileX * STATIC_TILE_SIZE - camera.x);
        const top = snapToWorldPixel(tileY * STATIC_TILE_SIZE - camera.y);
        const right = snapToWorldPixel((tileX + 1) * STATIC_TILE_SIZE - camera.x);
        const bottom = snapToWorldPixel((tileY + 1) * STATIC_TILE_SIZE - camera.y);
        const key = tileKey(tileX, tileY);
        visibleTileKeys.push(key);
        const source = staticTile(tileX, tileY);
        if (useWebGL) gpuTiles.push({ key, source, left, top, width: right - left, height: bottom - top });
        else ctx.drawImage(source, left, top, right - left, bottom - top);
      }
    }
    // The edge ring is useful for movement, but it never needs a placeholder
    // or GPU upload. Queue it only while the worker can fill it off-thread.
    if (staticTileWorkerEnabled) {
      for (let tileY = preloadRange.startY; tileY <= preloadRange.endY; tileY += 1) {
        for (let tileX = preloadRange.startX; tileX <= preloadRange.endX; tileX += 1) {
          if (tileX >= visibleRange.startX && tileX <= visibleRange.endX
            && tileY >= visibleRange.startY && tileY <= visibleRange.endY) continue;
          staticTile(tileX, tileY);
        }
      }
    }
    // Ring preloads run after visible work for request priority. Re-touch the
    // visible set so asynchronous cache insertion still evicts distant tiles
    // before anything needed by the current frame.
    for (const key of visibleTileKeys) touchStaticTile(key);
    if (useWebGL) {
      const view = viewport();
      collectVisibleLavaRocks();
      gpuWorldSprites.length = 0;
      for (const rock of visibleLavaRocks) {
        const sprite = lavaRockSpriteFrame(rock);
        if (sprite) gpuWorldSprites.push(sprite);
      }
      for (const sprite of extraSprites) gpuWorldSprites.push(sprite);
      const rendered = options.staticWorldLayer?.render({
        backgroundColor: mapColors().ground,
        width: view.width,
        height: view.height,
        dpr: options.getDevicePixelRatio(),
        zoom: camera.zoom,
        offsetX,
        offsetY,
        tiles: gpuTiles,
        sprites: gpuWorldSprites,
        colorQuads,
      });
      lavaRocksRenderedByWebGL = Boolean(rendered);
      if (!rendered) {
        for (const tile of gpuTiles) ctx.drawImage(tile.source, tile.left, tile.top, tile.width, tile.height);
      }
      trimStaticTiles();
      return Boolean(rendered);
    }
    trimStaticTiles();
    return false;
  }

  function waitForStaticTiles(keys: readonly string[], timeoutMs = 1_500) {
    if (!staticTileWorkerEnabled || keys.every((key) => staticTiles.has(key))) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        staticTileWaiters.delete(check);
        resolve();
      };
      const check = () => {
        if (!staticTileWorkerEnabled || keys.every((key) => staticTiles.has(key))) finish();
      };
      const timeout = globalThis.setTimeout(finish, timeoutMs);
      staticTileWaiters.add(check);
      check();
    });
  }

  /** Builds the visible spawn tiles first, then lets the movement ring finish in the background. */
  async function warmStaticWorld() {
    if (!options.staticWorldLayer?.active() || options.isArenaScene()) return;
    const visible = visibleSize();
    const range = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height);
    const visibleRange = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height, 0);
    const keys: string[] = [];
    const tileCount = (range.endX - range.startX + 1) * (range.endY - range.startY + 1);
    staticTileLimit = Math.max(staticTileLimit, tileCount + STATIC_TILE_CACHE_PADDING);
    for (let tileY = visibleRange.startY; tileY <= visibleRange.endY; tileY += 1) {
      for (let tileX = visibleRange.startX; tileX <= visibleRange.endX; tileX += 1) {
        keys.push(tileKey(tileX, tileY));
        staticTile(tileX, tileY);
      }
    }
    for (let tileY = range.startY; tileY <= range.endY; tileY += 1) {
      for (let tileX = range.startX; tileX <= range.endX; tileX += 1) {
        if (tileX >= visibleRange.startX && tileX <= visibleRange.endX
          && tileY >= visibleRange.startY && tileY <= visibleRange.endY) continue;
        staticTile(tileX, tileY);
      }
    }
    await waitForStaticTiles(keys);
    // A failed/unsupported worker switches staticTile() to its synchronous
    // Canvas fallback here, still keeping the first gameplay frame warm.
    for (let tileY = visibleRange.startY; tileY <= visibleRange.endY; tileY += 1) {
      for (let tileX = visibleRange.startX; tileX <= visibleRange.endX; tileX += 1) staticTile(tileX, tileY);
    }
    drawStaticWorld();
  }

  function invalidateStaticWorld() {
    options.staticWorldLayer?.invalidate();
    for (const tile of staticTiles.values()) closeStaticTile(tile);
    staticTiles.clear();
    pendingStaticTiles.clear();
    queuedStaticTileRequests.length = 0;
    if (staticTilePlaceholder) closeStaticTile(staticTilePlaceholder);
    staticTilePlaceholder = null;
    staticTilePlaceholderGeneration = -1;
    staticTileGeneration += 1;
    configuredWorkerGeneration = -1;
    sceneGeneration = -1;
    cachedStaticScene = null;
    lavaRockBuckets.clear();
    lavaRockBucketGeneration = -1;
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
      const x = snapToWorldPixel(path.x - camera.x);
      const y = snapToWorldPixel(path.y - camera.y);
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
    const x = snapToWorldPixel(tree.x - camera.x);
    const y = snapToWorldPixel(tree.y - camera.y);
    const drawSize = Math.round(154 * tree.s);
    const halfWidth = Math.ceil(drawSize / 2);
    const cullPadding = drawSize + 32;
    if (x + halfWidth < -cullPadding || x - halfWidth > visible.width + cullPadding || y < -cullPadding || y - drawSize > visible.height + cullPadding) return;
    if (options.getMapId() === SAMURAI_GARDEN_MAP_ID) {
      const scale = drawSize / 154;
      const trunkWidth = Math.max(8, Math.round(14 * scale));
      const trunkHeight = Math.round(82 * scale);
      const crownY = y - trunkHeight;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#49303a";
      ctx.lineWidth = Math.max(4, Math.round(8 * scale));
      ctx.beginPath();
      ctx.moveTo(x, y - Math.round(6 * scale));
      ctx.lineTo(x - Math.round(2 * scale), crownY + Math.round(18 * scale));
      ctx.lineTo(x - Math.round(28 * scale), crownY - Math.round(7 * scale));
      ctx.moveTo(x - Math.round(1 * scale), crownY + Math.round(24 * scale));
      ctx.lineTo(x + Math.round(30 * scale), crownY - Math.round(10 * scale));
      ctx.stroke();
      ctx.fillStyle = "#6d4650";
      ctx.fillRect(x - Math.floor(trunkWidth / 2), y - trunkHeight, trunkWidth, trunkHeight);
      ctx.fillStyle = "#a16a68";
      ctx.fillRect(x - Math.floor(trunkWidth / 2) + 2, y - trunkHeight + 4, Math.max(2, Math.round(trunkWidth * .24)), trunkHeight - 8);

      const drift = (tree.variant % 3 - 1) * Math.round(4 * scale);
      const clusters = [
        { dx: -42 + drift, dy: -16, rx: 34, ry: 25 },
        { dx: -16, dy: -37, rx: 39, ry: 29 },
        { dx: 19, dy: -37, rx: 38, ry: 29 },
        { dx: 45 + drift, dy: -14, rx: 31, ry: 24 },
        { dx: 3, dy: -9, rx: 45, ry: 31 },
      ];
      for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        const cx = x + Math.round(cluster.dx * scale);
        const cy = crownY + Math.round(cluster.dy * scale);
        const rx = Math.round(cluster.rx * scale);
        const ry = Math.round(cluster.ry * scale);
        ctx.fillStyle = "#7b355c";
        ctx.beginPath(); ctx.ellipse(cx, cy + Math.round(2 * scale), rx + Math.round(3 * scale), ry + Math.round(3 * scale), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = ["#f47fb2", "#ff94c2", "#e96ca7"][index % 3];
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,214,233,.82)";
        ctx.fillRect(cx - Math.round(rx * .42), cy - Math.round(ry * .48), Math.max(2, Math.round(6 * scale)), Math.max(2, Math.round(4 * scale)));
      }
      ctx.restore();
      return;
    }
    const night = options.getMapId() === options.infernalMapId;
    const spritesheet = night ? options.nightTreeSpritesheet : options.treeSpritesheet;
    if (!spritesheet.complete || spritesheet.naturalWidth <= 0) return;
    const source = (night ? options.nightTreeSpriteBounds() : options.treeSpriteBounds())[tree.variant % 16];
    if (!source) return;
    const drawWidth = Math.round(drawSize * source.w / source.h);
    ctx.drawImage(spritesheet, source.x, source.y, source.w, source.h, x - drawWidth / 2, y - drawSize, drawWidth, drawSize);
  }

  function drawPortalAt(portal: Portal, cutscene = false) {
    if (!options.portalArch.complete || options.portalArch.naturalWidth <= 0) return;
    const x = snapToWorldPixel(portal.x - camera.x);
    const y = snapToWorldPixel(portal.y - camera.y);
    options.drawShadow(x, y - 4, Math.round(portal.width * .68), .14);
    const cutsceneIntensity = cutscene ? options.portalRevealIntensity() : -1;
    const cutsceneActive = cutsceneIntensity >= 0;
    const portalIntensity = cutsceneActive ? cutsceneIntensity : options.portalIsUnlocked(portal) ? 1 : 0;
    const requestedSwirl = options.portalSwirls[portal.destination];
    const fallbackSwirl = options.portalSwirls[options.snowMapId];
    const portalSwirl = requestedSwirl?.complete && requestedSwirl.naturalWidth > 0 ? requestedSwirl : fallbackSwirl;
    if (portalIntensity > 0 && portalSwirl.complete && portalSwirl.naturalWidth > 0) {
      // Ease through the sprite sequence instead of abruptly reversing at
      // either end. The swirl now settles into and out of each turn.
      const cycle = options.getGameTime() / 3;
      const sweep = .5 - Math.cos(cycle * TAU) * .5;
      const frame = Math.round(sweep * 15);
      const cell = portalSwirl.naturalWidth / 4;
      const width = Math.round(portal.width * .59 * 1.265 * 1.05);
      const height = Math.round(portal.height * .75 * 1.265);
      ctx.save();
      ctx.globalAlpha = portalIntensity;
      ctx.drawImage(portalSwirl, (frame % 4) * cell, Math.floor(frame / 4) * cell, cell, cell, x - width / 2, y - height - 5, width, height);
      ctx.restore();
    }
    ctx.drawImage(options.portalArch, x - portal.width / 2, y - portal.height, portal.width, portal.height);
    const destinationOpacity = cutsceneActive ? options.portalDestinationOpacity() : options.portalIsUnlocked(portal) ? 1 : 0;
    if (destinationOpacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = destinationOpacity;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    options.outlinedText(options.mapName(portal.destination), x, y - portal.height - 8 + Math.sin(options.getGameTime() * 2.4) * 3, portalDestinationTextColor(portal.destination), 4);
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
    const x = snapToWorldPixel(cactus.x - camera.x);
    const y = snapToWorldPixel(cactus.y - camera.y);
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
    const visible = visibleSize(); const x = snapToWorldPixel(rock.x - camera.x); const y = snapToWorldPixel(rock.y - camera.y);
    if (x < -60 || y < -60 || x > visible.width + 60 || y > visible.height + 40) return;
    const w = Math.round(35 * rock.s); const h = Math.round(22 * rock.s);
    options.drawShadow(x, y, Math.round(w * 1.2), .11);
    ctx.fillStyle = "#79543d"; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * .32, y - h * .72); ctx.lineTo(x + w * .2, y - h); ctx.lineTo(x + w / 2, y - h * .28); ctx.lineTo(x + w * .38, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b77b4b"; ctx.beginPath(); ctx.moveTo(x - w * .32, y - h * .72); ctx.lineTo(x + w * .2, y - h); ctx.lineTo(x + w * .12, y - h * .45); ctx.closePath(); ctx.fill();
  }

  function drawDesertGrass(grass: DesertGrassDecor) {
    const visible = visibleSize(); const x = snapToWorldPixel(grass.x - camera.x); const y = snapToWorldPixel(grass.y - camera.y);
    if (x < -10 || y < -10 || x > visible.width + 10 || y > visible.height + 10) return;
    ctx.fillStyle = grass.variant % 2 ? "#8b7b3d" : "#a28a43"; ctx.fillRect(x - 1, y - 6, 2, 7); ctx.fillRect(x - 5, y - 3, 2, 5); ctx.fillRect(x + 3, y - 4, 2, 6);
  }

  function drawSnowPine(tree: SnowPineDecor) {
    const visible = visibleSize(); const x = snapToWorldPixel(tree.x - camera.x); const y = snapToWorldPixel(tree.y - camera.y);
    if (x < -150 || y < -230 || x > visible.width + 150 || y > visible.height + 60) return;
    if (!options.snowPine.complete || options.snowPine.naturalWidth <= 0) return;
    const height = Math.round(185 * tree.s);
    const width = Math.round(height * options.snowPine.naturalWidth / options.snowPine.naturalHeight);
    ctx.drawImage(options.snowPine, x - width / 2, y - height, width, height);
  }

  function drawUpgradeBench(bench: UpgradeBenchDecor) {
    const visible = visibleSize();
    const x = snapToWorldPixel(bench.x - camera.x);
    const y = snapToWorldPixel(bench.y - camera.y);
    if (x < -120 || y < -160 || x > visible.width + 120 || y > visible.height + 50) return;
    if (!options.upgradeBench.complete || options.upgradeBench.naturalWidth <= 0) return;
    const width = Math.round(180 * bench.s);
    const height = Math.round(width * options.upgradeBench.naturalHeight / options.upgradeBench.naturalWidth);
    // The generated sprite has generous transparent padding below its feet;
    // Lift the shadow into the sprite's padded feet so the bench stays planted.
    options.drawShadow(x, y - 27, Math.round(width * .75), .2);
    ctx.drawImage(options.upgradeBench, x - width / 2, y - height, width, height);
    const upgrade = options.upgradeBenchStatus();
    if (upgrade?.itemSprite?.complete && upgrade.itemSprite.naturalWidth > 0) {
      const maxWidth = 88;
      const maxHeight = 68;
      const scale = Math.min(maxWidth / upgrade.itemSprite.naturalWidth, maxHeight / upgrade.itemSprite.naturalHeight);
      const itemWidth = Math.max(1, Math.round(upgrade.itemSprite.naturalWidth * scale));
      const itemHeight = Math.max(1, Math.round(upgrade.itemSprite.naturalHeight * scale));
      // Center the active item over the bench sprite's flat gray work plate.
      const itemCenterX = x - Math.round(width * .18);
      const itemCenterY = y - height + height * .32 - 6;
      ctx.save();
      ctx.shadowColor = "rgba(116,225,255,.8)";
      ctx.shadowBlur = 8;
      ctx.drawImage(upgrade.itemSprite, itemCenterX - itemWidth / 2, itemCenterY - itemHeight / 2, itemWidth, itemHeight);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const labelY = y - height - (upgrade ? 21 : 7) + Math.sin(options.getGameTime() * 2.2) * 2;
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
    const x = snapToWorldPixel(rock.x - camera.x);
    const y = snapToWorldPixel(rock.y - camera.y);
    const width = Math.round(150 * rock.s);
    const height = Math.round(width * image.naturalHeight / image.naturalWidth);
    if (x + width / 2 < -50 || x - width / 2 > visible.width + 50 || y < -50 || y - height > visible.height + 50) return;
    ctx.drawImage(image, x - width / 2, y - height, width, height);
  }

  function lavaRockSpriteFrame(rock: LavaRockDecor): StaticWorldSpriteFrame | null {
    const source = options.lavaRocks[rock.variant % options.lavaRocks.length];
    if (!source?.complete || source.naturalWidth <= 0) return null;
    const visible = visibleSize();
    const x = snapToWorldPixel(rock.x - camera.x);
    const y = snapToWorldPixel(rock.y - camera.y);
    const width = Math.round(150 * rock.s);
    const height = Math.round(width * source.naturalHeight / source.naturalWidth);
    if (x + width / 2 < -50 || x - width / 2 > visible.width + 50 || y < -50 || y - height > visible.height + 50) return null;
    return { source, left: x - width / 2, top: y - height, width, height };
  }

  function drawCharredTree(tree: CharredTreeDecor) {
    const image = options.charredTrees[tree.variant % options.charredTrees.length];
    if (!image?.complete || image.naturalWidth <= 0) return;
    const visible = visibleSize();
    const x = snapToWorldPixel(tree.x - camera.x);
    const y = snapToWorldPixel(tree.y - camera.y);
    const height = Math.round(150 * tree.s);
    const width = Math.round(height * image.naturalWidth / image.naturalHeight);
    if (x + width / 2 < -50 || x - width / 2 > visible.width + 50 || y < -50 || y - height > visible.height + 50) return;
    ctx.drawImage(image, x - width / 2, y - height, width, height);
  }

  function drawSnowTuft(tuft: SnowTuftDecor) {
    const visible = visibleSize(); const x = snapToWorldPixel(tuft.x - camera.x); const y = snapToWorldPixel(tuft.y - camera.y);
    if (x < -8 || y < -8 || x > visible.width + 8 || y > visible.height + 8) return;
    ctx.fillStyle = tuft.variant % 2 ? "rgba(255,255,255,.78)" : "rgba(221,242,255,.76)";
    ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillRect(x, y - 3, 2, 5);
  }

  function drawGrass(grass: GrassDecor) {
    const visible = visibleSize(); const x = snapToWorldPixel(grass.x - camera.x); const y = snapToWorldPixel(grass.y - camera.y);
    if (x < -8 || y < -8 || x > visible.width + 8 || y > visible.height + 8) return;
    ctx.fillStyle = grass.variant % 2 ? "#237b49" : "#267f4c"; ctx.fillRect(x - 1, y - 5, 2, 7); ctx.fillRect(x - 5, y - 2, 2, 5); ctx.fillRect(x + 3, y - 3, 2, 6); if (grass.variant > 1) ctx.fillRect(x + 6, y, 2, 3);
  }

  function drawPetal(petal: PetalDecor) {
    const visible = visibleSize(); const x = snapToWorldPixel(petal.x - camera.x); const y = snapToWorldPixel(petal.y - camera.y);
    if (x < -8 || y < -8 || x > visible.width + 8 || y > visible.height + 8) return;
    ctx.fillStyle = ["#d9f4df", "#f3f0c6", "#ccebea"][petal.variant % 3]; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.fillRect(x, y, 1, 1);
  }

  function collectVisibleLavaRocks() {
    visibleLavaRocks.length = 0;
    if (!isLavaTerrain()) return visibleLavaRocks;
    if (lavaRockBucketGeneration !== staticTileGeneration) {
      lavaRockBuckets.clear();
      for (const decor of options.decor) {
        if (decor.type !== "lavaRock") continue;
        const bucketX = Math.floor(decor.x / LAVA_ROCK_BUCKET_SIZE);
        const bucketY = Math.floor(decor.y / LAVA_ROCK_BUCKET_SIZE);
        const key = `${bucketX}:${bucketY}`;
        const bucket = lavaRockBuckets.get(key);
        if (bucket) bucket.push(decor);
        else lavaRockBuckets.set(key, [decor]);
      }
      lavaRockBucketGeneration = staticTileGeneration;
    }
    const visible = visibleSize();
    const startX = Math.floor((camera.x - LAVA_ROCK_CULL_PADDING) / LAVA_ROCK_BUCKET_SIZE);
    const startY = Math.floor((camera.y - LAVA_ROCK_CULL_PADDING) / LAVA_ROCK_BUCKET_SIZE);
    const endX = Math.floor((camera.x + visible.width + LAVA_ROCK_CULL_PADDING) / LAVA_ROCK_BUCKET_SIZE);
    const endY = Math.floor((camera.y + visible.height + LAVA_ROCK_CULL_PADDING) / LAVA_ROCK_BUCKET_SIZE);
    for (let bucketY = startY; bucketY <= endY; bucketY += 1) {
      for (let bucketX = startX; bucketX <= endX; bucketX += 1) {
        const bucket = lavaRockBuckets.get(`${bucketX}:${bucketY}`);
        if (!bucket) continue;
        for (const rock of bucket) visibleLavaRocks.push(rock);
      }
    }
    return visibleLavaRocks;
  }

  function drawDecor() {
    if (!isLavaTerrain() || lavaRocksRenderedByWebGL) return;
    for (const rock of collectVisibleLavaRocks()) drawLavaRock(rock);
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
    draw.save();
    draw.globalAlpha = options.getMapId() === options.infernalMapId ? .5 : 1;
    draw.fillStyle = "#ff5d5d"; for (const enemy of options.enemies) {
      const marker = ENEMY_TYPES[enemy.type].elite ? 5 : 3;
      draw.fillRect(innerX + enemy.x * sx - 1, innerY + enemy.y * sy - 1, marker, marker);
    }
    draw.restore();

    const drawPortalMarker = (portal: Portal) => {
      const px = Math.round(innerX + portal.x * sx); const py = Math.round(innerY + portal.y * sy);
      const unlocked = options.portalIsUnlocked(portal);
      drawPortalMapMarker(draw, px, py, portal.destination, unlocked);
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
            : options.getMapId() === options.infernalMapId
              ? { state: options.gloomrootBoss, color: "#69f0e7" }
              : options.getMapId() === options.waterMapId
                ? { state: options.tidewyrmBoss, color: "#55ddf4" }
                : null;
    if (mapBoss) {
      const bx = Math.round(innerX + mapBoss.state.x * sx); const by = Math.round(innerY + mapBoss.state.y * sy);
      draw.save();
      draw.globalAlpha = mapBoss.state.dead ? .46 : 1;
      draw.fillStyle = "#101820"; draw.fillRect(bx - 5, by - 4, 11, 9);
      draw.fillStyle = mapBoss.color; draw.fillRect(bx - 4, by - 3, 9, 6); draw.fillRect(bx - 3, by - 5, 2, 2); draw.fillRect(bx + 2, by - 5, 2, 2); draw.fillRect(bx - 3, by + 3, 2, 2); draw.fillRect(bx + 2, by + 3, 2, 2);
      draw.fillStyle = "#fff"; draw.fillRect(bx - 2, by - 1, 2, 2); draw.fillRect(bx + 2, by - 1, 2, 2);
      draw.restore();
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

  return { drawGround, drawStaticWorld, warmStaticWorld, invalidateStaticWorld, drawTree, drawCactus, drawSnowPine, drawUpgradeBench, drawCharredTree, drawPortal, drawCutscenePortal, drawSecondaryPortal, drawDecor, drawMinimap };
}
