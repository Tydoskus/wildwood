import type { WorldDecor, WorldPath } from "../world";

export type StaticTileColors = {
  ground: string;
  path: string;
  pathDetail: string;
};

export type StaticTileTreeBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  groundCenter: number;
  groundWidth: number;
  canopyWidth: number;
};

export type StaticTileScene = {
  tileSize: number;
  colors: StaticTileColors;
  paths: WorldPath[];
  decor: WorldDecor[];
  treeBounds: StaticTileTreeBounds[];
  snowPineAspect: number;
};

type TileContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const TAU = Math.PI * 2;
const TREE_SHADOW_CANOPY_WIDTH_RATIO = .9;
const SNOW_PINE_GROUND_OFFSET_RATIO = .09;

function paintGroundAndPaths(context: TileContext, scene: StaticTileScene, tileX: number, tileY: number, details: boolean) {
  const originX = tileX * scene.tileSize;
  const originY = tileY * scene.tileSize;
  context.fillStyle = scene.colors.ground;
  context.fillRect(0, 0, scene.tileSize, scene.tileSize);
  for (const path of scene.paths) {
    context.fillStyle = scene.colors.path;
    context.fillRect(path.x - originX, path.y - originY, path.w, path.h);
    if (!details) continue;
    context.fillStyle = scene.colors.pathDetail;
    for (let y = path.y + 7; y < path.y + path.h; y += 18) {
      for (let x = path.x + ((y / 18) % 2 ? 4 : 12); x < path.x + path.w; x += 24) {
        context.fillRect(x - originX, y - originY, 2, 2);
      }
    }
  }
}

/** Cheap main-thread tile shown while a worker paints complete static art. */
export function paintStaticTilePlaceholder(context: TileContext, scene: StaticTileScene, tileX: number, tileY: number) {
  paintGroundAndPaths(context, scene, tileX, tileY, false);
}

/** Complete static tile painter shared by worker and compatibility fallback. */
export function paintStaticTile(
  context: TileContext,
  scene: StaticTileScene,
  tileX: number,
  tileY: number,
  shadowImage?: CanvasImageSource,
) {
  const originX = tileX * scene.tileSize;
  const originY = tileY * scene.tileSize;
  context.imageSmoothingEnabled = false;
  paintGroundAndPaths(context, scene, tileX, tileY, true);

  for (const decor of scene.decor) {
    const x = Math.round(decor.x - originX);
    const y = Math.round(decor.y - originY);
    if (x < -50 || y < -50 || x > scene.tileSize + 50 || y > scene.tileSize + 50) continue;
    if (decor.type === "grass") {
      context.fillStyle = decor.variant % 2 ? "#237b49" : "#267f4c";
      context.fillRect(x - 1, y - 5, 2, 7); context.fillRect(x - 5, y - 2, 2, 5); context.fillRect(x + 3, y - 3, 2, 6); if (decor.variant > 1) context.fillRect(x + 6, y, 2, 3);
    } else if (decor.type === "petal") {
      context.fillStyle = ["#d9f4df", "#f3f0c6", "#ccebea"][decor.variant % 3];
      context.fillRect(x - 3, y - 1, 7, 3); context.fillRect(x - 1, y - 3, 3, 7); context.fillStyle = "rgba(255,255,255,.72)"; context.fillRect(x, y, 1, 1);
    } else if (decor.type === "desertGrass") {
      context.fillStyle = decor.variant % 2 ? "#8b7b3d" : "#a28a43";
      context.fillRect(x - 1, y - 6, 2, 7); context.fillRect(x - 5, y - 3, 2, 5); context.fillRect(x + 3, y - 4, 2, 6);
    } else if (decor.type === "snowTuft") {
      context.fillStyle = decor.variant % 2 ? "rgba(255,255,255,.78)" : "rgba(221,242,255,.76)";
      context.fillRect(x - 2, y - 1, 5, 2); context.fillRect(x, y - 3, 2, 5);
    } else if (decor.type === "rock") {
      const width = Math.round(35 * decor.s);
      const height = Math.round(22 * decor.s);
      context.fillStyle = "rgba(0,0,0,.11)"; context.beginPath(); context.ellipse(x, y + 2, width * .6, Math.max(3, width * .23), 0, 0, TAU); context.fill();
      context.fillStyle = "#79543d"; context.beginPath(); context.moveTo(x - width / 2, y); context.lineTo(x - width * .32, y - height * .72); context.lineTo(x + width * .2, y - height); context.lineTo(x + width / 2, y - height * .28); context.lineTo(x + width * .38, y); context.closePath(); context.fill();
      context.fillStyle = "#b77b4b"; context.beginPath(); context.moveTo(x - width * .32, y - height * .72); context.lineTo(x + width * .2, y - height); context.lineTo(x + width * .12, y - height * .45); context.closePath(); context.fill();
    }
  }

  const drawStaticShadow = (x: number, y: number, width: number, alpha: number) => {
    const height = Math.max(8, Math.round(width * 33 / 86));
    if (x + width / 2 < 0 || x - width / 2 > scene.tileSize || y + height / 2 < 0 || y - height / 2 > scene.tileSize) return;
    context.save();
    context.globalAlpha = alpha;
    if (shadowImage) {
      context.drawImage(shadowImage, Math.round(x - width / 2), Math.round(y - height / 2), Math.round(width), height);
    } else {
      context.fillStyle = "#102719";
      context.beginPath();
      context.ellipse(x, y, width / 2, height / 2, 0, 0, TAU);
      context.fill();
    }
    context.restore();
  };

  // Tall decor remains live for depth sorting. Only its fixed ground shadow
  // belongs in the static tile.
  for (const decor of scene.decor) {
    const x = Math.round(decor.x - originX);
    const y = Math.round(decor.y - originY);
    if (decor.type === "tree") {
      const source = scene.treeBounds[decor.variant % 16];
      if (!source || source.h <= 0) continue;
      const drawSize = Math.round(154 * decor.s);
      const scale = drawSize / source.h;
      const shadowX = Math.round(x + (source.groundCenter - source.w / 2) * scale);
      const canopyWidth = source.canopyWidth * scale;
      drawStaticShadow(shadowX, y, Math.max(24, Math.round(canopyWidth * TREE_SHADOW_CANOPY_WIDTH_RATIO)), .14);
    } else if (decor.type === "cactus") {
      drawStaticShadow(x, y - 2, Math.round(46 * decor.s), .12);
    } else if (decor.type === "snowPine" && scene.snowPineAspect > 0) {
      const height = Math.round(185 * decor.s);
      const width = Math.round(height * scene.snowPineAspect);
      drawStaticShadow(x, y - Math.round(height * SNOW_PINE_GROUND_OFFSET_RATIO), Math.round(width * .75), .13);
    }
  }
}
