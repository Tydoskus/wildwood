import { fishOpenAt } from "../../../../shared/fishing";
import type { Camera } from "../render/camera";
import type { LayerBounds, PlayerLayer } from "../../player-layer-alignment";
import { fishingScene } from "./fishing-scene";

/** Where the line leaves the rod: its tip, in the rod's 118 x 59 art (fishing-rod-sprite.ts). */
const TIP = { x: 112, y: 30 }, ART = { width: 118, height: 59 };
const LINE = "rgba(236, 242, 246, .9)", FLOAT_RED = "#e8443a", FLOAT_WHITE = "#ffffff", OUTLINE = "#14100c";

/**
 * The line from the rod's tip to the spot being fished, sagging a little, with a float bobbing on the water. The rod
 * is drawn in the player's hand, so its tip is taken from that drawing (onLayerBounds) rather than worked out again.
 */
export function createFishingLine(camera: Camera) {
  const catchImages = new Map<string, HTMLImageElement>();
  function catchImage(id: string) {
    let image = catchImages.get(id);
    if (!image && typeof Image !== "undefined") {
      image = new Image(); image.src = `assets/wildstat/fish/${id}.webp`; catchImages.set(id, image);
    }
    return image?.complete && image.naturalWidth ? image : null;
  }
  let preparedExperience = -1;
  let tip: { x: number; y: number } | null = null;
  return {
    /** Given to the player's drawing while the rod is out: notes where the rod's tip lands on the canvas. */
    layer(layer: PlayerLayer, bounds: LayerBounds) {
      if (layer !== "weapon" || !bounds.transform || !bounds.source) return;
      const { source, transform: m } = bounds;
      const x = source.x + TIP.x / ART.width * source.width, y = source.y + TIP.y / ART.height * source.height;
      tip = { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
    },
    /** Draws the line from the tip just noted, in the canvas's own pixels; `world` is the transform the player was drawn under. */
    draw(ctx: CanvasRenderingContext2D, world: DOMMatrix, time: number, alpha: number) {
      const from = tip;
      tip = null;
      const spot = fishingScene.spots.find(each => each.spot === fishingScene.fishing);
      if (!from || !spot) return;
      if (preparedExperience !== fishingScene.experience) {
        preparedExperience = fishingScene.experience;
        for (const fish of fishOpenAt(preparedExperience)) catchImage(fish.id);
      }
      const sx = spot.x - camera.x, sy = spot.y - camera.y, scale = Math.hypot(world.a, world.b);
      // The float rides the ripples, and ducks under as a fish takes it.
      const bite = fishingScene.bite;
      const bob = Math.sin(time * 3.2) * 1.2 + bite * (3.5 + Math.sin(time * 17) * 3);
      const water = { x: world.a * sx + world.c * sy + world.e, y: world.b * sx + world.d * sy + world.f + bob * scale };
      // Let the catch finish its arc before the next throw leaves the rod.
      const flight = Math.min(1, fishingScene.castAge / .46);
      const reel = fishingScene.caughtFish && fishingScene.splash > 0 ? 1 - fishingScene.splash : null;
      const along = reel === null ? flight : 1 - reel;
      const lift = Math.sin(Math.PI * along) * (reel === null ? 21 : 40) * scale;
      const to = { x: from.x + (water.x - from.x) * along, y: from.y + (water.y - from.y) * along - lift };
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.strokeStyle = LINE;
      ctx.lineWidth = Math.max(1, 1.3 * scale);
      const sag = Math.hypot(to.x - from.x, to.y - from.y) * (.12 - bite * .095);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + to.x) / 2, (from.y + to.y) / 2 + sag, to.x, to.y);
      ctx.stroke();
      // The float: red over white, outlined.
      const r = 4.2 * scale;
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      ctx.strokeStyle = OUTLINE;
      ctx.fillStyle = FLOAT_WHITE;
      ctx.beginPath(); ctx.arc(to.x, to.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = FLOAT_RED;
      ctx.beginPath(); ctx.arc(to.x, to.y, r, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(to.x, to.y, r, 0, Math.PI * 2); ctx.stroke();
      if (reel !== null && fishingScene.caughtFish) {
        const image = catchImage(fishingScene.caughtFish);
        if (image) {
          const size = (28 + 7 * Math.sin(Math.PI * reel)) * scale;
          ctx.translate(to.x, to.y); ctx.rotate(Math.sin(reel * Math.PI * 3) * .35);
          ctx.drawImage(image, -size / 2, -size / 2, size, size);
        }
      }
      ctx.restore();
    },
  };
}
