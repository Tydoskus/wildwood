import type { RemotePlayer } from "../../wildstat-coop";
import { type MapId, type WorldDecor } from "../world";
import type { Camera } from "./camera";
import type { EnemyState, PlayerState } from "./types";
import { bossForMap, type BossKind, type BossStates } from "./boss-registry";
import { soulPropExtent, type SoulPropDecor } from "./soul-prop-renderer";

type Viewport = { width: number; height: number };
type TreeDecor = Extract<WorldDecor, { type: "tree" }>;
type CactusDecor = Extract<WorldDecor, { type: "cactus" }>;
type SnowPineDecor = Extract<WorldDecor, { type: "snowPine" }>;
type UpgradeBenchDecor = Extract<WorldDecor, { type: "upgradeBench" }>;
type CharredTreeDecor = Extract<WorldDecor, { type: "charredTree" }>;
type TallDecor = TreeDecor | CactusDecor | SnowPineDecor | UpgradeBenchDecor | CharredTreeDecor | SoulPropDecor;
type Portal = { depth: number };
type BootsPickup = { y: number; r: number; collected: boolean };
type DepthLayerKind = "enemy" | "boss" | "boots" | "portal" | "secondaryPortal" | "remotePlayer" | "player";
type DepthLayer = { depth: number; priority: number; kind: DepthLayerKind; entity?: WorldDecor | EnemyState | RemotePlayer; opacity: number };

/**
 * Builds and draws the world depth queue. Keep render ordering and viewport
 * culling here so main.ts only coordinates frame-level systems.
 */
export function createDepthWorldRenderer(options: {
  camera: Camera;
  viewport: () => Viewport;
  decor: WorldDecor[];
  enemies: EnemyState[];
  remoteEnemies?: () => readonly EnemyState[];
  player: PlayerState;
  /** Every world boss; only the current map's is queued. */
  bosses: BossStates;
  bootsPickup: BootsPickup;
  currentMapId: () => MapId;
  activePortal: () => Portal | null;
  secondaryPortal: () => Portal | null | undefined;
  drawTree: (tree: TreeDecor) => void;
  drawCactus: (cactus: CactusDecor) => void;
  drawSnowPine: (tree: SnowPineDecor) => void;
  drawUpgradeBench: (bench: UpgradeBenchDecor) => void;
  drawCharredTree: (tree: CharredTreeDecor) => void;
  drawSoulProp?: (prop: SoulPropDecor) => void;
  drawEnemy: (enemy: EnemyState, opacity?: number) => void;
  enemyOpacity?: (enemy: EnemyState) => number;
  drawBoss: (kind: BossKind) => void;
  /** Developer overlay, drawn over the finished world. */
  drawBossHitboxes?: () => void;
  /** Drawn over the finished world, under the developer overlay: the Soul Dimension village's smoke and sparks. */
  drawOverWorld?: () => void;
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
  // The current map's boss, when it was queued this frame.
  let queuedBoss: BossKind | null = null;

  function invalidateDepthOrder() {
    staticDepthDirty = true;
  }

  function sortedStaticDecor() {
    if (!staticDepthDirty) return staticDepthDecor;
    staticDepthDecor = options.decor
      .filter((decor): decor is TallDecor => decor.type === "tree" || decor.type === "cactus" || decor.type === "snowPine" || decor.type === "upgradeBench" || decor.type === "charredTree" || decor.type === "soulProp")
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
      if (item.type === "soulProp") {
        const extent = soulPropExtent(item);
        if (item.x + extent.right < camera.x - 40 || item.x - extent.left > camera.x + visibleW + 40
          || item.y + extent.down < camera.y - 40 || item.y - extent.up > endY + 40) continue;
      } else if (item.type === "cactus") {
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
      } else if (item.type === "upgradeBench") {
        const width = Math.round(210 * item.s);
        const height = Math.round(210 * item.s);
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
        const height = Math.round(150 * item.s);
        const width = Math.round(90 * item.s);
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
    else if (item.type === "upgradeBench") options.drawUpgradeBench(item);
    else if (item.type === "soulProp") options.drawSoulProp?.(item);
    else options.drawCharredTree(item);
  }

  function drawDynamicLayer(layer: DepthLayer) {
    switch (layer.kind) {
      case "enemy": options.drawEnemy(layer.entity as EnemyState, layer.opacity); break;
      case "boss": if (queuedBoss) options.drawBoss(queuedBoss); break;
      case "boots": options.drawBootPickup(); break;
      case "portal": options.drawPortal(); break;
      case "secondaryPortal": options.drawSecondaryPortal(); break;
      case "remotePlayer": options.drawRemotePlayer(layer.entity as RemotePlayer); break;
      case "player": options.drawPlayer(); break;
      default: {
        const missingRenderer: never = layer.kind;
        throw new Error("Missing depth renderer: " + missingRenderer);
      }
    }
  }

  function drawDepthSortedWorld(remotePlayers: RemotePlayer[], includePortal = true) {
    let layerCount = 0;
    const queueLayer = (depth: number, priority: number, kind: DepthLayerKind, entity?: WorldDecor | EnemyState | RemotePlayer, opacity = 1) => {
      const layer = dynamicLayers[layerCount] ?? (dynamicLayers[layerCount] = { depth: 0, priority: 0, kind, opacity: 1 });
      layer.depth = depth;
      layer.priority = priority;
      layer.kind = kind;
      layer.entity = entity;
      layer.opacity = opacity;
      layerCount += 1;
    };
    const camera = options.camera;
    const viewport = options.viewport();
    const visibleW = viewport.width / camera.zoom;
    const visibleH = viewport.height / camera.zoom;
    collectVisibleStaticDecor(visibleW, visibleH);
    const enemyCullPadding = 140;
    const queueEnemy = (enemy: EnemyState) => {
      if (enemy.dead) return;
      const opacity = (options.enemyOpacity?.(enemy) ?? 1) * (enemy.remoteCombatGhost ? .46 : 1);
      if (opacity <= 0) return;
      if (
        enemy.x + enemy.r < camera.x - enemyCullPadding ||
        enemy.x - enemy.r > camera.x + visibleW + enemyCullPadding ||
        enemy.y + enemy.r < camera.y - enemyCullPadding ||
        enemy.y - enemyCullPadding > camera.y + visibleH + enemyCullPadding
      ) return;
      queueLayer(enemy.y + enemy.r, 1, "enemy", enemy, opacity);
    };
    for (const enemy of options.enemies) queueEnemy(enemy);
    for (const enemy of options.remoteEnemies?.() ?? []) queueEnemy(enemy);
    // Includes large sprites, HP bars and reward labels beyond the body radius.
    const bossVisible = (boss: { x: number; y: number; dead: boolean }) => !boss.dead
      && boss.x >= camera.x - 600 && boss.x <= camera.x + visibleW + 600
      && boss.y >= camera.y - 600 && boss.y <= camera.y + visibleH + 600;
    const mapBoss = bossForMap(options.currentMapId());
    queuedBoss = mapBoss && bossVisible(options.bosses[mapBoss.kind]) ? mapBoss.kind : null;
    if (mapBoss && queuedBoss) queueLayer(options.bosses[mapBoss.kind].y + mapBoss.depthOffset, 1, "boss");
    const portal = options.activePortal();
    if (includePortal && portal) queueLayer(portal.depth, 2, "portal");
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
    options.drawOverWorld?.();
    options.drawBossHitboxes?.();
  }

  return { drawDepthSortedWorld, invalidateDepthOrder };
}
