import { expect, it, vi } from "vitest";
import { createEnemyStatusPlates, type StatusPlateLabel } from "./enemy-status-plate";

function fakeCanvas() {
  const calls: string[] = [];
  const context = new Proxy({ measureText: (text: string) => ({ width: text.length * 6, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 1 }) } as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => { calls.push(`${key}(${args.map(arg => typeof arg === "object" ? "canvas" : String(arg)).join(",")})`); };
    },
    set(target, key: string, value) { target[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement, calls };
}

const label = (width = 60): StatusPlateLabel => ({ canvas: {} as HTMLCanvasElement, width, height: 19, anchorY: 16 });

it("builds one plate per kind, bar size and health state, and reuses it for every enemy of that kind", () => {
  const made: ReturnType<typeof fakeCanvas>[] = [];
  const plates = createEnemyStatusPlates({ pixelRatio: () => 2, createCanvas: () => { const canvas = fakeCanvas(); made.push(canvas); return canvas.canvas; } });
  const warden = label();
  const first = plates.plate(warden, 80, 5, true);
  for (let enemy = 0; enemy < 9; enemy++) expect(plates.plate(warden, 80, 5, true)).toBe(first);
  expect(made).toHaveLength(1);
  // The bare plate for a wounded warden and another kind are separate plates.
  expect(plates.plate(warden, 80, 5, false)).not.toBe(first);
  expect(plates.plate(label(), 80, 5, true)).not.toBe(first);
  expect(made).toHaveLength(3);
  expect(plates.size()).toBe(3);
});

it("draws the name and a pill bar with no numbers: outline, empty track and, at full health, the fill", () => {
  const made: ReturnType<typeof fakeCanvas>[] = [];
  const plates = createEnemyStatusPlates({ pixelRatio: () => 2, createCanvas: () => { const canvas = fakeCanvas(); made.push(canvas); return canvas.canvas; } });
  const full = plates.plate(label(), 80, 5, true);
  expect(made[0].calls.filter(call => call === "fill()")).toHaveLength(3);
  expect(made[0].calls.some(call => call.startsWith("arcTo"))).toBe(true);
  expect(made[0].calls.some(call => call.startsWith("fillText") || call.startsWith("strokeText") || call.startsWith("fillRect"))).toBe(false);
  // Drawn at the pixel ratio, so the plate lands one-to-one on the screen.
  expect(made[0].canvas.width).toBe(Math.ceil(full.width * 2));
  expect(full.top).toBeLessThan(-4 - 16 + 1);
  plates.plate(label(), 80, 5, false);
  expect(made[1].calls.filter(call => call === "fill()")).toHaveLength(2);
});

it("rebuilds for a new pixel ratio and starts over when the cache fills", () => {
  let ratio = 2;
  const create = vi.fn(() => fakeCanvas().canvas);
  const plates = createEnemyStatusPlates({ pixelRatio: () => ratio, createCanvas: create });
  ratio = 2;
  for (let kind = 0; kind < 600; kind++) plates.plate(label(), 80, 5, false);
  expect(plates.size()).toBeLessThanOrEqual(512);
  const name = label();
  plates.plate(name, 80, 5, false);
  ratio = 3;
  plates.plate(name, 80, 5, false);
  expect(create).toHaveBeenCalledTimes(602);
});
