import { TAU } from "../constants";
import { clamp, rand, randi } from "../math";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export type DamageNumber = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  text: string;
};

type CameraPosition = { x: number; y: number };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;

function formatDamage(amount: number) {
  const units: ReadonlyArray<readonly [number, string]> = [[1e9, "b"], [1e6, "m"], [1e3, "k"]];
  for (const [value, suffix] of units) {
    if (amount < value) continue;
    const scaled = amount / value;
    const digits = scaled >= 100 ? 0 : 1;
    return `${Number(scaled.toFixed(digits))}${suffix}`;
  }
  return String(Math.round(amount));
}

export function createCombatEffects() {
  const particles: Particle[] = [];
  const damageNumbers: DamageNumber[] = [];

  function spawnBurst(x: number, y: number, color: string, count = 8, speed = 75) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const velocity = rand(speed * .4, speed);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(.25, .7),
        maxLife: 1,
        size: randi(2, 5),
        color,
      });
    }
  }

  function spawnDamageNumber(x: number, y: number, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    damageNumbers.push({
      x: x + rand(-10, 10),
      y: y - 28,
      life: .72,
      maxLife: .72,
      text: `-${formatDamage(amount)}`,
    });
  }

  function update(dt: number) {
    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.03, dt);
      particle.vy *= Math.pow(.03, dt);
    }
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      if (particles[index].life <= 0) particles.splice(index, 1);
    }

    for (const number of damageNumbers) {
      number.life -= dt;
      number.y -= 34 * dt;
    }
    for (let index = damageNumbers.length - 1; index >= 0; index -= 1) {
      if (damageNumbers[index].life <= 0) damageNumbers.splice(index, 1);
    }
  }

  function drawParticles(ctx: CanvasRenderingContext2D, camera: CameraPosition) {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / (particle.maxLife || 1), 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(
        Math.floor(particle.x - camera.x),
        Math.floor(particle.y - camera.y),
        particle.size,
        particle.size,
      );
    }
    ctx.globalAlpha = 1;
  }

  function drawDamageNumbers(ctx: CanvasRenderingContext2D, camera: CameraPosition, outlinedText: OutlinedText) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = '900 19px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    for (const number of damageNumbers) {
      ctx.globalAlpha = clamp(number.life / number.maxLife, 0, 1);
      outlinedText(number.text, Math.floor(number.x - camera.x), Math.floor(number.y - camera.y), "#ff5a5a", 3);
    }
    ctx.restore();
  }

  return { particles, damageNumbers, spawnBurst, spawnDamageNumber, update, drawParticles, drawDamageNumbers };
}
