import { afterEach, expect, it, vi } from "vitest";
import { residentImage } from "./resident-image";

afterEach(() => vi.unstubAllGlobals());

function stubCanvas() {
  const drawImage = vi.fn();
  const created: { width: number; height: number }[] = [];
  vi.stubGlobal("document", { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
    created.push(canvas);
    return canvas;
  } });
  return { drawImage, created };
}

it("waits for the image, then copies it once, capped at the height asked for", () => {
  const { drawImage, created } = stubCanvas();
  const image = { complete: false, naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
  const icon = residentImage(image, 64);
  expect(icon()).toBeNull();
  Object.assign(image, { complete: true, naturalWidth: 160, naturalHeight: 192 });
  const copy = icon();
  expect(copy).toMatchObject({ width: 53, height: 64 });
  expect(icon()).toBe(copy);
  expect(created).toHaveLength(1);
  expect(drawImage).toHaveBeenCalledOnce();
});

it("never enlarges a small image", () => {
  stubCanvas();
  const icon = residentImage({ complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement, 64);
  expect(icon()).toMatchObject({ width: 32, height: 32 });
});
