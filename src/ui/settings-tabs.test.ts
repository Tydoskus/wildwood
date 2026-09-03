import { describe, expect, it, vi } from "vitest";
import { installSettingsTabs } from "./settings-tabs";

class ElementStub {
  id = "";
  className = "";
  hidden = false;
  tabIndex = 0;
  textContent = "";
  parent: ElementStub | null = null;
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: any) => void)[]>();
  focus = vi.fn();
  classList = {
    add: (name: string) => { this.className += ` ${name}`; },
    toggle: (name: string, enabled: boolean) => {
      const classes = new Set(this.className.split(" "));
      if (enabled) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(" ");
    },
  };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, listener: (event: any) => void) {
    this.listeners.set(name, [...this.listeners.get(name) ?? [], listener]);
  }
  dispatch(name: string, event = {}) { this.listeners.get(name)?.forEach((listener) => listener(event)); }
  append(child: ElementStub) { this.insertBefore(child, null); }
  prepend(child: ElementStub) { this.insertBefore(child, this.children[0] ?? null); }
  insertBefore(child: ElementStub, before: ElementStub | null) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  }
  matches(selector: string) {
    return selector.startsWith("#") ? this.id === selector.slice(1) : this.className.split(" ").includes(selector.slice(1));
  }
  closest(selector: string): ElementStub | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector: string): ElementStub[] {
    return this.children.flatMap((child) => [...child.matches(selector) ? [child] : [], ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
}

function fixture() {
  const root = new ElementStub();
  root.id = "settingsPanel";
  const add = (id: string, className: string, parent = root) => {
    const element = new ElementStub();
    element.id = id;
    element.className = className;
    parent.append(element);
    return element;
  };
  for (const id of ["connectionStatus", "screenShakeToggle", "attackRangeToggle", "chatToggle", "fullscreenToggle", "lowPerformanceToggle", "fpsToggle", "latencyToggle", "musicVolume", "sfxVolume", "accountButton"]) {
    add(id, "", add("", "setting-row"));
  }
  add("accountStatus", "account-status");
  add("blockedPlayersSetting", "setting-support").hidden = true;
  add("support", "setting-support");
  add("terms", "setting-legal");
  add("developerSettingsRow", "setting-row").hidden = true;
  add("resetProgressBtn", "", add("", "setting-reset"));
  add("closeSettingsBtn", "", add("", "window-back-footer"));
  const get = (id: string) => id === root.id ? root : root.querySelector(`#${id}`)!;
  const doc = { getElementById: get, createElement: () => new ElementStub() } as unknown as Document;
  return { root, doc, get };
}

describe("Settings tabs", () => {
  it("groups existing controls without resetting values, listeners, or permission visibility", () => {
    const { root, doc, get } = fixture();
    const audio = get("sfxVolume");
    const listener = vi.fn();
    audio.addEventListener("input", listener);
    installSettingsTabs(doc);
    expect(get("settings-game-panel").hidden).toBe(false);
    expect(get("settings-audio-panel").hidden).toBe(true);
    expect(get("settings-account-panel").hidden).toBe(true);
    expect(get("settings-game-panel").querySelectorAll(".setting-row")).toHaveLength(7);
    expect(get("settings-audio-panel").querySelector("#sfxVolume")).toBe(audio);
    audio.dispatch("input");
    expect(listener).toHaveBeenCalledOnce();
    for (const id of ["accountStatus", "blockedPlayersSetting", "support", "terms", "developerSettingsRow", "resetProgressBtn"]) {
      expect(get("settings-account-panel").querySelector(`#${id}`)).toBe(get(id));
    }
    expect(get("blockedPlayersSetting").hidden).toBe(true);
    expect(get("developerSettingsRow").hidden).toBe(true);
    expect(root.children.map((child) => child.className)).toEqual([
      "settings-tabs", "setting-row settings-connection", "settings-content", "window-back-footer",
    ]);
    get("settings-audio-tab").dispatch("click");
    root.hidden = true;
    root.hidden = false;
    installSettingsTabs(doc);
    expect(get("settings-audio-panel").hidden).toBe(false);
    expect(root.querySelectorAll("#settingsTabs")).toHaveLength(1);
  });

  it("supports click, arrow keys, Home and End with one keyboard tab stop", () => {
    const { doc, get } = fixture();
    installSettingsTabs(doc);
    const game = get("settings-game-tab");
    const audio = get("settings-audio-tab");
    const account = get("settings-account-tab");
    audio.dispatch("click");
    expect(audio.attributes.get("aria-selected")).toBe("true");
    expect(game.tabIndex).toBe(-1);
    expect(audio.tabIndex).toBe(0);
    const key = (tab: ElementStub, value: string) => tab.dispatch("keydown", { key: value, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    key(audio, "End");
    expect(account.focus).toHaveBeenCalledOnce();
    key(account, "ArrowRight");
    expect(game.attributes.get("aria-selected")).toBe("true");
    key(game, "ArrowLeft");
    expect(account.attributes.get("aria-selected")).toBe("true");
    key(account, "Home");
    expect(get("settings-game-panel").hidden).toBe(false);
    expect(get("settings-account-panel").hidden).toBe(true);
  });
});
