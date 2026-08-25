import { paintStaticTile, type StaticTileImage, type StaticTileScene } from "./static-tile-painter";

type ConfigureMessage = {
  type: "configure";
  generation: number;
  scene: StaticTileScene;
  shadowUrl: string;
};

type PaintMessage = {
  type: "paint";
  generation: number;
  key: string;
  tileX: number;
  tileY: number;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ConfigureMessage | PaintMessage>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

let configuredGeneration = -1;
let configuredScene: StaticTileScene | null = null;
let configuredShadow: Promise<ImageBitmap | undefined> = Promise.resolve(undefined);
let configuredLavaPools: Promise<StaticTileImage[]> = Promise.resolve([]);
const staticImages = new Map<string, Promise<ImageBitmap | undefined>>();

function loadImage(url: string) {
  if (!url) return Promise.resolve(undefined);
  const cached = staticImages.get(url);
  if (cached) return cached;
  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Shadow request failed: ${response.status}`);
      return response.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .catch(() => undefined);
  staticImages.set(url, request);
  return request;
}

workerScope.onmessage = ({ data }) => {
  if (data.type === "configure") {
    configuredGeneration = data.generation;
    configuredScene = data.scene;
    configuredShadow = loadImage(data.shadowUrl);
    configuredLavaPools = Promise.all((data.scene.lavaPoolUrls ?? []).map(loadImage)).then((images) =>
      images.flatMap((image) => image ? [{ source: image, width: image.width, height: image.height }] : []));
    return;
  }
  if (typeof OffscreenCanvas === "undefined") {
    workerScope.postMessage({ type: "unsupported" }, []);
    return;
  }
  const scene = configuredScene;
  if (!scene || data.generation !== configuredGeneration) return;
  const request = data;
  void Promise.all([configuredShadow, configuredLavaPools]).then(([shadowImage, lavaPoolImages]) => {
    try {
      const canvas = new OffscreenCanvas(scene.tileSize, scene.tileSize);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Static tile context unavailable");
      paintStaticTile(context, scene, request.tileX, request.tileY, shadowImage, lavaPoolImages);
      const bitmap = canvas.transferToImageBitmap();
      workerScope.postMessage({ type: "tile", generation: request.generation, key: request.key, bitmap }, [bitmap]);
    } catch {
      workerScope.postMessage({ type: "error", generation: request.generation, key: request.key }, []);
    }
  });
};
