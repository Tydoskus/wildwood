import type { Camera } from "../render/camera";
import { fishingScene } from "./fishing-scene";

const FOAM = "#ffffff", SWIRL = "#e6f7ff";

/**
 * The fishing spots, drawn on the river with its water and under everyone on the bank: ripples spreading out of a
 * slow swirl, and bubbles rising and popping. A catch throws a wider ring at the spot being fished.
 */
export function createFishingSpotRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => { width: number; height: number };
  time: () => number;
  active: () => boolean;
}) {
  return function drawFishingSpots() {
    if (!options.active() || !fishingScene.spots.length) return;
    const { ctx, camera } = options, view = options.viewport(), time = options.time();
    const right = camera.x + view.width / camera.zoom, bottom = camera.y + view.height / camera.zoom;
    ctx.save();
    ctx.lineCap = "round";
    for (const spot of fishingScene.spots) {
      if (spot.x < camera.x - 80 || spot.x > right + 80 || spot.y < camera.y - 60 || spot.y > bottom + 60) continue;
      const x = spot.x - camera.x, y = spot.y - camera.y, phase = time + spot.spot * 1.7;
      // Three ripples spreading out and fading, flattened as the water lies.
      ctx.strokeStyle = FOAM;
      ctx.lineWidth = 2.6;
      for (let ring = 0; ring < 3; ring++) {
        const k = (phase / 1.8 + ring / 3) % 1, radius = 10 + k * 36;
        ctx.globalAlpha = (1 - k) * .65;
        ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .45, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // The swirl: two arcs turning round the middle.
      ctx.globalAlpha = .9;
      ctx.strokeStyle = SWIRL;
      ctx.lineWidth = 3;
      const turn = phase * 2.4;
      for (const offset of [0, Math.PI]) {
        ctx.beginPath(); ctx.ellipse(x, y, 16, 7, 0, turn + offset, turn + offset + 1.9); ctx.stroke();
      }
      // Bubbles rising at seeded points, each popping as the next comes up.
      ctx.fillStyle = FOAM;
      for (let bubble = 0; bubble < 3; bubble++) {
        const run = phase * .9 + bubble * .37, life = run % 1, seed = Math.floor(run) * 7 + bubble + spot.spot * 13;
        ctx.globalAlpha = (1 - life) * .9;
        ctx.beginPath(); ctx.arc(x + (seed * 37 % 29) - 14, y + (seed * 53 % 13) - 6 - life * 8, 2 + life * 1.8, 0, Math.PI * 2); ctx.fill();
      }
      if (fishingScene.fishing === spot.spot && fishingScene.splash > 0) {
        const k = 1 - fishingScene.splash, radius = 14 + k * 46;
        ctx.globalAlpha = fishingScene.splash * .8;
        ctx.strokeStyle = FOAM;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .45, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  };
}
