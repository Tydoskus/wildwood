import { afterEach, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { createLootSettingsSwitches, type LootSettings, type LootSettingsPort } from "./loot-settings-switches";

const globals = globalThis as unknown as Record<string, unknown>;
const saved = { document: globals.document, HTMLElement: globals.HTMLElement };
afterEach(() => { Object.assign(globals, saved); });

type Call = { settings: LootSettings; resolve: (result: { ok: boolean; error?: string }) => void };

function harness(server: LootSettings | null = null, options: { withSetter?: boolean } = {}) {
  const { document, window } = parseHTML(`<html><body><div id="settings" hidden></div></body></html>`);
  Object.assign(globals, { document, HTMLElement: window.HTMLElement });
  let stored = server;
  const calls: Call[] = [];
  const port: LootSettingsPort = {
    ...(stored ? { lootSettings: () => stored! } : { lootSettings: () => ({ autoKeepBest: true, autoEquipBest: true }) }),
    ...(options.withSetter === false ? {} : {
      setLootSettings: (settings: LootSettings) => new Promise(resolve => calls.push({ settings, resolve })),
    }),
  };
  const statuses: string[] = [];
  const container = document.getElementById("settings") as unknown as HTMLElement;
  const switches = createLootSettingsSwitches({ container, port: () => port, setStatus: text => statuses.push(text), root: document as unknown as Document });
  const button = (setting: string) => document.querySelector(`[data-setting="${setting}"]`) as unknown as HTMLButtonElement;
  const state = (setting: string) => [button(setting).getAttribute("aria-checked"), button(setting).querySelector(".loot-filter-switch-label")!.textContent];
  /** The server answers the oldest call: on success its row changes first, as a transaction update does. */
  const answer = async (result: { ok: boolean; error?: string } = { ok: true }) => {
    const call = calls.shift()!;
    if (result.ok) stored = call.settings;
    call.resolve(result);
    await Promise.resolve(); await Promise.resolve();
  };
  return { switches, container, button, state, calls, answer, statuses, stored: () => stored };
}

it("shows both switches on for an account that never chose, with the hint under Auto keep best", () => {
  const view = harness();
  view.switches.sync();
  expect(view.container.hidden).toBe(false);
  expect(view.state("autoKeepBest")).toEqual(["true", "On"]);
  expect(view.state("autoEquipBest")).toEqual(["true", "On"]);
  expect(view.button("autoKeepBest").querySelector("strong")!.textContent).toBe("Auto keep best copy");
  expect(view.button("autoKeepBest").querySelector(".loot-filter-detail")!.textContent)
    .toBe("Keeps the better skill roll, discards the rest. Off = ask me.");
  expect(view.button("autoEquipBest").querySelector("strong")!.textContent).toBe("Auto equip upgrades");
  expect(view.button("autoKeepBest").getAttribute("role")).toBe("switch");
});

it("switches at once, sends both settings, and stays switched once the server agrees", async () => {
  const view = harness({ autoKeepBest: true, autoEquipBest: true });
  view.switches.sync();
  view.button("autoKeepBest").click();
  expect(view.state("autoKeepBest")).toEqual(["false", "Off"]);
  expect(view.calls.map(call => call.settings)).toEqual([{ autoKeepBest: false, autoEquipBest: true }]);
  await view.answer();
  expect(view.state("autoKeepBest")).toEqual(["false", "Off"]);
  expect(view.stored()).toEqual({ autoKeepBest: false, autoEquipBest: true });
  view.button("autoEquipBest").click();
  expect(view.calls.map(call => call.settings)).toEqual([{ autoKeepBest: false, autoEquipBest: false }]);
});

it("goes back and says why when the server refuses", async () => {
  const view = harness({ autoKeepBest: true, autoEquipBest: false });
  view.switches.sync();
  view.button("autoEquipBest").click();
  expect(view.state("autoEquipBest")).toEqual(["true", "On"]);
  await view.answer({ ok: false, error: "NOT CONNECTED" });
  expect(view.state("autoEquipBest")).toEqual(["false", "Off"]);
  expect(view.statuses.at(-1)).toBe("Not saved: NOT CONNECTED");
});

it("never lets a late answer to an older press undo a newer one", async () => {
  const view = harness({ autoKeepBest: true, autoEquipBest: true });
  view.switches.sync();
  view.button("autoKeepBest").click();
  view.button("autoKeepBest").click();
  expect(view.state("autoKeepBest")).toEqual(["true", "On"]);
  await view.answer({ ok: false, error: "Try again" });
  expect(view.state("autoKeepBest")).toEqual(["true", "On"]);
});

it("hides the switches when the session cannot change them", () => {
  const view = harness(null, { withSetter: false });
  view.switches.sync();
  expect(view.container.hidden).toBe(true);
});
