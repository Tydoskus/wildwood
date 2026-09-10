import { ION_SWEEP, ION_BURSTS } from '../../../shared/ion-attacks';
import type { AegisPrimeBossState, AegisPrimeCrystalBurst } from './types';

export function drawIonAttacks(ctx: CanvasRenderingContext2D, boss: AegisPrimeBossState, bursts: AegisPrimeCrystalBurst[], camera: { x: number; y: number }) {
  const sweep = boss.shatter;
  if (sweep) {
    const active = sweep.windup <= 0;
    ctx.save(); ctx.translate(boss.x - camera.x, boss.y - camera.y); ctx.rotate(sweep.angle);
    ctx.fillStyle = active ? '#69ffb166' : '#69ffb122';
    ctx.strokeStyle = active ? '#d7ffec' : '#69ffb1'; ctx.lineWidth = active ? 5 : 2;
    ctx.setLineDash(active ? [] : [13, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, ION_SWEEP.range, -ION_SWEEP.halfAngle, ION_SWEEP.halfAngle);
    ctx.arc(0, 0, ION_SWEEP.innerRange, ION_SWEEP.halfAngle, -ION_SWEEP.halfAngle, true);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (active) {
      ctx.setLineDash([]); ctx.strokeStyle = '#b8ffe0'; ctx.lineWidth = 13;
      const radius = ION_SWEEP.innerRange + (1 - Math.max(0, sweep.timer) / sweep.duration) * (ION_SWEEP.range - ION_SWEEP.innerRange);
      ctx.beginPath(); ctx.arc(0, 0, radius, -ION_SWEEP.halfAngle, ION_SWEEP.halfAngle); ctx.stroke();
    }
    ctx.restore();
  }
  for (const burst of bursts) {
    const elapsed = burst.maxTimer - burst.timer;
    if (elapsed < 0) continue;
    const active = elapsed >= ION_BURSTS.windup;
    ctx.save(); ctx.translate(burst.x - camera.x, burst.y - camera.y);
    ctx.fillStyle = active ? '#a2e8ff77' : '#80dfff22'; ctx.strokeStyle = active ? '#ecffff' : '#80dfff';
    ctx.lineWidth = active ? 5 : 2; ctx.setLineDash(active ? [] : [10, 7]);
    ctx.beginPath(); ctx.arc(0, 0, burst.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.moveTo(0, -22); ctx.lineTo(0, 22); ctx.stroke();
    if (active) {
      ctx.strokeStyle = '#d7fff0'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, -160); ctx.lineTo(-13, -92); ctx.lineTo(16, -50); ctx.lineTo(0, 0); ctx.stroke();
    }
    ctx.restore();
  }
}
