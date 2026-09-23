import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installHudProgressSettings } from "./hud-progress-settings";

describe("HUD countdown settings", () => {
  it("hides each timer independently and remembers its choice", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const setup = () => {
      const { document, Event } = parseHTML('<div id="settings"><div class="setting-row"><button id="statTrackerToggle"></button></div></div>');
      const changed = vi.fn();
      const settings = installHudProgressSettings(document.getElementById("settings")!, changed, storage);
      const click = (label: string) => document.querySelector(`button[aria-label="${label}"]`)!.dispatchEvent(new Event("click"));
      return { settings, changed, click };
    };

    const first = setup();
    first.click("slot 1 timer");
    first.click("slot 3 timer");
    expect(first.settings.visible("slotOne")).toBe(false);
    expect(first.settings.visible("research")).toBe(true);
    expect(first.settings.visible("slotTwo")).toBe(true);
    expect(first.settings.visible("slotThree")).toBe(false);
    expect(first.changed).toHaveBeenCalledTimes(2);
    const restored = setup();
    expect(restored.settings.visible("slotOne")).toBe(false);
    expect(restored.settings.visible("research")).toBe(true);
    expect(restored.settings.visible("slotTwo")).toBe(true);
    expect(restored.settings.visible("slotThree")).toBe(false);
  });
});
