import { COOKING_RECIPES, cookingReward, nextCookingUnlock, type CookingRecipe } from "../../shared/cooking";
import { CRAFT_MAX_LEVEL, craftExperienceForLevel, craftLevel } from "../../shared/crafting";
import { formatCompactNumber } from "../../shared/compact-number";
import { FISH, type Fish, type FishId } from "../../shared/fishing";
import type { OreCounts } from "../../shared/ore-bag";
import { toolEffectText } from "../../shared/tools";
import { cookingScene } from "../game/runtime/town/cooking-scene";

const COOK_ALL_KEY = "wildstat:cooking-all:v1";
const COOK_DISH_KEY = "wildstat:cooking-dish:v1";

function readStore(key: string) {
  try { return typeof window !== "undefined" ? window.localStorage?.getItem(key) ?? null : null; } catch { return null; }
}
function writeStore(key: string, value: string) {
  try { if (typeof window !== "undefined") window.localStorage?.setItem(key, value); } catch { /* Session-only fallback. */ }
}

/** Short label for the dish-style strip: the 1-fish default is plain "Roast Fish", multi-fish recipes stay bonus dishes. */
function dishLabel(recipe: CookingRecipe) {
  return recipe.fish === 1 ? "Roast Fish" : recipe.name;
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
    + '<div class="quest-body cook-body">'
    + '<div class="cook-skill-meter">'
    + '<div class="cook-skill-meta"><strong class="cook-skill-level"></strong><span class="cook-skill-xp"></span></div>'
    + '<div class="cook-skill-track"><span class="cook-skill-fill"></span></div>'
    + '<div class="cook-skill-foot"><small class="cook-skill-next"></small><small class="cook-skillet-pill" hidden></small></div>'
    + '</div>'
    + '<div class="cook-toolbar" hidden>'
    + '<div class="cook-mode-seg" role="group" aria-label="Batch size">'
    + '<button type="button" class="cook-mode-btn" data-mode="one">Cook 1</button>'
    + '<button type="button" class="cook-mode-btn" data-mode="all">Cook All</button>'
    + '</div>'
    + '<button type="button" class="cook-bag-btn" hidden>Cook All Fish</button>'
    + '</div>'
    + '<section class="cook-fish-section"><div class="cook-section-head"><span>Your Fish</span><small class="cook-section-sub"></small></div>'
    + '<div class="cook-fish-list"></div></section>'
    + '<section class="cook-dishes-section" hidden><div class="cook-section-head"><span>Special Recipes</span><small>Optional multi-fish bonus</small></div>'
    + '<div class="cook-dish-strip" role="radiogroup" aria-label="Cooking style"></div></section>'
    + '<section class="cook-cast" hidden>'
    + '<div class="cook-cast-head"><span class="cook-flame" aria-hidden="true"></span>'
    + '<div class="cook-cast-copy"><strong class="cook-cast-title"></strong><span class="cook-clock"></span></div></div>'
    + '<div class="cook-cast-track" role="progressbar" aria-label="Cooking progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="cook-cast-fill"></span></div>'
    + '<div class="cook-cast-totals" hidden></div>'
    + '<button type="button" class="window-back-button cook-stop">Stop Cooking</button>'
    + '</section>'
    + '<p class="cook-status" role="status"></p></div>'
    + '<form method="dialog" class="farm-footer"><div class="farm-actions"><button class="window-back-button cook-back">Back</button></div></form>';
  document.body.append(dialog);

  const skillLevel = dialog.querySelector<HTMLElement>(".cook-skill-level")!;
  const skillXp = dialog.querySelector<HTMLElement>(".cook-skill-xp")!;
  const skillFill = dialog.querySelector<HTMLElement>(".cook-skill-fill")!;
  const skillNext = dialog.querySelector<HTMLElement>(".cook-skill-next")!;
  const skilletPill = dialog.querySelector<HTMLElement>(".cook-skillet-pill")!;
  const toolbar = dialog.querySelector<HTMLElement>(".cook-toolbar")!;
  const modeOne = dialog.querySelector<HTMLButtonElement>('[data-mode="one"]')!;
  const modeAll = dialog.querySelector<HTMLButtonElement>('[data-mode="all"]')!;
  const cookBagBtn = dialog.querySelector<HTMLButtonElement>(".cook-bag-btn")!;
  const fishSection = dialog.querySelector<HTMLElement>(".cook-fish-section")!;
  const sectionSub = dialog.querySelector<HTMLElement>(".cook-section-sub")!;
  const fishList = dialog.querySelector<HTMLElement>(".cook-fish-list")!;
  const dishesSection = dialog.querySelector<HTMLElement>(".cook-dishes-section")!;
  const dishStrip = dialog.querySelector<HTMLElement>(".cook-dish-strip")!;
  const cast = dialog.querySelector<HTMLElement>(".cook-cast")!;
  const castTitle = dialog.querySelector<HTMLElement>(".cook-cast-title")!;
  const castTrack = dialog.querySelector<HTMLElement>(".cook-cast-track")!;
  const castFill = dialog.querySelector<HTMLElement>(".cook-cast-fill")!;
  const castTotals = dialog.querySelector<HTMLElement>(".cook-cast-totals")!;
  const clock = dialog.querySelector<HTMLElement>(".cook-clock")!;
  const status = dialog.querySelector<HTMLElement>(".cook-status")!;

  const held = (stock = deps.ores()) => FISH.filter(fish => (stock[fish.id] ?? 0) > 0);
  let cookAll = readStore(COOK_ALL_KEY) === "1";
  let selectedDishId = readStore(COOK_DISH_KEY) ?? COOKING_RECIPES[0].id;
  let session = 0, busy = false, snapshot = "";
  const signature = (stock: OreCounts, xp: bigint, skillet: number) =>
    [xp, skillet, cookAll ? 1 : 0, selectedDishId, ...FISH.map(fish => stock[fish.id] ?? 0)].join("/");

  function activeRecipe(level: number): CookingRecipe {
    const found = COOKING_RECIPES.find(each => each.id === selectedDishId);
    if (found && found.level <= level) return found;
    return COOKING_RECIPES[0];
  }

  function paintSkillMeter(xp: bigint, skillet = deps.skillet?.() ?? 0) {
    const experience = Number(xp), level = craftLevel(xp), maxed = level >= CRAFT_MAX_LEVEL;
    const floor = craftExperienceForLevel(level);
    const needed = maxed ? 0 : craftExperienceForLevel(level + 1) - floor;
    const into = maxed ? 0 : Math.max(0, experience - floor);
    const share = maxed ? 1 : needed > 0 ? Math.max(0, Math.min(1, into / needed)) : 0;
    dialog.querySelector("h2 span")!.textContent = `Cooking Fire · Lv ${level}`;
    skillLevel.textContent = maxed ? `Cooking Lv ${level} Max` : `Cooking Lv ${level}`;
    skillXp.textContent = maxed ? "Max" : `${formatCompactNumber(into)} / ${formatCompactNumber(needed)} XP`;
    skillFill.style.width = `${Math.round(share * 1000) / 10}%`;
    skillNext.textContent = nextCookingUnlock(level);
    if (skillet > 0) {
      skilletPill.hidden = false;
      skilletPill.textContent = `Skillet Lv ${skillet} · ${toolEffectText("skillet", skillet)}`;
    } else {
      skilletPill.hidden = true;
    }
    cookingScene.experience = experience;
  }

  function render() {
    const stock = deps.ores(), xp = deps.xp(), skillet = deps.skillet?.() ?? 0;
    const level = craftLevel(xp);
    const recipe = activeRecipe(level);
    selectedDishId = recipe.id;
    snapshot = signature(stock, xp, skillet);
    paintSkillMeter(xp, skillet);

    const fishHeld = held(stock);
    cast.hidden = !busy;
    fishSection.hidden = busy;
    dishesSection.hidden = busy || !fishHeld.length;
    toolbar.hidden = busy || !fishHeld.length;

    if (busy) return;

    modeOne.classList.toggle("is-active", !cookAll);
    modeOne.setAttribute("aria-pressed", String(!cookAll));
    modeAll.classList.toggle("is-active", cookAll);
    modeAll.setAttribute("aria-pressed", String(cookAll));

    const totalBatches = fishHeld.reduce((sum, each) => sum + Math.floor((stock[each.id] ?? 0) / recipe.fish), 0);
    const cookableKinds = fishHeld.filter(each => (stock[each.id] ?? 0) >= recipe.fish);
    cookBagBtn.hidden = cookableKinds.length <= 1;
    cookBagBtn.textContent = `Cook All Fish (${totalBatches})`;
    cookBagBtn.disabled = totalBatches <= 0;
    cookBagBtn.onclick = () => {
      if (cookableKinds.length) void cook(cookableKinds[0], recipe, { batch: true, allKinds: true });
    };

    sectionSub.textContent = recipe.fish === 1
      ? `Tap a fish to roast · ${recipe.seconds}s each`
      : `${recipe.name} · ${recipe.fish} fish · ${recipe.seconds}s each`;

    fishList.replaceChildren();
    if (!fishHeld.length) {
      const empty = document.createElement("p");
      empty.className = "cook-empty";
      empty.textContent = "Bring fish from the Town river or Guild Pond to cook here.";
      fishList.append(empty);
      return;
    }

    for (const fish of fishHeld) {
      const count = stock[fish.id] ?? 0;
      const batches = Math.floor(count / recipe.fish);
      const reward = cookingReward(fish, recipe, skillet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cook-recipe cook-fish-card";
      btn.disabled = batches <= 0;
      const top = document.createElement("span");
      top.className = "cook-fish-top";
      const name = document.createElement("strong");
      name.textContent = fish.name;
      const qty = document.createElement("span");
      qty.className = "cook-fish-qty";
      qty.textContent = `×${formatCompactNumber(count)}`;
      top.append(name, qty);

      const meta = document.createElement("span");
      meta.className = "cook-fish-meta";
      if (batches <= 0) {
        meta.textContent = `Need ${recipe.fish} ${fish.name} for ${recipe.name}`;
      } else {
        const gold = document.createElement("span");
        gold.className = "cook-gold";
        gold.textContent = `+${formatCompactNumber(reward.gold)}g`;
        const xpText = document.createElement("span");
        xpText.className = "cook-xp";
        xpText.textContent = `+${formatCompactNumber(reward.experience)} XP`;
        const action = document.createElement("span");
        action.className = "cook-batch-tag";
        action.textContent = cookAll && batches > 1 ? `Cook ${batches}×` : recipe.fish === 1 ? "Roast" : recipe.name;
        meta.append(gold, xpText, action);
      }
      btn.append(top, meta);
      btn.onclick = () => void cook(fish, recipe, { batch: cookAll, allKinds: false });
      fishList.append(btn);
    }

    dishStrip.replaceChildren();
    for (const option of COOKING_RECIPES) {
      const locked = option.level > level;
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `cook-dish-pill${option.id === recipe.id ? " is-active" : ""}${locked ? " is-locked" : ""}`;
      pill.setAttribute("role", "radio");
      pill.setAttribute("aria-checked", String(option.id === recipe.id));
      pill.disabled = locked;
      const title = document.createElement("strong");
      title.textContent = dishLabel(option);
      const detail = document.createElement("small");
      detail.textContent = locked ? `Lv ${option.level}` : option.fish === 1 ? "1 fish · 3s" : `${option.fish} fish · +${option.bonus} bonus`;
      pill.append(title, detail);
      pill.onclick = () => {
        selectedDishId = option.id;
        writeStore(COOK_DISH_KEY, option.id);
        render();
      };
      dishStrip.append(pill);
    }
  }

  function nextCookableFish(currentFish: Fish, recipe: CookingRecipe, allKinds: boolean) {
    const stock = deps.ores();
    if ((stock[currentFish.id] ?? 0) >= recipe.fish) return currentFish;
    if (!allKinds) return null;
    return held(stock).find(candidate => (stock[candidate.id] ?? 0) >= recipe.fish) ?? null;
  }

  function setCastProgress(fraction: number) {
    const clamped = Math.max(0, Math.min(1, fraction));
    castFill.style.width = `${Math.round(clamped * 1000) / 10}%`;
    castTrack.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
  }

  async function cook(initialFish: Fish, recipe: CookingRecipe, opts: { batch: boolean; allKinds: boolean }) {
    if (busy || !dialog.open) return;
    const id = ++session;
    const current = () => dialog.open && id === session;
    busy = true;
    cookingScene.active = true;
    cookingScene.experience = Number(deps.xp());
    status.textContent = "";
    castTotals.hidden = true;
    castTotals.textContent = "";
    render();
    let dish = 0, totalGold = 0, totalXp = 0, activeFish: Fish | null = initialFish;
    let shownLevel = craftLevel(deps.xp());
    try {
      while (activeFish && current()) {
        const stock = deps.ores();
        const remainingForFish = Math.floor((stock[activeFish.id] ?? 0) / recipe.fish);
        if (remainingForFish <= 0) {
          activeFish = nextCookableFish(activeFish, recipe, opts.allKinds);
          if (!activeFish) break;
        }
        dish++;
        const liveStock = deps.ores();
        const totalLeft = opts.batch
          ? (opts.allKinds
            ? held(liveStock).reduce((sum, each) => sum + Math.floor((liveStock[each.id] ?? 0) / recipe.fish), 0)
            : Math.floor((liveStock[activeFish.id] ?? 0) / recipe.fish))
          : 1;
        const verb = recipe.fish === 1 ? `Roasting ${activeFish.name}` : `${recipe.name} (${activeFish.name})`;
        castTitle.textContent = verb + (opts.batch && totalLeft > 1 ? ` · ${dish} of ${dish + totalLeft - 1}` : "");
        setCastProgress(0);
        clock.textContent = "Preparing…";
        const start = await deps.cook(activeFish.id, recipe.id, true);
        if (!current()) return;
        if (!start?.ok) throw new Error(start?.error ?? "Not connected");
        const duration = recipe.seconds * 1000, finish = performance.now() + duration;
        while (current()) {
          const left = Math.max(0, finish - performance.now());
          setCastProgress(1 - left / duration);
          clock.textContent = `${(left / 1000).toFixed(1)}s`;
          if (!left) break;
          await new Promise(done => setTimeout(done, Math.min(80, left)));
        }
        if (!current()) return;
        setCastProgress(1);
        clock.textContent = "Serving…";
        const served = await deps.cook(activeFish.id, recipe.id, false);
        if (!current()) return;
        if (!served?.ok) throw new Error(served?.error ?? "Not connected");
        const reward = cookingReward(activeFish, recipe, deps.skillet?.() ?? 0);
        totalGold += reward.gold;
        totalXp += reward.experience;
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
        const servedLabel = recipe.fish === 1 ? `Roasted ${activeFish.name}` : recipe.name;
        status.textContent = `${servedLabel} sold · +${formatCompactNumber(reward.gold)}g · +${formatCompactNumber(reward.experience)} XP`;
        if (dish > 0) {
          castTotals.hidden = false;
          castTotals.textContent = `Session: ${dish} cooked · +${formatCompactNumber(totalGold)}g · +${formatCompactNumber(totalXp)} XP`;
        }
        if (!opts.batch) break;
        activeFish = nextCookableFish(activeFish, recipe, opts.allKinds);
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

  function setBatch(value: boolean) {
    cookAll = value;
    writeStore(COOK_ALL_KEY, value ? "1" : "0");
    render();
  }
  function stop() { session++; busy = false; cookingScene.active = false; }
  function close() { stop(); if (dialog.open) dialog.close(); }

  modeOne.addEventListener("click", () => setBatch(false));
  modeAll.addEventListener("click", () => setBatch(true));
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
