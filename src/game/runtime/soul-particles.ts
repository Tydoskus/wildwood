import { SOUL_VILLAGE_EMITTERS, type SoulEmitter } from "../soul-village";
import type { Camera } from "./camera";
import { soulFrame } from "./soul-prop-renderer";

type Particle = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; rotation: number; spin: number; phase: number };
type Running = { emitter: SoulEmitter; particles: Particle[]; owed: number };

const TINT_STEPS = 12;
const random = (range: readonly number[]) => range[0] + Math.random() * ((range[1] ?? range[0]) - range[0]);

/** A gradient's value at t, from Unity's keys ([time, ...values]). */
function sample(keys: readonly (readonly number[])[], t: number, width: number) {
  if (!keys.length) return new Array(width).fill(1);
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i], f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a.slice(1).map((value, index) => value + (b[index + 1] - value) * f);
    }
  }
  return keys[keys.length - 1].slice(1);
}

/**
 * The village's particles, the pack's own (chimney smoke, campfire smoke and
 * sparks): each emitter runs Unity's settings (rate, lifetime, rise, size
 * over life, colour and alpha over life, spin, a little noise) while it is
 * near the camera. Drawn over the world, as Unity's higher sorting order put them.
 */
export function createSoulParticles(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  image: () => HTMLImageElement | undefined;
  viewport: () => { width: number; height: number };
  time: () => number;
  active: () => boolean;
}) {
  const running = SOUL_VILLAGE_EMITTERS.map(emitter => ({ emitter, particles: [], owed: 0 } as Running));
  const tinted = new Map<string, HTMLCanvasElement>();
  let lastTime = Number.NaN;

  /** The emitter's sprite in one of a few steps of its colour, made once: a canvas cannot tint per draw. */
  function tintedSprite(emitter: SoulEmitter, image: HTMLImageElement, step: number) {
    const key = `${emitter.frame}:${step}:${emitter.color ? JSON.stringify(emitter.color.colors) : ""}`;
    let canvas = tinted.get(key);
    if (canvas) return canvas;
    const frame = soulFrame(String(emitter.frame), "village");
    canvas = document.createElement("canvas");
    canvas.width = frame?.w ?? 1; canvas.height = frame?.h ?? 1;
    const context = canvas.getContext("2d");
    if (context && frame) {
      context.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      const [r, g, b] = sample(emitter.color?.colors ?? [[0, 1, 1, 1]], step / (TINT_STEPS - 1), 3);
      const [sr, sg, sb] = sample(emitter.startColor.colors, 0, 3);
      context.globalCompositeOperation = "multiply";
      context.fillStyle = `rgb(${Math.round(r * sr * 255)},${Math.round(g * sg * 255)},${Math.round(b * sb * 255)})`;
      context.fillRect(0, 0, frame.w, frame.h);
      context.globalCompositeOperation = "destination-in";
      context.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    }
    tinted.set(key, canvas);
    return canvas;
  }

  function spawn(emitter: SoulEmitter): Particle {
    const angle = Math.random() * Math.PI * 2, radius = Math.sqrt(Math.random()) * emitter.shape.radius;
    const speed = random(emitter.speed);
    return {
      x: emitter.x + Math.cos(angle) * radius, y: emitter.y + Math.sin(angle) * radius,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      age: 0, life: Math.max(.05, random(emitter.lifetime)), size: random(emitter.size),
      rotation: random(emitter.rotation), spin: random(emitter.spin), phase: Math.random() * 100,
    };
  }

  return function drawSoulParticles() {
    if (!options.active()) { lastTime = Number.NaN; return; }
    const image = options.image();
    if (!image?.complete || image.naturalWidth <= 0) return;
    const now = options.time();
    const dt = Number.isFinite(lastTime) ? Math.max(0, Math.min(.1, now - lastTime)) : 0;
    lastTime = now;
    const { ctx, camera } = options;
    const view = options.viewport();
    const left = camera.x - 400, right = camera.x + view.width / camera.zoom + 400;
    const top = camera.y - 600, bottom = camera.y + view.height / camera.zoom + 400;
    for (const run of running) {
      const { emitter } = run;
      if (emitter.x < left || emitter.x > right || emitter.y < top || emitter.y > bottom) { run.particles.length = 0; run.owed = 0; continue; }
      run.owed += emitter.rate * dt;
      while (run.owed >= 1) { run.owed -= 1; if (run.particles.length < emitter.max) run.particles.push(spawn(emitter)); }
      const startAlpha = sample(emitter.startColor.alphas, 0, 1)[0];
      ctx.save();
      if (emitter.additive) ctx.globalCompositeOperation = "lighter";
      for (let index = run.particles.length - 1; index >= 0; index--) {
        const p = run.particles[index];
        p.age += dt;
        if (p.age >= p.life) { run.particles.splice(index, 1); continue; }
        p.vy += emitter.gravity * dt;
        p.x += (p.vx + (emitter.noise ? Math.sin(p.phase + p.age * 3) * emitter.noise : 0)) * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        const t = p.age / p.life;
        const alpha = startAlpha * (emitter.color ? sample(emitter.color.alphas, t, 1)[0] : 1);
        const size = p.size * (emitter.sizeCurve ? sample(emitter.sizeCurve, t, 1)[0] : 1);
        if (alpha <= .002 || size <= .5) continue;
        const sprite = tintedSprite(emitter, image, emitter.color ? Math.round(t * (TINT_STEPS - 1)) : 0);
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.translate(p.x - camera.x, p.y - camera.y);
        ctx.rotate(-p.rotation);
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.restore();
    }
  };
}
