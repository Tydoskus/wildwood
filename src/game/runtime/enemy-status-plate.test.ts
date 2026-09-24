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

it("builds one plate per kind, bar size and full-health text, and reuses it for every enemy of that kind", () => {
  const made: ReturnType<typeof fakeCanvas>[] = [];
  const plates = createEnemyStatusPlates({ pixelRatio: () => 2, createCanvas: () => { const canvas = fakeCanvas(); made.push(canvas); return canvas.canvas; } });
  const warden = label();
  const first = plates.plate(warden, 80, 10, "500 / 500");
  for (let enemy = 0; enemy < 9; enemy++) expect(plates.plate(warden, 80, 10, "500 / 500")).toBe(first);
  expect(made).toHaveLength(1);
  // The bare plate for a wounded warden and another kind are separate plates.
  expect(plates.plate(warden, 80, 10, null)).not.toBe(first);
  expect(plates.plate(label(), 80, 10, "500 / 500")).not.toBe(first);
  expect(made).toHaveLength(3);
  expect(plates.size()).toBe(3);
});

it("draws the name, the bar frame and, at full health, the full bar and its numbers", () => {
  const made: ReturnType<typeof fakeCanvas>[] = [];
  const plates = createEnemyStatusPlates({ pixelRatio: () => 2, createCanvas: () => { const canvas = fakeCanvas(); made.push(canvas); return canvas.canvas; } });
  const full = plates.plate(label(), 80, 10, "500 / 500");
  expect(made[0].calls.filter(call => call.startsWith("fillRect"))).toEqual(["fillRect(-42,-2,84,14)", "fillRect(-40,0,80,10)", "fillRect(-40,0,80,10)"]);
  expect(made[0].calls.some(call => call.startsWith("strokeText(500 / 500"))).toBe(true);
  expect(made[0].calls.some(call => call.startsWith("fillText(500 / 500"))).toBe(true);
  // Drawn at the pixel ratio, so the plate lands one-to-one on the screen.
  expect(made[0].canvas.width).toBe(Math.ceil(full.width * 2));
  expect(full.top).toBeLessThan(-4 - 16 + 1);
  plates.plate(label(), 80, 10, null);
  expect(made[1].calls.filter(call => call.startsWith("fillRect"))).toHaveLength(2);
  expect(made[1].calls.some(call => call.startsWith("fillText"))).toBe(false);
});

it("rebuilds for a new pixel ratio and starts over when the cache fills", () => {
  let ratio = 2;
  const create = vi.fn(() => fakeCanvas().canvas);
  const plates = createEnemyStatusPlates({ pixelRatio: () => ratio, createCanvas: create });
  const name = label();
  plates.plate(name, 80, 10, null);
  ratio = 3;
  plates.plate(name, 80, 10, null);
  expect(create).toHaveBeenCalledTimes(2);
  for (let hp = 0; hp < 600; hp++) plates.plate(name, 80, 10, `${hp} / 600`);
  expect(plates.size()).toBeLessThanOrEqual(512);
});
