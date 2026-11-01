import { cardDefinition } from "./cards";
import { MAX_ACTIVE_CARD_SLOTS, type ActiveCards } from "./active-cards";

/** How many Builds a player can save. */
export const BUILD_SLOTS = 10;
/** The longest name a Build can have. */
export const BUILD_NAME_MAX = 20;

/** A Build name as kept: printable, single-spaced, trimmed, at most BUILD_NAME_MAX characters ("" is no name). */
export function cleanBuildName(name: unknown) {
  return String(name ?? "").replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, BUILD_NAME_MAX).trim();
}
/** What a Build is called: its name, or "Build 1" and so on. */
export const buildLabel = (slot: number, name?: string | null) => name || `Build ${slot + 1}`;

/** ARROW is the arrow kind nocked when saved ("" for plain arrows); a build saved before arrows has none. */
export type BuildGear = { HEAD: string; CHEST: string; FEET: string; HAND: string; ARROW?: string };
/** A saved build as the client reads it: the gear in each slot and the active cards by type. */
export type SavedBuild = { slot: number; gear: BuildGear; cards: ActiveCards };
export const BUILD_GEAR_SLOTS = ["HAND", "HEAD", "CHEST", "FEET"] as const;
const EMPTY_GEAR: BuildGear = { HEAD: "", CHEST: "", FEET: "", HAND: "" };

/** A saved build's gear, with anything malformed read as an empty slot. */
export function parseBuildGear(text: string): BuildGear {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object") return { ...EMPTY_GEAR };
    const gear = Object.fromEntries(BUILD_GEAR_SLOTS.map(slot => [slot, typeof value[slot] === "string" ? value[slot] : ""])) as BuildGear;
    return typeof value.ARROW === "string" ? { ...gear, ARROW: value.ARROW } : gear;
  } catch { return { ...EMPTY_GEAR }; }
}

/**
 * A saved build's active cards by type, real cards only. Older builds list cards by item; each
 * of those cards goes to its own type, in the order saved.
 */
export function parseBuildCards(text: string): ActiveCards {
  const cards: Record<"HAND" | "HEAD" | "CHEST", string[]> = { HAND: [], HEAD: [], CHEST: [] };
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object") {
      for (const list of Object.values(value)) {
        if (!Array.isArray(list)) continue;
        for (const cardId of list) {
          const card = cardDefinition(cardId);
          if (card && cards[card.slot].length < MAX_ACTIVE_CARD_SLOTS) cards[card.slot].push(card.id);
        }
      }
    }
  } catch { /* an unreadable build has no cards */ }
  return cards;
}
