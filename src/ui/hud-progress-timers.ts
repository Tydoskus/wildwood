import type { ActiveItemUpgrade } from "../wildstat-coop";
import type { ActiveResearch } from "./tech-tree-controller";
import { formatRemaining } from "./format-remaining";

type TimerElements = {
  research: HTMLElement;
  slotOne: HTMLElement;
  slotTwo: HTMLElement;
};

type TimerSources = {
  connected: () => boolean;
  research: () => ActiveResearch | null;
  upgrades: () => ActiveItemUpgrade[];
  nowMs?: () => number;
};

export function hudProgressTimers(
  connected: boolean,
  research: ActiveResearch | null,
  upgrades: readonly ActiveItemUpgrade[],
  nowMs: number,
) {
  const active = connected ? upgrades : [];
  const slot = (number: 1 | 2) => {
    const job = active.find((upgrade) => upgrade.slot === number);
    if (!job) return null;
    const remaining = job.paused ? job.remainingMs : job.completesAtMs - nowMs;
    return { remaining: formatRemaining(remaining), paused: job.paused };
  };
  return {
    research: connected && research ? formatRemaining(research.completesAtMs - nowMs) : null,
    slotOne: slot(1),
    slotTwo: slot(2),
  };
}

export function createHudProgressTimers(elements: TimerElements, sources: TimerSources) {
  const render = (element: HTMLElement, label: string, remaining: string | null, paused = false) => {
    element.hidden = remaining === null;
    if (remaining === null) return;
    const text = `${label} ${remaining}`;
    if (element.textContent !== text) element.textContent = text;
    const description = `${label === "TECH" ? "Tech research" : `Upgrade ${label.toLowerCase()}`} ${paused ? "paused with" : "finishes in"} ${remaining}`;
    if (element.getAttribute("aria-label") !== description) element.setAttribute("aria-label", description);
  };

  function tick() {
    const timers = hudProgressTimers(sources.connected(), sources.research(), sources.upgrades(), (sources.nowMs ?? Date.now)());
    render(elements.research, "TECH", timers.research);
    render(elements.slotOne, "SLOT 1", timers.slotOne?.remaining ?? null, timers.slotOne?.paused);
    render(elements.slotTwo, "SLOT 2", timers.slotTwo?.remaining ?? null, timers.slotTwo?.paused);
  }

  tick();
  return { tick };
}
