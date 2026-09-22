import { itemTier } from "../../shared/item-tier";

/**
 * The map an item comes from, shown on the item itself.
 *
 * `placement` is where it sits: over the artwork for a loose item in the bag,
 * and in the corner of an equipped slot, where the middle is taken by the
 * slot's own name.
 */
export function appendItemTierLabel(element: HTMLElement, itemId: string, placement: "corner" | "above" = "corner") {
  const tier = itemTier(itemId);
  if (!tier) return;
  const label = document.createElement("span");
  label.className = "item-tier-label";
  if (placement === "above") label.classList.add("is-above");
  label.textContent = `Tier ${tier}`;
  element.append(label);
}
