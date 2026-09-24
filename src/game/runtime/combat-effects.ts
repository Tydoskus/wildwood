import { TAU } from "../constants";
import { clamp, rand, randi } from "../math";
import { formatCompactNumber } from "../../ui/number-format";
import { drawScreenSpaceAt, snapWorldRenderCoordinate } from "./render-space";

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
  startY: number;
  life: number;
  maxLife: number;
  opacity: number;
  text: string;
  critical: boolean;
  damageTaken: boolean;
};

/**
 * Line effects for the bow skills: a curving arrow (Arrow Storm), a glowing
 * streak between two points (Ricochet's arc, Piercing Shot's beam) and an
 * expanding ring. Pooled like particles and drawn with the damage numbers.
 * An arrow follows a quadratic curve from (x, y) through the pull of
 * (controlX, controlY) to (toX, toY).
 */
export type SkillEffect = {
  kind: "arrow" | "streak" | "ring";
  x: number; y: number; toX: number; toY: number; controlX: number; controlY: number;
  delay: number; life: number; maxLife: number;
  width: number; color: string; jagged: boolean;
};

type CameraPosition = { x: number; y: number; zoom: number };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;

export const MAX_PARTICLES = 320;
export const MAX_DAMAGE_NUMBERS = 96;
export const MAX_SKILL_EFFECTS = 96;
/** How far apart numbers from one burst of hits fan out, so each can be read. */
const DAMAGE_NUMBER_SPREAD: readonly [number, number][] = [
  [0, 0], [-40, -14], [40, -14], [-20, -36], [20, -36], [-60, -34], [60, -34], [0, -58], [-40, -60], [40, -60],
];
/** Numbers born within this long of each other, this close, count as one burst. */
const DAMAGE_NUMBER_BURST_SECONDS = .28;
const DAMAGE_NUMBER_BURST_DISTANCE = 70;
/** How long an Arrow Storm arrow flies, and how far apart the volley's arrows leave. */
export const ARROW_STORM_FLIGHT_SECONDS = .3;
export const ARROW_STORM_STAGGER_SECONDS = .035;
/** How far out an Arrow Storm arrow swings, as a share of the distance to the target. */
const ARROW_STORM_ARC_SPREAD = [.55, .8, .35, 1, .65] as const;
export const DAMAGE_NUMBER_RISE_DURATION = .55;
export const DAMAGE_NUMBER_FADE_DURATION = .35;
const DAMAGE_NUMBER_RISE_DISTANCE = 32;
const DAMAGE_NUMBER_LIFETIME = DAMAGE_NUMBER_RISE_DURATION + DAMAGE_NUMBER_FADE_DURATION;

export function createCombatEffects() {
  const particles: Particle[] = [];
  const damageNumbers: DamageNumber[] = [];
  const particlePool: Particle[] = [];
  const damageNumberPool: DamageNumber[] = [];
  const skillEffects: SkillEffect[] = [];
  const skillEffectPool: SkillEffect[] = [];
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

  function spawnDamageNumber(x: number, y: number, amount: number, critical = false, damageTaken = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    let number: DamageNumber;
    if (damageNumbers.length < MAX_DAMAGE_NUMBERS) {
      number = damageNumberPool.pop() ?? { x: 0, y: 0, startY: 0, life: 0, maxLife: 0, opacity: 1, text: "", critical: false, damageTaken: false };
      damageNumbers.push(number);
    } else {
      number = damageNumbers[damageNumberReplacement % damageNumbers.length];
      damageNumberReplacement = (damageNumberReplacement + 1) % MAX_DAMAGE_NUMBERS;
    }
    // Fan out from any numbers this burst already put here, nearest free spot first.
    let crowd = 0;
    for (const other of damageNumbers) {
      if (other === number || other.maxLife - other.life > DAMAGE_NUMBER_BURST_SECONDS) continue;
      if (Math.abs(other.x - x) < DAMAGE_NUMBER_BURST_DISTANCE && Math.abs(other.startY - (y - 28)) < DAMAGE_NUMBER_BURST_DISTANCE) crowd++;
    }
    const [spreadX, spreadY] = DAMAGE_NUMBER_SPREAD[crowd % DAMAGE_NUMBER_SPREAD.length];
    number.x = x + spreadX + rand(-6, 6);
    number.startY = y - 28 + spreadY - Math.floor(crowd / DAMAGE_NUMBER_SPREAD.length) * 24;
    number.y = number.startY;
    number.life = DAMAGE_NUMBER_LIFETIME;
    number.maxLife = DAMAGE_NUMBER_LIFETIME;
    number.opacity = 1;
    number.text = `-${formatCompactNumber(amount)}`;
    number.critical = critical;
    number.damageTaken = damageTaken;
  }

  function acquireSkillEffect() {
    if (skillEffects.length < MAX_SKILL_EFFECTS) {
      const effect = skillEffectPool.pop() ?? { kind: "ring", x: 0, y: 0, toX: 0, toY: 0, controlX: 0, controlY: 0, delay: 0, life: 0, maxLife: 0, width: 0, color: "", jagged: false } as SkillEffect;
      skillEffects.push(effect);
      return effect;
    }
    return skillEffects[0];
  }

  function spawnSkillEffect(kind: SkillEffect["kind"], x: number, y: number, toX: number, toY: number,
    life: number, width: number, color: string, delay = 0, jagged = false) {
    const effect = acquireSkillEffect();
    Object.assign(effect, { kind, x, y, toX, toY, controlX: (x + toX) / 2, controlY: (y + toY) / 2, life, maxLife: life, width, color, delay, jagged });
    return effect;
  }

  /**
   * Arrow Storm's volley, one arrow at a time: it leaves the shooter at +90 or
   * -90 degrees to the line of fire (alternating by index) and bends round
   * onto the target, so a volley traces a teardrop around the line of fire.
   */
  function spawnArcingArrow(fromX: number, fromY: number, toX: number, toY: number, index: number, color: string) {
    const distance = Math.hypot(toX - fromX, toY - fromY) || 1;
    const side = index % 2 === 0 ? 1 : -1;
    const spread = ARROW_STORM_ARC_SPREAD[index % ARROW_STORM_ARC_SPREAD.length] * distance;
    const normalX = -(toY - fromY) / distance * side, normalY = (toX - fromX) / distance * side;
    const delay = index * ARROW_STORM_STAGGER_SECONDS;
    const effect = spawnSkillEffect("arrow", fromX, fromY, toX, toY, ARROW_STORM_FLIGHT_SECONDS, 3, color, delay);
    // A control point out to the side, a little behind the shooter, starts the
    // arrow off square to the line of fire before it curves in.
    effect.controlX = fromX + normalX * spread * 1.35 - (toX - fromX) * .1;
    effect.controlY = fromY + normalY * spread * 1.35 - (toY - fromY) * .1;
    spawnSkillEffect("ring", toX, toY, toX, toY, .3, 24, color, delay + ARROW_STORM_FLIGHT_SECONDS - .02);
  }

  /** A glowing streak from one point to another; jagged reads as electricity. */
  function spawnSkillStreak(x: number, y: number, toX: number, toY: number, color: string, width = 5, life = .26, jagged = false) {
    spawnSkillEffect("streak", x, y, toX, toY, life, width, color, 0, jagged);
  }

  function spawnSkillRing(x: number, y: number, color: string, radius = 26, life = .3) {
    spawnSkillEffect("ring", x, y, x, y, life, radius, color);
  }

  function update(dt: number) {
    for (const effect of skillEffects) {
      if (effect.delay > 0) effect.delay = Math.max(0, effect.delay - dt);
      else effect.life -= dt;
    }
    for (let index = skillEffects.length - 1; index >= 0; index -= 1) {
      if (skillEffects[index].life > 0) continue;
      const expired = skillEffects[index];
      const last = skillEffects.pop()!;
      if (index < skillEffects.length) skillEffects[index] = last;
      if (skillEffectPool.length < MAX_SKILL_EFFECTS) skillEffectPool.push(expired);
    }
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
      number.life = Math.max(0, number.life - dt);
      const elapsed = number.maxLife - number.life;
      const riseProgress = clamp(elapsed / DAMAGE_NUMBER_RISE_DURATION, 0, 1);
      const easedRise = 1 - Math.pow(1 - riseProgress, 3);
      number.y = number.startY - DAMAGE_NUMBER_RISE_DISTANCE * easedRise;
      const fadeProgress = clamp((elapsed - DAMAGE_NUMBER_RISE_DURATION) / DAMAGE_NUMBER_FADE_DURATION, 0, 1);
      number.opacity = 1 - fadeProgress;
    }
    for (let index = damageNumbers.length - 1; index >= 0; index -= 1) {
      if (damageNumbers[index].life > 0) continue;
      const expired = damageNumbers[index];
      const last = damageNumbers.pop()!;
      if (index < damageNumbers.length) damageNumbers[index] = last;
      if (damageNumberPool.length < MAX_DAMAGE_NUMBERS) damageNumberPool.push(expired);
    }
  }

  function drawParticles(ctx: CanvasRenderingContext2D, camera: CameraPosition, devicePixelRatio = 1) {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / (particle.maxLife || 1), 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(
        snapWorldRenderCoordinate(particle.x - camera.x, camera.zoom, devicePixelRatio),
        snapWorldRenderCoordinate(particle.y - camera.y, camera.zoom, devicePixelRatio),
        particle.size,
        particle.size,
      );
    }
    ctx.globalAlpha = 1;
  }

  function drawSkillEffects(ctx: CanvasRenderingContext2D, camera: CameraPosition) {
    if (!skillEffects.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const effect of skillEffects) {
      if (effect.delay > 0) continue;
      const progress = 1 - clamp(effect.life / (effect.maxLife || 1), 0, 1);
      const fade = 1 - progress;
      const x = effect.x - camera.x, y = effect.y - camera.y;
      const toX = effect.toX - camera.x, toY = effect.toY - camera.y;
      if (effect.kind === "arrow") {
        // The head runs along the curve; a glowing tail traces the path behind it.
        const controlX = effect.controlX - camera.x, controlY = effect.controlY - camera.y;
        const at = (t: number): [number, number] => {
          const u = 1 - t;
          return [u * u * x + 2 * u * t * controlX + t * t * toX, u * u * y + 2 * u * t * controlY + t * t * toY];
        };
        const head = progress, tail = Math.max(0, head - .45);
        const path: [number, number][] = [];
        for (let step = 0; step <= 8; step++) path.push(at(tail + (head - tail) * step / 8));
        for (const [alpha, width, color] of [[.35, effect.width * 3, effect.color], [1, effect.width, "#ffffff"]] as const) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(path[0][0], path[0][1]);
          for (const [pointX, pointY] of path.slice(1)) ctx.lineTo(pointX, pointY);
          ctx.stroke();
        }
        const [headX, headY] = path[path.length - 1];
        const [beforeX, beforeY] = at(Math.max(0, head - .02));
        const angle = Math.atan2(headY - beforeY, headX - beforeX);
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.moveTo(headX + Math.cos(angle) * 9, headY + Math.sin(angle) * 9);
        ctx.lineTo(headX + Math.cos(angle + 2.5) * 7, headY + Math.sin(angle + 2.5) * 7);
        ctx.lineTo(headX + Math.cos(angle - 2.5) * 7, headY + Math.sin(angle - 2.5) * 7);
        ctx.closePath(); ctx.fill();
      } else if (effect.kind === "streak") {
        const points: [number, number][] = [[x, y]];
        if (effect.jagged) {
          const length = Math.hypot(toX - x, toY - y) || 1;
          const normalX = -(toY - y) / length, normalY = (toX - x) / length;
          for (let step = 1; step < 6; step++) {
            // A fixed zigzag per streak: the same seed every frame keeps it from shimmering.
            const offset = Math.sin((effect.x + effect.toY) * .37 + step * 2.3) * 9;
            points.push([x + (toX - x) * step / 6 + normalX * offset, y + (toY - y) * step / 6 + normalY * offset]);
          }
        }
        points.push([toX, toY]);
        for (const [alpha, width, color] of [[.3 * fade, effect.width * 3.2, effect.color], [fade, effect.width * fade + 1, "#ffffff"]] as const) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          for (const [pointX, pointY] of points.slice(1)) ctx.lineTo(pointX, pointY);
          ctx.stroke();
        }
      } else {
        ctx.globalAlpha = fade * .9;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3 * fade + 1;
        ctx.beginPath();
        ctx.ellipse(x, y, effect.width * (.35 + progress * .9), effect.width * (.18 + progress * .45), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDamageNumbers(ctx: CanvasRenderingContext2D, camera: CameraPosition, outlinedText: OutlinedText, devicePixelRatio = 1) {
    drawSkillEffects(ctx, camera);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const number of damageNumbers) {
      const x = snapWorldRenderCoordinate(number.x - camera.x, camera.zoom, devicePixelRatio);
      const y = snapWorldRenderCoordinate(number.y - camera.y, camera.zoom, devicePixelRatio);
      drawScreenSpaceAt(ctx, camera.zoom, x, y, () => {
        ctx.globalAlpha = number.opacity;
        ctx.font = number.critical
          ? '900 22px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif'
          : '900 20px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
        outlinedText(
          number.text,
          0,
          0,
          number.damageTaken ? "#ff5a5a" : number.critical ? "#ffe36b" : "#ffffff",
          4,
        );
      });
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
    while (skillEffects.length) {
      const effect = skillEffects.pop()!;
      if (skillEffectPool.length < MAX_SKILL_EFFECTS) skillEffectPool.push(effect);
    }
  }

  return { particles, damageNumbers, skillEffects, spawnParticle, spawnBurst, spawnDamageNumber, spawnArcingArrow, spawnSkillStreak, spawnSkillRing,
    update, drawParticles, drawDamageNumbers, clearParticles, clearDamageNumbers, clear };
}
