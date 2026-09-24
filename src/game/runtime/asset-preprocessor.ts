import { CARAPACE_ANGLER_ATLAS, CARAPACE_ANGLER_USED_PAGES } from "./carapace-angler-sprite";
import { BOSS_ART } from "./boss-art";
import { isProceduralMap } from "../../../shared/procedural-maps";
import { DUEL_PLATFORM_ART_SOURCE, DUEL_SPACE_BACKGROUND_SOURCE } from "../duel";
import { requiredCanvasContext } from "./dom";
import { scheduleBackgroundTask, yieldToUser } from "./scheduler";
import { PORTAL_SWIRL_SOURCE } from "../portal-presentation";
import { type MapId } from "../world";
import { centerFramesOnGround, keepLargestFrameComponents, removeGreenPixels, repackLargestComponentsIntoFrames } from "./sprite-pixels";
import { MAP_ASSET_GROUPS, type MapArtAssetGroup } from "./map-asset-groups";
import { SCORPION_SPRITE } from "./scorpion-sprite";
import { savedMapDesign } from "../map-design";
import { PRISMSHELL_ATLAS, PRISMSHELL_USED_PAGES } from "./prismshell-sprite";
import { IRONHORN_ATLAS, IRONHORN_USED_PAGES } from "./ironhorn-sprite";
import { VOLTWARDEN_ART_SOURCE } from "./neon-boss-art";
import { GRAVEBLOOM_ART_SOURCE } from "./verdant-boss-art";
import { AEGIS_PRIME_ART_SOURCE } from "./ion-boss-art";
import { DREADREAPER_ATLAS, DREADREAPER_USED_PAGES } from "./dreadreaper-sprite";

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
  };

  function createLazyImageAsset(
    source: string,
    process: (image: HTMLImageElement, settle: () => void) => void = (_image, settle) => settle(),
  ): LazyImageAsset {
    const image = new Image();
    image.decoding = "async";
    let started = false;
    let didSettle = false;
    let didFail = false;
    let retry = 0;
    let resolve!: () => void;
    const promise = new Promise<void>((complete) => { resolve = complete; });
    const settle = () => {
      if (didSettle) return;
      didSettle = true;
      onWorldAssetReady();
      resolve();
    };
    image.addEventListener("load", () => {
      try {
        process(image, settle);
      } catch {
        didFail = true;
        settle();
      }
    }, { once: true });
    image.addEventListener("error", () => {
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
          image.src = source;
        }
        return promise;
      },
      failed: () => didFail,
      settled: () => didSettle,
    };
  }

  const dragonSpriteCanvas = document.createElement("canvas");
  const dragonSpriteContext = requiredCanvasContext(dragonSpriteCanvas, { willReadFrequently: true });
  let dragonReady = false;
  const dragonAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.DRAGON.sheet}`, (image, settle) => {
    dragonSpriteCanvas.width = image.naturalWidth;
    dragonSpriteCanvas.height = image.naturalHeight;
    dragonSpriteContext.drawImage(image, 0, 0);
    removeGreen(dragonSpriteContext, dragonSpriteCanvas.width, dragonSpriteCanvas.height, 145, 1.45, () => {
      dragonReady = true;
      settle();
    });
  });

  const spiderSpriteCanvas = document.createElement("canvas");
  const spiderSpriteContext = requiredCanvasContext(spiderSpriteCanvas, { willReadFrequently: true });
  let spiderReady = false;
  const spiderAsset = createLazyImageAsset(SCORPION_SPRITE.source, (image, settle) => {
    spiderSpriteCanvas.width = image.naturalWidth;
    spiderSpriteCanvas.height = image.naturalHeight;
    spiderSpriteContext.drawImage(image, 0, 0);
    removeGreen(spiderSpriteContext, spiderSpriteCanvas.width, spiderSpriteCanvas.height, 135, 1.35, () => {
      spiderReady = true;
      settle();
    }, SCORPION_SPRITE.frames);
  });

  const frostclawSpriteCanvas = document.createElement("canvas");
  const frostclawSpriteContext = requiredCanvasContext(frostclawSpriteCanvas, { willReadFrequently: true });
  let frostclawReady = false;
  const frostclawAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.FROSTCLAW.sheet}`, (image, settle) => {
    frostclawSpriteCanvas.width = image.naturalWidth;
    frostclawSpriteCanvas.height = image.naturalHeight;
    frostclawSpriteContext.drawImage(image, 0, 0);
    removeGreen(frostclawSpriteContext, frostclawSpriteCanvas.width, frostclawSpriteCanvas.height, 145, 1.45, () => {
      frostclawReady = true;
      settle();
    }, 4);
  });

  const magmaliskSpriteCanvas = document.createElement("canvas");
  const magmaliskSpriteContext = requiredCanvasContext(magmaliskSpriteCanvas, { willReadFrequently: true });
  let magmaliskReady = false;
  const magmaliskAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.MAGMALISK.sheet}`, (image, settle) => {
    magmaliskSpriteCanvas.width = image.naturalWidth;
    magmaliskSpriteCanvas.height = image.naturalHeight;
    magmaliskSpriteContext.drawImage(image, 0, 0);
    removeGreen(magmaliskSpriteContext, magmaliskSpriteCanvas.width, magmaliskSpriteCanvas.height, 145, 1.45, () => {
      magmaliskReady = true;
      settle();
    }, 4, true);
  });

  const gloomrootSpriteCanvas = document.createElement("canvas");
  const gloomrootSpriteContext = requiredCanvasContext(gloomrootSpriteCanvas, { willReadFrequently: true });
  let gloomrootReady = false;
  const gloomrootAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.GLOOMROOT.sheet}`, (image, settle) => {
    gloomrootSpriteCanvas.width = image.naturalWidth;
    gloomrootSpriteCanvas.height = image.naturalHeight;
    gloomrootSpriteContext.drawImage(image, 0, 0);
    const pixels = gloomrootSpriteContext.getImageData(0, 0, gloomrootSpriteCanvas.width, gloomrootSpriteCanvas.height);
    removeGreenPixels(pixels.data, 145, 1.45);
    gloomrootSpriteContext.putImageData(pixels, 0, 0);
    gloomrootReady = true;
    settle();
  });

  const tidewyrmPageAssets = CARAPACE_ANGLER_ATLAS.pages.map(page => createLazyImageAsset(page.src));
  const tidewyrmAssets = CARAPACE_ANGLER_USED_PAGES.map(index => tidewyrmPageAssets[index]);

  const koiShogunSpriteCanvas = document.createElement("canvas");
  const koiShogunSpriteContext = requiredCanvasContext(koiShogunSpriteCanvas, { willReadFrequently: true });
  let koiShogunReady = false;
  const koiShogunAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.KOI_SHOGUN.sheet}`, (image, settle) => {
    koiShogunSpriteCanvas.width = image.naturalWidth;
    koiShogunSpriteCanvas.height = image.naturalHeight;
    koiShogunSpriteContext.drawImage(image, 0, 0);
    removeGreen(koiShogunSpriteContext, koiShogunSpriteCanvas.width, koiShogunSpriteCanvas.height, 145, 1.45, () => {
      koiShogunReady = true;
      settle();
    }, 4);
  });

  const tempestKirinSpriteCanvas = document.createElement("canvas");
  const tempestKirinSpriteContext = requiredCanvasContext(tempestKirinSpriteCanvas, { willReadFrequently: true });
  let tempestKirinReady = false;
  const tempestKirinAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.TEMPEST_KIRIN.sheet}`, (image, settle) => {
    tempestKirinSpriteCanvas.width = image.naturalWidth;
    tempestKirinSpriteCanvas.height = image.naturalHeight;
    tempestKirinSpriteContext.drawImage(image, 0, 0);
    tempestKirinReady = true;
    settle();
  });
  const miremawSpriteCanvas = document.createElement("canvas");
  const miremawSpriteContext = requiredCanvasContext(miremawSpriteCanvas, { willReadFrequently: true });
  let miremawReady = false;
  const miremawAsset = createLazyImageAsset(`assets/wildstat/${BOSS_ART.MIREMAW.sheet}`, (image, settle) => {
    miremawSpriteCanvas.width = image.naturalWidth;
    miremawSpriteCanvas.height = image.naturalHeight;
    miremawSpriteContext.drawImage(image, 0, 0);
    miremawReady = true;
    settle();
  });
  const prismshellPageAssets = PRISMSHELL_ATLAS.pages.map((page) => createLazyImageAsset(page.src));
  const ironhornPageAssets = IRONHORN_ATLAS.pages.map((page) => createLazyImageAsset(page.src));
  const dreadreaperPageAssets = DREADREAPER_ATLAS.pages.map((page) => createLazyImageAsset(page.src));
  const voltwardenPageAssets = [createLazyImageAsset(VOLTWARDEN_ART_SOURCE)];
  const gravebloomPageAssets = [createLazyImageAsset(GRAVEBLOOM_ART_SOURCE)];
  const aegisPrimePageAssets = [createLazyImageAsset(AEGIS_PRIME_ART_SOURCE)];
  const prismshellAssets = PRISMSHELL_USED_PAGES.map((index) => prismshellPageAssets[index]);
  const ironhornAssets = IRONHORN_USED_PAGES.map((index) => ironhornPageAssets[index]);
  const dreadreaperAssets = DREADREAPER_USED_PAGES.map((index) => dreadreaperPageAssets[index]);
  const voltwardenAssets = voltwardenPageAssets;
  const gravebloomAssets = gravebloomPageAssets;
  const aegisPrimeAssets = aegisPrimePageAssets;

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
  const assetGroups: Record<MapArtAssetGroup, LazyImageAsset[]> = {
    forestBoss: [dragonAsset],
    forestDecor: [treeAsset],
    orchardDecor: lavaAssets.slice(6),
    desertBoss: [spiderAsset],
    snowBoss: [frostclawAsset],
    snowDecor: [snowPineAsset, upgradeBenchAsset],
    lavaBoss: [magmaliskAsset],
    lavaDecor: lavaAssets,
    nightBoss: [gloomrootAsset],
    nightDecor: [nightTreeAsset],
    cherryDecor: [cherryTreeAsset],
    waterBoss: tidewyrmAssets,
    samuraiBoss: [koiShogunAsset],
    cloudspireBoss: [tempestKirinAsset],
    moonfenBoss: [miremawAsset],
    crystalHollowsBoss: prismshellAssets, clockworkRuinsBoss: ironhornAssets, duskfallOrchardBoss: dreadreaperAssets, neonBastionBoss: voltwardenAssets, verdantCatacombsBoss: gravebloomAssets, ionCitadelBoss: aegisPrimeAssets,
  };
  const mapAssets = {} as Record<MapId, LazyImageAsset[]>;
  for (const mapId of Object.keys(MAP_ASSET_GROUPS) as MapId[]) {
    const groups = new Set<MapArtAssetGroup>(MAP_ASSET_GROUPS[mapId].art);
    const editedDecor = new Set(savedMapDesign(mapId)?.decor.map((item) => item.type) ?? []);
    if (editedDecor.has("tree") && mapId !== "samurai_garden") groups.add(mapId === "infernal_depths" ? "nightDecor" : "forestDecor");
    if (editedDecor.has("snowPine") || editedDecor.has("upgradeBench")) groups.add("snowDecor");
    if (editedDecor.has("lavaPool") || editedDecor.has("lavaRock") || editedDecor.has("charredTree")) groups.add("lavaDecor");
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

  function ensureDuelAssets() {
    return Promise.all([duelSpaceAsset.load(), duelPlatformAsset.load()]).then(() => undefined);
  }

  return {
    dragonReady: () => dragonReady,
    dragonSpriteCanvas,
    duelPlatformArt: duelPlatformAsset.image,
    duelSpaceBackground: duelSpaceAsset.image,
    portalArch: portalArchAsset.image,
    portalSwirl: portalSwirlAsset.image,
    frostclawReady: () => frostclawReady,
    frostclawSpriteCanvas,
    gloomrootReady: () => gloomrootReady,
    gloomrootSpriteCanvas,
    charredTrees: lavaAssets.slice(6).map((asset) => asset.image),
    lavaPools: lavaAssets.slice(0, 3).map((asset) => asset.image),
    lavaRocks: lavaAssets.slice(3, 6).map((asset) => asset.image),
    magmaliskReady: () => magmaliskReady,
    magmaliskSpriteCanvas,
    nightTreeSpriteBounds: () => nightTreeBounds,
    nightTreeSpritesheet: nightTreeAsset.image,
    cherryTreeSpriteBounds: () => cherryTreeBounds,
    cherryTreeSpritesheet: cherryTreeAsset.image,
    snowPine: snowPineAsset.image,
    upgradeBench: upgradeBenchAsset.image,
    spiderReady: () => spiderReady,
    spiderSpriteCanvas,
    treeSpriteBounds: () => treeBounds,
    treeSpritesheet: treeAsset.image,
    tidewyrmReady: () => tidewyrmAssets.every(asset => asset.settled() && !asset.failed()),
    tidewyrmSpritePages: tidewyrmPageAssets.map(asset => asset.image),
    koiShogunReady: () => koiShogunReady,
    koiShogunSpriteCanvas,
    tempestKirinReady: () => tempestKirinReady,
    tempestKirinSpriteCanvas,
    miremawReady: () => miremawReady,
    prismshellReady: () => prismshellAssets.every((asset) => asset.settled() && !asset.failed()), ironhornReady: () => ironhornAssets.every((asset) => asset.settled() && !asset.failed()), dreadreaperReady: () => dreadreaperAssets.every((asset) => asset.settled() && !asset.failed()), voltwardenReady: () => voltwardenAssets.every((asset) => asset.settled() && !asset.failed()), gravebloomReady: () => gravebloomAssets.every((asset) => asset.settled() && !asset.failed()), aegisPrimeReady: () => aegisPrimeAssets.every((asset) => asset.settled() && !asset.failed()),
    miremawSpriteCanvas,
    prismshellSpritePages: prismshellPageAssets.map((asset) => asset.image), ironhornSpritePages: ironhornPageAssets.map((asset) => asset.image), dreadreaperSpritePages: dreadreaperPageAssets.map((asset) => asset.image), voltwardenSpritePages: voltwardenPageAssets.map((asset) => asset.image), gravebloomSpritePages: gravebloomPageAssets.map((asset) => asset.image), aegisPrimeSpritePages: aegisPrimePageAssets.map((asset) => asset.image),
    ensureDuelAssets,
    duelAssetsReady: () => duelSpaceAsset.settled() && duelPlatformAsset.settled(),
    ensureMapAssets,
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
