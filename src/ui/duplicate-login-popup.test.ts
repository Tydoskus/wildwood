import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createDuplicateLoginPopup, duplicateLoginStorageKey } from "./duplicate-login-popup";

const IDENTITY = "c200abc";
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(options: { name?: string; ready?: boolean; stored?: Record<string, string>; html?: string } = {}) {
  const { document } = parseHTML(`<html><body>${options.html ?? ""}</body></html>`);
  const values = new Map(Object.entries(options.stored ?? {}));
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const state = { ready: options.ready ?? true, time: 10_000 };
  const lookup = vi.fn(async () => options.name ?? "Vis");
  const signOut = vi.fn(), pause = vi.fn();
  const popup = createDuplicateLoginPopup({ root: document as unknown as Document, storage, now: () => state.time,
    identity: () => IDENTITY, ready: () => state.ready, lookup, signOut, pause });
  const overlay = document.getElementById("duplicateLoginWarning") as any;
  const click = (selector: string) => { state.time += 1_000; overlay.querySelector(selector).dispatchEvent(new document.defaultView!.Event("click")); };
  /** A HUD tick, the lookup resolving, then the next tick that shows it. */
  const arrive = async () => { popup.poll(); await flush(); popup.poll(); };
  return { document, popup, overlay, lookup, signOut, pause, click, arrive, values, state };
}

describe("existing character warning", () => {
  it("is not displayed until there is something to say", async () => {
    const f = setup({ name: "" });
    expect(f.overlay.style.display).toBe("none");
    await f.arrive();
    expect(f.overlay.style.display).toBe("none");
    const shown = setup();
    await shown.arrive();
    expect(shown.overlay.style.display).toBe("grid");
    shown.click(".duplicate-login-keep");
    expect(shown.overlay.style.display).toBe("none");
  });

  it("names the other character, asks the server once, and signs out on request", async () => {
    const f = setup();
    await f.arrive();
    expect(f.overlay.hidden).toBe(false);
    expect(f.overlay.textContent).toContain("already has a character, Vis");
    expect(f.pause).toHaveBeenCalledWith(true);
    f.click(".duplicate-login-sign-out");
    expect(f.signOut).toHaveBeenCalledOnce();
    expect(f.overlay.hidden).toBe(true);
    f.popup.poll();
    expect(f.lookup).toHaveBeenCalledOnce();
  });

  it("stays quiet with no other character, before sign-in, or after the player chose to keep this one", async () => {
    const none = setup({ name: "" });
    await none.arrive();
    expect(none.overlay.hidden).toBe(true);

    const early = setup({ ready: false });
    await early.arrive();
    expect(early.lookup).not.toHaveBeenCalled();

    const kept = setup();
    await kept.arrive();
    kept.click(".duplicate-login-keep");
    expect(kept.values.get(duplicateLoginStorageKey(IDENTITY))).toBe("Vis");
    const again = setup({ stored: { [duplicateLoginStorageKey(IDENTITY)]: "Vis" } });
    await again.arrive();
    expect(again.overlay.hidden).toBe(true);
  });

  it("waits for another window to close, and ignores presses in the first moment", async () => {
    const f = setup({ html: `<div role="dialog" id="other"></div>` });
    await f.arrive();
    expect(f.overlay.hidden).toBe(true);
    f.document.getElementById("other")!.remove();
    f.popup.poll();
    expect(f.overlay.hidden).toBe(false);
    f.overlay.querySelector(".duplicate-login-sign-out").dispatchEvent(new f.document.defaultView!.Event("click"));
    expect(f.signOut).not.toHaveBeenCalled();
  });
});
