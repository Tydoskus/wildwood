import {
  SOUL_STAT_DETAILS, SOUL_STAT_ORDER, SOUL_TIER_COUNT, SOUL_TIER_KILL_TYPES, soulStatsUnlocked, soulStatValue, soulTierKillsNeeded,
  type RewardKillCounts, type SoulStats, type SoulTierKillType,
} from "../../shared/soul-dimension";
import { formatCompactNumber as compactNumber } from "../../shared/compact-number";

const KILL_LABELS: Readonly<Record<SoulTierKillType, string>> = {
  damage: "Damage Enemies", health: "Health Enemies", armor: "Armor Enemies", regen: "Regen Enemies",
};

export type SoulWindowState = {
  access: "open" | "locked" | "closed";
  developer: boolean;
  open: boolean;
  tier: number;
  kills: RewardKillCounts;
  soul: SoulStats;
};

function soulValue(soul: SoulStats, stat: (typeof SOUL_STAT_ORDER)[number]) {
  const value = soulStatValue(soul, stat);
  if (stat === "critDamage") return `+${+(value * 100).toFixed(1)}%`;
  if (stat === "attackSpeed") return `+${+value.toFixed(3)}/s`;
  return `+${compactNumber(value)}`;
}

/**
 * The Soul Dimension portal's window: what the soul has gathered, how far
 * the tiers have come and what the next one needs, and the way in. The
 * developer also gets the switch that opens it to everyone.
 */
export function createSoulDimensionWindow(deps: {
  state: () => SoulWindowState;
  enter: () => Promise<boolean>;
  setOpen: (open: boolean) => Promise<boolean>;
  pause: (paused: boolean) => void;
  clearInput?: () => void;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet travel-sheet soul-sheet";
  dialog.setAttribute("aria-labelledby", "soulDimensionTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="soulDimensionTitle" class="window-banner"><span>Soul Dimension</span></h2></header>`
    + `<p class="farm-map">Soul Stats Never Reset</p><div class="farm-choices soul-body"></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite" hidden></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button">Back</button>`
    + `<button type="button" class="farm-start soul-enter">Enter</button></div></footer>`;
  document.body.append(dialog);
  const body = dialog.querySelector<HTMLDivElement>(".soul-body")!;
  const status = dialog.querySelector<HTMLElement>(".farm-selection")!;
  const enter = dialog.querySelector<HTMLButtonElement>(".soul-enter")!;
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  let pending = false;

  function setStatus(text: string) { status.textContent = text; status.hidden = !text; }

  function section(title: string) {
    const block = document.createElement("section");
    block.className = "soul-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    block.append(heading);
    body.append(block);
    return block;
  }
  function row(parent: HTMLElement, label: string, value: string, color?: string, done?: boolean) {
    const line = document.createElement("p");
    line.className = "soul-row";
    if (done) line.classList.add("is-done");
    const name = document.createElement("span");
    name.textContent = label;
    if (color) name.style.color = color;
    const amount = document.createElement("strong");
    amount.textContent = value;
    line.append(name, amount);
    parent.append(line);
  }

  function render() {
    const state = deps.state();
    body.replaceChildren();
    const stats = section("Soul Stats");
    for (const stat of SOUL_STAT_ORDER) row(stats, SOUL_STAT_DETAILS[stat].label, soulValue(state.soul, stat), SOUL_STAT_DETAILS[stat].color);
    const unlocked = soulStatsUnlocked(state.tier);
    const tiers = section(state.tier >= SOUL_TIER_COUNT ? `Tier ${state.tier}: Every Soul Enemy Awake` : `Tier ${state.tier} of ${SOUL_TIER_COUNT}`);
    const spawning = document.createElement("p");
    spawning.className = "soul-note";
    spawning.textContent = unlocked.length
      ? `Soul enemies: ${unlocked.map(stat => SOUL_STAT_DETAILS[stat].label).join(", ")}`
      : "No soul enemies yet. Reach Tier 1 to wake them.";
    tiers.append(spawning);
    if (state.tier < SOUL_TIER_COUNT) {
      const next = state.tier + 1;
      const needed = soulTierKillsNeeded(next);
      const goal = document.createElement("p");
      goal.className = "soul-note";
      goal.textContent = `Tier ${next} wakes ${SOUL_STAT_DETAILS[SOUL_STAT_ORDER[state.tier]].label} enemies. Kill ${compactNumber(needed)} of each type in the campaign or Endless:`;
      tiers.append(goal);
      for (const type of SOUL_TIER_KILL_TYPES) {
        const count = state.kills[type] ?? 0;
        row(tiers, KILL_LABELS[type], `${compactNumber(Math.min(count, needed))} / ${compactNumber(needed)}`, undefined, count >= needed);
      }
    }
    if (state.developer) {
      const developer = section("Developer");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "farm-enemy soul-toggle";
      toggle.textContent = state.open ? "Open To Everyone: On" : "Open To Everyone: Off";
      toggle.setAttribute("aria-pressed", String(state.open));
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        try { await deps.setOpen(!state.open); } catch { setStatus("Could not change it. Try again."); }
        window.setTimeout(render, 400);
      });
      developer.append(toggle);
    }
    enter.disabled = pending || state.access !== "open";
    if (state.access === "locked") setStatus("Prestige once to enter the Soul Dimension.");
    else if (state.access === "closed") setStatus("The Soul Dimension is not open yet.");
  }

  function close() {
    if (!dialog.open) return false;
    dialog.close();
    deps.clearInput?.();
    deps.pause(false);
    return true;
  }
  function open(message = "") {
    if (pending) return;
    setStatus(message);
    render();
    deps.clearInput?.();
    deps.pause(true);
    if (!dialog.open) dialog.showModal();
    (enter.disabled ? back : enter).focus();
  }
  async function go() {
    if (pending) return;
    pending = true; close();
    let arrived = false;
    try { arrived = await deps.enter(); } catch { arrived = false; }
    pending = false;
    if (!arrived) open("Could not enter. Try again.");
  }

  back.addEventListener("click", close);
  enter.addEventListener("click", () => { void go(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { open, close, isOpen: () => dialog.open, refresh: () => { if (dialog.open) render(); } };
}
