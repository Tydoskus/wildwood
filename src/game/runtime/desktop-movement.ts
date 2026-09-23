type Point = { x: number; y: number };
export type DesktopMovementOptions = {
  canMove: () => boolean;
  player: () => Point;
  speed: () => number;
  view: () => { x: number; y: number; zoom: number; width: number; height: number };
  bounds: () => { width: number; height: number; inset: number };
};

/** Clicks keep a world destination; holding steers toward the cursor as the camera moves. */
export function createDesktopMovement(canvas: HTMLCanvasElement, options: DesktopMovementOptions,
  onTapPlayer: (x: number, y: number) => boolean | void) {
  let target: Point | null = null;
  let held: { id: number; x: number; y: number; startX: number; startY: number; at: number; dragged: boolean } | null = null;
  let lastPosition: Point | null = null;
  let blockedSeconds = 0;

  function clear() { target = null; held = null; lastPosition = null; blockedSeconds = 0; }
  function worldPoint(x: number, y: number): Point | null {
    const rect = canvas.getBoundingClientRect(), view = options.view(), bounds = options.bounds();
    if (!rect.width || !rect.height || view.zoom <= 0) return null;
    return {
      x: Math.max(bounds.inset, Math.min(bounds.width - bounds.inset, view.x + (x - rect.left) * view.width / rect.width / view.zoom)),
      y: Math.max(bounds.inset, Math.min(bounds.height - bounds.inset, view.y + (y - rect.top) * view.height / rect.height / view.zoom)),
    };
  }

  // Only a primary mouse/pen press on the canvas starts movement. UI presses cancel it.
  window.addEventListener("pointerdown", event => { if (event.target !== canvas) clear(); }, true);
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch" || event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey || event.altKey) return;
    clear();
    if (onTapPlayer(event.clientX, event.clientY) || !options.canMove()) return;
    event.preventDefault();
    target = worldPoint(event.clientX, event.clientY);
    held = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, at: performance.now(), dragged: false };
    canvas.setPointerCapture(event.pointerId);
  });
  window.addEventListener("pointermove", event => {
    if (!held || event.pointerId !== held.id) return;
    if (!(event.buttons & 1)) { clear(); return; }
    held.x = event.clientX; held.y = event.clientY;
    held.dragged ||= Math.hypot(held.x - held.startX, held.y - held.startY) > 5;
  });
  window.addEventListener("pointerup", event => {
    if (!held || event.pointerId !== held.id) return;
    if (event.target !== canvas || held.dragged || performance.now() - held.at >= 200) { clear(); return; }
    // Freeze a quick click in world space, rather than chasing a scrolling screen point.
    target = worldPoint(event.clientX, event.clientY);
    held = null;
  });
  window.addEventListener("pointercancel", clear);

  return {
    clear,
    movement(dt = 0): Point {
      if (!options.canMove()) clear();
      if (held) target = worldPoint(held.x, held.y);
      if (!target) return { x: 0, y: 0 };
      const player = options.player(), dx = target.x - player.x, dy = target.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1) {
        if (!held) clear();
        return { x: 0, y: 0 };
      }
      // Stop a clicked route against a wall/boss instead of walking forever.
      // Presentation-only reads don't advance this timer.
      if (dt > 0 && !held) {
        blockedSeconds = lastPosition && Math.hypot(player.x - lastPosition.x, player.y - lastPosition.y) < .01 ? blockedSeconds + dt : 0;
        lastPosition = { x: player.x, y: player.y };
        if (blockedSeconds >= .75) { clear(); return { x: 0, y: 0 }; }
      }
      const step = Math.max(.001, options.speed() * (dt > 0 ? dt : 1 / 60));
      const magnitude = Math.min(1, distance / step);
      return { x: dx / distance * magnitude, y: dy / distance * magnitude };
    },
  };
}
