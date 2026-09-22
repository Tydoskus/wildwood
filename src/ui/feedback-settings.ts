import { renderBooleanSetting } from "./settings";

const DAMAGE_FLASH_KEY = "wildwood-damage-flash-enabled-v1";
const TOOLBAR_HAPTICS_KEY = "wildwood-toolbar-haptics-enabled-v1";
const SELF_PROFILE_TAP_KEY = "wildstat-self-profile-tap-enabled-v1";

/** Device preferences apply immediately, even when storage is unavailable. */
export function installFeedbackSettings(doc: Document, storage: Pick<Storage, "getItem" | "setItem"> | undefined, haptic: () => void) {
  const read = (key: string, fallback: boolean) => {
    try { const value = storage?.getItem(key); return value == null ? fallback : value === "true"; }
    catch { return fallback; }
  };
  function toggle(id: string, key: string, fallback: boolean) {
    const button = doc.getElementById(id)!;
    let enabled = read(key, fallback);
    renderBooleanSetting(button, enabled);
    button.addEventListener("click", () => {
      enabled = !enabled;
      try { storage?.setItem(key, String(enabled)); } catch {}
      renderBooleanSetting(button, enabled);
    });
    return () => enabled;
  }
  const damageFlashEnabled = toggle("damageFlashToggle", DAMAGE_FLASH_KEY, false);
  const toolbarHapticsEnabled = toggle("toolbarHapticsToggle", TOOLBAR_HAPTICS_KEY, true);
  // Off by default: the player sprite sits where you are trying to walk, so the
  // tap opened the profile by accident. The HUD card is the deliberate target.
  const selfProfileTapEnabled = toggle("selfProfileTapToggle", SELF_PROFILE_TAP_KEY, false);
  // Capture before navigation; only direct toolbar buttons, not settings inside it.
  doc.addEventListener("click", event => {
    const target = event.target as Element | null;
    const button = target?.closest?.("#toolbar > button") as HTMLButtonElement | null;
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true" || !toolbarHapticsEnabled()) return;
    try { haptic(); } catch { /* Feedback must never interrupt navigation. */ }
  }, true);
  return { damageFlashEnabled, selfProfileTapEnabled };
}

/** The settings shell loads after startup, keeping the entry page small. */
export function installFeedbackControls(doc: Document) {
  const panel = doc.getElementById("settingsPanel");
  if (!panel) return;
  for (const [id, label, enabled] of [
    ["damageFlashToggle", "DAMAGE FLASH", false],
    ["toolbarHapticsToggle", "TOOLBAR HAPTICS", true],
    ["selfProfileTapToggle", "TAP SELF TO OPEN PROFILE", false],
    ["keepScreenOnToggle", "KEEP SCREEN ON", false],
    ["gameTickerToggle", "GAME TIPS", true],
    // Account-scoped and server-backed, so this only builds the row; the
    // binding lives with the connection that owns the preference.
    ["offlineProgressToggle", "OFFLINE PROGRESS", true],
  ] as const) {
    if (doc.getElementById(id)) continue;
    const row = doc.createElement("div");
    row.className = "setting-row";
    const text = doc.createElement("span");
    text.textContent = label;
    const button = doc.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "setting-toggle";
    button.setAttribute("aria-label", label);
    renderBooleanSetting(button, enabled);
    row.append(text, button);
    panel.append(row);
  }
}
