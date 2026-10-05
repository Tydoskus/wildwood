import { afterEach, expect, it, vi } from "vitest";
import { LOST_GRACE_MS, RELOAD_COOLDOWN_MS, installCanvasPurgeRecovery } from "./canvas-purge-recovery";

afterEach(() => vi.useRealTimers());

function page() {
  const listeners: Record<string, () => void> = {};
  let pixel = [255, 0, 255, 255];
  const context: any = { fillStyle: "", fillRect() {}, clearRect() {}, drawImage() {}, getImageData: () => ({ data: pixel }), isContextLost: () => false };
  const doc: any = {
    hidden: false,
    addEventListener: (type: string, listener: () => void) => { listeners[type] = listener; },
    createElement: () => ({ width: 0, height: 0, getContext: () => context, addEventListener() {} }),
  };
  const stored = new Map<string, string>();
  const session = () => ({ getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } });
  return { doc, session, returnToPage: () => listeners.visibilitychange(), setPixel: (value: number[]) => { pixel = value; } };
}
const game = () => {
  let lost = false;
  return { canvas: { width: 0, height: 0, getContext: () => ({ fillRect() {}, getImageData: () => ({ data: [0, 0, 0, 255] }), fillStyle: "", isContextLost: () => lost }),
    addEventListener() {} } as never, lose: (value: boolean) => { lost = value; } };
};

it("reloads on return only when the off-page canvases read back wiped, never for a browser's fingerprinting noise", () => {
  vi.useFakeTimers();
  const p = page();
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc, session: p.session, now: () => Date.now() });
  // Noise from a fingerprinting guard: not what was drawn, but not blank either.
  p.setPixel([251, 3, 249, 254]);
  p.returnToPage();
  p.setPixel([0, 0, 0, 254]);
  p.returnToPage();
  expect(reload).not.toHaveBeenCalled();
  p.setPixel([0, 0, 0, 0]);
  p.returnToPage();
  expect(reload).toHaveBeenCalledOnce();
});

it("waits out a game canvas Chrome loses and restores by itself; one still lost reloads", async () => {
  vi.useFakeTimers();
  const p = page(), g = game();
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc, session: p.session, watch: [g.canvas], now: () => Date.now() });
  g.lose(true);
  await vi.advanceTimersByTimeAsync(2_000);
  g.lose(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(reload).not.toHaveBeenCalled();
  g.lose(true);
  await vi.advanceTimersByTimeAsync(LOST_GRACE_MS + 1_000);
  expect(reload).toHaveBeenCalledOnce();
});

it("never reloads twice inside the cooldown, even across the reload itself", () => {
  vi.useFakeTimers();
  const p = page();
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc, session: p.session, now: () => Date.now() });
  p.setPixel([0, 0, 0, 0]);
  p.returnToPage();
  // The reloaded page: a fresh install, the same tab's session.
  const again = vi.fn(async () => true);
  const q = page();
  installCanvasPurgeRecovery({ reload: again, doc: q.doc, session: p.session, now: () => Date.now() });
  q.setPixel([0, 0, 0, 0]);
  q.returnToPage();
  expect(again).not.toHaveBeenCalled();
  vi.advanceTimersByTime(RELOAD_COOLDOWN_MS);
  q.returnToPage();
  expect(again).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});

it("waits until it can save, then tries again", async () => {
  vi.useFakeTimers();
  const p = page();
  const reload = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  // A save that fails leaves the cooldown to the reload that does happen.
  installCanvasPurgeRecovery({ reload, doc: p.doc, session: p.session, now: () => Date.now() });
  p.setPixel([0, 0, 0, 0]);
  p.returnToPage();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(reload).toHaveBeenCalledTimes(2);
});

it("never trusts a blank read on a browser whose canvas reads were blank from the start", () => {
  vi.useFakeTimers();
  const p = page();
  // Canvas reads blocked: blank before anything could have wiped it.
  p.setPixel([0, 0, 0, 0]);
  const reload = vi.fn(async () => true);
  installCanvasPurgeRecovery({ reload, doc: p.doc, session: p.session, now: () => Date.now() });
  p.returnToPage();
  vi.advanceTimersByTime(RELOAD_COOLDOWN_MS * 2);
  p.returnToPage();
  expect(reload).not.toHaveBeenCalled();
});
