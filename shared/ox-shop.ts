import { GALAXY_ARMOR, GALAXY_BOOTS, GALAXY_BOW, GALAXY_HELMET, canonicalItemId } from "./items";

/**
 * Ox, in the bottom-right house in Town, sells the Galaxy set one piece at a
 * time. A piece bought here is an account-owned look (cosmeticItemsJson), so
 * it survives prestige and resets like a converted cosmetic does.
 */
export const OX_SHOP_ITEM_IDS = [GALAXY_HELMET, GALAXY_ARMOR, GALAXY_BOOTS, GALAXY_BOW] as const;
export const OX_SHOP_GEM_PRICE = 750n;

export function isOxShopItem(itemId: unknown) {
  const id = canonicalItemId(itemId);
  return Boolean(id && (OX_SHOP_ITEM_IDS as readonly string[]).includes(id));
}
