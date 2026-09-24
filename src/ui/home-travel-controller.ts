import { MAP_IDS, MAP_DISPLAY_NAMES } from "../../shared/rules";
import { CAMPAIGN_UNLOCK_FIELDS, type CampaignAccess } from "../../shared/equipment-access";
import { isProceduralMap, proceduralMapId, proceduralMapNumber } from "../../shared/procedural-maps";
import type { MapId } from "../game/world";

/** Each campaign map's boss, in MAP_IDS order. Beating one opens the next map. */
const CAMPAIGN_BOSSES = ["the Dragon", "the Desert Spider", "Frostclaw", "Magmalisk", "Gloomroot", "Tidewyrm", "Koi Shogun",
  "Tempest Kirin", "Miremaw", "Prismshell", "Ironhorn", "Dreadreaper", "Voltwarden", "Gravebloom", "Aegis Prime"] as const;
const ENDLESS = "endless";
const FAILED = "Travel unavailable. Try again.";

/** Only what the picker reads from the coop session. */
export type HomeTravelSource = {
  savedProgress?: () => CampaignAccess | null | undefined;
  proceduralMapUnlocked?: (mapId: string) => boolean;
  proceduralCompleted?: () => number;
} | null | undefined;

type Entry = { key: string; mark: string; name: string; locked: string | null };

const baseName = (mapId: string, mapName: (mapId: MapId) => string) =>
  (mapName(mapId as MapId) || MAP_DISPLAY_NAMES[mapId as keyof typeof MAP_DISPLAY_NAMES] || mapId).replace(/ - \d+$/, "");

/**
 * The destinations Home's portal offers: every unlocked campaign map in order,
 * then the next locked one with how to open it, then Endless as a single row
 * whose stage is chosen with a stepper. Further locked maps stay hidden so a
 * new player sees one goal rather than a wall of padlocks.
 */
export function homeTravelEntries(source: HomeTravelSource, mapName: (mapId: MapId) => string = () => "") {
  const progress = source?.savedProgress?.() ?? {};
  const entries: Entry[] = [];
  for (const [index, mapId] of MAP_IDS.entries()) {
    const unlocked = index === 0 || Boolean(progress[CAMPAIGN_UNLOCK_FIELDS[index - 1]]);
    const previous = MAP_IDS[index - 1];
    entries.push({ key: mapId, mark: String(index + 1), name: baseName(mapId, mapName),
      locked: unlocked ? null : `Defeat ${CAMPAIGN_BOSSES[index - 1]} in ${baseName(previous, mapName)} to unlock` });
    if (!unlocked) return { entries, endlessHighest: 0 };
  }
  const endlessHighest = source?.proceduralMapUnlocked?.(proceduralMapId(1))
    ? Math.max(1, Math.floor((source.proceduralCompleted?.() ?? 0) + 1)) : 0;
  entries.push({ key: ENDLESS, mark: "∞", name: "Endless",
    locked: endlessHighest ? null : `Defeat ${CAMPAIGN_BOSSES[MAP_IDS.length - 1]} in ${baseName(MAP_IDS[MAP_IDS.length - 1], mapName)} to unlock` });
  return { entries, endlessHighest };
}

/** Home's travel portal: a centered game window that picks where to go. */
export function createHomeTravelController(deps: {
  source: () => HomeTravelSource;
  travel: (mapId: MapId) => Promise<boolean>;
  departure: () => MapId | null;
  atHome: () => boolean;
  pause: (paused: boolean) => void;
  clearInput?: () => void;
  mapName?: (mapId: MapId) => string;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet travel-sheet";
  dialog.setAttribute("aria-labelledby", "homeTravelTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="homeTravelTitle" class="window-banner"><span>Travel</span></h2></header>`
    + `<p class="farm-map">Choose a map</p><div class="farm-choices" role="group" aria-label="Destinations"></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite" hidden></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button">Back</button>`
    + `<button type="button" class="farm-start travel-go" disabled>Travel</button></div></footer>`;
  document.body.append(dialog);
  const list = dialog.querySelector<HTMLDivElement>(".farm-choices")!;
  const status = dialog.querySelector<HTMLElement>(".farm-selection")!;
  const go = dialog.querySelector<HTMLButtonElement>(".travel-go")!;
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  let selected: string | null = null;
  let endlessHighest = 0;
  let endlessStage = 1;
  let pending = false;
  let endlessInput: HTMLInputElement | null = null;

  const destination = () => selected === ENDLESS ? proceduralMapId(endlessStage) as MapId : selected as MapId | null;
  function setStatus(text: string) { status.textContent = text; status.hidden = !text; }

  function updateSelection() {
    for (const row of list.querySelectorAll<HTMLButtonElement>("[data-map]")) {
      row.setAttribute("aria-pressed", String(row.dataset.map === selected));
    }
    if (endlessInput) endlessInput.value = String(endlessStage);
    for (const step of list.querySelectorAll<HTMLButtonElement>("[data-step]")) {
      const next = endlessStage + Number(step.dataset.step);
      step.disabled = next < 1 || next > endlessHighest;
    }
    go.disabled = pending || !selected;
  }

  function choose(key: string) { selected = key; setStatus(""); updateSelection(); }
  function setStage(stage: number) {
    if (!Number.isFinite(stage)) return;
    endlessStage = Math.min(endlessHighest, Math.max(1, Math.round(stage)));
    choose(ENDLESS);
  }

  function render() {
    const departed = deps.departure();
    const departedKey = departed && isProceduralMap(departed) ? ENDLESS : departed;
    const result = homeTravelEntries(deps.source(), deps.mapName);
    endlessHighest = result.endlessHighest;
    const departedStage = departed ? proceduralMapNumber(departed) : null;
    endlessStage = departedStage && departedStage <= endlessHighest ? departedStage : Math.max(1, endlessHighest);
    const open = result.entries.filter(entry => !entry.locked);
    selected = open.some(entry => entry.key === departedKey) ? departedKey : open.at(-1)?.key ?? null;
    list.replaceChildren(); endlessInput = null;
    for (const entry of result.entries) {
      const row = document.createElement("button");
      row.type = "button"; row.className = "farm-enemy travel-map";
      row.innerHTML = `<span class="farm-enemy-mark" aria-hidden="true"></span><span class="farm-enemy-copy"><strong></strong><span class="farm-reward"></span></span><span class="farm-check" aria-hidden="true">✓</span>`;
      row.querySelector(".farm-enemy-mark")!.textContent = entry.mark;
      row.querySelector("strong")!.textContent = entry.name;
      const note = row.querySelector<HTMLElement>(".farm-reward")!;
      if (entry.locked) {
        row.disabled = true; row.classList.add("is-locked"); note.textContent = entry.locked;
      } else {
        row.dataset.map = entry.key;
        const here = entry.key === departedKey;
        note.textContent = entry.key === ENDLESS ? `Stages 1–${endlessHighest} unlocked${here ? " · Where you left" : ""}` : here ? "Where you left" : `Zone ${entry.mark}`;
        row.classList.toggle("is-departure", here);
        row.addEventListener("click", () => choose(entry.key));
      }
      if (entry.key !== ENDLESS || entry.locked) { list.append(row); continue; }
      const wrap = document.createElement("div");
      wrap.className = "travel-endless";
      wrap.innerHTML = `<button type="button" class="travel-step" data-step="-1" aria-label="Previous Endless stage">−</button>`
        + `<input class="travel-stage" type="number" min="1" step="1" inputmode="numeric" aria-label="Endless stage">`
        + `<button type="button" class="travel-step" data-step="1" aria-label="Next Endless stage">+</button>`;
      endlessInput = wrap.querySelector("input")!;
      endlessInput.max = String(endlessHighest);
      for (const step of wrap.querySelectorAll<HTMLButtonElement>("[data-step]")) {
        step.addEventListener("click", () => setStage(endlessStage + Number(step.dataset.step)));
      }
      endlessInput.addEventListener("change", () => setStage(Number(endlessInput!.value)));
      endlessInput.addEventListener("focus", () => choose(ENDLESS));
      wrap.prepend(row);
      list.append(wrap);
    }
    updateSelection();
  }

  function close() {
    if (!dialog.open) return false;
    dialog.close();
    deps.clearInput?.();
    deps.pause(false);
    return true;
  }

  function open(message = "") {
    if (pending || !deps.atHome()) return;
    render();
    setStatus(message);
    deps.clearInput?.();
    deps.pause(true);
    if (!dialog.open) dialog.showModal();
    const current = list.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    current?.scrollIntoView?.({ block: "nearest" });
    (current ?? back).focus();
  }

  async function travel() {
    const mapId = destination();
    if (!mapId || pending) return;
    pending = true; close();
    let arrived = false;
    try { arrived = await deps.travel(mapId); } catch { arrived = false; }
    pending = false;
    if (!arrived) open(FAILED);
  }

  back.addEventListener("click", close);
  go.addEventListener("click", () => { void travel(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { open, close, isOpen: () => dialog.open, destroy() { close(); dialog.remove(); } };
}
