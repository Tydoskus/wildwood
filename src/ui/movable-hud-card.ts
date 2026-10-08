type Position = { x: number; y: number };
type CardStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Tracker-style dragging, keyboard movement, and ownership of HUD gestures. */
export function installMovableHudCard(options: {
  panel: HTMLElement;
  handle: HTMLButtonElement;
  storage: () => CardStorage | undefined;
  positionKey: string;
  toggle: () => void;
}) {
  const { panel, handle } = options;
  const cleanup: (() => void)[] = [];
  function listen(target: EventTarget, type: string, listener: EventListener, capture = false) {
    target.addEventListener(type, listener, capture);
    cleanup.push(() => target.removeEventListener(type, listener, capture));
  }
  let position: Position | null = null;
  let drag: { id: number; offset: Position; start: Position; moved: boolean } | null = null;
  let suppressClick = false;
  try {
    const saved = JSON.parse(options.storage()?.getItem(options.positionKey) ?? 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = { x: saved.x, y: saved.y };
  } catch { /* Use the default position. */ }
  const save = () => {
    try { options.storage()?.setItem(options.positionKey, JSON.stringify(position)); } catch { /* Keep it for this session. */ }
  };
  function place() {
    if (panel.hidden || panel.offsetWidth === 0 || panel.offsetHeight === 0) return;
    const bounds = panel.getBoundingClientRect();
    const desired = position ?? { x: bounds.left, y: bounds.top };
    const x = Math.max(8, Math.min(desired.x, window.innerWidth - panel.offsetWidth - 8));
    const y = Math.max(8, Math.min(desired.y, window.innerHeight - panel.offsetHeight - 8));
    if (!position && x === desired.x && y === desired.y) return;
    position = { x, y };
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  function home() {
    position = null;
    for (const property of ['left', 'top', 'right', 'bottom']) panel.style.removeProperty(property);
    save(); place();
  }
  listen(handle, 'pointerdown', raw => {
    const event = raw as PointerEvent;
    if (event.button !== 0) return;
    const bounds = panel.getBoundingClientRect();
    suppressClick = false;
    drag = { id: event.pointerId, offset: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      start: { x: event.clientX, y: event.clientY }, moved: false };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  listen(handle, 'pointermove', raw => {
    const event = raw as PointerEvent;
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) > 6) drag.moved = true;
    if (!drag.moved) return;
    position = { x: event.clientX - drag.offset.x, y: event.clientY - drag.offset.y };
    panel.classList.add('is-dragging');
    place();
  });
  const finishDrag = () => {
    if (drag?.moved) { suppressClick = true; save(); }
    drag = null;
    panel.classList.remove('is-dragging');
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(handle, type, finishDrag);
  listen(handle, 'dblclick', home);
  listen(handle, 'click', raw => {
    if (suppressClick && (raw as MouseEvent).detail !== 0) { suppressClick = false; return; }
    options.toggle();
  });
  listen(handle, 'keydown', raw => {
    const event = raw as KeyboardEvent;
    if (event.key === 'Home') { event.preventDefault(); home(); return; }
    const delta = ({ ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] } as Record<string, number[]>)[event.key];
    if (!delta) return;
    event.preventDefault();
    const bounds = panel.getBoundingClientRect();
    position = { x: bounds.left + delta[0], y: bounds.top + delta[1] };
    place(); save();
  });
  // A gesture starting in the world stays there when it crosses the card.
  listen(window, 'pointerdown', raw => {
    const event = raw as PointerEvent;
    if (event.button === 0 && (event.target as HTMLElement | null)?.tagName === 'CANVAS') panel.classList.add('is-world-gesture');
  }, true);
  const endWorldGesture = () => panel.classList.remove('is-world-gesture');
  for (const type of ['pointerup', 'pointercancel']) listen(window, type, endWorldGesture, true);
  listen(window, 'blur', () => { endWorldGesture(); finishDrag(); });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel']) {
    listen(panel, type, event => event.stopPropagation());
  }
  for (const type of ['keydown', 'keyup']) listen(panel, type, raw => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes((raw as KeyboardEvent).code)) raw.stopPropagation();
  });
  listen(window, 'resize', place);
  // Expanding settings, help, or More can change the card's height.
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
  observer?.observe(panel);
  return { place, destroy() { observer?.disconnect(); for (const dispose of cleanup) dispose(); } };
}
