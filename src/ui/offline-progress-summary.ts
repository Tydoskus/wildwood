import { MAP_DISPLAY_NAMES, numberedMapName } from "../../shared/rules";
import { isProceduralMap, proceduralMapNumber } from "../../shared/procedural-maps";
import type { OfflineProgressSummary } from "../coop/services/offline-progress-watch";
import { formatCompactNumber } from "./number-format";

export function offlineMapName(mapId: string) {
  if (isProceduralMap(mapId)) return `Endless ${proceduralMapNumber(mapId)}`;
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
  acknowledge: () => void;
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
    <p class="offline-progress-note"></p>
    <button type="button" class="window-back-button offline-progress-collect">OK</button>
  </div>`;
  document.body.append(overlay);
  const lead = overlay.querySelector<HTMLParagraphElement>(".offline-progress-lead")!;
  const stats = overlay.querySelector<HTMLElement>(".offline-progress-stats")!;
  const note = overlay.querySelector<HTMLParagraphElement>(".offline-progress-note")!;
  const collect = overlay.querySelector<HTMLButtonElement>(".offline-progress-collect")!;
  let open = false;

  function close() {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    dependencies.acknowledge();
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

  function show(summary: OfflineProgressSummary) {
    const map = offlineMapName(summary.mapId);
    const away = formatOfflineDuration(summary.seconds);
    stats.replaceChildren();
    if (summary.blocked) {
      lead.textContent = `You were away for ${away}, but ${map} would have finished you before you got back.`;
      note.textContent = "Offline farming needs a map you can hold for the whole stretch. Build up, and the next break will pay.";
    } else {
      lead.textContent = `${away} farming ${map} — ${formatCompactNumber(summary.kills)} kill${summary.kills === 1 ? "" : "s"}.`;
      for (const line of offlineStatLines(summary)) stats.append(statRow(line.kind, line.label, line.amount));
      note.textContent = stats.childElementCount
        ? "Already added to your stats."
        : "Not quite enough for a full stat point this time.";
    }
    open = true;
    overlay.hidden = false;
    window.requestAnimationFrame(() => collect.focus());
  }

  /**
   * Safe to call from the frame loop. The summary arrives over the connection,
   * which can beat the world onto the screen, so this is a poll rather than a
   * one-shot: it waits for a playable moment and then opens, once.
   */
  function showPending() {
    if (open || !dependencies.readyToShow()) return;
    const summary = dependencies.pending();
    if (summary) show(summary);
  }

  collect.addEventListener("click", close);
  return { show, showPending, close, isOpen: () => open };
}
