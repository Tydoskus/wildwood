import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installGamepadControls, nearestInDirection, stickVector } from "./gamepad-controls";
import { CONTROL_EVENT } from "../game/runtime/control-bindings";

const rect = (left: number, top: number, width = 10, height = 10) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

describe("stick and direction math", () => {
  it("ignores a resting stick and still walks slowly just past the dead zone", () => {
    expect(stickVector(.1, .1)).toEqual({ x: 0, y: 0 });
    expect(stickVector(.6, 0).x).toBeCloseTo(.5);
    expect(Math.hypot(stickVector(1, 1).x, stickVector(1, 1).y)).toBeCloseTo(1);
  });

  it("moves to the nearest control in line before one off to the side", () => {
    const from = rect(0, 0);
    const candidates = [{ item: "diagonal", rect: rect(40, 30) }, { item: "below", rect: rect(0, 60) }, { item: "above", rect: rect(0, -40) }];
    expect(nearestInDirection(from, candidates, "down")).toBe("below");
    expect(nearestInDirection(from, candidates, "up")).toBe("above");
    expect(nearestInDirection(from, candidates, "right")).toBe("diagonal");
    expect(nearestInDirection(from, candidates, "left")).toBeNull();
  });
});

/** linkedom has no layout: each placed element gets a box, and a hit test finds the last placed one there. */
function setup(html: string) {
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
  const stack: Element[] = [];
  const place = (element: Element, left: number, top: number) => {
    (element as any).getBoundingClientRect = () => rect(left, top);
    stack.push(element);
  };
  (document as any).elementFromPoint = (x: number, y: number) => [...stack].reverse().find(element => {
    const box = (element as any).getBoundingClientRect();
    return !(element as HTMLElement).closest("[hidden]") && x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
  }) ?? null;
  const pad = { id: "Steam Deck Controller (STANDARD GAMEPAD)", mapping: "standard", connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
  let frame: ((time: number) => void) | null = null, time = 0;
  Object.assign(window, {
    requestAnimationFrame: (run: (time: number) => void) => { frame = run; return 1; },
    cancelAnimationFrame: () => { frame = null; },
    KeyboardEvent: class extends window.Event { code: string; key: string; constructor(type: string, init: any) { super(type, init); this.code = init.code; this.key = init.key; } },
  });
  let active: Element | null = null;
  Object.defineProperty(document, "activeElement", { get: () => active, configurable: true });
  (window.HTMLElement.prototype as any).focus = function (this: Element) { active = this; };
  const actions: string[] = [];
  document.addEventListener(CONTROL_EVENT, (event: Event) => actions.push((event as CustomEvent).detail.action));
  const stop = installGamepadControls(document as unknown as Document, () => [pad]);
  const step = () => { time += 16; frame?.(time); };
  const press = (button: number) => { pad.buttons[button].pressed = true; step(); pad.buttons[button].pressed = false; step(); };
  const pick = (selector: string) => document.querySelector(selector) as unknown as HTMLElement;
  return { document, pad, step, press, place, pick, actions, stop };
}

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

describe("a controller", () => {
  it("reaches settings disclosure headings with the D-pad and activates them with A", () => {
    const s = setup(`<div role="dialog" aria-modal="true"><button id="first">Game</button>
      <details><summary id="group">Display &amp; HUD</summary></details><button>Back</button></div>`);
    cleanup = s.stop;
    s.place(s.pick("#first"), 0, 0);
    s.place(s.pick("#group"), 0, 40);
    const activate = vi.fn();
    s.pick("#group").addEventListener("click", activate);
    s.pick("#first").focus();
    s.press(13);
    expect(s.document.activeElement?.id).toBe("group");
    s.press(0);
    expect(activate).toHaveBeenCalledOnce();
  });
  it("starts bound actions from the world, and marks the page as using a controller", () => {
    const s = setup(`<canvas></canvas>`);
    cleanup = s.stop;
    s.press(3);
    s.press(2);
    s.press(0); // A is unbound
    expect(s.actions).toEqual(["inventory", "autoFarm"]);
    expect(s.document.documentElement.getAttribute("data-input")).toBe("gamepad");
  });

  it("in a window moves focus with the D-pad, presses with A, goes back with B and switches tabs with RB", () => {
    const s = setup(`<div role="dialog" id="win">
      <div role="tablist"><button role="tab" id="t1" aria-selected="true">One</button><button role="tab" id="t2" aria-selected="false">Two</button></div>
      <button id="first">First</button><button id="second">Second</button><button id="back">Back</button></div>`);
    cleanup = s.stop;
    s.place(s.pick("#t1"), 0, 0); s.place(s.pick("#t2"), 20, 0);
    s.place(s.pick("#first"), 0, 40); s.place(s.pick("#second"), 0, 80); s.place(s.pick("#back"), 0, 120);
    const clicks: string[] = [];
    for (const id of ["t1", "t2", "first", "second", "back"]) s.pick(`#${id}`).addEventListener("click", () => {
      clicks.push(id);
      if (id.startsWith("t")) for (const tab of ["t1", "t2"]) s.pick(`#${tab}`).setAttribute("aria-selected", String(tab === id));
    });
    const escapes = vi.fn();
    s.document.addEventListener("keydown", (event: any) => { if (event.code === "Escape") escapes(); });
    s.pick("#first").focus();
    s.press(13); // D-pad down
    expect(s.document.activeElement?.id).toBe("second");
    s.press(0);
    expect(clicks).toEqual(["second"]);
    s.press(1);
    expect(escapes).toHaveBeenCalledOnce();
    s.press(5);
    expect(clicks).toEqual(["second", "t2"]);
    // Y still opens and closes its window from inside one; A and B never start actions there.
    s.press(3);
    expect(s.actions).toEqual(["inventory"]);
  });
});
