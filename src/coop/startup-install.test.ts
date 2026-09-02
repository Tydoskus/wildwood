import { describe, expect, it } from "vitest";
import {
  createStartupInstallControl,
  type StartupInstallElements,
  type StartupInstallPromptEvent,
} from "./startup-install";

type Listener = EventListener;

class FakeButton {
  hidden = true;
  disabled = false;
  textContent = "";
  private listeners = new Set<Listener>();
  addEventListener(_type: string, listener: Listener) { this.listeners.add(listener); }
  removeEventListener(_type: string, listener: Listener) { this.listeners.delete(listener); }
  async click() {
    const event = new Event("click");
    for (const listener of this.listeners) await listener(event);
  }
}

class FakeHint {
  hidden = true;
  textContent = "";
}

class FakeWindow {
  standalone = false;
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  matchMedia() { return { matches: this.standalone }; }
  dispatch(type: string, event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function elements() {
  const button = new FakeButton();
  const hint = new FakeHint();
  return {
    button,
    hint,
    value: { button, hint } as unknown as StartupInstallElements,
  };
}

const desktopNavigator = {
  userAgent: "Mozilla/5.0 Chrome/140 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

describe("startup install control", () => {
  it("uses a captured browser install prompt once and hides after installation", async () => {
    const ui = elements();
    const browser = new FakeWindow();
    const control = createStartupInstallControl({
      windowValue: browser,
      navigatorValue: desktopNavigator,
    }, ui.value);
    expect(ui.button.hidden).toBe(true);

    let promptCalls = 0;
    const promptEvent = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        promptCalls += 1;
        return { outcome: "accepted" };
      },
    }) as StartupInstallPromptEvent;
    browser.dispatch("beforeinstallprompt", promptEvent);

    expect(promptEvent.defaultPrevented).toBe(true);
    expect(ui.button.hidden).toBe(false);
    expect(ui.button.textContent).toBe("INSTALL WILDSTAT");
    await ui.button.click();
    expect(promptCalls).toBe(1);
    expect(ui.button.hidden).toBe(true);
    expect(ui.hint.textContent).toBe("INSTALLING WILDSTAT…");

    browser.dispatch("appinstalled");
    expect(ui.hint.hidden).toBe(true);
    control.dispose();
  });

  it("gives Safari's manual Home Screen instruction on iPhone", async () => {
    const ui = elements();
    const browser = new FakeWindow();
    createStartupInstallControl({
      windowValue: browser,
      navigatorValue: {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
    }, ui.value);

    expect(ui.button.hidden).toBe(false);
    expect(ui.button.textContent).toBe("ADD TO HOME SCREEN");
    await ui.button.click();
    expect(ui.hint.hidden).toBe(false);
    expect(ui.hint.textContent).toBe("TAP SHARE, THEN ADD TO HOME SCREEN.");
  });

  it("stays hidden in unsupported and standalone contexts", () => {
    const unsupported = elements();
    createStartupInstallControl({
      windowValue: new FakeWindow(),
      navigatorValue: desktopNavigator,
    }, unsupported.value);
    expect(unsupported.button.hidden).toBe(true);

    const installed = elements();
    const standaloneWindow = new FakeWindow();
    standaloneWindow.standalone = true;
    createStartupInstallControl({
      windowValue: standaloneWindow,
      navigatorValue: desktopNavigator,
    }, installed.value);
    expect(installed.button.hidden).toBe(true);
  });
});
