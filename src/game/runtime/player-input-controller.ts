export type MovementInputSource = "keyboard" | "touch" | "none";
export type Movement = { x: number; y: number; source: MovementInputSource };

export type PlayerInputController = {
  movement: () => Movement;
  clear: () => void;
  stopTouchMove: () => void;
  keys: { clear: () => void };
};

/** Owns keyboard, touch joystick, player taps, and browser zoom prevention. */
export function createPlayerInputController(options: {
  canvas: HTMLCanvasElement;
  joystick: HTMLElement;
  stick: HTMLElement;
  running: () => boolean;
  onTapPlayer: (clientX: number, clientY: number) => void;
  onEscape: () => boolean;
}): PlayerInputController {
  const { canvas, joystick, stick, running, onTapPlayer, onEscape } = options;
  const keys = new Set<string>();
  const touch = { active: false, id: null as number | null, originX: 0, originY: 0, x: 0, y: 0, moved: false };

  function clear() {
    keys.clear();
    stopTouchMove();
  }

  function stopTouchMove() {
    touch.active = false;
    touch.id = null;
    touch.x = 0;
    touch.y = 0;
    touch.moved = false;
    stick.style.transform = "translate(0,0)";
    joystick.style.display = "none";
  }

  function beginTouch(event: TouchEvent) {
    if (!running() || touch.active) return;
    const point = event.changedTouches[0];
    if (!point) return;
    touch.active = true;
    touch.id = point.identifier;
    touch.originX = point.clientX;
    touch.originY = point.clientY;
    touch.x = 0;
    touch.y = 0;
    touch.moved = false;
    joystick.style.left = `${point.clientX - 59}px`;
    joystick.style.top = `${point.clientY - 59}px`;
    joystick.style.bottom = "auto";
    joystick.style.display = "block";
  }

  function moveTouch(event: TouchEvent) {
    if (!touch.active) return;
    for (const point of event.changedTouches) {
      if (point.identifier !== touch.id) continue;
      let dx = point.clientX - touch.originX;
      let dy = point.clientY - touch.originY;
      const distance = Math.hypot(dx, dy);
      if (distance > 8) touch.moved = true;
      const maximum = 38;
      if (distance > maximum) { dx = dx / distance * maximum; dy = dy / distance * maximum; }
      touch.x = dx / maximum;
      touch.y = dy / maximum;
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
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
    if (event.code === "Escape" && onEscape()) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => clear());
  window.addEventListener("wheel", (event) => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length > 1) event.preventDefault();
    beginTouch(event);
  }, { passive: false });
  canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) event.preventDefault();
    moveTouch(event);
  }, { passive: false });
  canvas.addEventListener("touchend", endTouch, { passive: false });
  canvas.addEventListener("touchcancel", endTouch, { passive: false });
  canvas.addEventListener("click", (event) => onTapPlayer(event.clientX, event.clientY));

  return {
    movement: () => {
      const left = keys.has("KeyA") || keys.has("ArrowLeft");
      const right = keys.has("KeyD") || keys.has("ArrowRight");
      const up = keys.has("KeyW") || keys.has("ArrowUp");
      const down = keys.has("KeyS") || keys.has("ArrowDown");
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
