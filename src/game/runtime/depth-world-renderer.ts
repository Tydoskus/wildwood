import type { RemotePlayer } from "../../wildwood-coop";
import {
  BEGINNER_DESERT_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  type MapId,
  type WorldDecor,
} from "../world";
import type { Camera } from "./camera";
import type { DragonBossState, EnemyState, PlayerState, SpiderBossState } from "./types";

type Viewport = { width: number; height: number };
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type Portal = { depth: number };
type BootsPickup = { y: number; r: number; collected: boolean };
type DepthLayerKind = "tree" | "cactus" | "enemy" | "dragon" | "spider" | "boots" | "portal" | "secondaryPortal" | "remotePlayer" | "player";
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
  bootsPickup: BootsPickup;
  currentMapId: () => MapId;
  activePortal: () => Portal;
  secondaryPortal: () => Portal | null | undefined;
  drawTree: (tree: TreeDecor) => void;
  drawCactus: (cactus: CactusDecor) => void;
  drawEnemy: (enemy: EnemyState) => void;
  drawBoss: () => void;
  drawSpiderBoss: () => void;
  drawBootPickup: () => void;
  drawPortal: () => void;
  drawSecondaryPortal: () => void;
  drawRemotePlayer: (player: RemotePlayer) => void;
  drawPlayer: () => void;
}) {
  const depthLayers: DepthLayer[] = [];

  function drawDepthSortedWorld(remotePlayers: RemotePlayer[], includePortal = true) {
    let layerCount = 0;
    const queueLayer = (depth: number, priority: number, kind: DepthLayerKind, entity?: WorldDecor | EnemyState | RemotePlayer) => {
      const layer = depthLayers[layerCount] ?? (depthLayers[layerCount] = { depth: 0, priority: 0, kind });
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
    const treeCullPadding = 240;
    for (const tree of options.decor) {
      if (tree.type === "cactus") {
        queueLayer(tree.y, 2, "cactus", tree);
        continue;
      }
      if (tree.type !== "tree") continue;
      const treeSize = Math.round(154 * tree.s);
      const treeHalfWidth = treeSize / 2;
      if (
        tree.x + treeHalfWidth < camera.x - treeCullPadding ||
        tree.x - treeHalfWidth > camera.x + visibleW + treeCullPadding ||
        tree.y < camera.y - treeCullPadding ||
        tree.y - treeSize > camera.y + visibleH + treeCullPadding
      ) continue;
      queueLayer(tree.y, 2, "tree", tree);
    }
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
    if (currentMapId === TUTORIAL_FOREST_MAP_ID && !options.bootsPickup.collected) {
      queueLayer(options.bootsPickup.y + options.bootsPickup.r, 1, "boots");
    }
    if (includePortal) queueLayer(options.activePortal().depth, 2, "portal");
    const secondary = options.secondaryPortal();
    if (secondary) queueLayer(secondary.depth, 2, "secondaryPortal");
    for (const remotePlayer of remotePlayers) {
      queueLayer(remotePlayer.y + 29, 1, "remotePlayer", remotePlayer);
    }
    queueLayer(options.player.y + 29, 1, "player");
    depthLayers.length = layerCount;
    depthLayers.sort((a, b) => a.depth - b.depth || a.priority - b.priority);
    for (const layer of depthLayers) {
      switch (layer.kind) {
        case "tree": options.drawTree(layer.entity as TreeDecor); break;
        case "cactus": options.drawCactus(layer.entity as CactusDecor); break;
        case "enemy": options.drawEnemy(layer.entity as EnemyState); break;
        case "dragon": options.drawBoss(); break;
        case "spider": options.drawSpiderBoss(); break;
        case "boots": options.drawBootPickup(); break;
        case "portal": options.drawPortal(); break;
        case "secondaryPortal": options.drawSecondaryPortal(); break;
        case "remotePlayer": options.drawRemotePlayer(layer.entity as RemotePlayer); break;
        case "player": options.drawPlayer(); break;
      }
    }
  }

  return { drawDepthSortedWorld };
}
