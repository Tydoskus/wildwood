import { TAU } from "../constants";
import { clamp, rand, randi } from "../math";
import { formatCompactNumber } from "../../ui/number-format";

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
  critical: boolean;
};

type CameraPosition = { x: number; y: number };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;

export const MAX_PARTICLES = 320;
export const MAX_DAMAGE_NUMBERS = 96;

export function createCombatEffects() {
  const particles: Particle[] = [];
  const damageNumbers: DamageNumber[] = [];
  const particlePool: Particle[] = [];
  const damageNumberPool: DamageNumber[] = [];
  let particleReplacement = 0;
  let damageNumberReplacement = 0;

  function acquireParticle() {
    if (particles.length < MAX_PARTICLES) {
      const particle = particlePool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: "" };
      particles.push(particle);
      return particle;
    }
    const particle = particles[particleReplacement % particles.length];
    particleReplacement = (particleReplacement + 1) % MAX_PARTICLES;
    return particle;
  }

  function spawnParticle(x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, color: string) {
    const particle = acquireParticle();
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = life;
    particle.maxLife = maxLife;
    particle.size = size;
    particle.color = color;
  }

  function spawnBurst(x: number, y: number, color: string, count = 8, speed = 75) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const velocity = rand(speed * .4, speed);
      spawnParticle(x, y, Math.cos(angle) * velocity, Math.sin(angle) * velocity, rand(.25, .7), 1, randi(2, 5), color);
    }
  }

  function spawnDamageNumber(x: number, y: number, amount: number, critical = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    let number: DamageNumber;
    if (damageNumbers.length < MAX_DAMAGE_NUMBERS) {
      number = damageNumberPool.pop() ?? { x: 0, y: 0, life: 0, maxLife: 0, text: "", critical: false };
      damageNumbers.push(number);
    } else {
      number = damageNumbers[damageNumberReplacement % damageNumbers.length];
      damageNumberReplacement = (damageNumberReplacement + 1) % MAX_DAMAGE_NUMBERS;
    }
    number.x = x + rand(-10, 10);
    number.y = y - 28;
    number.life = .72;
    number.maxLife = .72;
    number.text = `-${formatCompactNumber(amount)}`;
    number.critical = critical;
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
      if (particles[index].life > 0) continue;
      const expired = particles[index];
      const last = particles.pop()!;
      if (index < particles.length) particles[index] = last;
      if (particlePool.length < MAX_PARTICLES) particlePool.push(expired);
    }

    for (const number of damageNumbers) {
      number.life -= dt;
      number.y -= 34 * dt;
    }
    for (let index = damageNumbers.length - 1; index >= 0; index -= 1) {
      if (damageNumbers[index].life > 0) continue;
      const expired = damageNumbers[index];
      const last = damageNumbers.pop()!;
      if (index < damageNumbers.length) damageNumbers[index] = last;
      if (damageNumberPool.length < MAX_DAMAGE_NUMBERS) damageNumberPool.push(expired);
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
    for (const number of damageNumbers) {
      ctx.globalAlpha = clamp(number.life / number.maxLife, 0, 1);
      ctx.font = number.critical
        ? '900 22px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'
        : '900 20px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      outlinedText(number.text, Math.floor(number.x - camera.x), Math.floor(number.y - camera.y), number.critical ? "#ffe36b" : "#ff5a5a", 4);
    }
    ctx.restore();
  }

  function clearParticles() {
    while (particles.length) {
      const particle = particles.pop()!;
      if (particlePool.length < MAX_PARTICLES) particlePool.push(particle);
    }
    particleReplacement = 0;
  }

  function clearDamageNumbers() {
    while (damageNumbers.length) {
      const number = damageNumbers.pop()!;
      if (damageNumberPool.length < MAX_DAMAGE_NUMBERS) damageNumberPool.push(number);
    }
    damageNumberReplacement = 0;
  }

  function clear() {
    clearParticles();
    clearDamageNumbers();
  }

  return { particles, damageNumbers, spawnParticle, spawnBurst, spawnDamageNumber, update, drawParticles, drawDamageNumbers, clearParticles, clearDamageNumbers, clear };
}
