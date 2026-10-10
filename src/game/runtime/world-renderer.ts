import { SOUL_VILLAGE_GROUND } from "../soul-village";
import { WORLD_WIDTH } from "../../../shared/rules";
import { isSoulMap, SOUL_STAT_DETAILS } from "../../../shared/soul-dimension";
import { inTownInteriors, isTownMap, TOWN_DOORS, TOWN_INTERIOR_MARGIN, TOWN_WALK_AREA } from "../../../shared/town";
import { soulStatOfCampName } from "../soul-world";
import { residentDrawable } from "./resident-image";
import { drawHomeCourtyard, drawHomeQuestBoard, drawHomeResearchDesk, drawHomeStationSign } from "./home-courtyard";
import { drawIonRoads } from "./ion-ground";
import { drawVerdantRoads } from "./verdant-ground";
import { drawNeonRoads } from "./neon-ground";
import { TAU, WORLD } from "../constants";
import { ENEMY_TYPES, REWARD_DATA } from "../enemies";
import { drawPortalMapMarker, portalDestinationColor, portalDestinationTextColor } from "../portal-presentation";
import type { MapPlayerMarker } from "../../wildstat-coop";
import type { Camera } from "./camera";
import type { EnemyState, PlayerState } from "./types";
import { bossForMap, type BossStates } from "./boss-registry";
import { NEON_BASTION_MAP_ID, VERDANT_CATACOMBS_MAP_ID, ION_CITADEL_MAP_ID, SAMURAI_GARDEN_MAP_ID, type MapId, type WorldDecor, type WorldPath } from "../world";
import type { StaticWorldColorQuadFrame, StaticWorldLayer, StaticWorldSpriteFrame, StaticWorldTileFrame } from "./webgl-static-world-layer";
import {
  paintStaticTile,
  type StaticTileImage,
  type StaticTileScene,
  type StaticTileTreeBounds,
} from "./static-tile-painter";
import { drawScreenSpaceAt, snapWorldRenderCoordinate } from "./render-space";
import { nightGroundShadowsVisible } from "./night-visibility";
import { createTintedImageCanvas } from "./image-tint";
import { decorPaletteColor, mapVisualTheme } from "../map-design";

export { snapWorldRenderCoordinate } from "./render-space";

type Viewport = { width: number; height: number };
export type MinimapBounds = { left: number; top: number; width: number; height: number };
type Portal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId; label?: string };
type TreeSpriteBounds = StaticTileTreeBounds;
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type SnowPineDecor = Extract<WorldDecor, { type: "snowPine" }>;
type UpgradeBenchDecor = Extract<WorldDecor, { type: "upgradeBench" }>;
type LavaRockDecor = Extract<WorldDecor, { type: "lavaRock" }>;
type CharredTreeDecor = Extract<WorldDecor, { type: "charredTree" }>;

const STATIC_TILE_SIZE = 640;
/** The minimap inside the Town's rooms: a campaign map's 4,800 square, following the player. */
const TOWN_ROOMS_MINIMAP_SPAN = WORLD_WIDTH;
function soulMarkerColor(enemy: EnemyState) {
  const stat = soulStatOfCampName(enemy.campName);
  return stat ? SOUL_STAT_DETAILS[stat].color : null;
}
const PORTAL_TINTED_SHEET_SIZE = 768;
export function staticWorldTileRange(
  cameraX: number,
  cameraY: number,
  visibleWidth: number,
  visibleHeight: number,
  padding = 1,
  world: { w: number; h: number } = WORLD,
) {
  const maximumTileX = Math.ceil(world.w / STATIC_TILE_SIZE) - 1;
  const maximumTileY = Math.ceil(world.h / STATIC_TILE_SIZE) - 1;
  return {
    startX: Math.max(0, Math.floor(cameraX / STATIC_TILE_SIZE) - padding),
    startY: Math.max(0, Math.floor(cameraY / STATIC_TILE_SIZE) - padding),
    endX: Math.min(maximumTileX, Math.floor((cameraX + visibleWidth) / STATIC_TILE_SIZE) + padding),
    endY: Math.min(maximumTileY, Math.floor((cameraY + visibleHeight) / STATIC_TILE_SIZE) + padding),
  };
}

/**
 * The tiles of the movement ring to build ahead this frame, for a map painted on the main thread: at most
 * `budget`, and only into room the cache has to spare. A tile ahead must never push out one in view (or one
 * just walked past), or walking back and forth rebuilds the same tiles over and over.
 */
export function staticTilesToPreload(
  range: { startX: number; startY: number; endX: number; endY: number },
  cached: (tileX: number, tileY: number) => boolean,
  cacheSize: number,
  cacheLimit: number,
  budget: number,
) {
  const tiles: { tileX: number; tileY: number }[] = [];
  const room = Math.min(budget, cacheLimit - cacheSize);
  for (let tileY = range.startY; tileY <= range.endY && tiles.length < room; tileY += 1) {
    for (let tileX = range.startX; tileX <= range.endX && tiles.length < room; tileX += 1) {
      if (!cached(tileX, tileY)) tiles.push({ tileX, tileY });
    }
  }
  return tiles;
}

export function minimapDrawLayout(viewportWidth: number, bounds?: MinimapBounds | null) {
  const fallbackSize = Math.round(Math.min(126, Math.max(118, viewportWidth * .17)));
  if (!bounds || ![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)) {
    return { x: viewportWidth - fallbackSize, y: 0, size: fallbackSize };
  }
  const size = Math.round(Math.min(bounds.width, bounds.height));
  if (size <= 0) return { x: viewportWidth - fallbackSize, y: 0, size: fallbackSize };
  return {
    x: Math.round(Math.max(0, Math.min(viewportWidth - size, bounds.left))),
    y: Math.round(Math.max(0, bounds.top)),
    size,
  };
}

export type WorldRendererOptions = {
  ctx: CanvasRenderingContext2D;
  staticWorldLayer?: StaticWorldLayer | null;
  camera: Camera;
  getViewport: () => Viewport;
  getMinimapBounds?: () => MinimapBounds | null;
  /** The Soul Dimension village's baked ground, shown on its minimap. */
  minimapVillageGround?: () => HTMLImageElement | undefined;
  getDevicePixelRatio: () => number;
  getMapId: () => MapId;
  getGameTime: () => number;
  isArenaScene: () => boolean;
  mapName: (mapId: MapId) => string;
  activePortal: () => Portal | null;
  cutscenePortal: () => Portal;
  secondaryPortal: () => Portal | null;
  portalIsUnlocked: (portal: Portal) => boolean;
  portalRevealIntensity: () => number;
  portalDestinationOpacity: () => number;
  infernalMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  player: PlayerState;
  /** Every world boss; the current map's is marked on the minimap. */
  bosses: BossStates;
  duelSpaceBackground: HTMLImageElement;
  treeSpritesheet: HTMLImageElement;
  nightTreeSpritesheet: HTMLImageElement;
  actorShadowSprite: HTMLImageElement;
  cherryTreeSpritesheet: HTMLImageElement;
  treeSpriteBounds: () => TreeSpriteBounds[];
  nightTreeSpriteBounds: () => TreeSpriteBounds[];
  cherryTreeSpriteBounds: () => TreeSpriteBounds[];
  portalArch: HTMLImageElement;
  portalSwirl: HTMLImageElement;
  snowPine: HTMLImageElement;
  upgradeBench: HTMLImageElement;
  upgradeBenchStatus: () => { itemSprite?: HTMLImageElement; timer: string } | null;
  researchStatus?: () => { timer: string } | null;
  /** Today's quests, finished or not, and the line under the board's sign. */
  questBoardStatus?: () => { finished: boolean[]; timer: string } | null;
  /** Draws Ox, the Town's Galaxy seller, with his feet at a screen point. */
  drawOx?: (x: number, y: number) => void;
  lavaPools: HTMLImageElement[];
  lavaRocks: HTMLImageElement[];
  charredTrees: HTMLImageElement[];
  drawShadow: DrawShadow;
  outlinedText: OutlinedText;
  /**
   * A map whose static tiles are painted here on the main thread (the Town's baked ground), over its ground
   * colour, across its own world. Until it is ready (or when `paint` returns false) the tile is the ground colour, retried later.
   */
  customStaticTiles?: (mapId: MapId) => {
    world: { w: number; h: number };
    /** Whether it can paint yet (its images have loaded). */
    ready: () => boolean;
    /** `paintBase` paints the map's own tile (ground, paths, painted decor) first, for a map that adds to it. */
    paint: (context: CanvasRenderingContext2D, tileX: number, tileY: number, tileSize: number, paintBase: () => void) => boolean;
  } | null;
};

/** Tiles of a custom-painted map built ahead of the camera, at most, per frame: walking never waits on a row of them. */
const CUSTOM_STATIC_TILE_PRELOADS_PER_FRAME = 1;

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
  /** Tree-bounds count the cached tiles were baked with; -1 before any bake. */
  let bakedTreeBoundsCount = -1;
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
  const tintedPortalSwirls = new Map<string, HTMLCanvasElement>();
  /** More than any one map shows; the rest are rebuilt if a map is revisited. */
  const PORTAL_TINT_CACHE_LIMIT = 6;
  let lavaRocksRenderedByWebGL = false;
  const viewport = () => options.getViewport();
  const visibleSize = () => ({ width: viewport().width / camera.zoom, height: viewport().height / camera.zoom });
  const snapToWorldPixel = (value: number) => snapWorldRenderCoordinate(value, camera.zoom, options.getDevicePixelRatio());
  const hasLavaRocks = () => options.decor.some((decor) => decor.type === "lavaRock");
  const hasLavaPools = () => options.decor.some((decor) => decor.type === "lavaPool");

  function tintedPortalSwirl(destination: MapId) {
    const source = options.portalSwirl;
    if (!source.complete || source.naturalWidth <= 0 || source.naturalHeight <= 0) return null;
    const tint = portalDestinationColor(destination);
    const cached = tintedPortalSwirls.get(tint);
    if (cached) {
      // Most recently used last, so the oldest colour is the first to go.
      tintedPortalSwirls.delete(tint);
      tintedPortalSwirls.set(tint, cached);
      return cached;
    }
    const canvas = createTintedImageCanvas(
      source,
      Math.min(source.naturalWidth, PORTAL_TINTED_SHEET_SIZE),
      Math.min(source.naturalHeight, PORTAL_TINTED_SHEET_SIZE),
      tint,
      true,
    );
    if (canvas) tintedPortalSwirls.set(tint, canvas);
    // Every Endless map has its own colour, and each copy is a 768px canvas,
    // so an unbounded cache grew by about 2 MB per map for the whole session.
    while (tintedPortalSwirls.size > PORTAL_TINT_CACHE_LIMIT) {
      tintedPortalSwirls.delete(tintedPortalSwirls.keys().next().value!);
    }
    return canvas;
  }

  function mapColors() {
    return mapVisualTheme(options.getMapId());
  }

  function staticScene() {
    if (cachedStaticScene && sceneGeneration === staticTileGeneration) return cachedStaticScene;
    const lavaRocks = hasLavaRocks();
    cachedStaticScene = {
      tileSize: STATIC_TILE_SIZE,
      homeCourtyard: options.getMapId() === "home_exterior",
      colors: mapColors(),
      paths: options.paths,
      decor: lavaRocks ? options.decor.filter((decor) => decor.type !== "lavaRock") : options.decor,
      treeBounds: treeSheet().bounds,
      treeShadowsVisible: nightGroundShadowsVisible(options.getMapId(), options.infernalMapId),
      snowPineAspect: options.snowPine.naturalWidth > 0
        ? options.snowPine.naturalWidth / options.snowPine.naturalHeight
        : 0,
      lavaPoolUrls: hasLavaPools() ? options.lavaPools.map((image) => image.currentSrc || image.src).filter(Boolean) : [],
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

  const actorShadow = () => options.actorShadowSprite.complete && options.actorShadowSprite.naturalWidth > 0 ? options.actorShadowSprite : undefined;

  function staticTile(tileX: number, tileY: number): CachedStaticTile {
    const key = tileKey(tileX, tileY);
    const cached = staticTiles.get(key);
    if (cached) {
      touchStaticTile(key);
      return cached;
    }
    const scene = staticScene();
    const custom = options.customStaticTiles?.(options.getMapId());
    if (custom) {
      if (!custom.ready()) return sharedStaticTilePlaceholder(scene);
      const tile = createTileCanvas();
      const tileContext = tile.getContext("2d");
      if (!tileContext) return sharedStaticTilePlaceholder(scene);
      tileContext.fillStyle = scene.colors.ground;
      tileContext.fillRect(0, 0, STATIC_TILE_SIZE, STATIC_TILE_SIZE);
      const paintBase = () => paintStaticTile(tileContext, scene, tileX, tileY, actorShadow(), staticImages(options.lavaPools));
      if (!custom.paint(tileContext, tileX, tileY, STATIC_TILE_SIZE, paintBase)) {
        closeStaticTile(tile);
        return sharedStaticTilePlaceholder(scene);
      }
      cacheStaticTile(key, tile);
      return tile;
    }
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
      paintStaticTile(tileContext, scene, tileX, tileY, actorShadow(), staticImages(options.lavaPools));
    }
    cacheStaticTile(key, tile);
    return tile;
  }

  /**
   * A sheet's per-variant bounds are measured off-thread, so they arrive after
   * the image loads and can miss the first bake of a map, leaving its trees
   * with no ground shadow. Rebake when the count changes.
   */
  function syncStaticTreeBounds() {
    const count = treeSheet().bounds.length;
    if (count === bakedTreeBoundsCount) return;
    bakedTreeBoundsCount = count;
    invalidateStaticWorld();
  }

  function drawStaticWorld(
    extraSprites: readonly StaticWorldSpriteFrame[] = [],
    colorQuads: readonly StaticWorldColorQuadFrame[] = [],
  ) {
    syncStaticTreeBounds();
    lavaRocksRenderedByWebGL = false;
    if (options.isArenaScene()) {
      options.staticWorldLayer?.hide();
      drawGround();
      return false;
    }
    const visible = visibleSize();
    const custom = options.customStaticTiles?.(options.getMapId());
    const preloadRange = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height, 1, custom?.world);
    const visibleRange = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height, 0, custom?.world);
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
    // or GPU upload. Queue it only while the worker can fill it off-thread,
    // or, for a map painted here, a tile or so a frame.
    if (custom) {
      const ahead = staticTilesToPreload(preloadRange, (tileX, tileY) => staticTiles.has(tileKey(tileX, tileY)),
        staticTiles.size, staticTileLimit, CUSTOM_STATIC_TILE_PRELOADS_PER_FRAME);
      for (const { tileX, tileY } of ahead) staticTile(tileX, tileY);
    } else if (staticTileWorkerEnabled) {
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
    syncStaticTreeBounds();
    if (!options.staticWorldLayer?.active() || options.isArenaScene()) return;
    const visible = visibleSize();
    const world = options.customStaticTiles?.(options.getMapId())?.world;
    const range = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height, 1, world);
    const visibleRange = staticWorldTileRange(camera.x, camera.y, visible.width, visible.height, 0, world);
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
    if (options.getMapId() === "home_exterior") {
      ctx.save(); ctx.translate(-camera.x, -camera.y); drawHomeCourtyard(ctx); ctx.restore(); return;
    }
    if (options.getMapId() === NEON_BASTION_MAP_ID) { drawNeonRoads(ctx, options.paths, camera, visible); return; }
if (options.getMapId() === VERDANT_CATACOMBS_MAP_ID) { drawVerdantRoads(ctx, options.paths, camera, visible); return; }
if (options.getMapId() === ION_CITADEL_MAP_ID) { drawIonRoads(ctx, options.paths, camera, visible); return; }
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

  /** Which spritesheet and per-variant bounds the active map's trees use. */
  function treeSheet() {
    const mapId = options.getMapId();
    if (mapId === SAMURAI_GARDEN_MAP_ID) {
      return { spritesheet: options.cherryTreeSpritesheet, bounds: options.cherryTreeSpriteBounds() };
    }
    // The Soul Dimension is Tutorial Forest in the dark: the Night Forest's trees.
    if (mapId === options.infernalMapId || isSoulMap(mapId)) {
      return { spritesheet: options.nightTreeSpritesheet, bounds: options.nightTreeSpriteBounds() };
    }
    return { spritesheet: options.treeSpritesheet, bounds: options.treeSpriteBounds() };
  }

  function drawTree(tree: TreeDecor) {
    const visible = visibleSize();
    const x = snapToWorldPixel(tree.x - camera.x);
    const y = snapToWorldPixel(tree.y - camera.y);
    const drawSize = Math.round(154 * tree.s);
    const halfWidth = Math.ceil(drawSize / 2);
    const cullPadding = drawSize + 32;
    if (x + halfWidth < -cullPadding || x - halfWidth > visible.width + cullPadding || y < -cullPadding || y - drawSize > visible.height + cullPadding) return;
    const { spritesheet, bounds } = treeSheet();
    if (!spritesheet.complete || spritesheet.naturalWidth <= 0 || bounds.length === 0) return;
    const source = bounds[Math.abs(Math.trunc(tree.variant)) % bounds.length];
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
    const portalSwirl = tintedPortalSwirl(portal.destination);
    if (portalIntensity > 0 && portalSwirl) {
      // Ease through the sprite sequence instead of abruptly reversing at
      // either end. The swirl now settles into and out of each turn.
      const cycle = options.getGameTime() / 3;
      const sweep = .5 - Math.cos(cycle * TAU) * .5;
      const frame = Math.round(sweep * 15);
      const cellWidth = portalSwirl.width / 4;
      const cellHeight = portalSwirl.height / 4;
      const width = Math.round(portal.width * .59 * 1.265 * 1.05);
      const height = Math.round(portal.height * .75 * 1.265);
      ctx.save();
      ctx.globalAlpha = portalIntensity;
      ctx.drawImage(portalSwirl, (frame % 4) * cellWidth, Math.floor(frame / 4) * cellHeight, cellWidth, cellHeight, x - width / 2, y - height - 5, width, height);
      ctx.restore();
    }
    ctx.drawImage(options.portalArch, x - portal.width / 2, y - portal.height, portal.width, portal.height);
    const destinationOpacity = cutsceneActive ? options.portalDestinationOpacity() : options.portalIsUnlocked(portal) ? 1 : 0;
    if (destinationOpacity <= 0) return;
    drawScreenSpaceAt(ctx, camera.zoom, x, y - portal.height, () => {
      ctx.globalAlpha = destinationOpacity;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      options.outlinedText(portal.label ?? options.mapName(portal.destination), 0, -8 + Math.sin(options.getGameTime() * 2.4) * 3, portalDestinationTextColor(portal.destination), 4);
    });
  }

  function drawPortal() {
    const portal = options.activePortal();
    if (portal) drawPortalAt(portal);
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
    const theme = mapColors();
    const dark = cactus.color ?? decorPaletteColor(theme, "cactus", 1, ["#3f8050", "#245a36", "#70a961"]);
    const base = cactus.color ?? decorPaletteColor(theme, "cactus", 0, ["#3f8050", "#245a36", "#70a961"]);
    const highlight = cactus.color ?? decorPaletteColor(theme, "cactus", 2, ["#3f8050", "#245a36", "#70a961"]);
    ctx.fillStyle = dark; ctx.fillRect(x - w / 2 - 2, y - h, w + 4, h);
    ctx.fillStyle = base; ctx.fillRect(x - w / 2, y - h, w - 2, h - 4);
    ctx.fillStyle = highlight; ctx.fillRect(x - w / 2 + 2, y - h + 4, 3, h - 10);
    const armY = y - Math.round(h * .58);
    const direction = cactus.variant % 2 ? -1 : 1;
    ctx.fillStyle = dark;
    ctx.fillRect(x + direction * (w / 2 - 1), armY, direction * Math.round(19 * cactus.s), Math.round(10 * cactus.s));
    ctx.fillRect(x + direction * Math.round(16 * cactus.s), armY - Math.round(18 * cactus.s), Math.round(10 * cactus.s), Math.round(27 * cactus.s));
    ctx.fillStyle = base;
    ctx.fillRect(x + direction * Math.round(14 * cactus.s), armY - Math.round(16 * cactus.s), direction * Math.round(8 * cactus.s), Math.round(23 * cactus.s));
  }

  function drawSnowPine(tree: SnowPineDecor) {
    const visible = visibleSize(); const x = snapToWorldPixel(tree.x - camera.x); const y = snapToWorldPixel(tree.y - camera.y);
    if (x < -150 || y < -230 || x > visible.width + 150 || y > visible.height + 60) return;
    if (!options.snowPine.complete || options.snowPine.naturalWidth <= 0) return;
    const height = Math.round(185 * tree.s);
    const width = Math.round(height * options.snowPine.naturalWidth / options.snowPine.naturalHeight);
    ctx.drawImage(residentDrawable(options.snowPine), x - width / 2, y - height, width, height);
  }

  function drawUpgradeBench(bench: UpgradeBenchDecor) {
    const visible = visibleSize();
    const x = snapToWorldPixel(bench.x - camera.x);
    const y = snapToWorldPixel(bench.y - camera.y);
    if (x < -120 || y < -210 || x > visible.width + 120 || y > visible.height + 210) return;
    if (bench.label === "Tech Research") {
      drawHomeResearchDesk(ctx, x, y - 8, options.getGameTime());
      drawHomeStationSign(ctx, x, y, "Tech Research", options.researchStatus?.()?.timer);
      return;
    }
    if (bench.label === "Ox") {
      options.drawOx?.(x, y);
      drawScreenSpaceAt(ctx, camera.zoom, x, y - 70, () => {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const bob = Math.sin(options.getGameTime() * 2.2) * 2;
        ctx.font = '900 15px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
        options.outlinedText("Ox", 0, -18 + bob, "#ffb347", 4);
        ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
        options.outlinedText("Galaxy Shop", 0, -2 + bob, "#c9b8ff", 4);
      });
      return;
    }
    if (bench.label === "Quest Board") {
      const quests = options.questBoardStatus?.();
      drawHomeQuestBoard(ctx, x, y, options.getGameTime(), quests?.finished ?? []);
      drawHomeStationSign(ctx, x, y + 2, "Weekly Quests", quests?.timer);
      return;
    }
    if (!options.upgradeBench.complete || options.upgradeBench.naturalWidth <= 0) return;
    const width = Math.round(180 * bench.s);
    const height = Math.round(width * options.upgradeBench.naturalHeight / options.upgradeBench.naturalWidth);
    // The generated sprite has generous transparent padding below its feet;
    // Lift the shadow into the sprite's padded feet so the bench stays planted.
    options.drawShadow(x, y - 27, Math.round(width * .75), .2);
    // Drawn mirrored (Ryan, 2026-10-01): the sprite faces left as generated.
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(residentDrawable(options.upgradeBench), -width / 2, y - height, width, height);
    ctx.restore();
    const upgrade = options.upgradeBenchStatus();
    if (upgrade?.itemSprite?.complete && upgrade.itemSprite.naturalWidth > 0) {
      const maxWidth = 88;
      const maxHeight = 68;
      const scale = Math.min(maxWidth / upgrade.itemSprite.naturalWidth, maxHeight / upgrade.itemSprite.naturalHeight);
      const itemWidth = Math.max(1, Math.round(upgrade.itemSprite.naturalWidth * scale));
      const itemHeight = Math.max(1, Math.round(upgrade.itemSprite.naturalHeight * scale));
      // Center the active item over the bench sprite's flat gray work plate,
      // which the mirrored bench puts right of center.
      const itemCenterX = x + Math.round(width * .18);
      const itemCenterY = y - height + height * .32 - 6;
      ctx.save();
      ctx.shadowColor = "rgba(116,225,255,.8)";
      ctx.shadowBlur = 8;
      ctx.drawImage(residentDrawable(upgrade.itemSprite), itemCenterX - itemWidth / 2, itemCenterY - itemHeight / 2, itemWidth, itemHeight);
      ctx.restore();
    }
    if (options.getMapId() === "town" || options.getMapId() === "home_exterior") {
      drawHomeStationSign(ctx, x, y, "Loadout Upgrades", upgrade?.timer); return;
    }
    drawScreenSpaceAt(ctx, camera.zoom, x, y - height, () => {
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = '900 13px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      const labelY = -(upgrade ? 21 : 7) + Math.sin(options.getGameTime() * 2.2) * 2;
      options.outlinedText(bench.label, 0, labelY, "#f5e9c4", 4);
      if (upgrade) {
        ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
        options.outlinedText(upgrade.timer, 0, labelY + 16, "#8fe7ff", 4);
      }
    });
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
    ctx.drawImage(residentDrawable(image), x - width / 2, y - height, width, height);
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
    ctx.drawImage(residentDrawable(image), x - width / 2, y - height, width, height);
  }

  function collectVisibleLavaRocks() {
    visibleLavaRocks.length = 0;
    if (!hasLavaRocks()) return visibleLavaRocks;
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
    if (!hasLavaRocks() || lavaRocksRenderedByWebGL) return;
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

  // A small copy of the village's ground for the minimap, made once: the full image is far too big to scale every frame.
  let soulVillageThumbnail: HTMLCanvasElement | null = null;
  function drawSoulVillageOnMinimap(draw: CanvasRenderingContext2D, ox: number, oy: number, sx: number, sy: number) {
    const image = options.minimapVillageGround?.();
    if (!soulVillageThumbnail && image?.complete && image.naturalWidth > 0) {
      soulVillageThumbnail = document.createElement("canvas");
      soulVillageThumbnail.width = 256;
      soulVillageThumbnail.height = Math.max(1, Math.round(256 * image.naturalHeight / image.naturalWidth));
      soulVillageThumbnail.getContext("2d")?.drawImage(image, 0, 0, soulVillageThumbnail.width, soulVillageThumbnail.height);
    }
    if (!soulVillageThumbnail) return;
    const area = SOUL_VILLAGE_GROUND;
    draw.drawImage(soulVillageThumbnail, (area.x - ox) * sx, (area.y - oy) * sy, area.w * sx, area.h * sy);
  }

  /** Where the minimap looks on the Town, or null on any other map (it shows the whole world). */
  function townMinimapFrame() {
    if (!isTownMap(options.getMapId())) return null;
    if (inTownInteriors(options.player.x, options.player.y, TOWN_INTERIOR_MARGIN)) {
      return { x: options.player.x - TOWN_ROOMS_MINIMAP_SPAN / 2, y: options.player.y - TOWN_ROOMS_MINIMAP_SPAN / 2, span: TOWN_ROOMS_MINIMAP_SPAN, rooms: true };
    }
    const span = Math.max(TOWN_WALK_AREA.right - TOWN_WALK_AREA.left, TOWN_WALK_AREA.bottom - TOWN_WALK_AREA.top);
    return { x: (TOWN_WALK_AREA.left + TOWN_WALK_AREA.right - span) / 2, y: (TOWN_WALK_AREA.top + TOWN_WALK_AREA.bottom - span) / 2, span, rooms: false };
  }

  /** Inside a village room the map is that room in the dark, as the world is. */
  function drawSoulRoomsOnMinimap(draw: CanvasRenderingContext2D, size: number, ox: number, oy: number, sx: number, sy: number) {
    draw.fillStyle = "#000"; draw.fillRect(0, 0, size, size);
    draw.fillStyle = "#b98448";
    for (const { room } of TOWN_DOORS) draw.fillRect((room.left - ox) * sx, (room.top - oy) * sy, (room.right - room.left) * sx, (room.bottom - room.top) * sy);
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
    draw.save(); minimapRoundedRect(draw, 0, 0, size, size, 4); draw.clip();
    const innerX = 0; const innerY = 0; const innerSize = size;
    // The Town's map is its walled village, not its whole world (most of which is the dark round its rooms);
    // inside a room, it is the stretch of rooms around the player.
    const frame = townMinimapFrame();
    const ox = frame?.x ?? 0, oy = frame?.y ?? 0;
    const sx = innerSize / (frame?.span ?? WORLD.w); const sy = innerSize / (frame?.span ?? WORLD.h);
    const colors = mapColors();
    draw.fillStyle = colors.ground; draw.fillRect(innerX, innerY, innerSize, innerSize);
    if (frame && !frame.rooms) drawSoulVillageOnMinimap(draw, ox, oy, sx, sy);
    if (frame?.rooms) drawSoulRoomsOnMinimap(draw, innerSize, ox, oy, sx, sy);
    draw.fillStyle = colors.path; for (const path of options.paths) draw.fillRect(innerX + (path.x - ox) * sx, innerY + (path.y - oy) * sy, path.w * sx, path.h * sy);
    draw.save();
    draw.globalAlpha = options.getMapId() === options.infernalMapId ? .5 : 1;
    // Each enemy in the colour of the stat it pays (the autofarm tiles' colours), outlined so
    // green health dots still read on a green map. Elites and bosses are larger.
    for (const enemy of options.enemies) {
      const definition = enemy.definition ?? ENEMY_TYPES[enemy.type];
      const marker = enemy.generatedBoss || definition.elite ? 5 : 3;
      const ex = innerX + (enemy.x - ox) * sx - 1, ey = innerY + (enemy.y - oy) * sy - 1;
      draw.fillStyle = "#101010"; draw.fillRect(ex - 1, ey - 1, marker + 2, marker + 2);
      draw.fillStyle = soulMarkerColor(enemy) ?? REWARD_DATA[definition.reward.type]?.color ?? "#ff5d5d"; draw.fillRect(ex, ey, marker, marker);
    }
    draw.restore();

    const drawPortalMarker = (portal: Portal) => {
      const px = Math.round(innerX + (portal.x - ox) * sx); const py = Math.round(innerY + (portal.y - oy) * sy);
      const unlocked = options.portalIsUnlocked(portal);
      drawPortalMapMarker(draw, px, py, portal.destination, unlocked);
    };
    const portal = options.activePortal();
    if (portal) drawPortalMarker(portal);
    const secondary = options.secondaryPortal();
    if (secondary) drawPortalMarker(secondary);

    const mapBoss = bossForMap(options.getMapId());
    if (mapBoss) {
      const state = options.bosses[mapBoss.kind];
      const bx = Math.round(innerX + (state.x - ox) * sx); const by = Math.round(innerY + (state.y - oy) * sy);
      draw.save();
      draw.globalAlpha = state.dead ? .46 : 1;
      draw.fillStyle = "#101820"; draw.fillRect(bx - 5, by - 4, 11, 9);
      draw.fillStyle = mapBoss.minimapColor; draw.fillRect(bx - 4, by - 3, 9, 6); draw.fillRect(bx - 3, by - 5, 2, 2); draw.fillRect(bx + 2, by - 5, 2, 2); draw.fillRect(bx - 3, by + 3, 2, 2); draw.fillRect(bx + 2, by + 3, 2, 2);
      draw.fillStyle = "#fff"; draw.fillRect(bx - 2, by - 1, 2, 2); draw.fillRect(bx + 2, by - 1, 2, 2);
      draw.restore();
    }

    // Players are white, so they never read as an enemy's stat colour: others a small outlined square,
    // yourself an outlined diamond on top. Self is drawn from local simulation, even with the eye off.
    for (const player of remotePlayers) {
      const px = innerX + (player.x - ox) * sx, py = innerY + (player.y - oy) * sy;
      draw.fillStyle = "#101010"; draw.fillRect(px - 3, py - 3, 6, 6);
      draw.fillStyle = "#f4f1e8"; draw.fillRect(px - 2, py - 2, 4, 4);
    }
    const selfX = innerX + (options.player.x - ox) * sx, selfY = innerY + (options.player.y - oy) * sy;
    const diamond = (radius: number) => { draw.beginPath(); draw.moveTo(selfX, selfY - radius); draw.lineTo(selfX + radius, selfY); draw.lineTo(selfX, selfY + radius); draw.lineTo(selfX - radius, selfY); draw.closePath(); draw.fill(); };
    draw.fillStyle = "#101010"; diamond(6);
    draw.fillStyle = "#ffffff"; diamond(4);
    draw.strokeStyle = "rgba(255,255,255,.52)"; draw.lineWidth = 1; draw.strokeRect(innerX + (camera.x - ox) * sx, innerY + (camera.y - oy) * sy, (view.width / camera.zoom) * sx, (view.height / camera.zoom) * sy); draw.restore();
    minimapCacheKey = cacheKey;
  }

  function drawMinimap(remotePlayers: MapPlayerMarker[]) {
    if (options.getMapId() === "first_steps") return;
    const view = viewport();
    const layout = minimapDrawLayout(view.width, options.getMinimapBounds?.());
    const { size } = layout;
    const cacheKey = `${options.getMapId()}:${size}:${options.getDevicePixelRatio()}`;
    const now = performance.now();
    if (cacheKey !== minimapCacheKey || now >= nextMinimapFrameAt) {
      renderMinimapFrame(remotePlayers, size, view);
      nextMinimapFrameAt = now + MINIMAP_FRAME_INTERVAL_MS;
    }
    if (minimapCanvas.width > 0 && minimapCanvas.height > 0) ctx.drawImage(minimapCanvas, layout.x, layout.y, size, size);
  }

  return { drawGround, drawStaticWorld, warmStaticWorld, invalidateStaticWorld, drawTree, drawCactus, drawSnowPine, drawUpgradeBench, drawCharredTree, drawPortal, drawCutscenePortal, drawSecondaryPortal, drawDecor, drawMinimap };
}
