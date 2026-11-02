import { formatCompactNumber } from "./number-format";
import type { PowerJump } from "../game/runtime/power-jump";

const COUNT_MS = 900;
let countRuns = 0;

/** "+12%", or "+1.5%" under ten. */
export const powerJumpText = (gain: number) => {
  // Nudged so a 20% gain worked out as 19.9999% still reads 20.
  const percent = gain * 100 + 1e-6;
  return `+${percent < 10 ? (Math.floor(percent * 10) / 10).toString() : Math.floor(percent).toString()}%`;
};

/**
 * An upgrade's moment on the HUD's power: the number counts up to the new figure, glows, and the gain rises above
 * it. renderPlayerHud leaves the number alone while it counts.
 */
export function playPowerJump(powerEl: HTMLElement, jump: PowerJump) {
  const value = powerEl.querySelector<HTMLElement>(":scope > .power-value");
  const popup = document.createElement("span");
  popup.className = "power-jump-gain";
  popup.textContent = powerJumpText(jump.gain);
  popup.setAttribute("aria-hidden", "true");
  popup.addEventListener("animationend", () => popup.remove(), { once: true });
  // Over the page, not in the HUD card, which clips: it rises from under the number up past it.
  const rect = powerEl.getBoundingClientRect();
  document.body.append(popup);
  popup.style.left = `${Math.max(4, rect.right - popup.offsetWidth)}px`;
  popup.style.top = `${rect.bottom}px`;
  powerEl.classList.remove("is-power-jump");
  void powerEl.offsetWidth;
  powerEl.classList.add("is-power-jump");
  if (!value || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const run = String(++countRuns);
  powerEl.dataset.powerCounting = run;
  // Timed from the first frame's own clock: a frame's timestamp can run behind performance.now().
  let started: number | undefined;
  const step = (now: number) => {
    if (powerEl.dataset.powerCounting !== run) return;
    started ??= now;
    const t = Math.max(0, Math.min(1, (now - started) / COUNT_MS)), eased = 1 - (1 - t) ** 3;
    value.textContent = formatCompactNumber(Math.round(jump.from + (jump.to - jump.from) * eased));
    if (t < 1) { requestAnimationFrame(step); return; }
    delete powerEl.dataset.powerCounting;
    delete powerEl.dataset.renderedPower;
  };
  requestAnimationFrame(step);
}
