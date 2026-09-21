import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installFeedbackSettings } from "./feedback-settings";

function setup(values = new Map<string, string>(), brokenStorage = false) {
  const { document, Event } = parseHTML(`<html><body><div id="toolbar">
    <button id="home"><span id="icon">Home</span></button><button id="disabled" disabled>Shop</button>
    <section><button id="damageFlashToggle"></button><button id="toolbarHapticsToggle"></button><button id="selfProfileTapToggle"></button></section>
    </div><button id="outside">Other</button></body></html>`);
  const haptic = vi.fn();
  const settings = installFeedbackSettings(document, {
    getItem: key => { if (brokenStorage) throw new Error("blocked"); return values.get(key) ?? null; },
    setItem: (key, value) => { if (brokenStorage) throw new Error("blocked"); values.set(key, value); },
  }, haptic);
  return { ...settings, haptic, click: (id: string) => document.getElementById(id)!.dispatchEvent(new Event("click", { bubbles: true })) };
}

describe("damage and toolbar feedback preferences", () => {
  it("defaults flash off and haptics on, persists toggles, and only responds to enabled toolbar buttons", () => {
    const values = new Map<string, string>();
    const first = setup(values);
    expect(first.damageFlashEnabled()).toBe(false);
    first.click("icon");
    expect(first.haptic).toHaveBeenCalledTimes(1);
    first.click("disabled"); first.click("outside"); first.click("damageFlashToggle");
    expect(first.damageFlashEnabled()).toBe(true);
    expect(first.haptic).toHaveBeenCalledTimes(1);
    first.click("toolbarHapticsToggle"); first.click("home");
    expect(first.haptic).toHaveBeenCalledTimes(1);
    const restored = setup(values);
    expect(restored.damageFlashEnabled()).toBe(true);
    restored.click("home"); expect(restored.haptic).not.toHaveBeenCalled();
    restored.click("toolbarHapticsToggle"); restored.click("home");
    expect(restored.haptic).toHaveBeenCalledOnce();
  });

  it("keeps toggles functional with blocked storage and feedback failures", () => {
    const settings = setup(new Map(), true);
    expect(settings.damageFlashEnabled()).toBe(false);
    settings.click("damageFlashToggle"); expect(settings.damageFlashEnabled()).toBe(true);
    settings.haptic.mockImplementation(() => { throw new Error("unavailable"); });
    expect(() => settings.click("home")).not.toThrow();
    settings.click("toolbarHapticsToggle"); settings.click("home");
    expect(settings.haptic).toHaveBeenCalledOnce();
  });
});

describe("tapping your own sprite", () => {
  it("is off until the player asks for it, and remembers the answer", () => {
    const values = new Map<string, string>();
    const first = setup(values);
    // Your sprite stands where you are trying to walk, so the tap opened the
    // profile by accident. The HUD card, with its gear, is the deliberate way.
    expect(first.selfProfileTapEnabled()).toBe(false);
    first.click("selfProfileTapToggle");
    expect(first.selfProfileTapEnabled()).toBe(true);
    expect(setup(values).selfProfileTapEnabled()).toBe(true);
  });
});
