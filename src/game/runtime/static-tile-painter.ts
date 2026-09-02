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
  treeShadowsVisible: boolean;
  snowPineAspect: number;
  lavaPoolUrls?: readonly string[];
};

type TileContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type StaticTileImage = { source: CanvasImageSource; width: number; height: number };

const TAU = Math.PI * 2;
const TREE_SHADOW_CANOPY_WIDTH_RATIO = .9;
const SNOW_PINE_GROUND_OFFSET_RATIO = .09;

function paintGroundAndPaths(context: TileContext, scene: StaticTileScene, tileX: number, tileY: number) {
  const originX = tileX * scene.tileSize;
  const originY = tileY * scene.tileSize;
  context.fillStyle = scene.colors.ground;
  context.fillRect(0, 0, scene.tileSize, scene.tileSize);
  for (const path of scene.paths) {
    context.fillStyle = scene.colors.path;
    context.fillRect(path.x - originX, path.y - originY, path.w, path.h);
    context.fillStyle = scene.colors.pathDetail;
    for (let y = path.y + 7; y < path.y + path.h; y += 18) {
      for (let x = path.x + ((y / 18) % 2 ? 4 : 12); x < path.x + path.w; x += 24) {
        context.fillRect(x - originX, y - originY, 2, 2);
      }
    }
  }
}

/** Complete static tile painter shared by worker and compatibility fallback. */
export function paintStaticTile(
  context: TileContext,
  scene: StaticTileScene,
  tileX: number,
  tileY: number,
  shadowImage?: CanvasImageSource,
  lavaPoolImages: readonly StaticTileImage[] = [],
) {
  const originX = tileX * scene.tileSize;
  const originY = tileY * scene.tileSize;
  context.imageSmoothingEnabled = false;
  paintGroundAndPaths(context, scene, tileX, tileY);

  for (const decor of scene.decor) {
    const x = Math.round(decor.x - originX);
    const y = Math.round(decor.y - originY);
    if (decor.type === "lavaPool") {
      const image = lavaPoolImages[decor.variant % lavaPoolImages.length];
      if (!image) continue;
      const width = Math.round(300 * decor.s);
      const height = Math.round(width * image.height / image.width);
      if (x + width / 2 < 0 || x - width / 2 > scene.tileSize || y + height / 2 < 0 || y - height / 2 > scene.tileSize) continue;
      context.save();
      context.globalAlpha = .94;
      context.drawImage(image.source, x - width / 2, y - height / 2, width, height);
      context.restore();
      continue;
    }
    if (x < -50 || y < -50 || x > scene.tileSize + 50 || y > scene.tileSize + 50) continue;
    if (decor.type === "grass") {
      context.fillStyle = decor.variant % 2 ? "#237b49" : "#267f4c";
      context.fillRect(x - 1, y - 5, 2, 7); context.fillRect(x - 5, y - 2, 2, 5); context.fillRect(x + 3, y - 3, 2, 6); if (decor.variant > 1) context.fillRect(x + 6, y, 2, 3);
    } else if (decor.type === "petal") {
      context.fillStyle = ["#d9f4df", "#f3f0c6", "#ccebea"][decor.variant % 3];
      context.fillRect(x - 3, y - 1, 7, 3); context.fillRect(x - 1, y - 3, 3, 7); context.fillStyle = "rgba(255,255,255,.72)"; context.fillRect(x, y, 1, 1);
    } else if (decor.type === "cherryPetal") {
      context.fillStyle = ["#ffd0e5", "#ff9fc9", "#f477ad", "#fff0f7"][decor.variant % 4];
      context.fillRect(x - 3, y - 1, 6, 3);
      context.fillRect(x - 1, y - 2, 2, 5);
      context.fillStyle = "rgba(255,255,255,.68)";
      context.fillRect(x, y - 1, 1, 1);
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
    } else if (decor.type === "coral") {
      const scale = Math.max(.65, decor.s);
      const branch = Math.round(5 * scale);
      const height = Math.round(24 * scale);
      context.fillStyle = "rgba(11,70,78,.2)";
      context.beginPath(); context.ellipse(x, y + 2, Math.round(18 * scale), Math.round(6 * scale), 0, 0, TAU); context.fill();
      context.fillStyle = ["#ff7f87", "#f2a15f", "#b47be8"][decor.variant % 3];
      context.fillRect(x - Math.ceil(branch / 2), y - height, branch, height);
      context.fillRect(x - Math.round(12 * scale), y - Math.round(18 * scale), branch, Math.round(16 * scale));
      context.fillRect(x + Math.round(8 * scale), y - Math.round(15 * scale), branch, Math.round(13 * scale));
      context.fillRect(x - Math.round(12 * scale), y - Math.round(18 * scale), Math.round(10 * scale), branch);
      context.fillRect(x + Math.round(2 * scale), y - Math.round(15 * scale), Math.round(11 * scale), branch);
      context.fillStyle = "rgba(255,235,218,.62)";
      context.fillRect(x - 1, y - height, 2, 3);
    } else if (decor.type === "shell") {
      const radius = Math.round(8 * Math.max(.7, decor.s));
      context.fillStyle = "rgba(10,62,71,.18)";
      context.beginPath(); context.ellipse(x, y + 2, radius + 3, Math.max(2, Math.round(radius * .42)), 0, 0, TAU); context.fill();
      context.fillStyle = decor.variant % 2 ? "#f6d9b8" : "#f0bed0";
      context.beginPath(); context.arc(x, y, radius, Math.PI, TAU); context.lineTo(x + radius, y + 2); context.lineTo(x - radius, y + 2); context.closePath(); context.fill();
      context.strokeStyle = "rgba(126,76,83,.42)"; context.lineWidth = 1;
      for (let offset = -radius + 3; offset < radius; offset += 4) {
        context.beginPath(); context.moveTo(x, y - radius + 2); context.lineTo(x + offset, y + 1); context.stroke();
      }
    } else if (decor.type === "cloud") {
      const scale = Math.max(.55, decor.s);
      const width = Math.round(48 * scale);
      const height = Math.round(18 * scale);
      context.fillStyle = "rgba(20,48,91,.16)";
      context.beginPath(); context.ellipse(x, y + Math.round(height * .36), width * .62, height * .44, 0, 0, TAU); context.fill();
      context.fillStyle = decor.variant % 2 ? "rgba(235,248,255,.86)" : "rgba(214,239,255,.82)";
      context.beginPath();
      context.ellipse(x, y, width * .52, height * .52, 0, 0, TAU);
      context.ellipse(x - width * .28, y + 2, width * .34, height * .42, 0, 0, TAU);
      context.ellipse(x + width * .3, y + 3, width * .38, height * .46, 0, 0, TAU);
      context.fill();
      context.fillStyle = "rgba(255,255,255,.52)";
      context.beginPath(); context.ellipse(x - width * .08, y - height * .18, width * .27, height * .22, 0, 0, TAU); context.fill();
    } else if (decor.type === "skyShard") {
      const scale = Math.max(.6, decor.s);
      const width = Math.round(16 * scale);
      const height = Math.round(34 * scale);
      context.fillStyle = "rgba(22,42,83,.2)";
      context.beginPath(); context.ellipse(x, y + 3, width, Math.max(3, width * .36), 0, 0, TAU); context.fill();
      context.fillStyle = ["#8de5ff", "#f3d778", "#c9b8ff"][decor.variant % 3];
      context.beginPath();
      context.moveTo(x, y - height);
      context.lineTo(x + width * .58, y - height * .38);
      context.lineTo(x + width * .34, y);
      context.lineTo(x - width * .42, y);
      context.lineTo(x - width * .62, y - height * .42);
      context.closePath();
      context.fill();
      context.fillStyle = "rgba(255,255,255,.55)";
      context.beginPath(); context.moveTo(x, y - height); context.lineTo(x, y - height * .18); context.lineTo(x - width * .42, y); context.closePath(); context.fill();
    } else if (decor.type === "glowMushroom") {
      const scale = Math.max(.6, decor.s);
      const stemHeight = Math.round(18 * scale);
      const capWidth = Math.round(28 * scale);
      const capHeight = Math.round(12 * scale);
      context.fillStyle = "rgba(49,238,195,.14)";
      context.beginPath(); context.arc(x, y - stemHeight, capWidth * .9, 0, TAU); context.fill();
      context.fillStyle = "#b9e7d4";
      context.fillRect(x - Math.max(2, Math.round(3 * scale)), y - stemHeight, Math.max(4, Math.round(6 * scale)), stemHeight);
      context.fillStyle = ["#7b54c7", "#9b68e3", "#5f46ad", "#b174df"][decor.variant % 4];
      context.beginPath(); context.ellipse(x, y - stemHeight, capWidth / 2, capHeight / 2, 0, Math.PI, TAU); context.closePath(); context.fill();
      context.fillStyle = "rgba(210,255,241,.88)";
      context.fillRect(x - Math.round(capWidth * .22), y - stemHeight - Math.round(capHeight * .28), Math.max(2, Math.round(4 * scale)), Math.max(2, Math.round(3 * scale)));
    } else if (decor.type === "lilyPad") {
      const scale = Math.max(.6, decor.s);
      const radiusX = Math.round(17 * scale);
      const radiusY = Math.round(9 * scale);
      context.fillStyle = "rgba(3,35,35,.24)";
      context.beginPath(); context.ellipse(x, y + 2, radiusX + 3, radiusY + 2, 0, 0, TAU); context.fill();
      context.fillStyle = decor.variant % 2 ? "#45a66f" : "#3a8e68";
      context.beginPath(); context.ellipse(x, y, radiusX, radiusY, 0, .18, TAU - .18); context.lineTo(x, y); context.closePath(); context.fill();
      context.strokeStyle = "rgba(163,244,195,.48)";
      context.lineWidth = 1;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - radiusX * .72, y + radiusY * .25); context.stroke();
      if (decor.variant === 2) {
        context.fillStyle = "#f19ad5";
        context.beginPath(); context.arc(x + radiusX * .25, y - radiusY * .35, Math.max(2, Math.round(3 * scale)), 0, TAU); context.fill();
      }
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
    if (decor.type === "tree" && scene.treeShadowsVisible) {
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
