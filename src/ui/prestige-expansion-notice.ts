import { prestigeExpansionLabel, prestigeExpansionUnlocked } from "../../shared/prestige-expansion";

/** A shared deadline, never a per-tab timer; refresh/reconnect cannot restart it. */
export function createPrestigeExpansionNotice(d: {
  unlocksAt: () => number | null | undefined; now: () => number; visible: () => boolean; root?: Document;
}) {
  const root = d.root ?? document;
  const element = root.createElement("div");
  element.className = "prestige-expansion-notice";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  root.body.append(element);
  return {
    tick() {
      const deadline = d.unlocksAt(), now = d.now();
      element.hidden = !d.visible() || !deadline || now >= deadline + 5 * 60_000;
      if (element.hidden || !deadline) return;
      const label = prestigeExpansionLabel(deadline, now);
      if (element.textContent !== label) element.textContent = label;
    },
    unlocked: () => prestigeExpansionUnlocked(d.unlocksAt(), d.now()),
  };
}
