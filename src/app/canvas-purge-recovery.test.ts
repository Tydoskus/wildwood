import { expect, it, vi } from "vitest";
import { installCanvasPurgeRecovery } from "./canvas-purge-recovery";

function page(options: { isContextLost?: boolean } = {}) {
  const listeners: Record<string, () => void> = {}, canvasListeners: Record<string, () => void> = {};
  let alpha = 255, contextLost = false;
  const context: any = { fillStyle: "", fillRect() {}, getImageData: () => ({ data: [255, 0, 255, alpha] }) };
  if (options.isContextLost) context.isContextLost = () => contextLost;
  const doc: any = {
    hidden: false,
    addEventListener: (type: string, listener: () => void) => { listeners[type] = listener; },
    createElement: () => ({ width: 0, height: 0, getContext: () => context, addEventListener: (type: string, listener: () => void) => { canvasListeners[type] = listener; } }),
  };
  return { doc, returnToPage: () => listeners.visibilitychange(), wipe: () => { alpha = 0; }, loseContext: () => { contextLost = true; }, fire: (type: string) => canvasListeners[type]() };
}

it("reloads once on return when the browser wiped the off-page canvases, and leaves an intact page alone", async () => {
  const p = page();
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc });
  p.returnToPage();
  expect(reload).not.toHaveBeenCalled();
  p.wipe();
  p.returnToPage(); p.returnToPage();
  expect(reload).toHaveBeenCalledOnce();
});

it("reads a lost context, a lost-context event, or a blank pixel as lost", () => {
  const p = page({ isContextLost: true });
  const reload = vi.fn(async () => true);
  const recovery = installCanvasPurgeRecovery({ reload, doc: p.doc });
  expect(recovery.lost()).toBe(false);
  p.loseContext();
  expect(recovery.lost()).toBe(true);
  const q = page({ isContextLost: true });
  const again = installCanvasPurgeRecovery({ reload, doc: q.doc });
  q.wipe();
  expect(again.lost()).toBe(true);
  const r = page({ isContextLost: true });
  const third = installCanvasPurgeRecovery({ reload, doc: r.doc });
  r.fire("contextrestored");
  expect(third.lost()).toBe(true);
});

it("reloads as soon as the on-page game canvas loses its context", async () => {
  vi.useFakeTimers();
  const p = page();
  const listeners: Record<string, () => void> = {};
  let gameLost = false;
  const game = { width: 0, height: 0, getContext: () => ({ fillRect() {}, getImageData: () => ({ data: [0, 0, 0, 255] }), fillStyle: "", isContextLost: () => gameLost }),
    addEventListener: (type: string, listener: () => void) => { listeners[type] = listener; } };
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc, watch: [game as never] });
  p.returnToPage();
  expect(reload).not.toHaveBeenCalled();
  gameLost = true;
  listeners.contextlost();
  await vi.advanceTimersByTimeAsync(0);
  expect(reload).toHaveBeenCalledOnce();
});

it("notices a lost game canvas even when the browser never says so", async () => {
  vi.useFakeTimers();
  const p = page();
  let gameLost = false;
  const game = { width: 0, height: 0, getContext: () => ({ fillRect() {}, getImageData: () => ({ data: [0, 0, 0, 255] }), fillStyle: "", isContextLost: () => gameLost }),
    addEventListener() {} };
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc, watch: [game as never] });
  await vi.advanceTimersByTimeAsync(3_000);
  expect(reload).not.toHaveBeenCalled();
  gameLost = true;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(reload).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it("waits until it can save, then tries again", async () => {
  vi.useFakeTimers();
  const p = page();
  const reload = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  installCanvasPurgeRecovery({ reload, doc: p.doc });
  p.wipe();
  p.returnToPage();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(reload).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
