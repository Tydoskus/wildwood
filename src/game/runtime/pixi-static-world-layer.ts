import {
  Application,
  Container,
  RendererType,
  Sprite,
  Texture,
  type TextureSourceLike,
} from "pixi.js";
import { pixiRendererPreference } from "./renderer-preference";

export type StaticWorldTileFrame = {
  key: string;
  source: HTMLCanvasElement | ImageBitmap;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StaticWorldLayerFrame = {
  backgroundColor: string;
  width: number;
  height: number;
  dpr: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  tiles: StaticWorldTileFrame[];
};

export type StaticWorldLayer = {
  active: () => boolean;
  hide: () => void;
  invalidate: () => void;
  render: (frame: StaticWorldLayerFrame) => boolean;
  renderer: "webgl" | "canvas";
};

type TileSprite = {
  source: HTMLCanvasElement | ImageBitmap;
  texture: Texture;
  sprite: Sprite;
};

function rendererName(type: number): "webgl" | "canvas" {
  return type === RendererType.WEBGL ? "webgl" : "canvas";
}

/**
 * GPU-backed static world. Dynamic actors remain on the existing transparent
 * Canvas2D overlay until their renderers are migrated. If Pixi cannot start or
 * loses its WebGL context, callers immediately resume the complete Canvas path.
 */
export async function createPixiStaticWorldLayer(
  overlayCanvas: HTMLCanvasElement,
): Promise<StaticWorldLayer | null> {
  const canvas = document.createElement("canvas");
  canvas.id = "gameGpu";
  canvas.setAttribute("aria-hidden", "true");
  overlayCanvas.before(canvas);

  const app = new Application();
  try {
    await app.init({
      canvas,
      preference: [...pixiRendererPreference(window.location.search)],
      width: Math.max(1, innerWidth),
      height: Math.max(1, innerHeight),
      resolution: Math.min(devicePixelRatio || 1, 3),
      autoDensity: true,
      autoStart: false,
      sharedTicker: false,
      antialias: false,
      roundPixels: true,
      background: "#102819",
      backgroundAlpha: 1,
      eventMode: "none",
      powerPreference: "high-performance",
      hello: false,
    });
  } catch (error) {
    canvas.remove();
    console.warn("Wildwood Pixi renderer unavailable; using Canvas2D.", error);
    return null;
  }

  app.stop();
  const tileLayer = new Container({ isRenderGroup: true });
  tileLayer.eventMode = "none";
  app.stage.eventMode = "none";
  app.stage.addChild(tileLayer);
  const tiles = new Map<string, TileSprite>();
  let enabled = true;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDpr = 0;
  const renderer = rendererName(app.renderer.type);

  function destroyTile(tile: TileSprite) {
    tileLayer.removeChild(tile.sprite);
    tile.sprite.destroy();
    tile.texture.destroy(false);
  }

  function clearTiles() {
    for (const tile of tiles.values()) destroyTile(tile);
    tiles.clear();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    try { clearTiles(); } catch { tiles.clear(); }
    canvas.hidden = true;
    document.body.classList.remove("has-gpu-world");
    document.documentElement.dataset.worldRenderer = "canvas2d";
  }

  if (renderer === "webgl") {
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      disable();
    });
  }

  document.body.classList.add("has-gpu-world");
  document.documentElement.dataset.worldRenderer = `pixi-${renderer}`;
  console.info(`Wildwood world renderer: PixiJS ${renderer.toUpperCase()}`);

  function textureFor(source: HTMLCanvasElement | ImageBitmap) {
    const texture = Texture.from(source as TextureSourceLike, true);
    texture.source.scaleMode = "nearest";
    return texture;
  }

  function render(frame: StaticWorldLayerFrame) {
    if (!enabled) return false;
    try {
      canvas.hidden = false;
      if (frame.width !== lastWidth || frame.height !== lastHeight || frame.dpr !== lastDpr) {
        app.renderer.resize(frame.width, frame.height, frame.dpr);
        lastWidth = frame.width;
        lastHeight = frame.height;
        lastDpr = frame.dpr;
      }
      app.renderer.background.color = frame.backgroundColor;
      const visibleKeys = new Set<string>();
      for (const tile of frame.tiles) {
        visibleKeys.add(tile.key);
        let rendered = tiles.get(tile.key);
        if (!rendered || rendered.source !== tile.source) {
          if (rendered) destroyTile(rendered);
          const texture = textureFor(tile.source);
          const sprite = new Sprite(texture);
          sprite.eventMode = "none";
          tileLayer.addChild(sprite);
          rendered = { source: tile.source, texture, sprite };
          tiles.set(tile.key, rendered);
        }
        rendered.sprite.x = tile.left * frame.zoom + frame.offsetX;
        rendered.sprite.y = tile.top * frame.zoom + frame.offsetY;
        rendered.sprite.width = tile.width * frame.zoom;
        rendered.sprite.height = tile.height * frame.zoom;
      }
      for (const [key, tile] of tiles) {
        if (visibleKeys.has(key)) continue;
        destroyTile(tile);
        tiles.delete(key);
      }
      app.render();
      return true;
    } catch (error) {
      console.warn("Wildwood Pixi renderer failed; returning to Canvas2D.", error);
      disable();
      return false;
    }
  }

  return {
    active: () => enabled,
    hide: () => { canvas.hidden = true; },
    invalidate: clearTiles,
    render,
    renderer,
  };
}
