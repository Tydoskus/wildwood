import { SpriteRecorderUnsupported } from "./sprite-recorder";

/**
 * A 2D context that passes every call and property to its current target: the game's canvas context, or
 * for the world part of a frame, the sprite recorder (sprite-recorder.ts). Everything that draws the world
 * holds this one object, so switching the target moves all of its drawing without changing any of it.
 */
/** Calls that put pixels on the canvas they are made on. */
const DRAWING_METHODS = new Set(["drawImage", "fillRect", "strokeRect", "fill", "stroke", "fillText", "strokeText", "putImageData"]);

type Methods = Record<string, (...args: unknown[]) => unknown>;

/**
 * Keeps the real context's font as it was last set instead of reading it back: a read builds the font's string
 * anew every time, and WebKit reads one back without its weight ("900 15px Arial" comes back "15px Arial"), so
 * text cached by its font would be drawn thin. save() and restore() keep it in step; whatever resets the context
 * (a new canvas size, reset(), a lost context) makes it read the real font again.
 */
function rememberFont(context: Record<string, unknown>, real: CanvasRenderingContext2D, onReal: () => boolean, other: () => CanvasRenderingContext2D) {
  const native = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font");
  if (!native?.get || !native.set) return;
  let font: string | null = null;
  const saved: (string | null)[] = [];
  const forget = () => { font = null; saved.length = 0; };
  const { save, restore, reset } = context as Methods;
  context.save = function () {
    if (onReal()) saved.push(font);
    return save.call(context);
  };
  context.restore = function () {
    if (onReal() && saved.length) font = saved.pop()!;
    return restore.call(context);
  };
  if (typeof reset === "function") context.reset = function () {
    if (onReal()) forget();
    return reset.call(context);
  };
  Object.defineProperty(context, "font", {
    get: () => (onReal() ? font ??= native.get!.call(real) : other().font),
    set: (value: string) => {
      if (!onReal()) { other().font = value; return; }
      const next = String(value);
      if (next === font) return;
      native.set!.call(real, next);
      font = next;
    },
    enumerable: true,
    configurable: true,
  });
  const canvas = real.canvas;
  if (typeof HTMLCanvasElement === "undefined" || !(canvas instanceof HTMLCanvasElement)) return;
  canvas.addEventListener("contextlost", forget);
  canvas.addEventListener("contextrestored", forget);
  // Setting either size, even to the same value, resets the context.
  for (const name of ["width", "height"] as const) {
    const size = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name);
    if (!size?.get || !size.set) continue;
    Object.defineProperty(canvas, name, {
      get() { return size.get!.call(this); },
      set(value: number) { size.set!.call(this, value); forget(); },
      configurable: true,
    });
  }
}

/** `switchable` false (the world is never recorded as sprites here) hands out the real context itself. */
export function createSwitchableContext(real: CanvasRenderingContext2D, switchable = true) {
  if (typeof CanvasRenderingContext2D === "undefined" || !(real instanceof CanvasRenderingContext2D)) {
    return { context: real, real, canSwitch: false, use(_next: CanvasRenderingContext2D) {}, reset() {}, realDraws: () => -1 };
  }
  if (!switchable) {
    rememberFont(real as unknown as Record<string, unknown>, real, () => true, () => real);
    return { context: real, real, canSwitch: false, use(_next: CanvasRenderingContext2D) {}, reset() {}, realDraws: () => -1 };
  }
  let realDraws = 0;
  let target: CanvasRenderingContext2D = real;
  const facade: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (let proto = Object.getPrototypeOf(real); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor" || seen.has(name)) continue;
      seen.add(name);
      const descriptor = Object.getOwnPropertyDescriptor(proto, name)!;
      if (typeof descriptor.value === "function") {
        const drawing = DRAWING_METHODS.has(name);
        facade[name] = function () {
          if (drawing && target === real) realDraws += 1;
          const method = (target as unknown as Record<string, unknown>)[name];
          if (typeof method !== "function") throw new SpriteRecorderUnsupported(name);
          // eslint-disable-next-line prefer-rest-params
          return method.apply(target, arguments as unknown as unknown[]);
        };
      } else if (descriptor.get) {
        Object.defineProperty(facade, name, {
          get: () => (target as unknown as Record<string, unknown>)[name],
          set: descriptor.set ? (value: unknown) => { (target as unknown as Record<string, unknown>)[name] = value; } : undefined,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }
  rememberFont(facade, real, () => target === real, () => target);
  return {
    context: facade as unknown as CanvasRenderingContext2D,
    real,
    canSwitch: true,
    use(next: CanvasRenderingContext2D) { target = next; },
    reset() { target = real; },
    /** How many drawing calls have reached the real canvas, so a frame can tell whether it left the canvas empty. */
    realDraws: () => realDraws,
  };
}

export type SwitchableContext = ReturnType<typeof createSwitchableContext>;
