import type { WorldPath } from "../world";

/** Baked with the normal static terrain cache; no per-frame glow filters. */
export function drawNeonRoads(ctx: CanvasRenderingContext2D, paths: readonly WorldPath[], camera: { x: number; y: number }, visible: { width: number; height: number }) {
  ctx.strokeStyle = "#23304b"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -((camera.x % 120 + 120) % 120); x < visible.width; x += 120) { ctx.moveTo(x, 0); ctx.lineTo(x, visible.height); }
  for (let y = -((camera.y % 120 + 120) % 120); y < visible.height; y += 120) { ctx.moveTo(0, y); ctx.lineTo(visible.width, y); }
  ctx.stroke();
  // Draw all road bodies first so intersections stay open.
  for (const p of paths) { ctx.fillStyle = "#23324b"; ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, p.h); }
  for (const [index, p] of paths.entries()) {
    const x = p.x - camera.x, y = p.y - camera.y;
    if (x > visible.width || y > visible.height || x + p.w < 0 || y + p.h < 0) continue;
    const horizontal = p.w > p.h;
    ctx.fillStyle = index % 2 ? "#ff48d566" : "#4ef7ff66";
    if (horizontal) {
      ctx.fillRect(x, y + 7, p.w, 3); ctx.fillRect(x, y + p.h - 10, p.w, 3);
      for (let offset = Math.max(0, Math.floor(-x / 90) * 90); offset < Math.min(p.w, visible.width - x); offset += 90) ctx.fillRect(x + offset, y + p.h / 2, 28, 3);
    } else {
      ctx.fillRect(x + 7, y, 3, p.h); ctx.fillRect(x + p.w - 10, y, 3, p.h);
      for (let offset = Math.max(0, Math.floor(-y / 90) * 90); offset < Math.min(p.h, visible.height - y); offset += 90) ctx.fillRect(x + p.w / 2, y + offset, 3, 28);
    }
  }
}
