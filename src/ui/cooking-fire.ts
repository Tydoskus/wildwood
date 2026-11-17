import { COOKING_RECIPES, cookingReward, type CookingRecipe } from "../../shared/cooking";
import { craftLevel } from "../../shared/crafting";
import { FISH, type Fish, type FishId } from "../../shared/fishing";
import type { OreCounts } from "../../shared/ore-bag";

export function createCookingFire(deps: {
  ores: () => OreCounts;
  xp: () => bigint;
  finished?: (message: string) => void;
  cook: (fish: FishId, recipe: string, begin: boolean) => Promise<{ ok: boolean; error?: string } | undefined>;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet smith-sheet cooking-fire";
  dialog.setAttribute("aria-label", "Cooking Fire");
  dialog.innerHTML = '<header class="farm-header"><h2 class="window-banner"><span>Cooking Fire</span></h2></header>'
    + '<div class="quest-body"><div class="cook-choices"><label>Ingredient <select></select></label>'
    + '<label><input type="checkbox"> Cook all</label></div><div class="smith-shop-rows"></div>'
    + '<section class="cook-cast" hidden><strong></strong><progress max="1" value="0" aria-label="Cooking progress"></progress>'
    + '<span class="cook-clock"></span><button type="button" class="window-back-button cook-stop">Stop cooking</button></section>'
    + '<p class="farm-map" role="status"></p></div>'
    + '<form method="dialog" class="farm-footer"><div class="farm-actions"><button class="window-back-button cook-back">Back</button></div></form>';
  document.body.append(dialog);
  const ingredients = dialog.querySelector("select")!, all = dialog.querySelector("input")!;
  const choices = dialog.querySelector<HTMLElement>(".cook-choices")!, rows = dialog.querySelector<HTMLElement>(".smith-shop-rows")!;
  const cast = dialog.querySelector<HTMLElement>(".cook-cast")!, progress = dialog.querySelector("progress")!;
  const clock = dialog.querySelector(".cook-clock")!, status = dialog.querySelector("p")!;
  const held = (stock = deps.ores()) => FISH.filter(fish => (stock[fish.id] ?? 0) > 0);
  let session = 0, busy = false, snapshot = "";
  const signature = () => {
    const stock = deps.ores();
    return [deps.xp(), ...FISH.map(fish => stock[fish.id] ?? 0)].join("/");
  };
  function render() {
    snapshot = signature();
    const previous = ingredients.value, fishHeld = held(), level = craftLevel(deps.xp());
    dialog.querySelector("h2 span")!.textContent = "Cooking Fire · Lv " + level;
    ingredients.replaceChildren(...fishHeld.map(fish => {
      const option = document.createElement("option");
      option.value = fish.id;
      option.textContent = fish.name + " ×" + deps.ores()[fish.id];
      return option;
    }));
    if (fishHeld.some(fish => fish.id === previous)) ingredients.value = previous;
    const fish = fishHeld.find(fish => fish.id === ingredients.value) ?? fishHeld[0];
    cast.hidden = !busy;
    rows.hidden = busy;
    choices.hidden = busy || !fish;
    rows.replaceChildren();
    if (!fish) { rows.textContent = "Bring fish from the Town river to cook here."; return; }
    for (const recipe of COOKING_RECIPES) {
      const reward = cookingReward(fish, recipe), button = document.createElement("button");
      button.type = "button";
      button.className = "farm-start cook-recipe";
      button.disabled = recipe.level > level || recipe.fish > (deps.ores()[fish.id] ?? 0);
      button.innerHTML = '<strong></strong><small></small>';
      button.firstElementChild!.textContent = recipe.name;
      button.lastElementChild!.textContent = recipe.level > level ? "Cooking Lv " + recipe.level
        : recipe.fish + " fish · " + recipe.seconds + "s · " + reward.gold + " gold · " + reward.experience + " XP";
      button.onclick = () => void cook(fish, recipe);
      rows.append(button);
    }
  }
  async function cook(fish: Fish, recipe: CookingRecipe) {
    if (busy || !dialog.open) return;
    const id = ++session, portions = all.checked ? Math.floor((deps.ores()[fish.id] ?? 0) / recipe.fish) : 1;
    const current = () => dialog.open && id === session;
    busy = true;
    status.textContent = "";
    render();
    try {
      for (let dish = 1; dish <= portions && current(); dish++) {
        cast.querySelector("strong")!.textContent = recipe.name + (portions > 1 ? " · " + dish + " of " + portions : "");
        progress.value = 0;
        clock.textContent = "Preparing…";
        const start = await deps.cook(fish.id, recipe.id, true);
        if (!current()) return;
        if (!start?.ok) throw new Error(start?.error ?? "Not connected");
        const duration = recipe.seconds * 1000, finish = performance.now() + duration;
        while (current()) {
          const left = Math.max(0, finish - performance.now());
          progress.value = 1 - left / duration;
          clock.textContent = (left / 1000).toFixed(1) + "s";
          if (!left) break;
          await new Promise(done => setTimeout(done, Math.min(80, left)));
        }
        if (!current()) return;
        clock.textContent = "Serving…";
        const served = await deps.cook(fish.id, recipe.id, false);
        if (!current()) return;
        if (!served?.ok) throw new Error(served?.error ?? "Not connected");
        const reward = cookingReward(fish, recipe);
        status.textContent = recipe.name + " sold · +" + reward.gold + " gold · +" + reward.experience + " Cooking XP";
      }
      if (current() && !held().length) {
        deps.finished?.(status.textContent ?? "");
        close();
      }
    } catch (error) {
      if (current()) status.textContent = error instanceof Error ? error.message : "Cooking interrupted";
    } finally {
      if (current()) { busy = false; render(); }
    }
  }
  function stop() { session++; busy = false; }
  function close() { stop(); if (dialog.open) dialog.close(); }
  ingredients.onchange = render;
  dialog.querySelector(".cook-stop")!.addEventListener("click", () => { stop(); status.textContent = "Cooking stopped"; render(); });
  dialog.querySelector(".cook-back")!.addEventListener("click", event => { event.preventDefault(); close(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open) stop(); });
  return {
    open() { if (!dialog.open) { status.textContent = ""; render(); dialog.showModal(); } },
    refresh() { if (dialog.open && !busy && signature() !== snapshot) render(); },
    hasFish: () => held().length > 0, close, isOpen: () => dialog.open,
  };
}
