import type { WorldPath } from '../world';

/** Mossy, cracked flagstones are painted through the ordinary static terrain cache. */
export function drawVerdantRoads(ctx: CanvasRenderingContext2D, paths: readonly WorldPath[], camera: { x: number; y: number }, visible: { width: number; height: number }) {
  for (const p of paths) {
    const x = p.x - camera.x, y = p.y - camera.y;
    if (x > visible.width || y > visible.height || x + p.w < 0 || y + p.h < 0) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, p.w, p.h); ctx.clip();
    ctx.fillStyle = '#485e51'; ctx.fillRect(x, y, p.w, p.h);
    const firstX = Math.floor(Math.max(0, -x) / 90) * 90, firstY = Math.floor(Math.max(0, -y) / 70) * 70;
    for (let dy = firstY; dy < Math.min(p.h, visible.height - y); dy += 70) for (let dx = firstX; dx < Math.min(p.w, visible.width - x); dx += 90) {
      const seed = Math.floor((p.x + dx) / 90) + Math.floor((p.y + dy) / 70) * 17;
      ctx.fillStyle = ['#607164', '#657565', '#536958'][Math.abs(seed) % 3];
      ctx.fillRect(x + dx + 4, y + dy + 4, 81, 61);
      ctx.strokeStyle = '#344d3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + dx + 14, y + dy + 4); ctx.lineTo(x + dx + 33, y + dy + 28); ctx.lineTo(x + dx + 29, y + dy + 45); ctx.stroke();
      if (seed % 3 === 0) { ctx.fillStyle = '#75ae7540'; ctx.beginPath(); ctx.ellipse(x + dx + 65, y + dy + 55, 18, 8, -.3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
}
