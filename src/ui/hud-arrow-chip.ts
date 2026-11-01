import { ARROW_KINDS, isArrowId, type ArrowId } from "../../shared/arrows";
import { isBow } from "../../shared/bow-skills";
import { formatCompactNumber } from "../../shared/compact-number";
import { oreIconSource } from "./ore-icon";

/** The HUD chip beside gold: the nocked arrow and how many are left, while a bow is in hand. Tapping opens its window. */
export function createHudArrowChip(deps: {
  weapon: () => string | undefined;
  nocked: () => ArrowId | null | undefined;
  held: (arrowId: ArrowId) => number;
  open: (arrowId: ArrowId) => void;
}) {
  const chip = document.getElementById("hudArrowChip");
  const icon = chip?.querySelector("img"), count = chip?.querySelector("strong");
  let shown: ArrowId | null = null;
  chip?.addEventListener("click", () => { if (shown) deps.open(shown); });
  return function refresh() {
    if (!chip || !icon || !count) return;
    const nocked = deps.nocked();
    shown = isBow(deps.weapon()) && isArrowId(nocked) ? nocked : null;
    chip.hidden = !shown;
    if (!shown) return;
    const left = Math.max(0, Math.floor(deps.held(shown))), text = formatCompactNumber(left), source = oreIconSource(shown);
    if (icon.getAttribute("src") !== source) icon.setAttribute("src", source);
    if (count.textContent !== text) count.textContent = text;
    // Out of the nocked kind, the bow shoots plain arrows: the chip dims until more are crafted.
    chip.classList.toggle("is-empty", left === 0);
    chip.setAttribute("aria-label", `${ARROW_KINDS[shown].name}, ${text} left. Tap to manage.`);
  };
}
