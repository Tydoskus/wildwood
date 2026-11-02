import { describe, expect, it } from "vitest";
import { actionForKey, actionForPadButton, defaultBindings, keyLabel, padLabel, parseBindings, withKey, withPadButton } from "./control-bindings";

describe("control bindings", () => {
  it("starts on WASD, the old shortcut keys, and Xbox-style buttons", () => {
    const bindings = defaultBindings();
    expect(bindings.keys).toMatchObject({ moveUp: "KeyW", moveLeft: "KeyA", autoFarm: "KeyF", inventory: "KeyI", map: "KeyM", settings: "" });
    expect(bindings.pad).toMatchObject({ autoFarm: 2, inventory: 3, map: 8, settings: 9, moveUp: null });
    expect(actionForKey("KeyI", bindings)).toBe("inventory");
    expect(actionForKey("", bindings)).toBeNull();
    expect(actionForPadButton(9, bindings)).toBe("settings");
  });

  it("keeps saved bindings, and drops anything unknown, reserved, unbindable or doubled", () => {
    const saved = parseBindings(JSON.stringify({
      keys: { inventory: "KeyU", map: "Escape", guild: "KeyU", nonsense: "KeyQ" },
      pad: { inventory: 5, map: 0, profile: null, moveUp: 3, guild: 5 },
    }));
    expect(saved.keys).toMatchObject({ inventory: "KeyU", map: "KeyM", guild: "" });
    expect(saved.pad).toMatchObject({ inventory: 5, map: 8, profile: null, moveUp: null, guild: null });
    expect(parseBindings("not json")).toEqual(defaultBindings());
  });

  it("swaps when a key or button is already taken, and refuses reserved ones", () => {
    let bindings = withKey(defaultBindings(), "inventory", "KeyM");
    expect(bindings.keys).toMatchObject({ inventory: "KeyM", map: "KeyI" });
    bindings = withKey(bindings, "inventory", "");
    expect(bindings.keys.inventory).toBe("");
    expect(withKey(bindings, "map", "Enter")).toBe(bindings);
    bindings = withPadButton(bindings, "leaderboard", 3);
    expect(bindings.pad).toMatchObject({ leaderboard: 3, inventory: null });
    expect(withPadButton(bindings, "map", 1)).toBe(bindings);
    expect(withPadButton(bindings, "moveUp", 4)).toBe(bindings);
  });

  it("names keys and buttons as players read them", () => {
    expect([keyLabel("KeyI"), keyLabel("Digit4"), keyLabel("ShiftLeft"), keyLabel("Backquote"), keyLabel("")])
      .toEqual(["I", "4", "Left Shift", "Backquote", "None"]);
    expect([padLabel(3), padLabel(9), padLabel(null)]).toEqual(["Y", "Menu", "None"]);
  });
});
