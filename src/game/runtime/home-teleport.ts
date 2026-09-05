/** Shared presentation clock for the local player's departure and arrival. */
let startedAt = 0;
let arriving = false;
export function beginHomeTeleport(arrival = false) {
  startedAt = performance.now();
  arriving = arrival;
}
export function endHomeTeleport() { startedAt = 0; }
export function drawHomeTeleport(ctx: CanvasRenderingContext2D, x: number, y: number, drawPlayer: () => void) {
  const progress = startedAt ? Math.min(1, (performance.now() - startedAt) / 650) : 1;
  if (progress >= 1) { if (!startedAt || arriving) drawPlayer(); return; }
  const strength = Math.sin(progress * Math.PI);
  ctx.save();
  ctx.strokeStyle = `rgba(143,241,255,${1 - progress * .5})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#96eeff'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.ellipse(x, y, 24 + strength * 35, 10 + strength * 15, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + progress * Math.PI * 2;
    ctx.fillStyle = '#c5f9ff';
    ctx.fillRect(x + Math.cos(angle) * 28 - 2, y - progress * 110 + Math.sin(angle) * 12, 4, 8);
  }
  ctx.globalAlpha *= arriving ? progress : 1 - progress;
  ctx.translate(x, y);
  ctx.scale(1 - strength * .25, 1 + strength * .2);
  ctx.translate(-x, -y + (arriving ? -(1 - progress) : -progress) * 24);
  drawPlayer();
  ctx.restore();
}
