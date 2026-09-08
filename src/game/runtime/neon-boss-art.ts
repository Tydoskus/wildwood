/** Voltwarden is drawn from a small set of solid shapes, so the neon boss
 * stays crisp at every display scale without extra image downloads or blur. */
export function drawVoltwardenArt(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, attacking: boolean, hurt: number) {
  const cyan = hurt > 0 ? "#ffffff" : "#56f7ff";
  const pink = attacking ? "#ffffff" : "#ff48d5";
  const hover = Math.sin(time * 2.6) * 7;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "#05071680"; ctx.beginPath(); ctx.ellipse(0, 100, 158, 47, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, hover);
  // Segmented halo and the two orbiting induction coils.
  ctx.strokeStyle = "#1e4e65"; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.ellipse(0, -15, 175, 144, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const angle = time * .25 + i * Math.PI / 4;
    ctx.strokeStyle = i % 2 ? pink : cyan; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, -15, 175, 144, 0, angle, angle + .28); ctx.stroke();
  }
  const plate = (px: number, py: number, w: number, h: number, color: string) => {
    ctx.fillStyle = "#17243c"; ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(px + 14, py); ctx.lineTo(px + w - 14, py);
    ctx.lineTo(px + w, py + 14); ctx.lineTo(px + w, py + h - 14);
    ctx.lineTo(px + w - 14, py + h); ctx.lineTo(px + 14, py + h);
    ctx.lineTo(px, py + h - 14); ctx.lineTo(px, py + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  plate(-90, -110, 180, 180, cyan);
  plate(-165, -90, 62, 110, pink); plate(103, -90, 62, 110, pink);
  plate(-82, 65, 60, 55, cyan); plate(22, 65, 60, 55, cyan);
  plate(-64, -165, 128, 72, cyan);
  ctx.fillStyle = pink; ctx.fillRect(-43, -140, 86, 12);
  ctx.fillStyle = "#071321"; ctx.beginPath(); ctx.arc(0, -23, 46, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cyan; ctx.lineWidth = 7; ctx.stroke();
  ctx.save(); ctx.translate(0, -23); ctx.rotate(time * (attacking ? 2 : .6));
  ctx.fillStyle = pink; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(24, 0); ctx.lineTo(0, 30); ctx.lineTo(-24, 0); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.strokeStyle = cyan; ctx.lineWidth = 4;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 130, 20); ctx.lineTo(side * 115, 40); ctx.lineTo(side * 145, 45); ctx.lineTo(side * 130, 72); ctx.stroke(); }
  ctx.restore();
}
