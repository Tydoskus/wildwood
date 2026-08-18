import type { RemotePlayer } from "../../wildwood-coop";
import {
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
  type WorldDecor,
} from "../world";
import { FROSTCLAW_SPRITE_GROUND_OFFSET, FROSTCLAW_SPRITE_Y_OFFSET } from "../constants";
import type { Camera } from "./camera";
import type { DragonBossState, EnemyState, FrostclawBossState, PlayerState, SpiderBossState } from "./types";

type Viewport = { width: number; height: number };
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type SnowPineDecor = Extract<WorldDecor, { type: "snowPine" }>;
type LavaRockDecor = Extract<WorldDecor, { type: "lavaRock" }>;
type CharredTreeDecor = Extract<WorldDecor, { type: "charredTree" }>;
type TallDecor = TreeDecor | CactusDecor | SnowPineDecor | LavaRockDecor | CharredTreeDecor;
type Portal = { depth: number };
type BootsPickup = { y: number; r: number; collected: boolean };
type DepthLayerKind = "enemy" | "dragon" | "spider" | "frostclaw" | "boots" | "portal" | "secondaryPortal" | "remotePlayer" | "player";
type DepthLayer = { depth: number; priority: number; kind: DepthLayerKind; entity?: WorldDecor | EnemyState | RemotePlayer };

/**
 * Builds and draws the world depth queue. Keep render ordering and viewport
 * culling here so main.ts only coordinates frame-level systems.
 */
export function createDepthWorldRenderer(options: {
  camera: Camera;
  viewport: () => Viewport;
  decor: WorldDecor[];
  enemies: EnemyState[];
  player: PlayerState;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  bootsPickup: BootsPickup;
  currentMapId: () => MapId;
  activePortal: () => Portal;
  secondaryPortal: () => Portal | null | undefined;
  drawTree: (tree: TreeDecor) => void;
  drawCactus: (cactus: CactusDecor) => void;
  drawSnowPine: (tree: SnowPineDecor) => void;
  drawLavaRock: (rock: LavaRockDecor) => void;
  drawCharredTree: (tree: CharredTreeDecor) => void;
  drawEnemy: (enemy: EnemyState) => void;
  drawBoss: () => void;
  drawSpiderBoss: () => void;
  drawFrostclawBoss: () => void;
  drawBootPickup: () => void;
  drawPortal: () => void;
  drawSecondaryPortal: () => void;
  drawRemotePlayer: (player: RemotePlayer) => void;
  drawPlayer: () => void;
}) {
  const dynamicLayers: DepthLayer[] = [];
  const visibleStaticDecor: TallDecor[] = [];
  let staticDepthDecor: TallDecor[] = [];
  let staticDepthDirty = true;

  function invalidateDepthOrder() {
    staticDepthDirty = true;
  }

  function sortedStaticDecor() {
    if (!staticDepthDirty) return staticDepthDecor;
    staticDepthDecor = options.decor
      .filter((decor): decor is TallDecor => decor.type === "tree" || decor.type === "cactus" || decor.type === "snowPine" || decor.type === "lavaRock" || decor.type === "charredTree")
      .sort((a, b) => a.y - b.y);
    staticDepthDirty = false;
    return staticDepthDecor;
  }

  function lowerDepthBound(decor: TallDecor[], depth: number) {
    let low = 0;
    let high = decor.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (decor[middle].y < depth) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function collectVisibleStaticDecor(visibleW: number, visibleH: number) {
    visibleStaticDecor.length = 0;
    const camera = options.camera;
    const decor = sortedStaticDecor();
    const cullPadding = 240;
    const endY = camera.y + visibleH;
    // Tall sprites extend upward from their depth point. Limit the sorted scan
    // by Y first, then apply exact type-specific bounds.
    const start = lowerDepthBound(decor, camera.y - cullPadding);
    for (let index = start; index < decor.length; index += 1) {
      const item = decor[index];
      if (item.y > endY + cullPadding + 300) break;
      if (item.type === "cactus") {
        if (
          item.x < camera.x - 90 ||
          item.x > camera.x + visibleW + 90 ||
          item.y < camera.y - 100 ||
          item.y > endY + 50
        ) continue;
      } else if (item.type === "snowPine") {
        const height = Math.round(185 * item.s);
        const width = height * .8;
        if (
          item.x + width / 2 < camera.x - cullPadding ||
          item.x - width / 2 > camera.x + visibleW + cullPadding ||
          item.y < camera.y - cullPadding ||
          item.y - height > endY + cullPadding
        ) continue;
      } else if (item.type === "tree") {
        const size = Math.round(154 * item.s);
        if (
          item.x + size / 2 < camera.x - cullPadding ||
          item.x - size / 2 > camera.x + visibleW + cullPadding ||
          item.y < camera.y - cullPadding ||
          item.y - size > endY + cullPadding
        ) continue;
      } else {
        const height = Math.round((item.type === "lavaRock" ? 85 : 150) * item.s);
        const width = Math.round((item.type === "lavaRock" ? 150 : 90) * item.s);
        if (
          item.x + width / 2 < camera.x - cullPadding ||
          item.x - width / 2 > camera.x + visibleW + cullPadding ||
          item.y < camera.y - cullPadding ||
          item.y - height > endY + cullPadding
        ) continue;
      }
      visibleStaticDecor.push(item);
    }
  }

  function drawStaticDecor(item: TallDecor) {
    if (item.type === "tree") options.drawTree(item);
    else if (item.type === "cactus") options.drawCactus(item);
    else if (item.type === "snowPine") options.drawSnowPine(item);
    else if (item.type === "lavaRock") options.drawLavaRock(item);
    else options.drawCharredTree(item);
  }

  function drawDynamicLayer(layer: DepthLayer) {
    switch (layer.kind) {
      case "enemy": options.drawEnemy(layer.entity as EnemyState); break;
      case "dragon": options.drawBoss(); break;
      case "spider": options.drawSpiderBoss(); break;
      case "frostclaw": options.drawFrostclawBoss(); break;
      case "boots": options.drawBootPickup(); break;
      case "portal": options.drawPortal(); break;
      case "secondaryPortal": options.drawSecondaryPortal(); break;
      case "remotePlayer": options.drawRemotePlayer(layer.entity as RemotePlayer); break;
      case "player": options.drawPlayer(); break;
    }
  }

  function drawDepthSortedWorld(remotePlayers: RemotePlayer[], includePortal = true) {
    let layerCount = 0;
    const queueLayer = (depth: number, priority: number, kind: DepthLayerKind, entity?: WorldDecor | EnemyState | RemotePlayer) => {
      const layer = dynamicLayers[layerCount] ?? (dynamicLayers[layerCount] = { depth: 0, priority: 0, kind });
      layer.depth = depth;
      layer.priority = priority;
      layer.kind = kind;
      layer.entity = entity;
      layerCount += 1;
    };
    const camera = options.camera;
    const viewport = options.viewport();
    const visibleW = viewport.width / camera.zoom;
    const visibleH = viewport.height / camera.zoom;
    collectVisibleStaticDecor(visibleW, visibleH);
    const enemyCullPadding = 140;
    for (const enemy of options.enemies) {
      if (enemy.dead) continue;
      if (
        enemy.x + enemy.r < camera.x - enemyCullPadding ||
        enemy.x - enemy.r > camera.x + visibleW + enemyCullPadding ||
        enemy.y + enemy.r < camera.y - enemyCullPadding ||
        enemy.y - enemyCullPadding > camera.y + visibleH + enemyCullPadding
      ) continue;
      queueLayer(enemy.y + enemy.r, 1, "enemy", enemy);
    }
    const currentMapId = options.currentMapId();
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !options.boss.dead) {
      queueLayer(options.boss.y + 93, 1, "dragon");
    }
    if (currentMapId === BEGINNER_DESERT_MAP_ID && !options.spiderBoss.dead) {
      queueLayer(options.spiderBoss.y + 55, 1, "spider");
    }
    if (currentMapId === INTERMEDIATE_SNOWLANDS_MAP_ID && !options.frostclawBoss.dead) {
      queueLayer(options.frostclawBoss.y + FROSTCLAW_SPRITE_Y_OFFSET + FROSTCLAW_SPRITE_GROUND_OFFSET, 1, "frostclaw");
    }
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !options.bootsPickup.collected) {
      queueLayer(options.bootsPickup.y + options.bootsPickup.r, 1, "boots");
    }
    if (includePortal) queueLayer(options.activePortal().depth, 2, "portal");
    const secondary = options.secondaryPortal();
    if (secondary) queueLayer(secondary.depth, 2, "secondaryPortal");
    for (const remotePlayer of remotePlayers) {
      if (
        remotePlayer.x < camera.x - 65 ||
        remotePlayer.x > camera.x + visibleW + 65 ||
        remotePlayer.y < camera.y - 70 ||
        remotePlayer.y > camera.y + visibleH + 70
      ) continue;
      queueLayer(remotePlayer.y + 29, 1, "remotePlayer", remotePlayer);
    }
    queueLayer(options.player.y + 29, 1, "player");
    dynamicLayers.length = layerCount;
    dynamicLayers.sort((a, b) => a.depth - b.depth || a.priority - b.priority);

    let staticIndex = 0;
    let dynamicIndex = 0;
    while (staticIndex < visibleStaticDecor.length || dynamicIndex < dynamicLayers.length) {
      const staticItem = visibleStaticDecor[staticIndex];
      const dynamicItem = dynamicLayers[dynamicIndex];
      // Dynamic priority 1 actors draw before equal-depth priority 2 decor.
      // Equal priority keeps static decor first, matching the prior stable sort.
      if (
        dynamicItem &&
        (!staticItem || dynamicItem.depth < staticItem.y || (dynamicItem.depth === staticItem.y && dynamicItem.priority < 2))
      ) {
        drawDynamicLayer(dynamicItem);
        dynamicIndex += 1;
      } else if (staticItem) {
        drawStaticDecor(staticItem);
        staticIndex += 1;
      }
    }
  }

  return { drawDepthSortedWorld, invalidateDepthOrder };
}
