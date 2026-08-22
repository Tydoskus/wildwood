import { loadDuelPlatformArt, loadDuelSpaceBackground } from "../duel";
import { requiredCanvasContext } from "./dom";
import { scheduleBackgroundTask, yieldToUser } from "./scheduler";
import { loadTreeSpritesheet } from "../world";
import { centerFramesOnGround, keepLargestFrameComponents, removeGreenPixels } from "./sprite-pixels";

export type TreeSpriteBound = {
  x: number;
  y: number;
  w: number;
  h: number;
  groundCenter: number;
  groundWidth: number;
  canopyWidth: number;
};

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
  ) {
    const pixels = context.getImageData(0, 0, width, height);
    if (!worker) {
      removeGreenPixels(pixels.data, greenThreshold, ratio);
      if (frameColumns > 1) {
        keepLargestFrameComponents(pixels.data, width, height, frameColumns);
        centerFramesOnGround(pixels.data, width, height, frameColumns);
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
      }, [pixels.data.buffer]);
    });
  }

  const dragonSprite = new Image();
  const dragonSpriteCanvas = document.createElement("canvas");
  const dragonSpriteContext = requiredCanvasContext(dragonSpriteCanvas, { willReadFrequently: true });
  let dragonReady = false;
  dragonSprite.addEventListener("load", () => {
    dragonSpriteCanvas.width = dragonSprite.naturalWidth;
    dragonSpriteCanvas.height = dragonSprite.naturalHeight;
    dragonSpriteContext.drawImage(dragonSprite, 0, 0);
    removeGreen(dragonSpriteContext, dragonSpriteCanvas.width, dragonSpriteCanvas.height, 145, 1.45, () => {
      dragonReady = true;
    });
  });
  dragonSprite.src = "assets/wildwood/dragon_boss_spritesheet.png";

  const spiderSprite = new Image();
  const spiderSpriteCanvas = document.createElement("canvas");
  const spiderSpriteContext = requiredCanvasContext(spiderSpriteCanvas, { willReadFrequently: true });
  let spiderReady = false;
  spiderSprite.addEventListener("load", () => {
    spiderSpriteCanvas.width = spiderSprite.naturalWidth;
    spiderSpriteCanvas.height = spiderSprite.naturalHeight;
    spiderSpriteContext.drawImage(spiderSprite, 0, 0);
    removeGreen(spiderSpriteContext, spiderSpriteCanvas.width, spiderSpriteCanvas.height, 135, 1.35, () => {
      spiderReady = true;
    });
  });
  spiderSprite.src = "assets/wildwood/desert-spider-boss-spritesheet.png";

  const frostclawSprite = new Image();
  const frostclawSpriteCanvas = document.createElement("canvas");
  const frostclawSpriteContext = requiredCanvasContext(frostclawSpriteCanvas, { willReadFrequently: true });
  let frostclawReady = false;
  frostclawSprite.addEventListener("load", () => {
    frostclawSpriteCanvas.width = frostclawSprite.naturalWidth;
    frostclawSpriteCanvas.height = frostclawSprite.naturalHeight;
    frostclawSpriteContext.drawImage(frostclawSprite, 0, 0);
    removeGreen(frostclawSpriteContext, frostclawSpriteCanvas.width, frostclawSpriteCanvas.height, 145, 1.45, () => {
      frostclawReady = true;
    }, 4);
  });
  frostclawSprite.src = "assets/wildwood/frostclaw-boss-spritesheet.png";

  let portalArchReady = false;
  const portalArch = new Image();
  const settlePortalArch = () => {
    portalArchReady = true;
    onWorldAssetReady();
  };
  portalArch.addEventListener("load", settlePortalArch, { once: true });
  portalArch.addEventListener("error", settlePortalArch, { once: true });
  portalArch.src = "assets/wildwood/stone-portal-arch.png";

  let portalSwirlReady = false;
  const portalSwirl = new Image();
  const settlePortalSwirl = () => {
    portalSwirlReady = true;
    onWorldAssetReady();
  };
  portalSwirl.addEventListener("load", settlePortalSwirl, { once: true });
  portalSwirl.addEventListener("error", settlePortalSwirl, { once: true });
  portalSwirl.src = "assets/wildwood/portal-swirl-spritesheet.png";

  let treeReady = false;
  let treeBounds: TreeSpriteBound[] = [];
  const treeSpritesheet = loadTreeSpritesheet(() => {
    const finishTreeLoad = (bounds: TreeSpriteBound[] = []) => {
      treeBounds = bounds;
      treeReady = true;
      onWorldAssetReady();
    };
    if (treeSpritesheet.naturalWidth <= 0) {
      finishTreeLoad();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = treeSpritesheet.naturalWidth;
    canvas.height = treeSpritesheet.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !worker) {
      void yieldToUser().then(() => finishTreeLoad(measureTreeSpriteBounds(treeSpritesheet)));
      return;
    }
    context.drawImage(treeSpritesheet, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const requestId = nextRequestId++;
    requests.set(requestId, (result) => {
      if (result.type === "treeBounds") finishTreeLoad(result.bounds);
    });
    scheduleBackgroundTask(() => {
      worker.postMessage({ type: "treeBounds", requestId, width: canvas.width, height: canvas.height, pixels: pixels.data.buffer }, [pixels.data.buffer]);
    });
  });

  let duelSpaceReady = false;
  const duelSpaceBackground = loadDuelSpaceBackground(() => {
    duelSpaceReady = true;
    onWorldAssetReady();
  });
  let duelPlatformReady = false;
  const duelPlatformArt = loadDuelPlatformArt(() => {
    duelPlatformReady = true;
    onWorldAssetReady();
  });
  const snowPine = new Image();
  snowPine.src = "assets/wildwood/snow-pine-tree-v1.png";
  const upgradeBench = new Image();
  upgradeBench.src = "assets/wildwood/workbench-upgrade-station-v1.png";
  let settledLavaAssets = 0;
  const lavaAssetSources = [
    "assets/wildwood/lava/lava-pool-1.png",
    "assets/wildwood/lava/lava-pool-2.png",
    "assets/wildwood/lava/lava-pool-3.png",
    "assets/wildwood/lava/lava-rock-1.png",
    "assets/wildwood/lava/lava-rock-2.png",
    "assets/wildwood/lava/lava-rock-3.png",
    "assets/wildwood/lava/charred-tree-1.png",
    "assets/wildwood/lava/charred-tree-2.png",
  ];
  const lavaAssets = lavaAssetSources.map((source) => {
    const image = new Image();
    const settle = () => {
      settledLavaAssets += 1;
      onWorldAssetReady();
    };
    image.addEventListener("load", settle, { once: true });
    image.addEventListener("error", settle, { once: true });
    image.src = source;
    return image;
  });

  return {
    dragonReady: () => dragonReady,
    dragonSpriteCanvas,
    duelPlatformArt,
    duelSpaceBackground,
    portalArch,
    portalSwirl,
    frostclawReady: () => frostclawReady,
    frostclawSpriteCanvas,
    charredTrees: lavaAssets.slice(6),
    lavaPools: lavaAssets.slice(0, 3),
    lavaRocks: lavaAssets.slice(3, 6),
    snowPine,
    upgradeBench,
    spiderReady: () => spiderReady,
    spiderSpriteCanvas,
    treeSpriteBounds: () => treeBounds,
    treeSpritesheet,
    worldArtReady: () => treeReady && portalArchReady && portalSwirlReady && duelSpaceReady && duelPlatformReady && settledLavaAssets === lavaAssetSources.length,
  };
}

function measureTreeSpriteBounds(treeSpritesheet: HTMLImageElement): TreeSpriteBound[] {
  const canvas = document.createElement("canvas");
  canvas.width = treeSpritesheet.naturalWidth;
  canvas.height = treeSpritesheet.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(treeSpritesheet, 0, 0);
  const cellWidth = treeSpritesheet.naturalWidth / 4;
  const cellHeight = treeSpritesheet.naturalHeight / 4;
  return Array.from({ length: 16 }, (_, variant) => {
    const cellX = Math.floor((variant % 4) * cellWidth);
    const cellY = Math.floor(Math.floor(variant / 4) * cellHeight);
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
