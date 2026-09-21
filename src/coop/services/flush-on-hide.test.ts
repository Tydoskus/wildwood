import { expect, it, vi } from "vitest";
import { bindProgressFlushOnHide } from "./flush-on-hide";

function fixture() {
  const docHandlers = new Map<string, () => void>(), winHandlers = new Map<string, () => void>();
  const doc = { hidden: false, addEventListener: (type: string, handler: () => void) => docHandlers.set(type, handler) };
  const win = { addEventListener: (type: string, handler: () => void) => winHandlers.set(type, handler) };
  const flush = vi.fn();
  bindProgressFlushOnHide(doc as never, win as never, flush);
  return { doc, flush, hide: () => { doc.hidden = true; docHandlers.get("visibilitychange")!(); }, show: () => { doc.hidden = false; docHandlers.get("visibilitychange")!(); }, pagehide: () => winHandlers.get("pagehide")!() };
}
it("forces a report when the tab is hidden, not when it returns", () => {
  const f = fixture();
  f.hide();
  expect(f.flush).toHaveBeenCalledExactlyOnceWith(true);
  f.show();
  expect(f.flush).toHaveBeenCalledTimes(1);
});
it("forces a report when the page is going away", () => {
  const f = fixture();
  f.pagehide();
  expect(f.flush).toHaveBeenCalledExactlyOnceWith(true);
});
