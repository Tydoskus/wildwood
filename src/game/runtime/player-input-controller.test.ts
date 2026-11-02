import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPlayerInputController, JOYSTICK_DEAD_ZONE, JOYSTICK_MAXIMUM, radialJoystickInput, setAnalogMovementSource, swallowsGameKeys } from "./player-input-controller";
import { defaultBindings, setControlBindings, withKey } from "./control-bindings";

describe("radial touch joystick", () => {
  it("filters finger noise inside the dead zone", () => {
    expect(radialJoystickInput(JOYSTICK_DEAD_ZONE, 0)).toMatchObject({ x: 0, y: 0, moved: false });
  });

  it("ramps analog magnitude smoothly outside the dead zone", () => {
    const halfway = radialJoystickInput((JOYSTICK_DEAD_ZONE + JOYSTICK_MAXIMUM) / 2, 0);
    expect(halfway.x).toBeCloseTo(.5);
    expect(halfway.y).toBe(0);
    expect(halfway.moved).toBe(true);
  });

  it("clamps direction, speed, and visual travel at the outer radius", () => {
    const input = radialJoystickInput(300, 400);
    expect(Math.hypot(input.x, input.y)).toBeCloseTo(1);
    expect(Math.hypot(input.stickX, input.stickY)).toBeCloseTo(JOYSTICK_MAXIMUM);
  });
});

describe("keyboard ownership", () => {
  const { document } = parseHTML("<div></div>");
  const input = (type: string) => Object.assign(document.createElement("input"), { type });

  it("leaves the whole keyboard to text entry", () => {
    expect(swallowsGameKeys(input("text"), "KeyW")).toBe(true);
    expect(swallowsGameKeys(document.createElement("textarea"), "KeyW")).toBe(true);
  });

  it("keeps a focused slider from stopping movement after its thumb is dragged", () => {
    const slider = input("range");
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD"]) expect(swallowsGameKeys(slider, code)).toBe(false);
    // The keys the slider itself acts on still belong to it.
    expect(swallowsGameKeys(slider, "ArrowLeft")).toBe(true);
    expect(swallowsGameKeys(slider, "Home")).toBe(true);
  });

  it("gives the world every key when nothing focusable is typing", () => {
    expect(swallowsGameKeys(document.createElement("canvas"), "KeyW")).toBe(false);
    expect(swallowsGameKeys(null, "KeyW")).toBe(false);
  });
});

describe("bound movement", () => {
  afterEach(() => { setAnalogMovementSource(null); setControlBindings(defaultBindings()); vi.unstubAllGlobals(); });
  function controller() {
    const { document, window } = parseHTML("<canvas></canvas><div id=j></div><div id=s></div>");
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    const input = createPlayerInputController({ canvas: document.querySelector("canvas") as any, joystick: document.querySelector("#j") as any,
      stick: document.querySelector("#s") as any, running: () => true, onTapPlayer: () => {}, onEscape: () => false });
    const key = (type: string, code: string) => {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "code", { value: code });
      window.dispatchEvent(event);
    };
    return { input, key };
  }

  it("walks on a rebound key, still on the arrows, and no longer on the old key", () => {
    setControlBindings(withKey(defaultBindings(), "moveUp", "KeyZ"));
    const { input, key } = controller();
    key("keydown", "KeyW");
    expect(input.movement()).toMatchObject({ x: 0, y: 0, source: "none" });
    key("keyup", "KeyW");
    key("keydown", "KeyZ");
    expect(input.movement()).toMatchObject({ y: -1, source: "keyboard" });
    key("keyup", "KeyZ");
    key("keydown", "ArrowUp");
    expect(input.movement()).toMatchObject({ y: -1, source: "keyboard" });
  });

  it("walks a controller's stick at its own speed, sent like the touch joystick", () => {
    const { input } = controller();
    setAnalogMovementSource(() => ({ x: .4, y: 0 }));
    expect(input.movement()).toEqual({ x: .4, y: 0, source: "touch" });
  });
});
