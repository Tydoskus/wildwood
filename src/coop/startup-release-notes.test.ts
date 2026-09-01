import { describe, expect, it, vi } from "vitest";
import {
  createStartupReleaseNotes,
  type StartupReleaseNotesElements,
} from "./startup-release-notes";

class FakeElement {
  hidden = true;
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

function elements() {
  return {
    overlay: new FakeElement(),
    items: new FakeElement(),
    toggle: new FakeElement(),
  } as unknown as StartupReleaseNotesElements & {
    overlay: FakeElement;
    toggle: FakeElement;
  };
}

describe("startup release notes", () => {
  it("prepares release notes closed before the game bundle owns the startup screen", () => {
    const ui = elements();
    const render = vi.fn();
    const notes = createStartupReleaseNotes({
      releases: () => [{ version: "0.550", notes: ["A smoother sign-in."] }],
      render: render as never,
    }, ui);

    notes.show();

    expect(render).toHaveBeenCalledTimes(1);
    expect(ui.overlay.hidden).toBe(true);
    expect(ui.toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the notes from the version button and closes them during startup transitions", () => {
    const ui = elements();
    const notes = createStartupReleaseNotes({
      releases: () => [{ version: "0.550", notes: ["A smoother sign-in."] }],
      render: vi.fn() as never,
    }, ui);

    notes.show();
    ui.toggle.click();
    expect(ui.overlay.hidden).toBe(false);
    expect(ui.toggle.getAttribute("aria-expanded")).toBe("true");

    ui.toggle.click();
    expect(ui.overlay.hidden).toBe(true);
    expect(ui.toggle.getAttribute("aria-expanded")).toBe("false");

    ui.toggle.click();
    notes.hide();
    expect(ui.overlay.hidden).toBe(true);
    expect(ui.toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
