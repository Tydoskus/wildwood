import { MAP_DISPLAY_NAMES, numberedMapName } from "../../shared/rules";
import { isProceduralMap, proceduralMapNumber } from "../../shared/procedural-maps";
import type { OfflineActivity, OfflineProgressSummary } from "../coop/services/offline-progress-watch";
import { REFINE_ORES } from "../../shared/refine";
import { formatCompactNumber } from "./number-format";
import { mapGoldFactor, offlineGold } from "../../shared/gold";

export function offlineMapName(mapId: string) {
  if (isProceduralMap(mapId)) return `Endless ${proceduralMapNumber(mapId)}`;
  if (mapId === "town") return "Town";
  const name = MAP_DISPLAY_NAMES[mapId as keyof typeof MAP_DISPLAY_NAMES];
  return name ? numberedMapName(mapId, name) : mapId;
}

export function formatOfflineDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  if (!minutes) return `${whole} second${whole === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const spare = minutes % 60;
  return spare ? `${hours}h ${spare}m` : `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Only the stats that actually moved; a row of zeroes tells nobody anything.
 *
 * The kinds match the profile window's, so each stat keeps the colour the
 * player already reads it in everywhere else.
 */
export function offlineStatLines(summary: OfflineProgressSummary) {
  return ([
    ["damage", "Damage", summary.damage, false],
    ["health", "Max Health", summary.health, false],
    ["armor", "Armor", summary.armor, false],
    ["regen", "Regeneration", summary.regen, false],
    ["attack", "Attack Speed", summary.attackSpeed, true],
  ] as const)
    .filter(([, , value]) => value > 0)
    .map(([kind, label, value, precise]) => ({
      kind,
      label,
      amount: precise ? `-${value.toFixed(3)}s` : `+${formatCompactNumber(value)}`,
    }));
}

/**
 * The "while you were away" report.
 *
 * It says which map it used, because that is the part players will argue with:
 * an account that cannot yet hold its newest map earns on the one below, and
 * silently paying out the lower number reads as a bug.
 */
export function createOfflineProgressSummary(dependencies: {
  /** Collects the time away as one activity; rejects with the server's reason (a full bag). */
  acknowledge: (activity?: OfflineActivity) => Promise<unknown> | void;
  /** The waiting summary, or null. Read repeatedly; shown exactly once. */
  pending: () => OfflineProgressSummary | null | undefined;
  /** False while the world is not yet somewhere the player can act. */
  readyToShow: () => boolean;
}) {
  // Built from the same pieces every other game window uses — the overlay, the
  // .modal frame, .window-title, the stat rows the Dragon notice reports gains
  // with — so this reads as part of the game rather than a browser dialog.
  const overlay = document.createElement("div");
  overlay.id = "offlineProgress";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal offline-progress-modal" role="dialog" aria-modal="true" aria-labelledby="offlineProgressTitle">
    <h2 id="offlineProgressTitle" class="window-title">While You Were Away</h2>
    <p class="offline-progress-lead"></p>
    <div class="offline-progress-stats"></div>
    <div class="offline-choices"></div>
    <p class="offline-progress-note"></p>
    <button type="button" class="window-back-button offline-progress-later" hidden>Later</button>
    <button type="button" class="window-back-button offline-progress-collect">OK</button>
  </div>`;
  document.body.append(overlay);
  const lead = overlay.querySelector<HTMLParagraphElement>(".offline-progress-lead")!;
  const stats = overlay.querySelector<HTMLElement>(".offline-progress-stats")!;
  const choices = overlay.querySelector<HTMLElement>(".offline-choices")!;
  const note = overlay.querySelector<HTMLParagraphElement>(".offline-progress-note")!;
  const later = overlay.querySelector<HTMLButtonElement>(".offline-progress-later")!;
  const collect = overlay.querySelector<HTMLButtonElement>(".offline-progress-collect")!;
  const reminder = document.createElement("button");
  reminder.id = "offlineReadyHint";
  reminder.type = "button";
  reminder.className = "hud-reminder";
  reminder.textContent = "Offline Ready";
  reminder.hidden = true;
  let open = false, shownSummary: OfflineProgressSummary | null = null;
  /** The grant dismissed with "Later", so the frame poll doesn't immediately reopen it. */
  let dismissedKey: string | null = null;

  const summaryKey = (summary: OfflineProgressSummary) =>
    summary.grantedAtMicros ?? `${summary.seconds}:${summary.kills}:${summary.mapId}:${Boolean(summary.choice)}`;

  function mountReminder() {
    if (reminder.isConnected) return;
    const column = document.getElementById("hudTimerColumn");
    if (column) column.prepend(reminder);
  }

  function hide() {
    open = false;
    overlay.hidden = true;
  }

  function dismissForLater() {
    if (!open) return;
    if (shownSummary) dismissedKey = summaryKey(shownSummary);
    hide();
    mountReminder();
    reminder.hidden = !dependencies.pending();
  }

  function close() {
    if (!open) return;
    hide();
    reminder.hidden = true;
    dismissedKey = null;
    void dependencies.acknowledge();
  }

  function statRow(kind: string, label: string, amount: string) {
    const row = document.createElement("div");
    row.className = "offline-progress-row";
    row.dataset.statKind = kind;
    const name = document.createElement("span");
    name.className = "offline-progress-stat-name";
    name.textContent = label;
    const value = document.createElement("span");
    value.className = "offline-progress-stat-value";
    value.textContent = amount;
    row.append(name, value);
    return row;
  }

  function oreRows(ores: Record<string, number>, skill: string, gain: number) {
    const rows = Object.entries(ores).filter(([, count]) => count > 0)
      .map(([oreId, count]) => statRow("ore", REFINE_ORES[oreId as keyof typeof REFINE_ORES]?.name ?? oreId, `+${formatCompactNumber(count)}`));
    if (gain > 0) rows.push(statRow("skill", skill, `+${formatCompactNumber(gain)}`));
    return rows;
  }

  function fightRows(summary: OfflineProgressSummary) {
    const rows = offlineStatLines(summary).map(line => statRow(line.kind, line.label, line.amount));
    const gold = offlineGold(summary.kills, mapGoldFactor(summary.mapId));
    if (gold > 0) rows.push(statRow("gold", "Gold", `+${formatCompactNumber(gold)}`));
    return rows;
  }

  /** One activity on offer, folded to a row: its name and headline, a chevron that opens what it pays, and its own Collect. */
  function option(activity: OfflineActivity, title: string, detail: string, rows: HTMLElement[], available: boolean) {
    const section = document.createElement("section");
    section.className = "offline-choice";
    section.dataset.activity = activity;
    const head = document.createElement("div");
    head.className = "offline-choice-head";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "offline-choice-toggle";
    toggle.setAttribute("aria-expanded", "false");
    const name = document.createElement("span");
    name.className = "offline-choice-title";
    name.textContent = title;
    const info = document.createElement("span");
    info.className = "offline-choice-detail";
    info.textContent = detail;
    toggle.append(name, info);
    const list = document.createElement("div");
    list.className = "offline-progress-stats";
    list.id = `offline-choice-${activity}`;
    list.hidden = true;
    list.append(...rows);
    toggle.setAttribute("aria-controls", list.id);
    toggle.disabled = !rows.length;
    toggle.addEventListener("click", () => {
      list.hidden = !list.hidden;
      section.classList.toggle("is-open", !list.hidden);
      toggle.setAttribute("aria-expanded", String(!list.hidden));
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "window-back-button offline-choice-collect";
    button.textContent = "Collect";
    button.disabled = !available;
    button.addEventListener("click", () => void pick(activity));
    head.append(toggle, button);
    section.append(head, list);
    return section;
  }

  async function pick(activity: OfflineActivity) {
    const buttons = [...choices.querySelectorAll<HTMLButtonElement>(".offline-choice-collect")];
    const enabled = buttons.filter(button => !button.disabled);
    for (const button of enabled) button.disabled = true;
    try {
      await dependencies.acknowledge(activity);
      dismissedKey = null;
      reminder.hidden = true;
      hide();
    } catch (error) {
      note.textContent = error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
      for (const button of enabled) button.disabled = false;
    }
  }

  function showChoice(summary: OfflineProgressSummary) {
    const choice = summary.choice!;
    lead.textContent = `You were away for ${formatOfflineDuration(summary.seconds)}. Pick one to collect.`;
    const kills = `${formatCompactNumber(summary.kills)} kill${summary.kills === 1 ? "" : "s"}`;
    const fight = summary.blocked ? `${offlineMapName(summary.mapId)} would have finished you`
      : summary.mapId ? `${kills}\n${offlineMapName(summary.mapId)}` : "Nothing to fight";
    const fightPaid = fightRows(summary);
    const items = [
      option("fight", "Fight", fight, fightPaid, !summary.blocked && summary.kills > 0),
      option("mine", "Mine", `${formatCompactNumber(choice.rocks)} rock${choice.rocks === 1 ? "" : "s"}`,
        oreRows(choice.mineOres, "Mining", choice.miningGain), choice.rocks > 0),
      option("chop", "Chop", `${formatCompactNumber(choice.trees)} tree${choice.trees === 1 ? "" : "s"}`,
        oreRows(choice.chopOres, "Woodcutting", choice.woodcuttingGain), choice.trees > 0),
    ];
    if (choice.fishing) {
      const fish = choice.fishing;
      items.push(option("fish", "Fish", `${formatCompactNumber(fish.catches)} catch${fish.catches === 1 ? "" : "es"}`,
        oreRows(fish.fishOres, "Fishing XP", fish.experienceGain), fish.catches > 0));
    }
    choices.replaceChildren(...items);
    note.textContent = "Gathering goes at half speed while you are away.";
  }

  function show(summary: OfflineProgressSummary) {
    shownSummary = summary;
    const map = offlineMapName(summary.mapId);
    const away = formatOfflineDuration(summary.seconds);
    stats.replaceChildren();
    choices.replaceChildren();
    // The stylesheet's display wins over [hidden] on this button.
    collect.style.display = summary.choice ? "none" : "";
    later.hidden = !summary.choice;
    later.style.display = summary.choice ? "" : "none";
    reminder.hidden = true;
    if (summary.choice) {
      showChoice(summary);
    } else if (summary.blocked) {
      lead.textContent = `You were away for ${away}, but ${map} would have finished you before you got back.`;
      note.textContent = "Offline farming needs a map you can hold for the whole stretch. Build up, and the next break will pay.";
    } else {
      lead.textContent = `${away} farming ${map} — ${formatCompactNumber(summary.kills)} kill${summary.kills === 1 ? "" : "s"}.`;
      // The server pays offline gold from the kills alone (shared/gold.ts), so this is the amount it added.
      stats.append(...fightRows(summary));
      note.textContent = stats.childElementCount
        ? "Already added to your stats."
        : "Not quite enough for a full stat point this time.";
    }
    open = true;
    overlay.hidden = false;
    window.requestAnimationFrame(() => (summary.choice ? choices.querySelector<HTMLButtonElement>(".offline-choice-collect:not(:disabled)") ?? later : collect)?.focus());
  }

  /**
   * Safe to call from the frame loop. The summary arrives over the connection,
   * which can beat the world onto the screen, so this is a poll rather than a
   * one-shot: it waits for a playable moment and then opens, once.
   */
  function showPending() {
    const summary = dependencies.pending();
    if (!summary) {
      dismissedKey = null;
      reminder.hidden = true;
      if (open) hide();
      return;
    }
    const key = summaryKey(summary);
    if (open) {
      // Upgrade in place if the choice/fishing rows finished arriving after the modal opened.
      if (shownSummary !== summary) show(summary);
      return;
    }
    if (dismissedKey === key) {
      mountReminder();
      reminder.hidden = false;
      return;
    }
    if (!dependencies.readyToShow()) return;
    show(summary);
  }

  collect.addEventListener("click", close);
  later.addEventListener("click", dismissForLater);
  reminder.addEventListener("click", () => {
    const summary = dependencies.pending();
    if (!summary) { reminder.hidden = true; return; }
    dismissedKey = null;
    show(summary);
  });
  return { show, showPending, close, isOpen: () => open };
}
