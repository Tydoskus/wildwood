export const ITEM_INSPECTION_HOLD_MS = 600;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

type LongPressOptions = {
  onPress?: () => void;
  onLongPress: () => void;
  durationMs?: number;
  moveTolerancePx?: number;
};

export function movedBeyondLongPressTolerance(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  tolerancePx = LONG_PRESS_MOVE_TOLERANCE_PX,
) {
  const deltaX = currentX - startX;
  const deltaY = currentY - startY;
  return deltaX * deltaX + deltaY * deltaY > tolerancePx * tolerancePx;
}

/**
 * Adds a scroll-safe long-press gesture to any element. The click generated
 * after a completed hold is consumed so callers can keep a separate tap action.
 */
export function bindLongPress(element: HTMLElement, options: LongPressOptions) {
  const durationMs = Math.max(0, options.durationMs ?? ITEM_INSPECTION_HOLD_MS);
  const moveTolerancePx = Math.max(0, options.moveTolerancePx ?? LONG_PRESS_MOVE_TOLERANCE_PX);
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let timer = 0;
  let suppressNextClick = false;

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const stopPointerTracking = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  };

  const cancelGesture = (preserveClickSuppression = false) => {
    clearTimer();
    stopPointerTracking();
    activePointerId = null;
    if (!preserveClickSuppression) suppressNextClick = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    cancelGesture();
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    timer = window.setTimeout(() => {
      if (activePointerId !== event.pointerId) return;
      timer = 0;
      suppressNextClick = true;
      options.onLongPress();
    }, durationMs);
    options.onPress?.();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    if (movedBeyondLongPressTolerance(startX, startY, event.clientX, event.clientY, moveTolerancePx)) {
      cancelGesture();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    const preserveClickSuppression = suppressNextClick;
    cancelGesture(preserveClickSuppression);
    if (preserveClickSuppression) {
      // A long press may open an overlay before release, retargeting the
      // synthesized click away from this element. Do not suppress a later tap.
      window.setTimeout(() => { suppressNextClick = false; }, 0);
    }
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId === activePointerId) cancelGesture();
  };

  const onClick = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("click", onClick, { capture: true });
  element.addEventListener("contextmenu", onContextMenu);

  return () => {
    cancelGesture();
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("click", onClick, { capture: true });
    element.removeEventListener("contextmenu", onContextMenu);
  };
}
