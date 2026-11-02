/**
 * The player's keyboard and controller bindings, kept in this browser. Movement keys also take the
 * arrow keys, and a controller always moves with its left stick and D-pad; those stay fixed.
 */
export type ControlAction = "moveUp" | "moveLeft" | "moveDown" | "moveRight"
  | "autoFarm" | "inventory" | "map" | "profile" | "guild" | "leaderboard" | "settings"
  | "build1" | "build2" | "build3" | "build4" | "build5" | "build6" | "build7" | "build8" | "build9" | "build10";

export type ControlBindings = { keys: Record<ControlAction, string>; pad: Record<ControlAction, number | null> };

type ActionDefinition = { id: ControlAction; label: string; key: string; pad: number | null; movement?: boolean };

export const CONTROL_ACTIONS: readonly ActionDefinition[] = Object.freeze([
  { id: "moveUp", label: "Move Up", key: "KeyW", pad: null, movement: true },
  { id: "moveLeft", label: "Move Left", key: "KeyA", pad: null, movement: true },
  { id: "moveDown", label: "Move Down", key: "KeyS", pad: null, movement: true },
  { id: "moveRight", label: "Move Right", key: "KeyD", pad: null, movement: true },
  { id: "autoFarm", label: "Auto Farm", key: "KeyF", pad: 2 },
  { id: "inventory", label: "Inventory", key: "KeyI", pad: 3 },
  { id: "map", label: "Map", key: "KeyM", pad: 8 },
  { id: "profile", label: "Profile", key: "KeyP", pad: 6 },
  { id: "guild", label: "Guild", key: "KeyG", pad: 7 },
  { id: "leaderboard", label: "Leaderboard", key: "KeyL", pad: null },
  { id: "settings", label: "Settings", key: "", pad: 9 },
  { id: "build1", label: "Build 1", key: "Digit1", pad: null },
  { id: "build2", label: "Build 2", key: "Digit2", pad: null },
  { id: "build3", label: "Build 3", key: "Digit3", pad: null },
  { id: "build4", label: "Build 4", key: "Digit4", pad: null },
  { id: "build5", label: "Build 5", key: "Digit5", pad: null },
  { id: "build6", label: "Build 6", key: "Digit6", pad: null },
  { id: "build7", label: "Build 7", key: "Digit7", pad: null },
  { id: "build8", label: "Build 8", key: "Digit8", pad: null },
  { id: "build9", label: "Build 9", key: "Digit9", pad: null },
  { id: "build10", label: "Build 10", key: "Digit0", pad: null },
]);

/** Standard-mapping button names, as an Xbox pad or a Steam Deck labels them. */
export const PAD_BUTTON_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS",
  "D-Pad Up", "D-Pad Down", "D-Pad Left", "D-Pad Right", "Home"] as const;
export const PAD = { A: 0, B: 1, LB: 4, RB: 5, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
/** Buttons a player can bind; A, B and the D-pad select, go back and move. */
export const BINDABLE_PAD_BUTTONS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** Keys that keep their own job: Escape goes back, Enter opens chat, Tab moves focus, arrows move. */
export const RESERVED_KEYS: readonly string[] = ["Escape", "Enter", "NumpadEnter", "Tab",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
export const ARROW_FOR: Readonly<Partial<Record<ControlAction, string>>> = {
  moveUp: "ArrowUp", moveLeft: "ArrowLeft", moveDown: "ArrowDown", moveRight: "ArrowRight",
};

export const CONTROLS_STORAGE_KEY = "wildstat-controls-v1";

export function defaultBindings(): ControlBindings {
  const keys = {} as ControlBindings["keys"], pad = {} as ControlBindings["pad"];
  for (const action of CONTROL_ACTIONS) { keys[action.id] = action.key; pad[action.id] = action.pad; }
  return { keys, pad };
}

/** Saved bindings over the defaults; anything unknown, reserved or doubled up falls back. */
export function parseBindings(text: string | null): ControlBindings {
  const result = defaultBindings();
  let saved: { keys?: Record<string, unknown>; pad?: Record<string, unknown> } | null = null;
  try { saved = text ? JSON.parse(text) : null; } catch { saved = null; }
  if (!saved || typeof saved !== "object") return result;
  for (const action of CONTROL_ACTIONS) {
    const key = saved.keys?.[action.id];
    if (typeof key === "string" && key.length <= 32 && !RESERVED_KEYS.includes(key)) result.keys[action.id] = key;
    const button = saved.pad?.[action.id];
    if (button === null && !action.movement) result.pad[action.id] = null;
    else if (typeof button === "number" && BINDABLE_PAD_BUTTONS.includes(button) && !action.movement) result.pad[action.id] = button;
  }
  // A key or button held by two actions keeps only the first.
  const seenKeys = new Set<string>(), seenPad = new Set<number>();
  for (const action of CONTROL_ACTIONS) {
    const key = result.keys[action.id];
    if (key && seenKeys.has(key)) result.keys[action.id] = "";
    else if (key) seenKeys.add(key);
    const button = result.pad[action.id];
    if (button !== null && seenPad.has(button)) result.pad[action.id] = null;
    else if (button !== null) seenPad.add(button);
  }
  return result;
}

/** Binds `code` ("" clears); an action already on it swaps onto this one's old key. */
export function withKey(bindings: ControlBindings, action: ControlAction, code: string): ControlBindings {
  if (RESERVED_KEYS.includes(code)) return bindings;
  const keys = { ...bindings.keys };
  const holder = code ? CONTROL_ACTIONS.find(entry => entry.id !== action && keys[entry.id] === code) : undefined;
  if (holder) keys[holder.id] = keys[action];
  keys[action] = code;
  return { ...bindings, keys };
}

/** Binds a controller button (null clears); an action already on it swaps onto this one's old button. */
export function withPadButton(bindings: ControlBindings, action: ControlAction, button: number | null): ControlBindings {
  if (CONTROL_ACTIONS.find(entry => entry.id === action)?.movement) return bindings;
  if (button !== null && !BINDABLE_PAD_BUTTONS.includes(button)) return bindings;
  const pad = { ...bindings.pad };
  const holder = button === null ? undefined : CONTROL_ACTIONS.find(entry => entry.id !== action && pad[entry.id] === button);
  if (holder) pad[holder.id] = pad[action];
  pad[action] = button;
  return { ...bindings, pad };
}

const readStorage = () => { try { return localStorage.getItem(CONTROLS_STORAGE_KEY); } catch { return null; } };

/** Kept on the page, not in this module: the shell and the game are two bundles, and both read these. */
type SharedBindings = { current: ControlBindings; listeners: Set<(bindings: ControlBindings) => void> };
const SHARED = Symbol.for("wildstat.controlBindings");
function shared(): SharedBindings {
  const page = globalThis as Record<symbol, SharedBindings | undefined>;
  return page[SHARED] ??= { current: parseBindings(readStorage()), listeners: new Set() };
}

export function controlBindings() { return shared().current; }

export function setControlBindings(next: ControlBindings) {
  shared().current = next;
  try { localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode keeps them for this visit */ }
  for (const listener of shared().listeners) listener(next);
}

export function onControlBindingsChange(listener: (bindings: ControlBindings) => void) {
  shared().listeners.add(listener);
  return () => { shared().listeners.delete(listener); };
}

/** The action a key starts, if any. */
export function actionForKey(code: string, bindings = controlBindings()): ControlAction | null {
  if (!code) return null;
  return CONTROL_ACTIONS.find(action => bindings.keys[action.id] === code)?.id ?? null;
}

export function actionForPadButton(button: number, bindings = controlBindings()): ControlAction | null {
  return CONTROL_ACTIONS.find(action => bindings.pad[action.id] === button)?.id ?? null;
}

/** "KeyI" → "I", "Digit1" → "1", "ShiftLeft" → "Left Shift", "" → "None". */
export function keyLabel(code: string) {
  if (!code) return "None";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Numpad ${code.slice(6)}`;
  const side = code.match(/^(Shift|Control|Alt|Meta)(Left|Right)$/);
  if (side) return `${side[2]} ${side[1] === "Control" ? "Ctrl" : side[1]}`;
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function padLabel(button: number | null) {
  return button === null ? "None" : PAD_BUTTON_NAMES[button] ?? `Button ${button}`;
}

/** Controls a keyboard key or controller button started, for the windows that own each action. */
export const CONTROL_EVENT = "wildstat-control";

export function dispatchControlAction(doc: Document, action: ControlAction) {
  doc.dispatchEvent(new (doc.defaultView?.CustomEvent ?? CustomEvent)(CONTROL_EVENT, { detail: { action } }));
}

export function onControlAction(doc: Document, action: ControlAction, run: () => void) {
  const listener = (event: Event) => { if ((event as CustomEvent).detail?.action === action) run(); };
  doc.addEventListener(CONTROL_EVENT, listener);
  return () => doc.removeEventListener(CONTROL_EVENT, listener);
}
