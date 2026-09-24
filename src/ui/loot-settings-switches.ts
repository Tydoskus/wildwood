export type LootSettings = { autoKeepBest: boolean; autoEquipBest: boolean };
type LootSetting = keyof LootSettings;
type Result = { ok: boolean; error?: string } | undefined;

/** What the switches need from the coop session. Without the setter they stay hidden. */
export type LootSettingsPort = {
  lootSettings?: () => LootSettings;
  setLootSettings?: (settings: LootSettings) => Promise<Result>;
};

/** Both on until the player says otherwise, as on the server. */
const DEFAULT_SETTINGS: LootSettings = { autoKeepBest: true, autoEquipBest: true };

/** The switches, in order, with the line under each. */
export const LOOT_SETTING_SWITCHES: readonly { setting: LootSetting; label: string; hint: string }[] = [
  { setting: "autoKeepBest", label: "Auto keep best copy", hint: "Keeps the better skill roll, discards the rest. Off = ask me." },
  { setting: "autoEquipBest", label: "Auto equip upgrades", hint: "" },
];

/**
 * The two loot automation switches at the top of the Loot Filter window,
 * drawn like its item rows. A switch changes the moment it is pressed and the
 * server is told; if the server refuses or cannot be reached it goes back and
 * `setStatus` says why, the same way the filter's own switches behave.
 */
export function createLootSettingsSwitches(options: {
  container: HTMLElement;
  port: () => LootSettingsPort | null | undefined;
  setStatus: (text: string) => void;
  root?: Document;
}) {
  const doc = options.root ?? document;
  for (const { setting, label, hint } of LOOT_SETTING_SWITCHES) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "loot-filter-row loot-filter-setting";
    button.dataset.setting = setting;
    button.setAttribute("role", "switch");
    button.setAttribute("aria-label", label);
    button.innerHTML = `<span class="loot-filter-copy"><strong></strong><span class="loot-filter-detail"></span></span>`
      + `<span class="loot-filter-switch" aria-hidden="true"><span class="loot-filter-switch-label"></span><span class="loot-filter-check"></span></span>`;
    button.querySelector("strong")!.textContent = label;
    button.querySelector(".loot-filter-detail")!.textContent = hint;
    button.addEventListener("click", () => { void toggle(setting); });
    options.container.append(button);
  }

  /** Presses on their way, newest per switch: a late answer to an older press never undoes a newer one. */
  const pending = new Map<LootSetting, { on: boolean; press: number; confirmed: boolean }>();
  let presses = 0;

  function isOn(setting: LootSetting) {
    const server = (options.port()?.lootSettings?.() ?? DEFAULT_SETTINGS)[setting];
    const entry = pending.get(setting);
    if (!entry) return server;
    if (entry.confirmed && entry.on === server) {
      pending.delete(setting);
      return server;
    }
    return entry.on;
  }

  const current = (): LootSettings => ({ autoKeepBest: isOn("autoKeepBest"), autoEquipBest: isOn("autoEquipBest") });

  function sync() {
    options.container.hidden = !options.port()?.setLootSettings;
    for (const button of options.container.querySelectorAll<HTMLButtonElement>("[data-setting]")) {
      const on = isOn(button.dataset.setting as LootSetting);
      button.setAttribute("aria-checked", String(on));
      button.querySelector(".loot-filter-switch-label")!.textContent = on ? "On" : "Off";
    }
  }

  async function toggle(setting: LootSetting) {
    const send = options.port()?.setLootSettings;
    if (!send) return;
    const press = ++presses;
    pending.set(setting, { on: !isOn(setting), press, confirmed: false });
    options.setStatus("");
    sync();
    let result: Result;
    try { result = await send(current()); } catch (error) { result = { ok: false, error: String((error as Error)?.message ?? error) }; }
    const entry = pending.get(setting);
    if (entry?.press === press) {
      if (result?.ok) entry.confirmed = true;
      else pending.delete(setting);
    }
    if (!result?.ok) options.setStatus(`Not saved: ${result?.error ?? "NOT CONNECTED"}`);
    sync();
  }

  /** On opening: a confirmed press the server never matched was changed elsewhere since; the server stands. */
  function forgetConfirmed() {
    for (const [setting, entry] of pending) if (entry.confirmed) pending.delete(setting);
  }

  return { sync, forgetConfirmed, current };
}
