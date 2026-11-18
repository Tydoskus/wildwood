import { GUILD_HALL_POND } from "../../../../shared/guild-hall";
import { guildHallShown } from "../../guild-hall";
import type { Camera } from "../render/camera";

/**
 * Draws the guild hall's permanent Fishing Pond on the east courtyard lawn whenever the guild has unlocked it
 * (level 1: Koi Pond, level 2: Grand Fishing Pond). Drawn in the water pass under players and ripples.
 */
export function createGuildHallPondRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  time: () => number;
}) {
  const stones = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const wobble = 1 + Math.sin(i * 2.7) * .045;
    return {
      dx: Math.cos(angle) * (GUILD_HALL_POND.rx + 4) * wobble,
      dy: Math.sin(angle) * (GUILD_HALL_POND.ry + 4) * wobble,
      rx: 13 + (i % 3) * 3,
      ry: 9 + ((i + 1) % 3) * 2.2,
      rot: angle + Math.PI / 2,
      shade: i % 2 === 0 ? "#858a82" : "#6c726b",
      light: i % 2 === 0 ? "#a9afa5" : "#929990",
    };
  });

  const pads = [
    { dx: -56, dy: -22, r: 13, gap: .4, bloom: true },
    { dx: -36, dy: -36, r: 10, gap: 1.8, bloom: false },
    { dx: 54, dy: 24, r: 14, gap: 3.5, bloom: true },
    { dx: 36, dy: 34, r: 9.5, gap: 4.8, bloom: false },
    { dx: 58, dy: -16, r: 11, gap: 2.3, bloom: true },
  ];

  return function drawGuildHallPond() {
    const level = guildHallShown.pond;
    if (level < 1 || guildHallShown.indoors) return;
    const { ctx, camera } = options;
    const t = options.time();
    const cx = GUILD_HALL_POND.x - camera.x, cy = GUILD_HALL_POND.y - camera.y;
    const { rx, ry } = GUILD_HALL_POND;

    ctx.save();
    // Soft grass rim shadow
    ctx.fillStyle = "rgba(18, 28, 14, .34)";
    ctx.beginPath(); ctx.ellipse(cx, cy + 5, rx + 15, ry + 13, 0, 0, Math.PI * 2); ctx.fill();

    // Bank stones around the edge
    for (const stone of stones) {
      ctx.save();
      ctx.translate(cx + stone.dx, cy + stone.dy);
      ctx.rotate(stone.rot);
      ctx.fillStyle = "#2b2f2a";
      ctx.beginPath(); ctx.ellipse(0, 2, stone.rx + 1.5, stone.ry + 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = stone.shade;
      ctx.beginPath(); ctx.ellipse(0, 0, stone.rx, stone.ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = stone.light;
      ctx.beginPath(); ctx.ellipse(-2, -2, stone.rx * .65, stone.ry * .55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Layered water: shallow turquoise rim into rich pond blue
    ctx.fillStyle = level >= 2 ? "#1e6e84" : "#226576";
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - 3, ry - 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = level >= 2 ? "#154f69" : "#18495c";
    ctx.beginPath(); ctx.ellipse(cx, cy + 3, rx - 16, ry - 13, 0, 0, Math.PI * 2); ctx.fill();

    // Gentle sunlit water caustics
    ctx.strokeStyle = level >= 2 ? "rgba(190, 245, 255, .28)" : "rgba(175, 232, 245, .22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const phase = (t * .38 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * .7;
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(t * .6 + i) * 6, cy + Math.cos(t * .5 + i) * 4, (rx - 26) * phase, (ry - 20) * phase, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Swimming koi silhouettes gliding under the surface
    const koiCount = level >= 2 ? 4 : 2;
    for (let i = 0; i < koiCount; i++) {
      const speed = .42 + i * .11, a = t * speed + i * 1.7;
      const kx = cx + Math.cos(a) * (rx * .48), ky = cy + Math.sin(a * 1.3) * (ry * .42);
      const heading = Math.atan2(Math.cos(a * 1.3) * ry * .42 * 1.3, -Math.sin(a) * rx * .48);
      ctx.save();
      ctx.translate(kx, ky);
      ctx.rotate(heading);
      ctx.fillStyle = i % 2 === 0 ? (level >= 2 ? "#ffd24d" : "#f28c45") : "#ff6b45";
      ctx.globalAlpha = .72;
      ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-14, -4 + Math.sin(t * 7 + i) * 1.8); ctx.lineTo(-14, 4 + Math.sin(t * 7 + i) * 1.8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Lily pads & blossoms (extra lotus blooms at Grand Fishing Pond)
    for (const pad of pads) {
      const px = cx + pad.dx, py = cy + pad.dy;
      ctx.fillStyle = "#3f8746";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, pad.r, pad.gap, pad.gap + Math.PI * 1.84);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#265a2c"; ctx.lineWidth = 1.2; ctx.stroke();
      if (pad.bloom && (level >= 2 || pad.dx < 0)) {
        ctx.fillStyle = level >= 2 ? "#ffd8ea" : "#fff1f6";
        ctx.beginPath(); ctx.arc(px, py - 1, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffd34d";
        ctx.beginPath(); ctx.arc(px, py - 1, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };
}
