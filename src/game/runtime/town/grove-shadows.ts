import { WOOD_TREE_NODES } from "../../../../shared/woodcutting";
import { stoneShadowUnder, woodTreeDecor } from "../../town-world";
import type { Camera } from "../render/camera";
import { soulFrame, SOUL_SHADOW_STRENGTH, type SoulPropDecor } from "../soul/soul-prop-renderer";
import { stumpFrame } from "./wood-tree-renderer";
import { woodcuttingScene } from "./woodcutting-scene";

/**
 * A Timberwood tree's shadow: its own while it stands, and once felled the round stone shadow under its stump (the pack
 * draws stumps none, and a shrunk tree shadow still shows its leaves), as an ore rock has.
 */
export function groveTreeShadow(treeId: number, felled: boolean): SoulPropDecor | null {
  const node = WOOD_TREE_NODES[treeId];
  if (!node) return null;
  const tree = woodTreeDecor(node);
  if (felled) return soulFrame(stumpFrame(treeId)) ? stoneShadowUnder(stumpFrame(treeId), tree.x, tree.y, 1, tree.flip) : null;
  const frame = `${tree.frame}__shadow`;
  return soulFrame(frame) ? { type: "soulProp", x: tree.x, y: tree.y, s: tree.s, frame, flip: tree.flip, shadow: true } : null;
}

/**
 * Timberwood's tree shadows, drawn each frame over the baked ground and under everything standing on it, so a tree
 * the player felled shows its stump's small shadow rather than the whole tree's.
 */
export function createGroveShadowRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => { width: number; height: number };
  drawProp: (prop: SoulPropDecor) => void;
  active: () => boolean;
}) {
  const standing = WOOD_TREE_NODES.map(tree => groveTreeShadow(tree.id, false));
  const felled = WOOD_TREE_NODES.map(tree => groveTreeShadow(tree.id, true));
  return function drawGroveShadows() {
    if (!options.active()) return;
    const { ctx, camera } = options, view = options.viewport();
    const right = camera.x + view.width / camera.zoom, bottom = camera.y + view.height / camera.zoom;
    ctx.save();
    ctx.globalAlpha = SOUL_SHADOW_STRENGTH;
    WOOD_TREE_NODES.forEach((tree, index) => {
      const shadow = woodcuttingScene.felled.has(tree.id) ? felled[index] : standing[index];
      if (!shadow) return;
      const frame = soulFrame(shadow.frame)!, half = Math.max(frame.ax, frame.w - frame.ax) * shadow.s;
      if (shadow.x + half < camera.x || shadow.x - half > right || shadow.y + frame.h * shadow.s < camera.y || shadow.y - frame.h * shadow.s > bottom) return;
      options.drawProp(shadow);
    });
    ctx.restore();
  };
}
