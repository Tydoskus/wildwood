import { NEON_LASER, NEON_EMP, neonEmpRadius } from "../../../shared/neon-attacks";
import type { VoltwardenBossState, VoltwardenCrystalBurst } from "./types";

export function drawNeonAttacks(ctx: CanvasRenderingContext2D, boss: VoltwardenBossState, pulses: readonly VoltwardenCrystalBurst[], camera: { x: number; y: number }) {
  const laser = boss.shatter;
  if (laser) {
    ctx.save(); ctx.translate(boss.x - camera.x, boss.y - camera.y); ctx.rotate(laser.angle);
    for (const lane of NEON_LASER.lanes) {
      const active = laser.windup <= 0;
      ctx.fillStyle = active ? "#36f1ffbb" : "#36f1ff22";
      ctx.strokeStyle = "#63faff"; ctx.lineWidth = active ? 4 : 2;
      ctx.setLineDash(active ? [] : [16, 12]);
      ctx.fillRect(150, lane - NEON_LASER.halfWidth, NEON_LASER.range - 150, NEON_LASER.halfWidth * 2);
      ctx.strokeRect(150, lane - NEON_LASER.halfWidth, NEON_LASER.range - 150, NEON_LASER.halfWidth * 2);
      if (active) { ctx.fillStyle = "#ffffff"; ctx.fillRect(150, lane - 4, NEON_LASER.range - 150, 8); }
      else {
        ctx.fillStyle = "#8dffff";
        for (let x = 200; x < NEON_LASER.range; x += 150) {
          ctx.beginPath(); ctx.moveTo(x, lane - 8); ctx.lineTo(x + 12, lane); ctx.lineTo(x, lane + 8); ctx.closePath(); ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  for (const pulse of pulses) {
    const elapsed = pulse.maxTimer - pulse.timer;
    if (elapsed < 0) continue;
    const active = elapsed >= NEON_EMP.windup, radius = neonEmpRadius(elapsed);
    ctx.save(); ctx.translate(pulse.x - camera.x, pulse.y - camera.y);
    ctx.strokeStyle = active ? "#ff48dcaa" : "#ff48dc88";
    ctx.lineWidth = active ? NEON_EMP.halfWidth * 2 : 3;
    ctx.setLineDash(active ? [] : [14, 10]);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    if (active) {
      ctx.strokeStyle = "#ffeaff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}
