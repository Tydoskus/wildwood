import { describe, expect, it, vi } from "vitest";
import {
  createStartupReleaseNotes,
  type StartupReleaseNotesElements,
} from "./startup-release-notes";

class FakeElement {
  hidden = true;
  private listeners = new Map<string, Set<() => void>>();
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
    title: new FakeElement(),
    items: new FakeElement(),
    close: new FakeElement(),
  } as unknown as StartupReleaseNotesElements & {
    overlay: FakeElement;
    close: FakeElement;
  };
}

describe("startup release notes", () => {
  it("renders unseen notes before the game bundle owns the startup screen", () => {
    const ui = elements();
    const render = vi.fn(({ overlay }: { overlay: FakeElement }) => { overlay.hidden = false; });
    const notes = createStartupReleaseNotes({
      version: "0.550",
      releases: () => [{ version: "0.550", notes: ["A smoother sign-in."] }],
      seenVersion: () => "0.549",
      markSeen: vi.fn(),
      render: render as never,
    }, ui);

    notes.show();

    expect(render).toHaveBeenCalledTimes(1);
    expect(ui.overlay.hidden).toBe(false);
  });

  it("marks notes seen only when they are explicitly closed", () => {
    const ui = elements();
    const markSeen = vi.fn();
    const notes = createStartupReleaseNotes({
      version: "0.550",
      releases: () => [{ version: "0.550", notes: ["A smoother sign-in."] }],
      seenVersion: () => "0.549",
      markSeen,
      render: (({ overlay }: { overlay: FakeElement }) => { overlay.hidden = false; }) as never,
    }, ui);

    notes.show();
    notes.hide();
    expect(markSeen).not.toHaveBeenCalled();

    notes.show();
    ui.close.click();
    expect(ui.overlay.hidden).toBe(true);
    expect(markSeen).toHaveBeenCalledTimes(1);
  });
});
