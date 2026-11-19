import type { CrossingSide, GuildCrossingSnapshot } from "../../../../shared/guild-crossing";

export type CrossingShard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
};

export type CrossingPop = {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
  speech?: boolean;
};

export type CrossingShockwave = {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
};

export type CrossingFallAnim = {
  active: boolean;
  progress: number;
  elapsed: number;
  direction: number;
  cry: string;
};

const FALL_CRIES = [
  "NOOOOO!!",
  "IT WAS THE OTHER ONE!!",
  "MY TRY!!",
  "AVENGE ME!!",
  "TELL THE GUILD!!",
  "WORTH IT!!",
];

/**
 * Shared live render state for the playable in-world Glass Crossing map.
 * Owned by `guild-crossing-runtime.ts` and read by `guild-crossing-render.ts`.
 */
export const guildCrossingScene: {
  snapshot: GuildCrossingSnapshot | null;
  stepping: { step: number; side: CrossingSide; progress: number } | null;
  fall: CrossingFallAnim;
  hop: { left: number; duration: number };
  safeFlash: { step: number; side: CrossingSide; left: number } | null;
  banner: { text: string; color: string; left: number } | null;
  shake: { intensity: number; left: number; duration: number };
  shards: CrossingShard[];
  pops: CrossingPop[];
  shockwaves: CrossingShockwave[];
} = {
  snapshot: null,
  stepping: null,
  fall: { active: false, progress: 0, elapsed: 0, direction: 1, cry: "NOOOOO!!" },
  hop: { left: 0, duration: 0.22 },
  safeFlash: null,
  banner: null,
  shake: { intensity: 0, left: 0, duration: 0.3 },
  shards: [],
  pops: [],
  shockwaves: [],
};

export function pickCrossingFallCry(step: number, name = ""): string {
  let hash = step * 31;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
  return FALL_CRIES[hash % FALL_CRIES.length];
}

export function resetGuildCrossingScene() {
  guildCrossingScene.snapshot = null;
  guildCrossingScene.stepping = null;
  guildCrossingScene.fall = { active: false, progress: 0, elapsed: 0, direction: 1, cry: "NOOOOO!!" };
  guildCrossingScene.hop = { left: 0, duration: 0.22 };
  guildCrossingScene.safeFlash = null;
  guildCrossingScene.banner = null;
  guildCrossingScene.shake = { intensity: 0, left: 0, duration: 0.3 };
  guildCrossingScene.shards = [];
  guildCrossingScene.pops = [];
  guildCrossingScene.shockwaves = [];
}

/** Triggers a crisp tactile hop arc when jumping onto a floating glass slab. */
export function triggerCrossingHop(duration = 0.22) {
  guildCrossingScene.hop = { left: duration, duration };
}

/** Triggers a punchy camera shake for glass crackle tension or explosive shatters. */
export function triggerCrossingShake(intensity: number, duration = 0.35) {
  guildCrossingScene.shake = { intensity, left: duration, duration };
}

/** Spawns a burst of spinning cel-shaded crystal shards when fragile glass shatters. */
export function spawnCrossingShards(x: number, y: number, count = 34, palette?: readonly string[]) {
  const colors = palette ?? ["#c4f8ff", "#7ee7f7", "#ffffff", "#7db2ff", "#ff9ea9"];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55;
    const speed = 75 + Math.random() * 240;
    const maxLife = 0.65 + Math.random() * 0.6;
    guildCrossingScene.shards.push({
      x: x + (Math.random() - 0.5) * 86,
      y: y + (Math.random() - 0.5) * 56,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 65,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 15,
      size: 6 + Math.random() * 11,
      life: maxLife,
      maxLife,
      color: colors[i % colors.length],
    });
  }
}

/** Spawns a crisp world-space comic popup ("STREAK ×3!!", "+2 PTS", or a dramatic fall cry). */
export function spawnCrossingPop(x: number, y: number, text: string, color: string, scale = 1, speech = false) {
  guildCrossingScene.pops.push({
    x,
    y,
    vy: speech ? -34 : -48,
    text,
    color,
    scale,
    life: speech ? 1.55 : 1.35,
    maxLife: speech ? 1.55 : 1.35,
    speech,
  });
}

/** Spawns an expanding glowing shockwave ring on safe holds or Victory Portal clears. */
export function spawnCrossingShockwave(x: number, y: number, color: string, maxRadius = 118) {
  guildCrossingScene.shockwaves.push({
    x,
    y,
    radius: 16,
    maxRadius,
    color,
    life: 0.52,
    maxLife: 0.52,
  });
}

/** Advances flying crystal shards, shockwaves, pops, shake, flashes, and banners. */
export function stepCrossingEffects(dt: number) {
  for (let i = guildCrossingScene.shards.length - 1; i >= 0; i--) {
    const s = guildCrossingScene.shards[i];
    s.life -= dt;
    if (s.life <= 0) { guildCrossingScene.shards.splice(i, 1); continue; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 420 * dt;
    s.rot += s.vrot * dt;
  }
  for (let i = guildCrossingScene.pops.length - 1; i >= 0; i--) {
    const p = guildCrossingScene.pops[i];
    p.life -= dt;
    if (p.life <= 0) { guildCrossingScene.pops.splice(i, 1); continue; }
    p.y += p.vy * dt;
    p.vy *= Math.max(0.2, 1 - dt * 1.4);
  }
  for (let i = guildCrossingScene.shockwaves.length - 1; i >= 0; i--) {
    const w = guildCrossingScene.shockwaves[i];
    w.life -= dt;
    if (w.life <= 0) { guildCrossingScene.shockwaves.splice(i, 1); continue; }
    const progress = 1 - w.life / w.maxLife;
    w.radius = 16 + (w.maxRadius - 16) * (1 - (1 - progress) * (1 - progress));
  }
  if (guildCrossingScene.hop.left > 0) {
    guildCrossingScene.hop.left = Math.max(0, guildCrossingScene.hop.left - dt);
  }
  if (guildCrossingScene.shake.left > 0) {
    guildCrossingScene.shake.left = Math.max(0, guildCrossingScene.shake.left - dt);
  }
  if (guildCrossingScene.safeFlash) {
    guildCrossingScene.safeFlash.left -= dt;
    if (guildCrossingScene.safeFlash.left <= 0) guildCrossingScene.safeFlash = null;
  }
  if (guildCrossingScene.banner) {
    guildCrossingScene.banner.left -= dt;
    if (guildCrossingScene.banner.left <= 0) guildCrossingScene.banner = null;
  }
}
