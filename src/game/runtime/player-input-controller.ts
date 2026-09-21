import { createDesktopMovement, type DesktopMovementOptions } from "./desktop-movement";

/**
 * "keyboard" is eight-way WASD: the vector only changes when a key does, so a
 * change is sent at once. "touch" and "steer" turn continuously; "steer" is
 * movement the game or the mouse aims (autofarm walking a route, click-to-move),
 * whose vector turns a little every frame. Reported as "keyboard" it sent a
 * packet on every one of those frames; it is rate-limited like touch instead.
 */
export type MovementInputSource = "keyboard" | "touch" | "steer" | "none";
export type Movement = { x: number; y: number; source: MovementInputSource };

export type PlayerInputController = {
  movement: (dt?: number) => Movement;
  clear: () => void;
  stopTouchMove: () => void;
  keys: { clear: () => void };
};

const JOYSTICK_RADIUS = 59;
export const JOYSTICK_DEAD_ZONE = 8;
export const JOYSTICK_MAXIMUM = 38;

export type RadialJoystickInput = {
  x: number;
  y: number;
  stickX: number;
  stickY: number;
  moved: boolean;
};

/** Maps touch distance to analog speed after a radial noise dead zone. */
export function radialJoystickInput(
  dx: number,
  dy: number,
  deadZone = JOYSTICK_DEAD_ZONE,
  maximum = JOYSTICK_MAXIMUM,
): RadialJoystickInput {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance === 0) {
    return { x: 0, y: 0, stickX: 0, stickY: 0, moved: false };
  }
  const safeMaximum = Math.max(1, maximum);
  const safeDeadZone = Math.max(0, Math.min(deadZone, safeMaximum - Number.EPSILON));
  const stickDistance = Math.min(distance, safeMaximum);
  const directionX = dx / distance;
  const directionY = dy / distance;
  const magnitude = distance <= safeDeadZone
    ? 0
    : Math.min(1, (stickDistance - safeDeadZone) / (safeMaximum - safeDeadZone));
  return {
    x: directionX * magnitude,
    y: directionY * magnitude,
    stickX: directionX * stickDistance,
    stickY: directionY * stickDistance,
    moved: distance > safeDeadZone,
  };
}

const SLIDER_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];

/**
 * Text fields own the whole keyboard; a slider owns only the keys it acts on.
 * A range input keeps focus after its thumb is dragged, so treating it like a
 * text field would leave a player unable to walk until they clicked elsewhere.
 */
export function swallowsGameKeys(target: EventTarget | null, code: string): boolean {
  const element = target as HTMLInputElement | null;
  if (element?.tagName === "TEXTAREA") return true;
  if (element?.tagName !== "INPUT") return false;
  return element.type === "range" ? SLIDER_KEYS.includes(code) : true;
}

/** Owns keyboard, desktop pointing, touch joystick, player taps, and zoom prevention. */
export function createPlayerInputController(options: {
  canvas: HTMLCanvasElement;
  joystick: HTMLElement;
  stick: HTMLElement;
  running: () => boolean;
  onTapPlayer: (clientX: number, clientY: number) => boolean | void;
  onEscape: () => boolean;
  desktop?: DesktopMovementOptions;
}): PlayerInputController {
  const { canvas, joystick, stick, running, onTapPlayer, onEscape } = options;
  const keys = new Set<string>();
  const desktop = options.desktop && createDesktopMovement(canvas, options.desktop, onTapPlayer);
  const touch = { active: false, id: null as number | null, originX: 0, originY: 0, x: 0, y: 0, moved: false };

  function clear() {
    keys.clear();
    stopTouchMove();
  }

  function stopTouchMove() {
    // Existing travel/modal callers stop all pointing input, including a click destination.
    desktop?.clear();
    touch.active = false;
    touch.id = null;
    touch.x = 0;
    touch.y = 0;
    touch.moved = false;
    stick.style.transform = "translate3d(0, 0, 0)";
    joystick.style.opacity = "0";
  }

  function beginTouch(event: TouchEvent) {
    if (!running() || touch.active) return;
    const point = event.changedTouches[0];
    if (!point) return;
    desktop?.clear();
    touch.active = true;
    touch.id = point.identifier;
    touch.originX = point.clientX;
    touch.originY = point.clientY;
    touch.x = 0;
    touch.y = 0;
    touch.moved = false;
    joystick.style.transform = `translate3d(${point.clientX - JOYSTICK_RADIUS}px, ${point.clientY - JOYSTICK_RADIUS}px, 0)`;
    joystick.style.opacity = "1";
  }

  function moveTouch(event: TouchEvent) {
    if (!touch.active) return;
    for (const point of event.changedTouches) {
      if (point.identifier !== touch.id) continue;
      const input = radialJoystickInput(point.clientX - touch.originX, point.clientY - touch.originY);
      if (input.moved) touch.moved = true;
      touch.x = input.x;
      touch.y = input.y;
      stick.style.transform = `translate3d(${input.stickX}px, ${input.stickY}px, 0)`;
      return;
    }
  }

  function endTouch(event: TouchEvent) {
    if (!touch.active) return;
    for (const point of event.changedTouches) {
      if (point.identifier !== touch.id) continue;
      const wasTap = !touch.moved;
      stopTouchMove();
      if (wasTap) onTapPlayer(point.clientX, point.clientY);
      return;
    }
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") { desktop?.clear(); if (onEscape()) return; }
    if (swallowsGameKeys(event.target, event.code)) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (["KeyA", "KeyD", "KeyW", "KeyS", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) desktop?.clear();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => clear());
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  window.addEventListener("wheel", (event) => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  canvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
    beginTouch(event);
  }, { passive: false });
  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
    moveTouch(event);
  }, { passive: false });
  canvas.addEventListener("touchend", endTouch, { passive: false });
  canvas.addEventListener("touchcancel", stopTouchMove, { passive: false });
  canvas.addEventListener("click", (event) => {
    // Mouse/pen taps are handled on press; touch taps use touchend.
    if (!desktop || event.detail === 0) onTapPlayer(event.clientX, event.clientY);
  });

  return {
    movement: (dt) => {
      const left = keys.has("KeyA") || keys.has("ArrowLeft");
      const right = keys.has("KeyD") || keys.has("ArrowRight");
      const up = keys.has("KeyW") || keys.has("ArrowUp");
      const down = keys.has("KeyS") || keys.has("ArrowDown");
      const keyboard = left || right || up || down;
      if (keyboard || touch.active) desktop?.clear();
      const pointing = !keyboard && !touch.active ? desktop?.movement(dt) : undefined;
      if (pointing && (pointing.x || pointing.y)) {
        // The pointer aims a continuously turning vector: see MovementInputSource.
        return { ...pointing, source: "steer" };
      }
      return {
        x: (right ? 1 : 0) - (left ? 1 : 0) + touch.x,
        y: (down ? 1 : 0) - (up ? 1 : 0) + touch.y,
        source: touch.active ? "touch" : left || right || up || down ? "keyboard" : "none",
      };
    },
    clear,
    stopTouchMove,
    keys,
  };
}
