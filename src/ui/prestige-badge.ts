import { prestigeBadgeWidthRatio } from "../../shared/prestige";

export function setPrestigeBadgeLevel(badge: HTMLElement, level: number) {
  badge.textContent = String(level);
  badge.style.setProperty("--prestige-width-ratio", String(prestigeBadgeWidthRatio(level)));
}
