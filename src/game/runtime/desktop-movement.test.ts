import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPlayerInputController } from "./player-input-controller";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const { window, document } = parseHTML('<html><body><canvas></canvas><button>UI</button></body></html>');
  vi.stubGlobal("window", window); vi.stubGlobal("document", document);
  vi.stubGlobal("HTMLInputElement", window.HTMLInputElement);
  vi.stubGlobal("HTMLTextAreaElement", window.HTMLTextAreaElement);
  const canvas = document.querySelector("canvas")!;
  Object.assign(canvas, { setPointerCapture: vi.fn() });
  canvas.getBoundingClientRect = () => ({ left: 20, top: 30, width: 400, height: 300 } as DOMRect);
  const player = { x: 100, y: 100 }, camera = { x: 0, y: 0, zoom: 2, width: 800, height: 600 };
  let movable = true, now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const profile = vi.fn(() => false);
  const input = createPlayerInputController({ canvas, joystick: document.createElement("div"), stick: document.createElement("div"),
    running: () => true, onTapPlayer: profile, onEscape: () => false,
    desktop: { canMove: () => movable, player: () => player, speed: () => 300, view: () => camera,
      bounds: () => ({ width: 1000, height: 1000, inset: 10 }) },
  });
  function event(type: string, data: Record<string, unknown> = {}, target: EventTarget = canvas) {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { pointerType: "mouse", pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 220, clientY: 130, ...data });
    target.dispatchEvent(e);
  }
  function click() { event("pointerdown"); event("pointerup"); }
  return { input, event, click, player, camera, profile, document,
    time: (ms: number) => { now = ms; }, pause: () => { movable = false; } };
}

it("walks to a world-space click through canvas offsets, scaling, and camera motion without overshooting", () => {
  const f = fixture(); f.click();
  expect(f.input.movement(1 / 60)).toEqual({ x: 1, y: 0, source: "steer" });
  f.camera.x = 300;
  f.player.x = 198;
  const step = f.input.movement(1 / 60);
  expect(step.x).toBeCloseTo(.4);
  f.player.x += step.x * 300 / 60;
  expect(f.player.x).toBe(200);
  expect(f.input.movement(1 / 60).source).toBe("none");
});

it("steers a held cursor as the camera moves, then stops on release", () => {
  const f = fixture(); f.event("pointerdown");
  f.player.x = 200;
  expect(f.input.movement(1 / 60).source).toBe("none");
  f.camera.x = 100;
  expect(f.input.movement(1 / 60).x).toBe(1);
  f.event("pointermove", { clientX: 50 });
  expect(f.input.movement(1 / 60).x).toBe(-1);
  f.time(300); f.event("pointerup", { clientX: 50 });
  expect(f.input.movement().source).toBe("none");
});

it("stops a stationary hold on release even without mousemove events", () => {
  const f = fixture(); f.event("pointerdown"); f.time(300); f.event("pointerup");
  expect(f.input.movement().source).toBe("none");
});

it("keeps profile taps, right clicks, and touch out of desktop movement", () => {
  const f = fixture(); f.profile.mockReturnValue(true); f.click();
  expect(f.input.movement().source).toBe("none");
  f.profile.mockReturnValue(false);
  f.event("pointerdown", { button: 2 });
  f.event("pointerdown", { pointerType: "touch" });
  expect(f.input.movement().source).toBe("none");
});

it.each(["keyboard", "UI", "travel", "blur", "pause", "cancel"])("cancels desktop movement for %s", reason => {
  const f = fixture(); f.event("pointerdown");
  f.event("pointerup");
  if (reason === "keyboard") { f.event("keydown", { code: "KeyA" }); f.event("keyup", { code: "KeyA" }); }
  if (reason === "UI") f.event("pointerdown", {}, f.document.querySelector("button")!);
  if (reason === "travel") f.input.stopTouchMove();
  if (reason === "blur") f.event("blur");
  if (reason === "pause") f.pause();
  if (reason === "cancel") f.event("pointercancel");
  expect(f.input.movement().source).toBe("none");
});

it("abandons an obstructed click without letting presentation reads advance the timeout", () => {
  const f = fixture(); f.click();
  for (let i = 0; i < 200; i++) expect(f.input.movement().x).toBe(1);
  for (let i = 0; i < 50; i++) f.input.movement(1 / 60);
  expect(f.input.movement().source).toBe("none");
});
