import {
  COOKING_RECIPES, canCookFish, cookedFishId, cookedFishSellPrice, cookingReward,
  cookingStopBurnLevel, cookingSuccessChance, fishCookingLevel, formatFoodBuffSummary,
  nextCookingUnlock, type CookingRecipe,
} from "../../shared/cooking";
import { CRAFT_MAX_LEVEL, craftExperienceForLevel, craftLevel } from "../../shared/crafting";
import { formatCompactNumber } from "../../shared/compact-number";
import { FISH, type Fish, type FishId } from "../../shared/fishing";
import type { OreCounts } from "../../shared/ore-bag";
import { toolEffectText } from "../../shared/tools";
import { cookingScene } from "../game/runtime/town/cooking-scene";
import { oreIconSource } from "./ore-icon";

const COOK_ALL_KEY = "wildstat:cooking-all:v1";
const COOK_DISH_KEY = "wildstat:cooking-dish:v1";

function readStore(key: string) {
  try { return typeof window !== "undefined" ? window.localStorage?.getItem(key) ?? null : null; } catch { return null; }
}
function writeStore(key: string, value: string) {
  try { if (typeof window !== "undefined") window.localStorage?.setItem(key, value); } catch { /* Session-only fallback. */ }
}

/** Short label for the dish-style picker: the 1-fish default is plain "Roast Fish", multi-fish recipes stay bonus dishes. */
function dishLabel(recipe: CookingRecipe) {
  return recipe.fish === 1 ? "Roast Fish" : recipe.name;
}

function openDialog(el: HTMLDialogElement) {
  if (el.open) return;
  if (typeof el.showModal === "function") el.showModal();
  else el.open = true;
}

function closeDialog(el: HTMLDialogElement) {
  if (!el.open) return;
  if (typeof el.close === "function") el.close();
  else el.open = false;
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
    + '<div class="cook-top-strip">'
    + '<button type="button" class="cook-nav-pill cook-open-recipes" aria-haspopup="dialog">'
    + '<span class="cook-nav-kicker">Recipe</span>'
    + '<strong class="cook-nav-value cook-recipe-value"></strong>'
    + '<small class="cook-nav-sub cook-recipe-sub"></small>'
    + '</button>'
    + '<button type="button" class="cook-nav-pill cook-open-skill" aria-haspopup="dialog">'
    + '<span class="cook-nav-kicker">Skill &amp; Info</span>'
    + '<strong class="cook-nav-value cook-skill-summary"></strong>'
    + '<span class="cook-mini-track" aria-hidden="true"><span class="cook-mini-fill"></span></span>'
    + '</button>'
    + '</div>'
    + '<div class="cook-toolbar" hidden>'
    + '<div class="cook-mode-seg" role="group" aria-label="Batch size">'
    + '<button type="button" class="cook-mode-btn" data-mode="one">Cook 1</button>'
    + '<button type="button" class="cook-mode-btn" data-mode="all">Cook All</button>'
    + '</div>'
    + '<button type="button" class="cook-bag-btn" hidden>Cook All Fish</button>'
    + '</div>'
    + '<div class="quest-body cook-body">'
    + '<section class="cook-fish-section">'
    + '<div class="cook-fish-list"></div>'
    + '</section>'
    + '<section class="cook-cast" hidden>'
    + '<div class="cook-cast-head">'
    + '<span class="cook-cast-visual"><img class="cook-cast-img" alt="" draggable="false" /><span class="cook-flame" aria-hidden="true"></span></span>'
    + '<div class="cook-cast-copy"><strong class="cook-cast-title"></strong><span class="cook-clock"></span></div>'
    + '</div>'
    + '<div class="cook-cast-track" role="progressbar" aria-label="Cooking progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="cook-cast-fill"></span></div>'
    + '<div class="cook-cast-totals" hidden></div>'
    + '<button type="button" class="window-back-button cook-stop">Stop Cooking</button>'
    + '</section>'
    + '<p class="cook-status" role="status"></p>'
    + '</div>'
    + '<form method="dialog" class="farm-footer"><div class="farm-actions"><button class="window-back-button cook-back">Back</button></div></form>';

  const recipesDialog = document.createElement("dialog");
  recipesDialog.className = "farm-sheet quest-sheet cook-sub-sheet cook-recipes-sheet";
  recipesDialog.setAttribute("aria-label", "Cooking Recipes");
  recipesDialog.innerHTML = '<header class="farm-header"><h2 class="window-banner"><span>Recipes</span></h2></header>'
    + '<p class="farm-map">Choose how to cook your fish. Multi-fish recipes give bonus rewards.</p>'
    + '<div class="quest-body cook-sub-body"><div class="cook-dish-list" role="radiogroup" aria-label="Cooking style"></div></div>'
    + '<form method="dialog" class="farm-footer"><div class="farm-actions"><button class="window-back-button cook-sub-back">Back</button></div></form>';

  const skillDialog = document.createElement("dialog");
  skillDialog.className = "farm-sheet quest-sheet cook-sub-sheet cook-skill-sheet";
  skillDialog.setAttribute("aria-label", "Cooking Skill");
  skillDialog.innerHTML = '<header class="farm-header"><h2 class="window-banner"><span>Cooking Skill</span></h2></header>'
    + '<div class="quest-body cook-sub-body">'
    + '<div class="cook-skill-meter">'
    + '<div class="cook-skill-meta"><strong class="cook-skill-level"></strong><span class="cook-skill-xp"></span></div>'
    + '<div class="cook-skill-track"><span class="cook-skill-fill"></span></div>'
    + '<div class="cook-skill-foot"><small class="cook-skill-next"></small><small class="cook-skillet-pill" hidden></small></div>'
    + '</div>'
    + '<div class="cook-unlock-list"></div>'
    + '</div>'
    + '<form method="dialog" class="farm-footer"><div class="farm-actions"><button class="window-back-button cook-sub-back">Back</button></div></form>';

  document.body.append(dialog, recipesDialog, skillDialog);

  const openRecipesBtn = dialog.querySelector<HTMLButtonElement>(".cook-open-recipes")!;
  const openSkillBtn = dialog.querySelector<HTMLButtonElement>(".cook-open-skill")!;
  const recipeValue = dialog.querySelector<HTMLElement>(".cook-recipe-value")!;
  const recipeSub = dialog.querySelector<HTMLElement>(".cook-recipe-sub")!;
  const skillSummary = dialog.querySelector<HTMLElement>(".cook-skill-summary")!;
  const miniFill = dialog.querySelector<HTMLElement>(".cook-mini-fill")!;
  const toolbar = dialog.querySelector<HTMLElement>(".cook-toolbar")!;
  const modeOne = dialog.querySelector<HTMLButtonElement>('[data-mode="one"]')!;
  const modeAll = dialog.querySelector<HTMLButtonElement>('[data-mode="all"]')!;
  const cookBagBtn = dialog.querySelector<HTMLButtonElement>(".cook-bag-btn")!;
  const fishSection = dialog.querySelector<HTMLElement>(".cook-fish-section")!;
  const fishList = dialog.querySelector<HTMLElement>(".cook-fish-list")!;
  const cast = dialog.querySelector<HTMLElement>(".cook-cast")!;
  const castImg = dialog.querySelector<HTMLImageElement>(".cook-cast-img")!;
  const castTitle = dialog.querySelector<HTMLElement>(".cook-cast-title")!;
  const castTrack = dialog.querySelector<HTMLElement>(".cook-cast-track")!;
  const castFill = dialog.querySelector<HTMLElement>(".cook-cast-fill")!;
  const castTotals = dialog.querySelector<HTMLElement>(".cook-cast-totals")!;
  const clock = dialog.querySelector<HTMLElement>(".cook-clock")!;
  const status = dialog.querySelector<HTMLElement>(".cook-status")!;

  const dishList = recipesDialog.querySelector<HTMLElement>(".cook-dish-list")!;
  const skillLevel = skillDialog.querySelector<HTMLElement>(".cook-skill-level")!;
  const skillXp = skillDialog.querySelector<HTMLElement>(".cook-skill-xp")!;
  const skillFill = skillDialog.querySelector<HTMLElement>(".cook-skill-fill")!;
  const skillNext = skillDialog.querySelector<HTMLElement>(".cook-skill-next")!;
  const skilletPill = skillDialog.querySelector<HTMLElement>(".cook-skillet-pill")!;
  const unlockList = skillDialog.querySelector<HTMLElement>(".cook-unlock-list")!;

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
    const pct = `${Math.round(share * 1000) / 10}%`;

    skillSummary.textContent = maxed ? `Lv ${level} Max` : `Lv ${level} · ${formatCompactNumber(into)}/${formatCompactNumber(needed)}`;
    miniFill.style.width = pct;

    skillLevel.textContent = maxed ? `Cooking Lv ${level} Max` : `Cooking Lv ${level}`;
    skillXp.textContent = maxed ? "Max" : `${formatCompactNumber(into)} / ${formatCompactNumber(needed)} XP`;
    skillFill.style.width = pct;
    skillNext.textContent = nextCookingUnlock(level);
    if (skillet > 0) {
      skilletPill.hidden = false;
      skilletPill.textContent = `Skillet Lv ${skillet} · ${toolEffectText("skillet", skillet)}`;
    } else {
      skilletPill.hidden = true;
    }

    unlockList.replaceChildren();
    for (const fish of FISH) {
      const unlocked = canCookFish(fish, level);
      const stopBurn = cookingStopBurnLevel(fish);
      const chance = unlocked ? Math.round(cookingSuccessChance(fish, level, skillet) * 100) : 0;
      const row = document.createElement("div");
      row.className = `cook-unlock-row${unlocked ? " is-unlocked" : ""}`;
      const thumb = document.createElement("img");
      thumb.className = "cook-unlock-img";
      thumb.src = oreIconSource(fish.id);
      thumb.alt = "";
      thumb.draggable = false;
      const copy = document.createElement("div");
      copy.className = "cook-unlock-copy";
      const left = document.createElement("strong");
      left.textContent = `${fish.name} · ${cookedFishSellPrice(fish.id)}g`;
      const mid = document.createElement("span");
      mid.className = "cook-unlock-meta";
      mid.textContent = formatFoodBuffSummary(fish.id);
      copy.append(left, mid);
      const badge = document.createElement("span");
      badge.className = `cook-unlock-lvl${unlocked && chance < 100 ? " is-risk" : ""}`;
      badge.textContent = !unlocked
        ? `Lv ${fishCookingLevel(fish)}`
        : chance < 100 ? `${chance}% · Safe Lv ${stopBurn}` : "100% Safe";
      row.append(thumb, copy, badge);
      unlockList.append(row);
    }
    cookingScene.experience = experience;
  }

  function renderRecipesWindow(level: number, recipe: CookingRecipe) {
    dishList.replaceChildren();
    for (const option of COOKING_RECIPES) {
      const locked = option.level > level;
      const active = option.id === recipe.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cook-dish-row${active ? " is-active" : ""}${locked ? " is-locked" : ""}`;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(active));
      btn.disabled = locked;
      const head = document.createElement("span");
      head.className = "cook-dish-row-head";
      const title = document.createElement("strong");
      title.textContent = dishLabel(option);
      const tag = document.createElement("span");
      tag.className = "cook-dish-row-tag";
      tag.textContent = locked ? `Lv ${option.level}` : active ? "Active" : `Lv ${option.level}`;
      head.append(title, tag);
      const detail = document.createElement("small");
      detail.textContent = option.fish === 1
        ? `1 fish · ${option.seconds}s per roast`
        : `${option.fish} fish · ${option.seconds}s · +${option.bonus} bonus reward`;
      btn.append(head, detail);
      btn.onclick = () => {
        selectedDishId = option.id;
        writeStore(COOK_DISH_KEY, option.id);
        closeDialog(recipesDialog);
        render();
      };
      dishList.append(btn);
    }
  }

  function render() {
    const stock = deps.ores(), xp = deps.xp(), skillet = deps.skillet?.() ?? 0;
    const level = craftLevel(xp);
    const recipe = activeRecipe(level);
    selectedDishId = recipe.id;
    snapshot = signature(stock, xp, skillet);
    paintSkillMeter(xp, skillet);
    renderRecipesWindow(level, recipe);

    recipeValue.textContent = dishLabel(recipe);
    recipeSub.textContent = `${recipe.fish} fish · ${recipe.seconds}s`;

    const fishHeld = held(stock);
    cast.hidden = !busy;
    fishSection.hidden = busy;
    toolbar.hidden = busy || !fishHeld.length;
    openRecipesBtn.disabled = busy;
    openSkillBtn.disabled = busy;

    if (busy) return;

    modeOne.classList.toggle("is-active", !cookAll);
    modeOne.setAttribute("aria-pressed", String(!cookAll));
    modeAll.classList.toggle("is-active", cookAll);
    modeAll.setAttribute("aria-pressed", String(cookAll));

    const cookableKinds = fishHeld.filter(each => canCookFish(each, level) && (stock[each.id] ?? 0) >= recipe.fish);
    const totalBatches = cookableKinds.reduce((sum, each) => sum + Math.floor((stock[each.id] ?? 0) / recipe.fish), 0);
    cookBagBtn.hidden = cookableKinds.length <= 1;
    cookBagBtn.textContent = `Cook All (${formatCompactNumber(totalBatches)})`;
    cookBagBtn.disabled = totalBatches <= 0;
    cookBagBtn.onclick = () => {
      if (cookableKinds.length) void cook(cookableKinds[0], recipe, { batch: true, allKinds: true });
    };

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
      const unlocked = canCookFish(fish, level);
      const batches = unlocked ? Math.floor(count / recipe.fish) : 0;
      const chancePct = unlocked ? Math.round(cookingSuccessChance(fish, level, skillet) * 100) : 0;
      const reward = cookingReward(fish, recipe, skillet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cook-recipe cook-fish-tile${unlocked ? "" : " is-locked"}`;
      btn.disabled = !unlocked || batches <= 0;

      const artWrap = document.createElement("span");
      artWrap.className = "cook-fish-art";
      const iconSrc = oreIconSource(fish.id);
      if (iconSrc) {
        const img = document.createElement("img");
        img.className = "cook-fish-img";
        img.src = iconSrc;
        img.alt = fish.name;
        img.draggable = false;
        artWrap.append(img);
      }
      const qty = document.createElement("span");
      qty.className = "cook-fish-qty";
      qty.textContent = `×${formatCompactNumber(count)}`;
      artWrap.append(qty);
      if (unlocked && chancePct < 100) {
        const risk = document.createElement("span");
        risk.className = "cook-risk-tag";
        risk.textContent = `${chancePct}%`;
        risk.title = `${chancePct}% success chance (stops burning at Lv ${cookingStopBurnLevel(fish)})`;
        artWrap.append(risk);
      }

      const name = document.createElement("strong");
      name.className = "cook-fish-name";
      name.textContent = fish.name;

      const meta = document.createElement("span");
      meta.className = "cook-fish-meta";
      if (!unlocked) {
        const lock = document.createElement("span");
        lock.className = "cook-lock-tag";
        lock.textContent = `Cook Lv ${fishCookingLevel(fish)}`;
        meta.append(lock);
      } else if (batches <= 0) {
        meta.textContent = `Need ${recipe.fish}`;
      } else {
        const xpText = document.createElement("span");
        xpText.className = "cook-xp";
        xpText.textContent = `+${formatCompactNumber(reward.experience)} XP`;
        const action = document.createElement("span");
        action.className = "cook-batch-tag";
        action.textContent = cookAll && batches > 1 ? `${formatCompactNumber(batches)}×` : "Cook";
        meta.append(xpText, action);
      }
      btn.append(artWrap, name, meta);
      btn.onclick = () => void cook(fish, recipe, { batch: cookAll, allKinds: false });
      fishList.append(btn);
    }
  }

  function nextCookableFish(currentFish: Fish, recipe: CookingRecipe, allKinds: boolean, level: number) {
    const stock = deps.ores();
    if (canCookFish(currentFish, level) && (stock[currentFish.id] ?? 0) >= recipe.fish) return currentFish;
    if (!allKinds) return null;
    return held(stock).find(candidate => canCookFish(candidate, level) && (stock[candidate.id] ?? 0) >= recipe.fish) ?? null;
  }

  function setCastProgress(fraction: number) {
    const clamped = Math.max(0, Math.min(1, fraction));
    castFill.style.width = `${Math.round(clamped * 1000) / 10}%`;
    castTrack.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
  }

  async function cook(initialFish: Fish, recipe: CookingRecipe, opts: { batch: boolean; allKinds: boolean }) {
    if (busy || !dialog.open) return;
    closeDialog(recipesDialog);
    closeDialog(skillDialog);
    const id = ++session;
    const current = () => dialog.open && id === session;
    busy = true;
    cookingScene.active = true;
    cookingScene.experience = Number(deps.xp());
    status.classList.remove("is-burn");
    status.textContent = "";
    castTotals.hidden = true;
    castTotals.textContent = "";
    render();
    let dish = 0, cookedCount = 0, burnedCount = 0, totalXp = 0, activeFish: Fish | null = initialFish;
    let shownLevel = craftLevel(deps.xp());
    try {
      while (activeFish && current()) {
        const stock = deps.ores();
        const remainingForFish = canCookFish(activeFish, shownLevel) ? Math.floor((stock[activeFish.id] ?? 0) / recipe.fish) : 0;
        if (remainingForFish <= 0) {
          activeFish = nextCookableFish(activeFish, recipe, opts.allKinds, shownLevel);
          if (!activeFish) break;
        }
        dish++;
        const liveStock = deps.ores();
        const totalLeft = opts.batch
          ? (opts.allKinds
            ? held(liveStock).reduce((sum, each) => sum + (canCookFish(each, shownLevel) ? Math.floor((liveStock[each.id] ?? 0) / recipe.fish) : 0), 0)
            : Math.floor((liveStock[activeFish.id] ?? 0) / recipe.fish))
          : 1;
        castImg.src = oreIconSource(activeFish.id);
        castImg.alt = activeFish.name;
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
        const cookedKey = cookedFishId(activeFish.id);
        const beforeCooked = deps.ores()[cookedKey] ?? 0;
        const beforeXp = deps.xp();
        const served = await deps.cook(activeFish.id, recipe.id, false);
        if (!current()) return;
        if (!served?.ok) throw new Error(served?.error ?? "Not connected");
        const afterCooked = deps.ores()[cookedKey] ?? 0;
        const afterXp = deps.xp();
        // If cooked stock or XP rose, the dish succeeded; otherwise the raw fish burned on the fire.
        const burned = afterCooked === beforeCooked && afterXp === beforeXp && beforeCooked >= 0
          && (deps.ores()[activeFish.id] ?? 0) < (liveStock[activeFish.id] ?? 0);
        if (burned) {
          burnedCount++;
          status.classList.add("is-burn");
          status.textContent = `Burned the ${activeFish.name}! (0 XP)`;
        } else {
          const reward = cookingReward(activeFish, recipe, deps.skillet?.() ?? 0);
          const gainedPortions = afterCooked > beforeCooked ? afterCooked - beforeCooked : reward.portions;
          cookedCount += gainedPortions;
          totalXp += reward.experience;
          cookingScene.experience = Math.max(Number(afterXp), cookingScene.experience + reward.experience);
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
          status.classList.remove("is-burn");
          status.textContent = `+${formatCompactNumber(gainedPortions)} Cooked ${activeFish.name} in bag · +${formatCompactNumber(reward.experience)} XP`;
        }
        if (dish > 0) {
          castTotals.hidden = false;
          const parts = [`${formatCompactNumber(cookedCount)} cooked`, `+${formatCompactNumber(totalXp)} XP`];
          if (burnedCount > 0) parts.push(`${formatCompactNumber(burnedCount)} burned`);
          castTotals.textContent = `Session: ${parts.join(" · ")}`;
        }
        if (!opts.batch) break;
        activeFish = nextCookableFish(activeFish, recipe, opts.allKinds, shownLevel);
      }
      if (current() && !held().some(each => canCookFish(each, shownLevel))) {
        deps.finished?.(status.textContent ?? "");
        if (!held().length) close();
      }
    } catch (error) {
      if (current()) {
        status.classList.add("is-burn");
        status.textContent = error instanceof Error ? error.message : "Cooking interrupted";
      }
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
  function close() {
    closeDialog(recipesDialog);
    closeDialog(skillDialog);
    stop();
    closeDialog(dialog);
  }

  openRecipesBtn.addEventListener("click", () => { if (!busy) openDialog(recipesDialog); });
  openSkillBtn.addEventListener("click", () => { if (!busy) openDialog(skillDialog); });
  recipesDialog.querySelector(".cook-sub-back")!.addEventListener("click", event => { event.preventDefault(); closeDialog(recipesDialog); });
  skillDialog.querySelector(".cook-sub-back")!.addEventListener("click", event => { event.preventDefault(); closeDialog(skillDialog); });
  modeOne.addEventListener("click", () => setBatch(false));
  modeAll.addEventListener("click", () => setBatch(true));
  dialog.querySelector(".cook-stop")!.addEventListener("click", () => { stop(); status.textContent = "Cooking stopped"; render(); });
  dialog.querySelector(".cook-back")!.addEventListener("click", event => { event.preventDefault(); close(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open) { closeDialog(recipesDialog); closeDialog(skillDialog); stop(); } });
  return {
    open() { if (!dialog.open) { status.textContent = ""; render(); openDialog(dialog); } },
    refresh() { if (dialog.open && !busy && signature(deps.ores(), deps.xp(), deps.skillet?.() ?? 0) !== snapshot) render(); },
    hasFish: () => held().length > 0, close, isOpen: () => dialog.open,
  };
}
