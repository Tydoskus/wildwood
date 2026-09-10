import { VERDANT_ROOTS, VERDANT_SPORES } from '../../../shared/verdant-attacks';
import type { GravebloomBossState, GravebloomCrystalBurst } from './types';

export function drawVerdantAttacks(ctx: CanvasRenderingContext2D, boss: GravebloomBossState, pods: GravebloomCrystalBurst[], camera: { x: number; y: number }) {
  const roots = boss.shatter;
  if (roots) for (const offset of VERDANT_ROOTS.angles) {
    const active = roots.windup <= 0;
    ctx.save(); ctx.translate(boss.x - camera.x, boss.y - camera.y); ctx.rotate(roots.angle + offset);
    ctx.fillStyle = active ? '#a0e8a97a' : '#a0e8a926';
    ctx.strokeStyle = active ? '#d2ffaf' : '#b8faba'; ctx.lineWidth = active ? 5 : 2;
    ctx.setLineDash(active ? [] : [12, 9]);
    ctx.beginPath(); ctx.rect(150, -VERDANT_ROOTS.halfWidth, VERDANT_ROOTS.range - 150, VERDANT_ROOTS.halfWidth * 2); ctx.fill(); ctx.stroke();
    if (active) {
      ctx.setLineDash([]); ctx.strokeStyle = '#416c37'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(150, 0);
      for (let x = 180; x <= VERDANT_ROOTS.range; x += 35) ctx.lineTo(x, Math.sin(x * .035) * 15);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const pod of pods) {
    const elapsed = pod.maxTimer - pod.timer;
    if (elapsed < 0) continue;
    const active = elapsed >= VERDANT_SPORES.windup;
    const progress = Math.min(1, elapsed / VERDANT_SPORES.windup);
    ctx.save(); ctx.translate(pod.x - camera.x, pod.y - camera.y);
    ctx.fillStyle = active ? '#8fffd365' : '#65edc427'; ctx.strokeStyle = '#aaffda'; ctx.lineWidth = active ? 4 : 2;
    ctx.setLineDash(active ? [] : [9, 6]);
    ctx.beginPath(); ctx.arc(0, 0, pod.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#baffbb';
    ctx.beginPath(); ctx.ellipse(0, -5, 12 + progress * 13, 8 + progress * 8, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-3, -6, 6, 22);
    if (active) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = 25 + (elapsed - VERDANT_SPORES.windup) * 120;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
