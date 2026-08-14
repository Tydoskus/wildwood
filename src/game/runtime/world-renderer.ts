import { TAU, WORLD } from "../constants";
import { ENEMY_TYPES } from "../enemies";
import type { RemotePlayer } from "../../wildwood-coop";
import type { Camera } from "./camera";
import type { EnemyState, PlayerState } from "./types";
import type { MapId, WorldDecor, WorldPath } from "../world";

type Viewport = { width: number; height: number };
type Portal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type EmptyArch = Omit<Portal, "destination">;
type TreeSpriteBounds = { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type RoundRect = (x: number, y: number, width: number, height: number, radius: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type RockDecor = Extract<WorldDecor, { type: "rock" }>;
type DuneDecor = Extract<WorldDecor, { type: "dune" }>;
type DesertGrassDecor = Extract<WorldDecor, { type: "desertGrass" }>;
type GrassDecor = Extract<WorldDecor, { type: "grass" }>;
type PetalDecor = Extract<WorldDecor, { type: "petal" }>;

export type WorldRendererOptions = {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  getViewport: () => Viewport;
  getMapId: () => MapId;
  getGameTime: () => number;
  isArenaScene: () => boolean;
  mapName: (mapId: MapId) => string;
  activePortal: () => Portal;
  portalIsUnlocked: () => boolean;
  portalRevealIntensity: () => number;
  portalDestinationOpacity: () => number;
  emptyDesertArch: EmptyArch;
  tutorialMapId: MapId;
  desertMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  player: PlayerState;
  duelSpaceBackground: HTMLImageElement;
  treeSpritesheet: HTMLImageElement;
  treeSpriteBounds: () => TreeSpriteBounds[];
  portalArch: HTMLImageElement;
  portalSwirl: HTMLImageElement;
  drawShadow: DrawShadow;
  outlinedText: OutlinedText;
  roundRect: RoundRect;
};

export function createWorldRenderer(options: WorldRendererOptions) {
  const { ctx, camera } = options;
  const viewport = () => options.getViewport();
  const visibleSize = () => ({ width: viewport().width / camera.zoom, height: viewport().height / camera.zoom });

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
    const desert = options.getMapId() === options.desertMapId;
    ctx.fillStyle = desert ? "#d9a95f" : "#31945b";
    ctx.fillRect(0, 0, visible.width, visible.height);
    for (const path of options.paths) {
      const x = Math.floor(path.x - camera.x);
      const y = Math.floor(path.y - camera.y);
      ctx.fillStyle = desert ? "#c48b4b" : "#8b6551";
      ctx.fillRect(x, y, path.w, path.h);
      ctx.fillStyle = desert ? "rgba(111,65,32,.15)" : "rgba(68,38,29,.12)";
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
    const scale = drawSize / source.h;
    const shadowX = Math.round(x + (source.groundCenter - source.w / 2) * scale);
    const shadowWidth = Math.max(12, Math.round(source.groundWidth * scale * 1.8));
    options.drawShadow(shadowX, y, shadowWidth, .12);
    ctx.drawImage(options.treeSpritesheet, source.x, source.y, source.w, source.h, Math.round(x - drawWidth / 2), Math.round(y - drawSize), drawWidth, drawSize);
  }

  function drawPortal() {
    if (!options.portalArch.complete || options.portalArch.naturalWidth <= 0) return;
    const portal = options.activePortal();
    const x = Math.round(portal.x - camera.x);
    const y = Math.round(portal.y - camera.y);
    options.drawShadow(x, y - 4, Math.round(portal.width * .68), .14);
    const cutsceneIntensity = options.portalRevealIntensity();
    const cutsceneActive = cutsceneIntensity >= 0;
    const portalIntensity = cutsceneActive ? cutsceneIntensity : options.portalIsUnlocked() ? 1 : 0;
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
    const destinationOpacity = cutsceneActive ? options.portalDestinationOpacity() : options.portalIsUnlocked() ? 1 : 0;
    if (destinationOpacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = destinationOpacity;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    options.outlinedText(options.mapName(portal.destination), x, Math.round(y - portal.height - 8 + Math.sin(options.getGameTime() * 2.4) * 3), "#f5e9c4", 4);
    ctx.restore();
  }

  function drawEmptyDesertArch() {
    if (options.getMapId() !== options.desertMapId || !options.portalArch.complete || options.portalArch.naturalWidth <= 0) return;
    const arch = options.emptyDesertArch;
    const x = Math.round(arch.x - camera.x);
    const y = Math.round(arch.y - camera.y);
    options.drawShadow(x, y - 4, Math.round(arch.width * .68), .14);
    ctx.drawImage(options.portalArch, Math.round(x - arch.width / 2), Math.round(y - arch.height), arch.width, arch.height);
  }

  function drawCactus(cactus: CactusDecor) {
    const visible = visibleSize();
    const x = Math.round(cactus.x - camera.x);
    const y = Math.round(cactus.y - camera.y);
    if (x < -90 || y < -100 || x > visible.width + 90 || y > visible.height + 50) return;
    const h = Math.round(68 * cactus.s);
    const w = Math.max(10, Math.round(15 * cactus.s));
    options.drawShadow(x, y - 2, Math.round(46 * cactus.s), .12);
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

  function drawDune(dune: DuneDecor) {
    const visible = visibleSize(); const x = Math.round(dune.x - camera.x); const y = Math.round(dune.y - camera.y);
    if (x + dune.w / 2 < -40 || x - dune.w / 2 > visible.width + 40 || y < -80 || y - dune.h > visible.height + 40) return;
    ctx.save(); ctx.fillStyle = dune.variant % 2 ? "#c58b48" : "#c9934e"; ctx.beginPath(); ctx.ellipse(x, y, dune.w / 2, dune.h / 2, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = dune.variant % 2 ? "#e3b66b" : "#e9bd72"; ctx.beginPath(); ctx.ellipse(x - dune.w * .08, y - dune.h * .08, dune.w * .39, dune.h * .25, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(119,71,36,.22)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, dune.w * .38, dune.h * .32, 0, Math.PI * 1.08, Math.PI * 1.88); ctx.stroke(); ctx.restore();
  }

  function drawDesertGrass(grass: DesertGrassDecor) {
    const visible = visibleSize(); const x = Math.round(grass.x - camera.x); const y = Math.round(grass.y - camera.y);
    if (x < -10 || y < -10 || x > visible.width + 10 || y > visible.height + 10) return;
    ctx.fillStyle = grass.variant % 2 ? "#8b7b3d" : "#a28a43"; ctx.fillRect(x - 1, y - 6, 2, 7); ctx.fillRect(x - 5, y - 3, 2, 5); ctx.fillRect(x + 3, y - 4, 2, 6);
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
    for (const decor of options.decor) if (decor.type === "dune") drawDune(decor);
    for (const decor of options.decor) if (decor.type === "grass") drawGrass(decor);
    for (const decor of options.decor) if (decor.type === "petal") drawPetal(decor);
    for (const decor of options.decor) if (decor.type === "desertGrass") drawDesertGrass(decor);
    for (const decor of options.decor) if (decor.type === "rock") drawRock(decor);
  }

  function drawMinimap(remotePlayers: RemotePlayer[]) {
    const view = viewport(); const size = Math.min(126, Math.max(118, view.width * .17)); const x = view.width - size; const y = 0;
    ctx.save(); ctx.fillStyle = "rgba(12,18,15,.82)"; ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; options.roundRect(x, y, size, size, 10); ctx.fill(); ctx.stroke();
    const sx = size / WORLD.w; const sy = size / WORLD.h;
    ctx.save(); options.roundRect(x + 5, y + 5, size - 10, size - 10, 7); ctx.clip();
    const desert = options.getMapId() === options.desertMapId;
    ctx.fillStyle = desert ? "#d9a95f" : "#31945b"; ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
    ctx.fillStyle = desert ? "#c48b4b" : "#8b6551"; for (const path of options.paths) ctx.fillRect(x + path.x * sx, y + path.y * sy, path.w * sx, path.h * sy);
    ctx.fillStyle = "#ff5d5d"; for (const enemy of options.enemies) { const marker = ENEMY_TYPES[enemy.type].elite ? 5 : 3; ctx.fillRect(x + enemy.x * sx - 1, y + enemy.y * sy - 1, marker, marker); }
    ctx.fillStyle = "#58e878"; for (const player of remotePlayers) ctx.fillRect(x + player.x * sx - 2, y + player.y * sy - 2, 5, 5);
    ctx.fillStyle = "#fff"; ctx.fillRect(x + options.player.x * sx - 2, y + options.player.y * sy - 2, 5, 5);
    ctx.strokeStyle = "rgba(255,255,255,.52)"; ctx.lineWidth = 1; ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, (view.width / camera.zoom) * sx, (view.height / camera.zoom) * sy); ctx.restore(); ctx.restore();
  }

  return { drawGround, drawTree, drawCactus, drawPortal, drawEmptyDesertArch, drawDecor, drawMinimap };
}
