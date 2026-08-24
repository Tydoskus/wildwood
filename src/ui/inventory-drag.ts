import { itemFitsEquipmentSlot, type EquipmentSlot } from "../game/inventory";
import { itemArtMarkup } from "../game/item-presentation";

export type InventoryDragLocation = EquipmentSlot | "BAG";

export const INVENTORY_TOUCH_DRAG_ARM_MS = 180;
export const INVENTORY_DRAG_START_DISTANCE_PX = 8;
const INVENTORY_SCROLL_CANCEL_DISTANCE_PX = 12;
const INVENTORY_DRAG_CLICK_SUPPRESSION_MS = 500;

type DragSource = {
  element: HTMLElement;
  itemId: string;
  location: InventoryDragLocation;
};

type ActiveGesture = DragSource & {
  kind: "POINTER" | "TOUCH";
  pointerId: number;
  startX: number;
  startY: number;
  armed: boolean;
  dragging: boolean;
};

type DropTarget = {
  element: HTMLElement;
  destination: InventoryDragLocation | null;
};

export function inventoryDragDestination(
  itemId: string,
  source: InventoryDragLocation,
  candidate: InventoryDragLocation | null,
): InventoryDragLocation | null {
  if (!itemId || !candidate || candidate === source) return null;
  if (candidate === "BAG") return source === "BAG" ? null : "BAG";
  return itemFitsEquipmentSlot(itemId, candidate) ? candidate : null;
}

function inventoryDragLocation(value: string | undefined): InventoryDragLocation | null {
  return value === "BAG" || value === "HEAD" || value === "CHEST" || value === "FEET" ||
    value === "RIGHT_HAND" || value === "LEFT_HAND"
    ? value
    : null;
}

function movedFarEnough(startX: number, startY: number, x: number, y: number, distance: number) {
  const dx = x - startX;
  const dy = y - startY;
  return dx * dx + dy * dy >= distance * distance;
}

/**
 * Adds one mouse-and-touch drag layer over the inventory's existing tap and
 * long-press controls. Touch waits briefly before arming so a normal swipe
 * still scrolls the bag, while a stationary hold can continue into inspection.
 */
export function bindInventoryDrag(options: {
  panel: HTMLElement;
  bagItems: HTMLElement;
  onDrop: (itemId: string, destination: InventoryDragLocation) => void;
}) {
  const { panel, bagItems } = options;
  let active: ActiveGesture | null = null;
  let armTimer = 0;
  let ghost: HTMLElement | null = null;
  let hoveredTarget: HTMLElement | null = null;
  let suppressClicksUntil = 0;

  const sourceFromTarget = (target: EventTarget | null): DragSource | null => {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>("[data-inventory-drag-source]");
    if (!element || !panel.contains(element)) return null;
    const itemId = element.dataset.itemId ?? "";
    const location = inventoryDragLocation(element.dataset.inventoryLocation);
    return itemId && location ? { element, itemId, location } : null;
  };

  const dropTargetAt = (x: number, y: number, gesture: ActiveGesture): DropTarget | null => {
    const hit = document.elementFromPoint(x, y);
    const element = hit?.closest<HTMLElement>("[data-inventory-drop]") ?? null;
    if (!element || !panel.contains(element)) return null;
    const candidate = inventoryDragLocation(element.dataset.inventoryDrop);
    return {
      element,
      destination: inventoryDragDestination(gesture.itemId, gesture.location, candidate),
    };
  };

  const clearArmTimer = () => {
    if (armTimer) window.clearTimeout(armTimer);
    armTimer = 0;
  };

  const clearTargetClasses = () => {
    hoveredTarget = null;
    panel.querySelectorAll<HTMLElement>(".is-drag-valid, .is-drag-invalid, .is-drag-over").forEach((element) => {
      element.classList.remove("is-drag-valid", "is-drag-invalid", "is-drag-over");
    });
  };

  const clearDragUi = () => {
    active?.element.classList.remove("is-drag-armed", "is-drag-source");
    active?.element.removeAttribute("aria-grabbed");
    panel.classList.remove("is-dragging");
    document.body.classList.remove("inventory-dragging");
    clearTargetClasses();
    ghost?.remove();
    ghost = null;
  };

  const stopPointerTracking = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  };

  const stopTouchTracking = () => {
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchCancel);
  };

  const resetGesture = () => {
    clearArmTimer();
    stopPointerTracking();
    stopTouchTracking();
    clearDragUi();
    active = null;
  };

  const armGesture = () => {
    if (!active) return;
    active.armed = true;
    active.element.classList.add("is-drag-armed");
  };

  const positionGhost = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  };

  const highlightDestinations = (gesture: ActiveGesture) => {
    panel.querySelectorAll<HTMLElement>("[data-inventory-drop]").forEach((element) => {
      const candidate = inventoryDragLocation(element.dataset.inventoryDrop);
      const destination = inventoryDragDestination(gesture.itemId, gesture.location, candidate);
      element.classList.toggle("is-drag-valid", Boolean(destination));
      element.classList.toggle("is-drag-invalid", Boolean(candidate && candidate !== "BAG" && candidate !== gesture.location && !destination));
    });
  };

  const beginDrag = (gesture: ActiveGesture, x: number, y: number) => {
    gesture.dragging = true;
    gesture.element.classList.remove("is-drag-armed");
    gesture.element.classList.add("is-drag-source");
    gesture.element.setAttribute("aria-grabbed", "true");
    panel.classList.add("is-dragging");
    document.body.classList.add("inventory-dragging");
    ghost = document.createElement("div");
    ghost.className = "inventory-drag-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = itemArtMarkup(gesture.itemId);
    document.body.append(ghost);
    positionGhost(x, y);
    highlightDestinations(gesture);
    if (typeof navigator.vibrate === "function") navigator.vibrate(8);
  };

  const updateHoveredTarget = (x: number, y: number, gesture: ActiveGesture) => {
    hoveredTarget?.classList.remove("is-drag-over");
    const target = dropTargetAt(x, y, gesture);
    hoveredTarget = target?.destination ? target.element : null;
    hoveredTarget?.classList.add("is-drag-over");
  };

  const autoScrollBag = (x: number, y: number) => {
    if (bagItems.scrollHeight <= bagItems.clientHeight) return;
    const bounds = bagItems.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
    const edge = Math.min(44, bounds.height / 4);
    if (y < bounds.top + edge) bagItems.scrollTop -= 12;
    else if (y > bounds.bottom - edge) bagItems.scrollTop += 12;
  };

  const moveGesture = (x: number, y: number, event: Event) => {
    const gesture = active;
    if (!gesture) return;
    if (!gesture.armed) {
      if (movedFarEnough(gesture.startX, gesture.startY, x, y, INVENTORY_SCROLL_CANCEL_DISTANCE_PX)) resetGesture();
      return;
    }
    if (!gesture.dragging) {
      if (!movedFarEnough(gesture.startX, gesture.startY, x, y, INVENTORY_DRAG_START_DISTANCE_PX)) return;
      beginDrag(gesture, x, y);
    }
    if (event.cancelable) event.preventDefault();
    positionGhost(x, y);
    autoScrollBag(x, y);
    updateHoveredTarget(x, y, gesture);
  };

  const finishGesture = (x: number, y: number, allowDrop: boolean) => {
    const gesture = active;
    if (!gesture) return;
    const wasDragging = gesture.dragging;
    const destination = wasDragging && allowDrop ? dropTargetAt(x, y, gesture)?.destination ?? null : null;
    const itemId = gesture.itemId;
    resetGesture();
    if (!wasDragging) return;
    suppressClicksUntil = performance.now() + INVENTORY_DRAG_CLICK_SUPPRESSION_MS;
    if (destination) options.onDrop(itemId, destination);
  };

  function onPointerMove(event: PointerEvent) {
    if (!active || active.kind !== "POINTER" || event.pointerId !== active.pointerId) return;
    moveGesture(event.clientX, event.clientY, event);
  }

  function onPointerUp(event: PointerEvent) {
    if (!active || active.kind !== "POINTER" || event.pointerId !== active.pointerId) return;
    finishGesture(event.clientX, event.clientY, true);
  }

  function onPointerCancel(event: PointerEvent) {
    if (active?.kind === "POINTER" && event.pointerId === active.pointerId) {
      finishGesture(event.clientX, event.clientY, false);
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (!active || active.kind !== "TOUCH") return;
    const touch = [...event.touches].find((candidate) => candidate.identifier === active?.pointerId);
    if (touch) moveGesture(touch.clientX, touch.clientY, event);
  }

  function onTouchEnd(event: TouchEvent) {
    if (!active || active.kind !== "TOUCH") return;
    const touch = [...event.changedTouches].find((candidate) => candidate.identifier === active?.pointerId);
    if (touch) finishGesture(touch.clientX, touch.clientY, true);
  }

  function onTouchCancel(event: TouchEvent) {
    if (!active || active.kind !== "TOUCH") return;
    const touch = [...event.changedTouches].find((candidate) => candidate.identifier === active?.pointerId);
    if (touch) finishGesture(touch.clientX, touch.clientY, false);
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0) return;
    const source = sourceFromTarget(event.target);
    if (!source) return;
    resetGesture();
    active = {
      ...source,
      kind: "POINTER",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      armed: true,
      dragging: false,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    const source = sourceFromTarget(event.target);
    const touch = event.changedTouches[0];
    if (!source || !touch) return;
    resetGesture();
    active = {
      ...source,
      kind: "TOUCH",
      pointerId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      armed: false,
      dragging: false,
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchCancel);
    armTimer = window.setTimeout(armGesture, INVENTORY_TOUCH_DRAG_ARM_MS);
  };

  const onClickCapture = (event: MouseEvent) => {
    if (performance.now() > suppressClicksUntil) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const onWindowBlur = () => resetGesture();

  panel.addEventListener("pointerdown", onPointerDown);
  panel.addEventListener("touchstart", onTouchStart, { passive: true });
  panel.addEventListener("click", onClickCapture, { capture: true });
  window.addEventListener("blur", onWindowBlur);

  const destroy = () => {
    resetGesture();
    panel.removeEventListener("pointerdown", onPointerDown);
    panel.removeEventListener("touchstart", onTouchStart);
    panel.removeEventListener("click", onClickCapture, { capture: true });
    window.removeEventListener("blur", onWindowBlur);
  };
  return { cancel: resetGesture, destroy };
}
