import { profileSnapshotKey, type ProfileSnapshotLook } from "../../../shared/profile-snapshot";
import type { ProfileSnapshotPortrait } from "../../app/profile-snapshot-portraits";
import { itemPresentation } from "../item-presentation";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import { EXPANSION_HEAD_FRAME } from "../player-head-template";

/** Drawn once per look at this many pixels square, then scaled to each portrait. */
export const PROFILE_SNAPSHOT_PIXELS = 160;
// Character space is the 180 × 171 body frame drawStartingPlayer works in.
const FRAME_CENTER_X = 89;
/** The crop's lower edge: the chest and the top of the arms, like the portrait sheets' shoulders. */
const FRAME_BOTTOM = 146;
const FRAME_MIN_SPAN = 82;
const HEADROOM = 5;

/**
 * The square of character space a snapshot shows: head and shoulders. A tall
 * hat raises the top, so the whole hat fits and the face shrinks a little,
 * which is what the inventory preview does for its label.
 */
export function profileSnapshotFrame(look: ProfileSnapshotLook, assets?: PlayerAppearanceAssets) {
  const head = itemPresentation(look.headItem)?.world;
  let headTop: number = EXPANSION_HEAD_FRAME.y;
  if (head?.kind === "SPRITE" && head.layer === "HEAD") {
    const height = head.height ?? assets?.equipment[look.headItem]?.sprite?.naturalHeight ?? 0;
    headTop = Math.min(headTop, head.top ?? (head.bottom ?? height) - height);
  }
  const top = headTop - HEADROOM;
  const span = Math.max(FRAME_MIN_SPAN, FRAME_BOTTOM - top);
  return { left: FRAME_CENTER_X - span / 2, top: FRAME_BOTTOM - span, span };
}

/** Draws a snapshot into a `size` square: transparent, so the chosen backdrop shows behind it. */
export function drawProfileSnapshot(ctx: CanvasRenderingContext2D, assets: PlayerAppearanceAssets, look: ProfileSnapshotLook, size: number) {
  const frame = profileSnapshotFrame(look, assets);
  const scale = size / frame.span;
  // drawStartingPlayer puts character point (cx, cy) at (x + (cx - 90)·s, y + 29 + (cy - 171)·s).
  drawStartingPlayer(ctx, assets, {
    x: (90 - frame.left) * scale,
    y: (171 - frame.top) * scale - 29,
    facing: 0, moving: false, gameTime: 0, smooth: true, scale,
    skinTone: look.skinTone, headItem: look.headItem, chestItem: look.chestItem, feetItem: look.feetItem,
    rightHandItem: look.rightHandItem, leftHandItem: look.leftHandItem,
  });
}

/** The renderer the portrait cache uses once the character art has loaded. */
export function createProfileSnapshotRenderer(assets: PlayerAppearanceAssets, size = PROFILE_SNAPSHOT_PIXELS) {
  return (look: ProfileSnapshotLook): ProfileSnapshotPortrait | null => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Firefox throws drawing a part that failed to load: that portrait is the default silhouette, nothing else breaks.
    try { drawProfileSnapshot(ctx, assets, look, size); } catch { return null; }
    return { key: profileSnapshotKey(look), canvas, url: canvas.toDataURL("image/png") };
  };
}
