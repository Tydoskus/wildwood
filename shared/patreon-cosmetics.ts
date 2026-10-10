import { DIAMOND_GALAXY_ARMOR, DIAMOND_GALAXY_BOOTS, DIAMOND_GALAXY_BOW, DIAMOND_GALAXY_HELMET, canonicalItemId } from "./items";

/**
 * Looks lent by a Patreon membership rather than owned: the Diamond Galaxy set
 * is worn only while the account's Diamond tier is active (and by developer
 * accounts). Nothing stores them; when the membership lapses they simply stop
 * counting as owned, and a worn piece falls back to what is worn underneath at
 * the next save or sign-in.
 */
export const PATREON_DIAMOND_ITEM_IDS = [DIAMOND_GALAXY_HELMET, DIAMOND_GALAXY_ARMOR, DIAMOND_GALAXY_BOOTS, DIAMOND_GALAXY_BOW] as const;

export function isPatreonDiamondItem(itemId: unknown) {
  const id = canonicalItemId(itemId);
  return Boolean(id && (PATREON_DIAMOND_ITEM_IDS as readonly string[]).includes(id));
}

const COSMETIC_FIELDS = ["cosmeticHead", "cosmeticChest", "cosmeticFeet", "cosmeticRightHand", "cosmeticLeftHand"] as const;

/** Whether a saved look still wears a lent piece the membership no longer lends, so it must be saved again without it. */
export function wearsUnlentLook(progress: Partial<Record<typeof COSMETIC_FIELDS[number], unknown>>, lent: readonly string[]) {
  return COSMETIC_FIELDS.some(field => isPatreonDiamondItem(progress[field]) && !lent.includes(String(progress[field])));
}

/** The looks a membership lends right now. */
export function patreonLooks(diamondActive: boolean): readonly string[] {
  return diamondActive ? PATREON_DIAMOND_ITEM_IDS : [];
}
