type Positioned = { x: number; y: number; r: number };

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function randi(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

export function distanceSquared(a: Positioned, b: Positioned) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function circlesOverlap(a: Positioned, b: Positioned) {
  const radius = a.r + b.r;
  return distanceSquared(a, b) < radius * radius;
}
