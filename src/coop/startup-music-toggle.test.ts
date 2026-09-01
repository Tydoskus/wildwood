import { describe, expect, it } from "vitest";
import {
  createStartupMusicToggle,
  type StartupMusicToggleElements,
} from "./startup-music-toggle";

class FakeButton {
  title = "";
  private attributeValues = new Map<string, string>();
  private listeners = new Map<string, Set<() => void>>();
  setAttribute(name: string, value: string) {
    this.attributeValues.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributeValues.get(name) ?? null;
  }
  addEventListener(name: string, listener: () => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name: string, listener: () => void) {
    this.listeners.get(name)?.delete(listener);
  }
  click() {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }
}

class FakeStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function elements() {
  return { toggle: new FakeButton() } as unknown as StartupMusicToggleElements & { toggle: FakeButton };
}

describe("startup music toggle", () => {
  it("mutes and restores the saved audible volume before the game bundle loads", () => {
    const ui = elements();
    const storage = new FakeStorage();
    storage.setItem("music", ".72");
    const control = createStartupMusicToggle({ storageKey: "music", storage }, ui);

    expect(control.volume()).toBe(.72);
    expect(ui.toggle.getAttribute("aria-pressed")).toBe("false");
    expect(ui.toggle.getAttribute("aria-label")).toBe("Mute music");

    ui.toggle.click();
    expect(control.volume()).toBe(0);
    expect(storage.getItem("music")).toBe("0");
    expect(ui.toggle.getAttribute("aria-pressed")).toBe("true");
    expect(ui.toggle.title).toBe("Unmute music");

    ui.toggle.click();
    expect(control.volume()).toBe(.72);
    expect(storage.getItem("music")).toBe("0.72");
    expect(ui.toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("uses the default audible volume when a returning player starts muted", () => {
    const ui = elements();
    const storage = new FakeStorage();
    storage.setItem("music", "0");
    const control = createStartupMusicToggle({ storageKey: "music", storage }, ui);

    expect(ui.toggle.getAttribute("aria-pressed")).toBe("true");
    ui.toggle.click();
    expect(control.volume()).toBe(.35);
    expect(storage.getItem("music")).toBe("0.35");

    control.dispose();
    ui.toggle.click();
    expect(control.volume()).toBe(.35);
  });
});
