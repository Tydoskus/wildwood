import {
  cookedFishId,
  foodBuffRemainingMs,
  formatFoodBuffClock,
  formatFoodBuffStats,
  type ActiveFoodBuff,
} from "../../shared/cooking";
import { fishById, type FishId } from "../../shared/fishing";
import { oreIconSource } from "./ore-icon";

/** The HUD chip beside gold/arrows showing the active cooked-fish combat buff and remaining duration. */
export function createHudFoodChip(deps: {
  buff: () => ActiveFoodBuff | null | undefined;
  onClick?: (fishId: FishId, remainingMs: number) => void;
}) {
  const chip = document.getElementById("hudFoodChip");
  const icon = chip?.querySelector("img"), clock = chip?.querySelector("strong");
  let shown: ActiveFoodBuff | null = null;
  chip?.addEventListener("click", () => {
    if (!shown) return;
    const left = foodBuffRemainingMs(shown, Date.now());
    if (left > 0) deps.onClick?.(shown.fishId, left);
  });
  return function refresh() {
    if (!chip || !icon || !clock) return;
    const active = deps.buff();
    const left = foodBuffRemainingMs(active, Date.now());
    shown = active && left > 0 && fishById(active.fishId) ? active : null;
    chip.hidden = !shown;
    if (!shown) return;
    const fish = fishById(shown.fishId)!;
    const source = oreIconSource(cookedFishId(shown.fishId));
    const text = formatFoodBuffClock(left);
    if (icon.getAttribute("src") !== source) icon.setAttribute("src", source);
    if (clock.textContent !== text) clock.textContent = text;
    const label = `Cooked ${fish.name} · ${formatFoodBuffStats(shown.fishId)} (${text} left)`;
    chip.title = label;
    chip.setAttribute("aria-label", label);
  };
}
