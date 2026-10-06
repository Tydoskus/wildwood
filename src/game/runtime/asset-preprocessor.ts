import { SOUL_SHORE_SOURCE, SOUL_WATER_SOURCE } from "./soul-water";
import { SOUL_ATLAS_SOURCE, SOUL_INTERIORS_SOURCE, SOUL_VILLAGE_GROUND_SOURCE, SOUL_VILLAGE_PROPS_SOURCE } from "./soul-prop-renderer";
import { isProceduralMap } from "../../../shared/procedural-maps";
import { DUEL_PLATFORM_ART_SOURCE, DUEL_SPACE_BACKGROUND_SOURCE } from "../duel";
import { requiredCanvasContext } from "./dom";
import { scheduleBackgroundTask, yieldToUser } from "./scheduler";
import { PORTAL_SWIRL_SOURCE } from "../portal-presentation";
import { type MapId } from "../world";
import { centerFramesOnGround, keepLargestFrameComponents, removeGreenPixels, repackLargestComponentsIntoFrames } from "./sprite-pixels";
import { MAP_ASSET_GROUPS, type MapArtAssetGroup } from "./map-asset-groups";
import { savedMapDesign } from "../map-design";
import { BOSSES, BOSS_KINDS, perBoss, type BossArtAssets, type BossArtSource } from "./boss-registry";

export type TreeSpriteBound = {
  x: number;
  y: number;
  w: number;
  h: number;
  groundCenter: number;
  groundWidth: number;
  canopyWidth: number;
};

/** The forest and night sheets pack sixteen trees into a 4x4 grid. */
const TREE_SHEET_COLUMNS = 4;
/** Samurai Garden's cherries are four larger trees in a 2x2 grid. */
export const CHERRY_TREE_SHEET_COLUMNS = 2;
export const CHERRY_TREE_SHEET_SOURCE = "assets/wildstat/cherry-tree-spritesheet-v1.webp";
export const CHERRY_TREE_VARIANTS = CHERRY_TREE_SHEET_COLUMNS * CHERRY_TREE_SHEET_COLUMNS;

type PreprocessResult =
  | { type: "removeGreen"; requestId: number; pixels: ArrayBuffer }
  | { type: "treeBounds"; requestId: number; bounds: TreeSpriteBound[] };

/** Loads image assets and moves expensive pixel preprocessing off the main thread. */
export function createAssetPreprocessor(onWorldAssetReady: () => void) {
  const worker = typeof Worker === "undefined"
    ? null
    : new Worker(new URL("./asset-preprocess-worker.ts", import.meta.url), { type: "module" });
  let nextRequestId = 1;
  const requests = new Map<number, (result: PreprocessResult) => void>();
  worker?.addEventListener("message", ({ data }: MessageEvent<PreprocessResult>) => {
    const complete = requests.get(data.requestId);
    if (!complete) return;
    requests.delete(data.requestId);
    complete(data);
  });

  function removeGreen(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    greenThreshold: number,
    ratio: number,
    complete: () => void,
    frameColumns = 0,
    repackFrameComponents = false,
  ) {
    const pixels = context.getImageData(0, 0, width, height);
    if (!worker) {
      removeGreenPixels(pixels.data, greenThreshold, ratio);
      if (frameColumns > 1) {
        if (repackFrameComponents) repackLargestComponentsIntoFrames(pixels.data, width, height, frameColumns);
        else {
          keepLargestFrameComponents(pixels.data, width, height, frameColumns);
          centerFramesOnGround(pixels.data, width, height, frameColumns);
        }
      }
      context.putImageData(pixels, 0, 0);
      complete();
      return;
    }
    const requestId = nextRequestId++;
    requests.set(requestId, (result) => {
      if (result.type !== "removeGreen") return;
      context.putImageData(new ImageData(new Uint8ClampedArray(result.pixels), width, height), 0, 0);
      complete();
    });
    scheduleBackgroundTask(() => {
      worker.postMessage({
        type: "removeGreen",
        requestId,
        pixels: pixels.data.buffer,
        width,
        height,
        greenThreshold,
        ratio,
        frameColumns,
        repackFrameComponents,
      }, [pixels.data.buffer]);
    });
  }

  type LazyImageAsset = {
    image: HTMLImageElement;
    load: () => Promise<void>;
    failed: () => boolean;
    settled: () => boolean;
    /** Lets go of the pixels of a map that was left; a later load() fetches them again. */
    release: () => boolean;
  };

  function createLazyImageAsset(
    source: string,
    process: (image: HTMLImageElement, settle: () => void) => void = (_image, settle) => settle(),
    /** Frees whatever `process` built from the image, and marks it not ready. */
    onRelease?: () => void,
  ): LazyImageAsset {
    const image = new Image();
    image.decoding = "async";
    let started = false;
    let didSettle = false;
    let didFail = false;
    let retry = 0;
    let resolve!: () => void;
    let promise = new Promise<void>((complete) => { resolve = complete; });
    const settle = () => {
      if (didSettle) return;
      didSettle = true;
      onWorldAssetReady();
      resolve();
    };
    const onLoad = () => {
      try {
        process(image, settle);
      } catch {
        didFail = true;
        settle();
      }
    };
    image.addEventListener("error", () => {
      if (!started) return;
      if (retry >= 2) {
        didFail = true;
        settle();
        return;
      }
      retry += 1;
      globalThis.setTimeout(() => { image.src = `${source}?asset-retry=${retry}`; }, retry * 500);
    });
    return {
      image,
      load: () => {
        if (!started) {
          started = true;
          image.addEventListener("load", onLoad, { once: true });
          image.src = source;
        }
        return promise;
      },
      failed: () => didFail,
      settled: () => didSettle,
      release: () => {
        // Nothing loaded yet, or still loading: leave it to finish.
        if (!started || !didSettle) return false;
        image.removeEventListener("load", onLoad);
        image.removeAttribute("src");
        started = false; didSettle = false; didFail = false; retry = 0;
        promise = new Promise<void>((complete) => { resolve = complete; });
        onRelease?.();
        return true;
      },
    };
  }

  /** A processed canvas takes its memory back by shrinking to nothing. */
  const emptyCanvas = (canvas: HTMLCanvasElement) => { canvas.width = 0; canvas.height = 0; };

  /**
   * One world boss's art, as the registry describes it: a sheet drawn into a
   * canvas (its green backdrop keyed out first when it has one), or the pages
   * of an atlas, of which only the used ones are loaded with the map.
   */
  function createBossArt(source: BossArtSource) {
    if ("pages" in source) {
      const pages = source.pages.map((page) => createLazyImageAsset(page));
      const used = source.used.map((index) => pages[index]);
      return {
        assets: used,
        art: { pages: pages.map((asset) => asset.image), ready: () => used.every((asset) => asset.settled() && !asset.failed()) },
      };
    }
    const canvas = document.createElement("canvas");
    const context = requiredCanvasContext(canvas, { willReadFrequently: true });
    const { chroma } = source;
    let ready = false;
    const asset = createLazyImageAsset(source.sheet, (image, settle) => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
      const finish = () => {
        ready = true;
        settle();
      };
      if (!chroma) finish();
      else if (chroma.inline) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        removeGreenPixels(pixels.data, chroma.greenThreshold, chroma.ratio);
        context.putImageData(pixels, 0, 0);
        finish();
      } else removeGreen(context, canvas.width, canvas.height, chroma.greenThreshold, chroma.ratio, finish, chroma.frameColumns, chroma.repack);
    }, () => { ready = false; emptyCanvas(canvas); });
    return { assets: [asset], art: { canvas, ready: () => ready } };
  }
  const bossArt = perBoss((kind) => createBossArt(BOSSES[kind].art));

  const portalArchAsset = createLazyImageAsset("assets/wildstat/stone-portal-arch.webp");
  const portalSwirlAsset = createLazyImageAsset(PORTAL_SWIRL_SOURCE);
  void portalArchAsset.load();
  void portalSwirlAsset.load();

  const preprocessTreeBounds = (
    spritesheet: HTMLImageElement,
    finish: (bounds?: TreeSpriteBound[]) => void,
    columns = TREE_SHEET_COLUMNS,
  ) => {
    if (spritesheet.naturalWidth <= 0) {
      finish();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = spritesheet.naturalWidth;
    canvas.height = spritesheet.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !worker) {
      void yieldToUser().then(() => finish(measureTreeSpriteBounds(spritesheet, columns)));
      return;
    }
    context.drawImage(spritesheet, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const requestId = nextRequestId++;
    requests.set(requestId, (result) => {
      if (result.type === "treeBounds") finish(result.bounds);
    });
    scheduleBackgroundTask(() => {
      worker.postMessage({ type: "treeBounds", requestId, width: canvas.width, height: canvas.height, columns, pixels: pixels.data.buffer }, [pixels.data.buffer]);
    });
  };

  let treeBounds: TreeSpriteBound[] = [];
  const treeAsset = createLazyImageAsset("assets/wildstat/tree-spritesheet-v1.webp", (image, settle) => {
    preprocessTreeBounds(image, (bounds = []) => {
      treeBounds = bounds;
      settle();
    });
  });

  let nightTreeBounds: TreeSpriteBound[] = [];
  const nightTreeAsset = createLazyImageAsset("assets/wildstat/night-tree-spritesheet-v1.webp", (image, settle) => {
    preprocessTreeBounds(image, (bounds = []) => {
      nightTreeBounds = bounds;
      settle();
    });
  });

  let cherryTreeBounds: TreeSpriteBound[] = [];
  const cherryTreeAsset = createLazyImageAsset(CHERRY_TREE_SHEET_SOURCE, (image, settle) => {
    preprocessTreeBounds(image, (bounds = []) => {
      cherryTreeBounds = bounds;
      settle();
    }, CHERRY_TREE_SHEET_COLUMNS);
  });

  const duelSpaceAsset = createLazyImageAsset(DUEL_SPACE_BACKGROUND_SOURCE);
  const duelPlatformAsset = createLazyImageAsset(DUEL_PLATFORM_ART_SOURCE);
  const snowPineAsset = createLazyImageAsset("assets/wildstat/snow-pine-tree-v1.webp");
  const upgradeBenchAsset = createLazyImageAsset("assets/wildstat/workbench-upgrade-station-v1.webp");
  const lavaAssetSources = [
    "assets/wildstat/lava/lava-pool-1.webp",
    "assets/wildstat/lava/lava-pool-2.webp",
    "assets/wildstat/lava/lava-pool-3.webp",
    "assets/wildstat/lava/lava-rock-1.webp",
    "assets/wildstat/lava/lava-rock-2.webp",
    "assets/wildstat/lava/lava-rock-3.webp",
    "assets/wildstat/lava/charred-tree-1.webp",
    "assets/wildstat/lava/charred-tree-2.webp",
  ];
  const lavaAssets = lavaAssetSources.map((source) => createLazyImageAsset(source));
  const soulAtlasAsset = createLazyImageAsset(SOUL_ATLAS_SOURCE);
  const soulVillagePropsAsset = createLazyImageAsset(SOUL_VILLAGE_PROPS_SOURCE);
  const soulVillageGroundAsset = createLazyImageAsset(SOUL_VILLAGE_GROUND_SOURCE);
  const soulWaterAsset = createLazyImageAsset(SOUL_WATER_SOURCE);
  const soulShoreAsset = createLazyImageAsset(SOUL_SHORE_SOURCE);
  const soulInteriorsAsset = createLazyImageAsset(SOUL_INTERIORS_SOURCE);
  const assetGroups = {
    forestDecor: [treeAsset],
    orchardDecor: lavaAssets.slice(6),
    snowDecor: [snowPineAsset, upgradeBenchAsset],
    lavaDecor: lavaAssets,
    nightDecor: [nightTreeAsset],
    cherryDecor: [cherryTreeAsset],
    soulVillage: [soulAtlasAsset, soulVillagePropsAsset, soulVillageGroundAsset, soulWaterAsset, soulShoreAsset, soulInteriorsAsset],
    packNature: [soulAtlasAsset],
    ...Object.fromEntries(BOSS_KINDS.map((kind) => [BOSSES[kind].assetGroup, bossArt[kind].assets])),
  } as Record<MapArtAssetGroup, LazyImageAsset[]>;
  const mapAssets = {} as Record<MapId, LazyImageAsset[]>;
  for (const mapId of Object.keys(MAP_ASSET_GROUPS) as MapId[]) {
    const groups = new Set<MapArtAssetGroup>(MAP_ASSET_GROUPS[mapId].art);
    const editedDecor = new Set(savedMapDesign(mapId)?.decor.map((item) => item.type) ?? []);
    if (editedDecor.has("tree") && mapId !== "samurai_garden") groups.add(mapId === "infernal_depths" ? "nightDecor" : "forestDecor");
    if (editedDecor.has("snowPine") || editedDecor.has("upgradeBench")) groups.add("snowDecor");
    if (editedDecor.has("lavaPool") || editedDecor.has("lavaRock") || editedDecor.has("charredTree")) groups.add("lavaDecor");
    if (editedDecor.has("glowMushroom") || mapId === "moonfen" || mapId === "verdant_catacombs") groups.add("packNature");
    mapAssets[mapId] = [...groups].flatMap((group) => assetGroups[group]);
  }
  function ensureMapAssets(mapId: MapId) {
    return Promise.all((isProceduralMap(mapId) ? [] : mapAssets[mapId]).map((asset) => asset.load())).then(() => undefined);
  }

  function mapAssetsReady(mapId: MapId) {
    return (isProceduralMap(mapId) ? [] : mapAssets[mapId]).every((asset) => asset.settled());
  }

  function mapAssetLoadFailed(mapId: MapId) {
    return (isProceduralMap(mapId) ? [] : mapAssets[mapId]).some((asset) => asset.failed());
  }

  /**
   * Maps load their art on the way in and used to keep it for the session, so
   * a long run held every boss sheet it had passed (hundreds of MB decoded),
   * and iOS began purging and re-decoding images mid-frame. Anything no map
   * in `keep` uses is let go; it loads again if the player walks back.
   */
  function releaseMapAssetsExcept(keep: readonly MapId[]) {
    const needed = new Set(keep.flatMap((mapId) => isProceduralMap(mapId) ? [] : mapAssets[mapId] ?? []));
    let released = 0;
    for (const asset of new Set(Object.values(mapAssets).flat())) if (!needed.has(asset) && asset.release()) released += 1;
    return released;
  }

  function ensureDuelAssets() {
    return Promise.all([duelSpaceAsset.load(), duelPlatformAsset.load()]).then(() => undefined);
  }

  return {
    bossArt: perBoss((kind) => bossArt[kind].art) as BossArtAssets,
    duelPlatformArt: duelPlatformAsset.image,
    duelSpaceBackground: duelSpaceAsset.image,
    portalArch: portalArchAsset.image,
    portalSwirl: portalSwirlAsset.image,
    charredTrees: lavaAssets.slice(6).map((asset) => asset.image),
    soulAtlas: soulAtlasAsset.image,
    soulVillageProps: soulVillagePropsAsset.image,
    soulVillageGround: soulVillageGroundAsset.image,
    soulInteriors: soulInteriorsAsset.image,
    soulWater: soulWaterAsset.image,
    soulShore: soulShoreAsset.image,
    lavaPools: lavaAssets.slice(0, 3).map((asset) => asset.image),
    lavaRocks: lavaAssets.slice(3, 6).map((asset) => asset.image),
    nightTreeSpriteBounds: () => nightTreeBounds,
    nightTreeSpritesheet: nightTreeAsset.image,
    cherryTreeSpriteBounds: () => cherryTreeBounds,
    cherryTreeSpritesheet: cherryTreeAsset.image,
    snowPine: snowPineAsset.image,
    upgradeBench: upgradeBenchAsset.image,
    treeSpriteBounds: () => treeBounds,
    treeSpritesheet: treeAsset.image,
    ensureDuelAssets,
    duelAssetsReady: () => duelSpaceAsset.settled() && duelPlatformAsset.settled(),
    ensureMapAssets,
    releaseMapAssetsExcept,
    mapAssetLoadFailed,
    mapAssetsReady,
    worldArtReady: (mapId?: MapId) => {
      if (mapId) void ensureMapAssets(mapId);
      return portalArchAsset.settled() && portalSwirlAsset.settled()
        && (!mapId || mapAssetsReady(mapId));
    },
  };
}

function measureTreeSpriteBounds(treeSpritesheet: HTMLImageElement, columns = TREE_SHEET_COLUMNS): TreeSpriteBound[] {
  const canvas = document.createElement("canvas");
  canvas.width = treeSpritesheet.naturalWidth;
  canvas.height = treeSpritesheet.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(treeSpritesheet, 0, 0);
  const cellWidth = treeSpritesheet.naturalWidth / columns;
  const cellHeight = treeSpritesheet.naturalHeight / columns;
  return Array.from({ length: columns * columns }, (_, variant) => {
    const cellX = Math.floor((variant % columns) * cellWidth);
    const cellY = Math.floor(Math.floor(variant / columns) * cellHeight);
    const width = Math.ceil(cellWidth);
    const height = Math.ceil(cellHeight);
    const pixels = context.getImageData(cellX, cellY, width, height).data;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] < 8) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right <= left || bottom <= top) {
      return { x: cellX, y: cellY, w: width, h: height, groundCenter: width / 2, groundWidth: width * .3, canopyWidth: width * .6 };
    }
    let groundLeft = width;
    let groundRight = 0;
    for (let y = Math.max(0, bottom - 3); y < bottom; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] < 8) continue;
        groundLeft = Math.min(groundLeft, x);
        groundRight = Math.max(groundRight, x + 1);
      }
    }
    const groundWidth = groundRight > groundLeft ? groundRight - groundLeft : Math.max(8, (right - left) * .28);
    const groundCenter = groundRight > groundLeft ? (groundLeft + groundRight) / 2 - left : (right - left) / 2;
    const canopyBottom = Math.round(top + (bottom - top) * .78);
    let canopyLeft = width;
    let canopyRight = 0;
    for (let y = top; y < canopyBottom; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] < 8) continue;
        canopyLeft = Math.min(canopyLeft, x);
        canopyRight = Math.max(canopyRight, x + 1);
      }
    }
    const canopyWidth = canopyRight > canopyLeft ? canopyRight - canopyLeft : right - left;
    return { x: cellX + left, y: cellY + top, w: right - left, h: bottom - top, groundCenter, groundWidth, canopyWidth };
  });
}
