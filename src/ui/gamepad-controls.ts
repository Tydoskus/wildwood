import { actionForPadButton, dispatchControlAction, PAD } from "../game/runtime/control-bindings";
import { clickable, topBackButton } from "./desktop-hotkeys";
import { setAnalogMovementSource } from "../game/runtime/player-input-controller";

/**
 * Controllers through the browser's Gamepad API (Steam Deck, Xbox, PlayStation: any "standard" pad).
 * In the world the left stick and D-pad walk and bound buttons start their actions. With a window
 * open the D-pad or stick moves a highlight between its buttons, A presses, B goes back as Escape
 * does, LB/RB switch tabs and the right stick scrolls.
 */
const STICK_DEAD_ZONE = .2;
const NAV_THRESHOLD = .55;
const NAV_FIRST_REPEAT_MS = 380;
const NAV_REPEAT_MS = 130;
const SCROLL_PIXELS_PER_SECOND = 900;
/**
 * How often the window on top is looked for while no button is newly pressed. Finding it walks every button and
 * forces a layout, which every frame cost controller players a steady slice of each frame.
 */
const TOP_WINDOW_RECHECK_MS = 150;
const FOCUSABLE = "button, summary, [href], input, select, textarea, [tabindex]:not([tabindex='-1']), [role='tab']";

type Pad = { buttons: readonly { pressed: boolean; value?: number }[]; axes: readonly number[]; id: string; mapping?: string; connected?: boolean };
type Direction = "up" | "down" | "left" | "right";

/** A stick past its dead zone, scaled back to 0..1 so slow walking still works. */
export function stickVector(x: number, y: number, deadZone = STICK_DEAD_ZONE) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= deadZone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (length - deadZone) / (1 - deadZone));
  return { x: x / length * scaled, y: y / length * scaled };
}

/** The candidate nearest in a direction, favouring ones in line over ones off to the side. */
export function nearestInDirection<T>(from: DOMRect, candidates: readonly { item: T; rect: DOMRect }[], direction: Direction): T | null {
  const [dx, dy] = direction === "up" ? [0, -1] : direction === "down" ? [0, 1] : direction === "left" ? [-1, 0] : [1, 0];
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  let best: T | null = null, bestScore = Infinity;
  for (const { item, rect } of candidates) {
    const vx = rect.left + rect.width / 2 - fx, vy = rect.top + rect.height / 2 - fy;
    const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
    if (along <= 1) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = item; }
  }
  return best;
}

/**
 * The window on top: the one holding the top Back, else the last open <dialog> or modal with a button
 * showing (the title screen's sign-in choice, a Keep/Ignore offer).
 */
export function topWindow(doc: Document): HTMLElement | null {
  const back = topBackButton(doc);
  if (back) return back.closest<HTMLElement>("dialog, [role='dialog'], [role='alertdialog']") ?? back.parentElement;
  const open = [...doc.querySelectorAll<HTMLElement>("dialog[open], [aria-modal='true'], .modal, #start")]
    .filter(element => focusables(element).length > 0);
  return open[open.length - 1] ?? null;
}

function focusables(scope: HTMLElement) {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => clickable(element));
}

/** Where the highlight starts: the first real button, not a link in some text or the Back. */
function firstChoice(options: readonly HTMLElement[]) {
  return options.find(element => element.tagName === "BUTTON" && element.textContent?.trim() !== "Back") ?? options[0];
}

const listeners = new Set<() => void>();
let padName = "";
/** The connected controller's name, or "" with none. */
export function connectedGamepad() { return padName; }
export function onGamepadChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

let capture: ((button: number) => void) | null = null;
/** The next button pressed goes to `take` instead of the game (the Controls tab rebinding). */
export function captureNextPadButton(take: (button: number) => void) {
  capture = take;
  return () => { if (capture === take) capture = null; };
}

const installed = new WeakSet<Document>();

export function installGamepadControls(doc: Document = document, readPads?: () => readonly (Pad | null)[]) {
  if (installed.has(doc)) return () => {};
  installed.add(doc);
  const view = doc.defaultView;
  const navigatorPads = readPads ?? (() => (view?.navigator.getGamepads?.() ?? []) as readonly (Pad | null)[]);
  let held: boolean[] = [];
  let move = { x: 0, y: 0 };
  let navDirection: Direction | null = null, navNextAt = 0;
  let lastFrame = 0, frame = 0, running = false;
  let scopeCache: HTMLElement | null = null, scopeCheckedAt = -Infinity;
  const root = doc.documentElement;

  const usingPad = () => { root.dataset.input = "gamepad"; };
  // Back to mouse, touch or keyboard: the highlight goes until the controller is used again.
  const leavePad = (event: Event) => { if (event.isTrusted !== false && root.dataset.input === "gamepad") delete root.dataset.input; };
  doc.addEventListener("pointerdown", leavePad, true);
  doc.addEventListener("keydown", leavePad, true);

  const activePad = () => navigatorPads().find(pad => pad?.connected !== false && pad?.mapping === "standard")
    ?? navigatorPads().find(pad => pad && pad.connected !== false) ?? null;

  const focusIn = (scope: HTMLElement, direction: Direction) => {
    const options = focusables(scope);
    if (!options.length) return;
    const active = doc.activeElement as HTMLElement | null;
    if (!active || !scope.contains(active) || !options.includes(active)) { focus(firstChoice(options)); return; }
    // A slider takes left and right as its own value.
    if (active instanceof (view?.HTMLInputElement ?? HTMLInputElement) && active.type === "range" && (direction === "left" || direction === "right")) {
      direction === "right" ? active.stepUp() : active.stepDown();
      active.dispatchEvent(new Event("input", { bubbles: true }));
      active.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const next = nearestInDirection(active.getBoundingClientRect(),
      options.filter(element => element !== active).map(item => ({ item, rect: item.getBoundingClientRect() })), direction);
    if (next) focus(next);
  };
  // Marked as well as focused: a window without the page's focus still shows where the highlight is.
  const focus = (element: HTMLElement) => {
    for (const marked of doc.querySelectorAll(".pad-focus")) if (marked !== element) marked.classList.remove("pad-focus");
    element.classList.add("pad-focus");
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const switchTab = (scope: HTMLElement, step: number) => {
    const list = [...scope.querySelectorAll<HTMLElement>("[role='tablist']")].find(element => focusables(element).length > 1);
    if (!list) return;
    const tabs = [...list.querySelectorAll<HTMLElement>("[role='tab']")].filter(tab => clickable(tab));
    const current = tabs.findIndex(tab => tab.getAttribute("aria-selected") === "true" || tab.classList.contains("is-active"));
    const next = tabs[(Math.max(0, current) + step + tabs.length) % tabs.length];
    next?.click();
    next && focus(next);
  };

  const pressBack = () => {
    const target = (doc.activeElement as HTMLElement | null) ?? doc.body;
    target.dispatchEvent(new (view?.KeyboardEvent ?? KeyboardEvent)("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  };

  const scrollWith = (scope: HTMLElement, amount: number) => {
    let element: HTMLElement | null = (doc.activeElement as HTMLElement | null) ?? scope;
    if (!scope.contains(element)) element = scope;
    while (element && element !== scope.parentElement) {
      if (element.scrollHeight > element.clientHeight + 1) { element.scrollTop += amount; return; }
      element = element.parentElement;
    }
  };

  const poll = (time: number) => {
    const dt = lastFrame ? Math.min(.1, (time - lastFrame) / 1000) : 0;
    lastFrame = time;
    const pad = activePad();
    const name = pad?.id ?? "";
    if (name !== padName) { padName = name; for (const listener of listeners) listener(); }
    // Polled only while a controller is connected: phones never pay for it.
    if (!pad) { held = []; move = { x: 0, y: 0 }; running = false; lastFrame = 0; return; }
    frame = view?.requestAnimationFrame(poll) ?? 0;
    const pressed = pad.buttons.map(button => Boolean(button?.pressed));
    const went = (index: number) => pressed[index] && !held[index];
    const anyInput = pressed.some(Boolean) || pad.axes.some(axis => Math.abs(axis) > STICK_DEAD_ZONE);
    if (anyInput) usingPad();
    const pressedNow = pressed.some((down, button) => down && !held[button]);
    if (pressedNow || time - scopeCheckedAt >= TOP_WINDOW_RECHECK_MS || (scopeCache && !scopeCache.isConnected)) {
      scopeCache = topWindow(doc);
      scopeCheckedAt = time;
    }
    const scope = scopeCache;
    const stick = stickVector(pad.axes[0] ?? 0, pad.axes[1] ?? 0);

    if (capture) {
      const index = pressed.findIndex((down, button) => down && !held[button]);
      if (index >= 0) { const take = capture; capture = null; take(index); }
      move = { x: 0, y: 0 };
    } else if (scope) {
      move = { x: 0, y: 0 };
      // A window that focused its own button (an OK) shows the highlight there too.
      const focused = doc.activeElement as HTMLElement | null;
      if (focused && focused !== doc.body && scope.contains(focused) && !focused.classList.contains("pad-focus")) {
        for (const marked of doc.querySelectorAll(".pad-focus")) marked.classList.remove("pad-focus");
        focused.classList.add("pad-focus");
      }
      // D-pad or stick: one step, then repeats while held.
      const direction: Direction | null = pressed[PAD.UP] || stick.y < -NAV_THRESHOLD ? "up"
        : pressed[PAD.DOWN] || stick.y > NAV_THRESHOLD ? "down"
          : pressed[PAD.LEFT] || stick.x < -NAV_THRESHOLD ? "left"
            : pressed[PAD.RIGHT] || stick.x > NAV_THRESHOLD ? "right" : null;
      if (direction !== navDirection) { navDirection = direction; navNextAt = time + NAV_FIRST_REPEAT_MS; if (direction) focusIn(scope, direction); }
      else if (direction && time >= navNextAt) { navNextAt = time + NAV_REPEAT_MS; focusIn(scope, direction); }
      if (went(PAD.A)) {
        const active = doc.activeElement as HTMLElement | null;
        if (active && scope.contains(active) && clickable(active)) active.click();
        else { const first = firstChoice(focusables(scope)); if (first) focus(first); }
      }
      if (went(PAD.B)) pressBack();
      if (went(PAD.LB)) switchTab(scope, -1);
      if (went(PAD.RB)) switchTab(scope, 1);
      const scroll = stickVector(0, pad.axes[3] ?? 0).y;
      if (scroll) scrollWith(scope, scroll * SCROLL_PIXELS_PER_SECOND * dt);
    } else {
      navDirection = null;
      const dpad = { x: (pressed[PAD.RIGHT] ? 1 : 0) - (pressed[PAD.LEFT] ? 1 : 0), y: (pressed[PAD.DOWN] ? 1 : 0) - (pressed[PAD.UP] ? 1 : 0) };
      move = { x: stick.x + dpad.x, y: stick.y + dpad.y };
    }
    // Bound buttons work in the world and in windows alike (Y opens and closes the inventory), except
    // the ones a window uses to move around.
    if (!capture) pressed.forEach((down, button) => {
      if (!down || held[button]) return;
      if (scope && ([PAD.A, PAD.B, PAD.LB, PAD.RB] as number[]).includes(button)) return;
      const action = actionForPadButton(button);
      if (action) dispatchControlAction(doc, action);
    });
    held = pressed;
  };

  const start = () => { if (running || !view?.requestAnimationFrame) return; running = true; frame = view.requestAnimationFrame(poll); };
  setAnalogMovementSource(() => move);
  // Browsers show a controller once a button is pressed on it, and say so with this event.
  view?.addEventListener("gamepadconnected", start);
  if (navigatorPads().some(Boolean)) start();
  return () => {
    installed.delete(doc);
    view?.removeEventListener("gamepadconnected", start);
    view?.cancelAnimationFrame(frame);
    running = false;
    setAnalogMovementSource(null);
    doc.removeEventListener("pointerdown", leavePad, true);
    doc.removeEventListener("keydown", leavePad, true);
  };
}
