import { renderBooleanSetting } from "./settings";
import { setNumberNotation } from "../../shared/compact-number";
import { setStatPopupsEnabled } from "./stat-popup-setting";
import { setChatTimestampsEnabled } from "./chat-timestamp-setting";
import { setEnemyHpNumbersEnabled } from "../game/runtime/enemy-hp-setting";
import { setDamageNumbersEnabled } from "../game/runtime/damage-number-setting";
import { setCardFoundPopupsEnabled } from "./card-found-setting";
import { setOwnNamePlateEnabled } from "../game/runtime/name-plate-setting";
import { setGuildTagsVisible } from "../app/player-name-tags";

const TOOLBAR_HAPTICS_KEY = "wildwood-toolbar-haptics-enabled-v1";
const SELF_PROFILE_TAP_KEY = "wildstat-self-profile-tap-enabled-v1";
const SCIENTIFIC_NOTATION_KEY = "wildstat-scientific-notation-v1";
const STAT_POPUPS_KEY = "wildstat-stat-popups-v1";
const CHAT_TIMESTAMPS_KEY = "wildstat-chat-timestamps-v1";
const ENEMY_HP_NUMBERS_KEY = "wildstat-enemy-hp-numbers-v1";
const DAMAGE_NUMBERS_KEY = "wildstat-damage-numbers-v1";
const CARD_FOUND_POPUPS_KEY = "wildstat-card-found-popups-v1";
const OWN_NAME_PLATE_KEY = "wildstat-own-name-plate-v1";
const GUILD_TAGS_KEY = "wildstat-guild-tags-v1";

/** Device preferences apply immediately, even when storage is unavailable. */
export function installFeedbackSettings(doc: Document, storage: Pick<Storage, "getItem" | "setItem"> | undefined, haptic: () => void) {
  const read = (key: string, fallback: boolean) => {
    try { const value = storage?.getItem(key); return value == null ? fallback : value === "true"; }
    catch { return fallback; }
  };
  function toggle(id: string, key: string, fallback: boolean, onChange?: (enabled: boolean) => void) {
    const button = doc.getElementById(id)!;
    let enabled = read(key, fallback);
    renderBooleanSetting(button, enabled);
    onChange?.(enabled);
    button.addEventListener("click", () => {
      enabled = !enabled;
      try { storage?.setItem(key, String(enabled)); } catch {}
      renderBooleanSetting(button, enabled);
      onChange?.(enabled);
    });
    return () => enabled;
  }
  const toolbarHapticsEnabled = toggle("toolbarHapticsToggle", TOOLBAR_HAPTICS_KEY, true);
  // Off by default: the player sprite sits where you are trying to walk, so the
  // tap opened the profile by accident. The HUD card is the deliberate target.
  const selfProfileTapEnabled = toggle("selfProfileTapToggle", SELF_PROFILE_TAP_KEY, false);
  // Big numbers as 1.23e45 instead of suffixes. Display only: windows pick it up on their next draw.
  toggle("scientificNotationToggle", SCIENTIFIC_NOTATION_KEY, false, enabled => setNumberNotation(enabled ? "scientific" : "suffix"));
  if (doc.getElementById("statPopupsToggle")) toggle("statPopupsToggle", STAT_POPUPS_KEY, true, setStatPopupsEnabled);
  if (doc.getElementById("chatTimestampsToggle")) toggle("chatTimestampsToggle", CHAT_TIMESTAMPS_KEY, false, setChatTimestampsEnabled);
  if (doc.getElementById("ownNamePlateToggle")) toggle("ownNamePlateToggle", OWN_NAME_PLATE_KEY, true, setOwnNamePlateEnabled);
  // Off by default: "[TheG]" before every name crowded plates and chat.
  if (doc.getElementById("guildTagsToggle")) toggle("guildTagsToggle", GUILD_TAGS_KEY, false, setGuildTagsVisible);
  if (doc.getElementById("enemyHpNumbersToggle")) toggle("enemyHpNumbersToggle", ENEMY_HP_NUMBERS_KEY, true, setEnemyHpNumbersEnabled);
  if (doc.getElementById("damageNumbersToggle")) toggle("damageNumbersToggle", DAMAGE_NUMBERS_KEY, true, setDamageNumbersEnabled);
  if (doc.getElementById("cardFoundPopupsToggle")) toggle("cardFoundPopupsToggle", CARD_FOUND_POPUPS_KEY, true, setCardFoundPopupsEnabled);
  // Capture before navigation; only direct toolbar buttons, not settings inside it.
  doc.addEventListener("click", event => {
    const target = event.target as Element | null;
    const button = target?.closest?.("#toolbar > button") as HTMLButtonElement | null;
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true" || !toolbarHapticsEnabled()) return;
    try { haptic(); } catch { /* Feedback must never interrupt navigation. */ }
  }, true);
  return { selfProfileTapEnabled };
}

/** The settings shell loads after startup, keeping the entry page small. */
export function installFeedbackControls(doc: Document) {
  const panel = doc.getElementById("settingsPanel");
  if (!panel) return;
  for (const [id, label, enabled] of [
    ["toolbarHapticsToggle", "Toolbar Haptics", true],
    ["selfProfileTapToggle", "Tap Self to Open Profile", false],
    ["scientificNotationToggle", "Scientific Notation", false],
    ["statPopupsToggle", "Stat Gain Popups", true],
    ["chatTimestampsToggle", "Chat Timestamps", false],
    ["ownNamePlateToggle", "Show My Name Plate", true],
    ["guildTagsToggle", "Show Guild Tags", false],
    ["enemyHpNumbersToggle", "Enemy HP Numbers", true],
    ["damageNumbersToggle", "Damage Numbers", true],
    ["cardFoundPopupsToggle", "Card Found Popups", true],
    ["keepScreenOnToggle", "Keep Screen On", false],
    ["gameTickerToggle", "Game Tips", true],
    // Account-scoped and server-backed, so this only builds the row; the
    // binding lives with the connection that owns the preference.
    ["offlineProgressToggle", "Offline Progress", true],
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
