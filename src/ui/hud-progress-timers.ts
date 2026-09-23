import type { ActiveItemUpgrade } from "../wildstat-coop";
import type { ActiveResearch } from "./tech-tree-controller";

type TimerElements = {
  research: HTMLElement;
  slotOne: HTMLElement;
  slotTwo: HTMLElement;
  slotThree: HTMLElement;
};

type TimerSources = {
  connected: () => boolean;
  research: () => ActiveResearch | null;
  upgrades: () => ActiveItemUpgrade[];
  visible: () => { research: boolean; slotOne: boolean; slotTwo: boolean; slotThree: boolean };
  nowMs?: () => number;
};

/** Keep minute and hour countdowns calm; show seconds only in the last minute. */
export function formatHudRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const extraMinutes = minutes % 60;
  return extraMinutes ? `${hours}h ${extraMinutes}m` : `${hours}h`;
}

export function hudProgressTimers(
  connected: boolean,
  research: ActiveResearch | null,
  upgrades: readonly ActiveItemUpgrade[],
  nowMs: number,
) {
  const active = connected ? upgrades : [];
  const slot = (number: 1 | 2 | 3) => {
    const job = active.find((upgrade) => upgrade.slot === number);
    if (!job) return null;
    const remaining = job.paused ? job.remainingMs : job.completesAtMs - nowMs;
    return { remaining: formatHudRemaining(remaining), paused: job.paused };
  };
  return {
    research: connected && research ? formatHudRemaining(research.completesAtMs - nowMs) : null,
    slotOne: slot(1),
    slotTwo: slot(2),
    slotThree: slot(3),
  };
}

export function createHudProgressTimers(elements: TimerElements, sources: TimerSources) {
  const render = (element: HTMLElement, label: string, remaining: string | null, paused = false) => {
    element.hidden = remaining === null;
    if (remaining === null) return;
    const text = `${label} ${remaining}`;
    if (element.textContent !== text) element.textContent = text;
    const description = `${label === "Tech" ? "Tech research" : `Upgrade ${label.toLowerCase()}`} ${paused ? "paused with" : "finishes in"} ${remaining}`;
    if (element.getAttribute("aria-label") !== description) element.setAttribute("aria-label", description);
  };

  function tick() {
    const timers = hudProgressTimers(sources.connected(), sources.research(), sources.upgrades(), (sources.nowMs ?? Date.now)());
    const visible = sources.visible();
    render(elements.research, "Tech", visible.research ? timers.research : null);
    render(elements.slotOne, "Slot 1", visible.slotOne ? timers.slotOne?.remaining ?? null : null, timers.slotOne?.paused);
    render(elements.slotTwo, "Slot 2", visible.slotTwo ? timers.slotTwo?.remaining ?? null : null, timers.slotTwo?.paused);
    render(elements.slotThree, "Slot 3", visible.slotThree ? timers.slotThree?.remaining ?? null : null, timers.slotThree?.paused);
  }

  tick();
  return { tick };
}
