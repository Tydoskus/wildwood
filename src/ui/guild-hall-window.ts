import { GUILD_HALL_PARTS, GUILD_HALL_TABLE_SEATS, guildHallUpgradeCost, type GuildHallLevels, type GuildHallPart } from "../../shared/guild-hall";
import { createGuildEmblem } from "./guild-emblems";

export type GuildHallWindowState = {
  /** Null without a guild. */
  guild: { name: string; emblem?: number; canUpgrade: boolean } | null;
  fund: number;
  levels: GuildHallLevels;
  /** Whether the player is in the hall already: the window then has no way in. */
  inHall: boolean;
};

/**
 * The Guild Hall window: the guild's crest and hall fund, every upgrade with
 * its level and what the next one costs, and (away from the hall) the way in.
 * The President and Vice Presidents buy upgrades; everyone else sees them.
 */
export function createGuildHallWindow(deps: {
  state: () => GuildHallWindowState;
  /** Fetches the guild's name, badge and roles again; the window redraws when it lands. */
  refresh?: () => Promise<void>;
  upgrade: (part: GuildHallPart) => Promise<boolean>;
  enter: () => Promise<boolean>;
  pause: (paused: boolean) => void;
  clearInput?: () => void;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet travel-sheet soul-sheet guild-hall-sheet";
  dialog.setAttribute("aria-labelledby", "guildHallTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="guildHallTitle" class="window-banner"><span>Guild Hall</span></h2></header>`
    + `<div class="guild-hall-crest"></div><p class="farm-map guild-hall-fund"></p><div class="farm-choices soul-body"></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite" hidden></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button">Back</button>`
    + `<button type="button" class="farm-start guild-hall-enter">Enter Hall</button></div></footer>`;
  document.body.append(dialog);
  const crest = dialog.querySelector<HTMLDivElement>(".guild-hall-crest")!;
  const fund = dialog.querySelector<HTMLElement>(".guild-hall-fund")!;
  const body = dialog.querySelector<HTMLDivElement>(".soul-body")!;
  const status = dialog.querySelector<HTMLElement>(".farm-selection")!;
  const enter = dialog.querySelector<HTMLButtonElement>(".guild-hall-enter")!;
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  let pending = false;

  function setStatus(text: string) { status.textContent = text; status.hidden = !text; }

  function partRow(part: (typeof GUILD_HALL_PARTS)[number], state: GuildHallWindowState) {
    const level = state.levels[part.id];
    const cost = guildHallUpgradeCost(state.levels, part.id);
    const block = document.createElement("section");
    block.className = "soul-section guild-hall-part";
    const heading = document.createElement("h3");
    heading.textContent = part.name;
    const now = document.createElement("p");
    now.className = "soul-row";
    const label = document.createElement("span");
    label.textContent = part.id === "table" ? `${part.levels[level]} (${GUILD_HALL_TABLE_SEATS[level]})` : part.levels[level];
    const progress = document.createElement("strong");
    progress.textContent = `Level ${level + 1} of ${part.levels.length}`;
    now.append(label, progress);
    block.append(heading, now);
    if (cost === null) {
      now.classList.add("is-done");
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "farm-enemy soul-toggle guild-hall-upgrade";
      button.textContent = `${part.levels[level + 1]}: ${cost} Quest Points`;
      button.disabled = pending || !state.guild?.canUpgrade || state.fund < cost;
      button.addEventListener("click", async () => {
        if (pending) return;
        pending = true; render();
        try {
          if (await deps.upgrade(part.id)) setStatus(`${part.name} upgraded.`);
        } catch (error) {
          setStatus(error instanceof Error && error.message ? error.message : "Could not upgrade. Try again.");
        }
        pending = false;
        // The hall row arrives on its own; draw again once it has.
        window.setTimeout(() => { if (dialog.open) render(); }, 400);
        render();
      });
      block.append(button);
    }
    body.append(block);
  }

  function render() {
    const state = deps.state();
    body.replaceChildren();
    crest.replaceChildren();
    if (!state.guild) {
      fund.textContent = "Join a guild to have a hall.";
      enter.disabled = true;
      return;
    }
    crest.append(createGuildEmblem(document, state.guild.name, "guild-hall-badge", state.guild.emblem));
    const name = document.createElement("strong");
    name.textContent = state.guild.name;
    crest.append(name);
    fund.textContent = `Hall Fund: ${state.fund} Quest Points`;
    const note = document.createElement("p");
    note.className = "soul-note";
    note.textContent = state.guild.canUpgrade
      ? "Guild quests fill the fund as they are finished. Upgrades change how the hall looks, never anyone's stats."
      : "Guild quests fill the fund as they are finished. The President and Vice Presidents choose the upgrades.";
    body.append(note);
    for (const part of GUILD_HALL_PARTS) partRow(part, state);
    enter.hidden = state.inHall;
    enter.disabled = pending;
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
    (enter.hidden || enter.disabled ? back : enter).focus();
    void deps.refresh?.().then(() => { if (dialog.open) render(); }, () => {});
  }
  async function go() {
    if (pending) return;
    pending = true; close();
    let arrived = false;
    try { arrived = await deps.enter(); } catch { arrived = false; }
    pending = false;
    if (!arrived) open("Could not enter the hall. Try again.");
  }

  back.addEventListener("click", close);
  enter.addEventListener("click", () => { void go(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { open, close, isOpen: () => dialog.open, refresh: () => { if (dialog.open) render(); } };
}
