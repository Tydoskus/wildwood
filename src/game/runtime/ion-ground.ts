import type { WorldPath } from '../world';

/** Static armor plates and mint conduits are cached with the map terrain. */
export function drawIonRoads(ctx: CanvasRenderingContext2D, paths: readonly WorldPath[], camera: { x: number; y: number }, visible: { width: number; height: number }) {
  for (const p of paths) {
    const x = p.x - camera.x, y = p.y - camera.y;
    if (x > visible.width || y > visible.height || x + p.w < 0 || y + p.h < 0) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, p.w, p.h); ctx.clip();
    ctx.fillStyle = '#233e4c'; ctx.fillRect(x, y, p.w, p.h);
    const startX = Math.floor(Math.max(0, -x) / 120) * 120, startY = Math.floor(Math.max(0, -y) / 100) * 100;
    for (let dy = startY; dy < Math.min(p.h, visible.height - y); dy += 100) for (let dx = startX; dx < Math.min(p.w, visible.width - x); dx += 120) {
      ctx.fillStyle = '#345563'; ctx.fillRect(x + dx + 5, y + dy + 5, 109, 89);
      ctx.strokeStyle = '#182f3c'; ctx.lineWidth = 3; ctx.strokeRect(x + dx + 12, y + dy + 12, 95, 75);
      ctx.fillStyle = '#7baab6'; ctx.fillRect(x + dx + 18, y + dy + 19, 5, 5); ctx.fillRect(x + dx + 95, y + dy + 75, 5, 5);
    }
    ctx.strokeStyle = '#69ffb177'; ctx.lineWidth = 4;
    ctx.strokeRect(x + 10, y + 10, p.w - 20, p.h - 20);
    ctx.restore();
  }
}
