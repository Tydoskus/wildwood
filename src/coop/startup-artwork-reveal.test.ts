import { describe, expect, it, vi } from "vitest";
import { createStartupArtworkReveal } from "./startup-artwork-reveal";

function fixture(complete = false) {
  let loadListener: EventListener | null = null;
  let finishDecode = () => {};
  const decode = vi.fn(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
  const image = {
    complete,
    naturalWidth: complete ? 1170 : 0,
    decoding: "auto",
    src: "",
    decode,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "load") loadListener = listener;
    }),
    removeEventListener: vi.fn(),
  } as unknown as HTMLImageElement;
  const add = vi.fn();
  const root = { classList: { add } } as unknown as HTMLElement;
  return {
    image,
    root,
    add,
    decode,
    emitLoad: () => loadListener?.({} as Event),
    finishDecode: () => finishDecode(),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("startup artwork reveal", () => {
  it("keeps the black cover until the full image has decoded", async () => {
    const scene = fixture();
    createStartupArtworkReveal({ root: scene.root, source: "/wallpaper.png", image: scene.image });

    expect(scene.image.src).toBe("/wallpaper.png");
    scene.emitLoad();
    expect(scene.decode).toHaveBeenCalledOnce();
    expect(scene.add).not.toHaveBeenCalled();

    scene.finishDecode();
    await flushPromises();
    expect(scene.add).toHaveBeenCalledWith("signin-artwork-ready");
  });

  it("handles an image already completed by the preload", async () => {
    const scene = fixture(true);
    createStartupArtworkReveal({ root: scene.root, source: "/wallpaper.png", image: scene.image });

    expect(scene.decode).toHaveBeenCalledOnce();
    scene.finishDecode();
    await flushPromises();
    expect(scene.add).toHaveBeenCalledWith("signin-artwork-ready");
  });

  it("does not reveal after disposal", async () => {
    const scene = fixture();
    const reveal = createStartupArtworkReveal({ root: scene.root, source: "/wallpaper.png", image: scene.image });
    scene.emitLoad();
    reveal.dispose();
    scene.finishDecode();
    await flushPromises();

    expect(scene.add).not.toHaveBeenCalled();
  });
});
