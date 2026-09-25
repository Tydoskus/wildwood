import { renderBooleanSetting } from "./settings";

export type HudTimerKind = "research" | "slotOne" | "slotTwo" | "slotThree" | "adTimer";
const SETTINGS: readonly { kind: HudTimerKind; label: string; key: string; shownByDefault?: false }[] = [
  { kind: "research", label: "TECH TIMER", key: "wildstat-hud-tech-timer-visible" },
  { kind: "slotOne", label: "SLOT 1 TIMER", key: "wildstat-hud-slot-one-timer-visible" },
  { kind: "slotTwo", label: "SLOT 2 TIMER", key: "wildstat-hud-slot-two-timer-visible" },
  { kind: "slotThree", label: "SLOT 3 TIMER", key: "wildstat-hud-slot-three-timer-visible" },
  // The ad's wait until the next one. Hidden unless asked for; the ad button
  // itself still appears whenever an ad is ready.
  { kind: "adTimer", label: "AD TIMER", key: "wildstat-hud-ad-timer-visible", shownByDefault: false },
];

/** Each countdown has its own saved visibility switch in Settings. */
export function installHudProgressSettings(panel: HTMLElement, onChange: () => void, storage: Pick<Storage, "getItem" | "setItem"> | null = null) {
  const visible = {} as Record<HudTimerKind, boolean>;
  const anchor = panel.querySelector("#statTrackerToggle")?.closest(".setting-row");
  const document = panel.ownerDocument;
  for (const setting of SETTINGS) {
    const shownByDefault = setting.shownByDefault ?? true;
    let stored: string | null = null;
    try { stored = storage?.getItem(setting.key) ?? null; } catch { /* Use the default. */ }
    visible[setting.kind] = stored === null ? shownByDefault : stored !== "false";
    const row = document.createElement("div");
    row.className = "setting-row";
    const label = document.createElement("span");
    label.textContent = setting.label;
    const button = document.createElement("button");
    button.className = "setting-toggle";
    button.type = "button";
    button.setAttribute("aria-label", setting.label.toLowerCase());
    const render = () => renderBooleanSetting(button, visible[setting.kind]);
    button.addEventListener("click", () => {
      visible[setting.kind] = !visible[setting.kind];
      try { storage?.setItem(setting.key, String(visible[setting.kind])); } catch { /* Keep current session choice. */ }
      render();
      onChange();
    });
    render();
    row.append(label, button);
    if (anchor) anchor.before(row); else panel.append(row);
  }
  return { visible: (kind: HudTimerKind) => visible[kind] };
}
