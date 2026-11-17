import { COOKING_RECIPES, cookingReward } from "../../shared/cooking";
import { craftLevel } from "../../shared/crafting";
import { FISH, type FishId } from "../../shared/fishing";
import type { OreCounts } from "../../shared/ore-bag";

export function createCookingFire(deps: {
  ores: () => OreCounts;
  xp: () => bigint;
  cook: (fish: FishId, recipe: string) => Promise<{ ok: boolean; error?: string } | undefined>;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet smith-sheet";
  dialog.setAttribute("aria-label", "Cooking Fire");
  dialog.innerHTML = '<header class="farm-header"><h2 class="window-banner"><span>Cooking Fire</span></h2></header>'
    + '<div class="quest-body"><label>Ingredient <select></select></label><p class="farm-map" role="status"></p><div class="smith-shop-rows"></div></div>'
    + '<footer class="farm-footer"><button class="window-back-button">Back</button></footer>';
  document.body.append(dialog);
  const ingredients = dialog.querySelector("select")!;
  const rows = dialog.querySelector(".smith-shop-rows")!;
  const status = dialog.querySelector("p")!;
  let busy = false;
  function render() {
    const selected = ingredients.value, stock = deps.ores(), level = craftLevel(deps.xp());
    dialog.querySelector("h2 span")!.textContent = "Cooking Fire · Lv " + level;
    const held = FISH.filter(fish => (stock[fish.id] ?? 0) > 0);
    ingredients.replaceChildren(...held.map(fish => {
      const option = document.createElement("option");
      option.value = fish.id;
      option.textContent = fish.name + " ×" + stock[fish.id];
      return option;
    }));
    if (held.some(fish => fish.id === selected)) ingredients.value = selected;
    const fish = held.find(f => f.id === ingredients.value);
    rows.replaceChildren();
    ingredients.disabled = busy || !fish;
    if (!fish) { rows.textContent = "Bring fish from the Town river to cook here."; return; }
    for (const recipe of COOKING_RECIPES) {
      const reward = cookingReward(fish, recipe);
      const button = document.createElement("button");
      button.className = "farm-start";
      button.disabled = busy || recipe.level > level || recipe.fish > (stock[fish.id] ?? 0);
      button.textContent = recipe.name + " · " + recipe.fish + " fish · " + (level < recipe.level ? "Cooking Lv " + recipe.level : reward.gold + " gold · " + reward.experience + " XP");
      button.onclick = async () => {
        if (busy) return;
        busy = true;
        render();
        try {
          const result = await deps.cook(fish.id, recipe.id);
          status.textContent = result?.ok ? recipe.name + " sold · +" + reward.gold + " gold · +" + reward.experience + " Cooking XP" : result?.error ?? "Not connected";
        } finally { busy = false; render(); }
      };
      rows.append(button);
    }
  }
  ingredients.onchange = render;
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.querySelector("button")!.onclick = close;
  return { open() { if (!dialog.open) { status.textContent = ""; render(); dialog.showModal(); } }, close, isOpen: () => dialog.open };
}
