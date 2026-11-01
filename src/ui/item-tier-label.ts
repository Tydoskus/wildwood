import { itemTier } from "../../shared/item-tier";
import { GEAR_GRADE_NAMES } from "../../shared/gear-grades";
import { gradeOf } from "../../shared/grade-equipment";

/**
 * The map an item comes from, shown on the item itself.
 *
 * `placement` is where it sits: over the artwork for a loose item in the bag,
 * and in the corner of an equipped slot, where the middle is taken by the
 * slot's own name.
 */
export function appendItemTierLabel(element: HTMLElement, itemId: string, placement: "corner" | "above" = "corner") {
  // Graded gear names its grade over a tile's art, in the grade's color.
  const grade = placement === "above" ? gradeOf(itemId) : undefined;
  const tier = itemTier(itemId);
  if (!grade && !tier) return;
  const label = document.createElement("span");
  label.className = "item-tier-label";
  if (placement === "above") label.classList.add("is-above");
  if (grade) label.classList.add("is-grade");
  label.textContent = grade ? GEAR_GRADE_NAMES[grade] : `Tier ${tier}`;
  element.append(label);
}
