import { COOKING_RECIPES, cookingReward, nextCookingUnlock, type CookingRecipe } from "../../shared/cooking";
import { CRAFT_MAX_LEVEL, craftExperienceForLevel, craftLevel } from "../../shared/crafting";
import { formatCompactNumber } from "../../shared/compact-number";
import { FISH, type Fish, type FishId } from "../../shared/fishing";
import type { OreCounts } from "../../shared/ore-bag";
import { cookingScene } from "../game/runtime/town/cooking-scene";

const COOK_ALL_KEY = "wildstat:cooking-all:v1";
const COOK_ALL_KINDS_KEY = "wildstat:cooking-all-kinds:v1";

function readFlag(key: string) {
  try { return typeof window !== "undefined" && window.localStorage?.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string, value: boolean) {
  try { if (typeof window !== "undefined") window.localStorage?.setItem(key, value ? "1" : "0"); } catch { /* Session-only fallback. */ }
}

export function createCookingFire(deps: {
  ores: () => OreCounts;
  xp: () => bigint;
  skillet?: () => number;
  finished?: (message: string) => void;
  levelUp?: (message: string) => void;
  cook: (fish: FishId, recipe: string, begin: boolean) => Promise<{ ok: boolean; error?: string } | undefined>;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet smith-sheet cooking-fire";
  dialog.setAttribute("aria-label", "Cooking Fire");
  dialog.innerHTML = '<header class="farm-header"><h2 class="window-banner"><span>Cooking Fire</span></h2></header>'
    + '<div class="quest-body">'
    + '<div class="cook-skill-meter"><div class="cook-skill-meta"><strong class="cook-skill-level"></strong><span class="cook-skill-xp"></span></div>'
    + '<div class="cook-skill-track"><span class="cook-skill-fill"></span></div><small class="cook-skill-next"></small></div>'
    + '<div class="cook-choices"><label>Ingredient <select></select></label>'
    + '<label><input type="checkbox" class="cook-all-toggle"> Cook all</label>'
    + '<label><input type="checkbox" class="cook-kinds-toggle"> All fish</label></div>'
    + '<div class="smith-shop-rows"></div>'
    + '<section class="cook-cast" hidden><strong></strong><progress max="1" value="0" aria-label="Cooking progress"></progress>'
    + '<span class="cook-clock"></span><button type="button" class="window-back-button cook-stop">Stop cooking</button></section>'
    + '<p class="farm-map" role="status"></p></div>'
    + '<form method="dialog" class="farm-footer"><div class="farm-actions"><button class="window-back-button cook-back">Back</button></div></form>';
  document.body.append(dialog);
  const ingredients = dialog.querySelector("select")!;
  const all = dialog.querySelector<HTMLInputElement>(".cook-all-toggle")!;
  const allKinds = dialog.querySelector<HTMLInputElement>(".cook-kinds-toggle")!;
  all.checked = readFlag(COOK_ALL_KEY);
  allKinds.checked = readFlag(COOK_ALL_KINDS_KEY);
  const skillLevel = dialog.querySelector<HTMLElement>(".cook-skill-level")!;
  const skillXp = dialog.querySelector<HTMLElement>(".cook-skill-xp")!;
  const skillFill = dialog.querySelector<HTMLElement>(".cook-skill-fill")!;
  const skillNext = dialog.querySelector<HTMLElement>(".cook-skill-next")!;
  const choices = dialog.querySelector<HTMLElement>(".cook-choices")!, rows = dialog.querySelector<HTMLElement>(".smith-shop-rows")!;
  const cast = dialog.querySelector<HTMLElement>(".cook-cast")!, progress = dialog.querySelector("progress")!;
  const clock = dialog.querySelector(".cook-clock")!, status = dialog.querySelector("p")!;
  const held = (stock = deps.ores()) => FISH.filter(fish => (stock[fish.id] ?? 0) > 0);
  let session = 0, busy = false, snapshot = "";
  const signature = (stock: OreCounts, xp: bigint, skillet: number) => [xp, skillet, ...FISH.map(fish => stock[fish.id] ?? 0)].join("/");

  function paintSkillMeter(xp: bigint) {
    const experience = Number(xp), level = craftLevel(xp), maxed = level >= CRAFT_MAX_LEVEL;
    const floor = craftExperienceForLevel(level);
    const needed = maxed ? 0 : craftExperienceForLevel(level + 1) - floor;
    const into = maxed ? 0 : Math.max(0, experience - floor);
    const share = maxed ? 1 : needed > 0 ? Math.max(0, Math.min(1, into / needed)) : 0;
    dialog.querySelector("h2 span")!.textContent = "Cooking Fire · Lv " + level;
    skillLevel.textContent = maxed ? `Cooking Lv ${level} Max` : `Cooking Lv ${level}`;
    skillXp.textContent = maxed ? "Max" : `${formatCompactNumber(into)} / ${formatCompactNumber(needed)} XP`;
    skillFill.style.width = `${Math.round(share * 1000) / 10}%`;
    skillNext.textContent = nextCookingUnlock(level);
    cookingScene.experience = experience;
  }

  function render() {
    const stock = deps.ores(), xp = deps.xp(), skillet = deps.skillet?.() ?? 0;
    snapshot = signature(stock, xp, skillet);
    paintSkillMeter(xp);
    const previous = ingredients.value, fishHeld = held(stock), level = craftLevel(xp);
    ingredients.replaceChildren(...fishHeld.map(fish => {
      const option = document.createElement("option");
      option.value = fish.id;
      option.textContent = fish.name + " ×" + stock[fish.id];
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
      const reward = cookingReward(fish, recipe, skillet), button = document.createElement("button");
      button.type = "button";
      button.className = "farm-start cook-recipe";
      button.disabled = recipe.level > level || recipe.fish > (stock[fish.id] ?? 0);
      button.innerHTML = "<strong></strong><small></small>";
      button.firstElementChild!.textContent = recipe.name;
      button.lastElementChild!.textContent = recipe.level > level ? "Cooking Lv " + recipe.level
        : recipe.fish + " fish · " + recipe.seconds + "s · " + reward.gold + " gold · " + reward.experience + " XP";
      button.onclick = () => void cook(fish, recipe);
      rows.append(button);
    }
  }

  function nextCookableFish(currentFish: Fish, recipe: CookingRecipe) {
    const stock = deps.ores();
    if ((stock[currentFish.id] ?? 0) >= recipe.fish) return currentFish;
    if (!allKinds.checked) return null;
    return held(stock).find(candidate => (stock[candidate.id] ?? 0) >= recipe.fish) ?? null;
  }

  async function cook(initialFish: Fish, recipe: CookingRecipe) {
    if (busy || !dialog.open) return;
    const id = ++session;
    const current = () => dialog.open && id === session;
    busy = true;
    cookingScene.active = true;
    cookingScene.experience = Number(deps.xp());
    status.textContent = "";
    render();
    let dish = 0, activeFish: Fish | null = initialFish;
    let shownLevel = craftLevel(deps.xp());
    try {
      while (activeFish && current()) {
        const stock = deps.ores();
        const remainingForFish = Math.floor((stock[activeFish.id] ?? 0) / recipe.fish);
        if (remainingForFish <= 0) {
          activeFish = nextCookableFish(activeFish, recipe);
          if (!activeFish) break;
        }
        dish++;
        const totalLeft = all.checked
          ? (allKinds.checked
            ? held(deps.ores()).reduce((sum, each) => sum + Math.floor((deps.ores()[each.id] ?? 0) / recipe.fish), 0)
            : Math.floor((deps.ores()[activeFish.id] ?? 0) / recipe.fish))
          : 1;
        cast.querySelector("strong")!.textContent = `${recipe.name} (${activeFish.name})`
          + (all.checked && totalLeft > 1 ? ` · ${dish} of ${dish + totalLeft - 1}` : "");
        progress.value = 0;
        clock.textContent = "Preparing…";
        const start = await deps.cook(activeFish.id, recipe.id, true);
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
        const served = await deps.cook(activeFish.id, recipe.id, false);
        if (!current()) return;
        if (!served?.ok) throw new Error(served?.error ?? "Not connected");
        const reward = cookingReward(activeFish, recipe, deps.skillet?.() ?? 0);
        const xpNow = deps.xp();
        cookingScene.experience = Math.max(Number(xpNow), cookingScene.experience + reward.experience);
        cookingScene.gain = reward.experience;
        cookingScene.gainLeft = 1;
        cookingScene.badgeLeft = 2.6;
        paintSkillMeter(BigInt(Math.round(cookingScene.experience)));
        const newLevel = craftLevel(cookingScene.experience);
        if (newLevel > shownLevel) {
          const unlocked = COOKING_RECIPES.find(each => each.level > shownLevel && each.level <= newLevel);
          deps.levelUp?.(unlocked ? `Cooking Lv ${newLevel}: ${unlocked.name} unlocked.` : `Cooking Lv ${newLevel}`);
          shownLevel = newLevel;
        }
        status.textContent = recipe.name + " sold · +" + reward.gold + " gold · +" + reward.experience + " Cooking XP";
        if (!all.checked) break;
        activeFish = nextCookableFish(activeFish, recipe);
      }
      if (current() && !held().length) {
        deps.finished?.(status.textContent ?? "");
        close();
      }
    } catch (error) {
      if (current()) status.textContent = error instanceof Error ? error.message : "Cooking interrupted";
    } finally {
      cookingScene.active = false;
      if (current()) { busy = false; render(); }
    }
  }
  function stop() { session++; busy = false; cookingScene.active = false; }
  function close() { stop(); if (dialog.open) dialog.close(); }
  ingredients.onchange = render;
  all.onchange = () => writeFlag(COOK_ALL_KEY, all.checked);
  allKinds.onchange = () => {
    if (allKinds.checked) { all.checked = true; writeFlag(COOK_ALL_KEY, true); }
    writeFlag(COOK_ALL_KINDS_KEY, allKinds.checked);
  };
  dialog.querySelector(".cook-stop")!.addEventListener("click", () => { stop(); status.textContent = "Cooking stopped"; render(); });
  dialog.querySelector(".cook-back")!.addEventListener("click", event => { event.preventDefault(); close(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open) stop(); });
  return {
    open() { if (!dialog.open) { status.textContent = ""; render(); dialog.showModal(); } },
    refresh() { if (dialog.open && !busy && signature(deps.ores(), deps.xp(), deps.skillet?.() ?? 0) !== snapshot) render(); },
    hasFish: () => held().length > 0, close, isOpen: () => dialog.open,
  };
}
