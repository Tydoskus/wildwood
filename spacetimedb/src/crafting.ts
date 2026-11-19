import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import {
  CRAFTED_REFINE, CRAFTED_SKILL_LUCK_RANKS, isPlayerCraftSkill, type PlayerCraftSkill, MATERIAL_NAMES, craftExperience, craftLevel, type CraftSkill, type Materials,
} from "../../shared/crafting";
import {
  craftMaterialsKey, craftMaterialsShort, gradeCraftLevel, gradeCraftMaterials, gradeCraftNeed, gradeCraftSkill, isCraftable,
} from "../../shared/grade-craft";
import { gradeOf, type GradeItemId } from "../../shared/grade-equipment";
import type { WeaponSchool } from "../../shared/weapon-mastery";
import { TOWN_FEET_OFFSET, TOWN_SCHOOL_POSITIONS, TOWN_SCHOOL_SERVER_REACH, isTownMap } from "../../shared/town";
import type { OreId } from "../../shared/refine";
import { isSkillWeapon, mergeSkillRolls, rollWeaponSkills } from "../../shared/weapon-skills";
import { withinStationReach } from "./door-reach";
import { addOres, oreCount, oreCountsFor, setRefineLevel, standsAtTheSmith, takeOres } from "./item-refine";
import { readPlayerProgress } from "./wide-stats";
import { collectItem, extraCopiesOf, freeBagSlots, insertKeptCopy, reforgeCopySkills, setFirstCopyRoll } from "./equipment-copies";
import { activeItemUpgradeEntriesFor } from "./upgrade-bench-slots";
import { luckInPlay } from "./luck-research";
import { CRAFT_TOOL, toolBonusYield, toolCraftCost, toolExperience, toolSavedMaterials } from "../../shared/tools";
import { fishById, type FishId } from "../../shared/fishing";
import { bagFullForOres, roomForOres } from "../../shared/ore-bag";
import {
  COOK_FIRES, FIRE_REACH, COOKING_RECIPES, COOKED_FISH_PROFILES, NO_FOOD_BUFF,
  canCookFish, cookedFishId, cookedFishSellPrice, cookingReward, cookingSuccessChance,
  fishCookingLevel, fishForCookedId, foodBuffFactors,
} from "../../shared/cooking";
import { addGold } from "./gold";
import { bagCapacityFor } from "./bag-capacity";
import { equippedFields } from "./gather-batch";
import { toolLevelFor } from "./tools";

/** Each craft's experience (shared/crafting.ts), one row per player and craft. Private; read through my_craft_skills. */
export const cookingAttempt = table({ name: "cooking_attempt", public: false }, {
  identity: t.identity().primaryKey(), fish: t.string(), recipe: t.string(), started: t.timestamp(),
});

/** Active cooked-fish combat buff for a player (1 active at a time). Private; read through my_food_buff. */
export const playerFoodBuff = table({ name: "player_food_buff", public: false }, {
  identity: t.identity().primaryKey(),
  fishId: t.string(),
  endsAtMs: t.f64(),
});

export const playerCraftSkill = table({ name: "player_craft_skill", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  skill: t.string(),
  experience: t.u64(),
});

/** Each craft's level, public, for profiles; written only when a level changes, as player_mastery_level is. */
export const playerCraftLevel = table({ name: "player_craft_level", public: true }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  skill: t.string(),
  level: t.u8(),
});

type Ctx = any;
export const craftKey = (identity: Identity, skill: PlayerCraftSkill) => `${identity.toHexString()}:${skill}`;
const rowsOf = (ctx: Ctx, identity: Identity): any[] => [...ctx.db.playerCraftSkill.identity.filter(identity)];

/** Each craft's experience, 0 for a craft never practised. */
export function craftSkillExperience(ctx: Ctx, identity: Identity): Record<PlayerCraftSkill, bigint> {
  const experience = { smithing: 0n, fletching: 0n, enchanting: 0n, cooking: 0n };
  for (const row of rowsOf(ctx, identity)) {
    const skill: unknown = row.skill;
    if (isPlayerCraftSkill(skill)) experience[skill] = row.experience;
  }
  return experience;
}

function writeCraftLevel(ctx: Ctx, identity: Identity, skill: PlayerCraftSkill, experience: bigint) {
  const key = craftKey(identity, skill), level = craftLevel(experience), row = ctx.db.playerCraftLevel.key.find(key);
  if (!row) ctx.db.playerCraftLevel.insert({ key, identity, skill, level });
  else if (row.level !== level) ctx.db.playerCraftLevel.key.update({ ...row, level });
}

export function addCraftExperience(ctx: Ctx, identity: Identity, skill: PlayerCraftSkill, amount: number) {
  if (!(amount > 0)) return;
  const key = craftKey(identity, skill), row = ctx.db.playerCraftSkill.key.find(key);
  const next = (row?.experience ?? 0n) + BigInt(Math.floor(amount));
  if (row) ctx.db.playerCraftSkill.key.update({ ...row, experience: next });
  else ctx.db.playerCraftSkill.insert({ key, identity, skill, experience: next });
  writeCraftLevel(ctx, identity, skill, next);
}

/** Older clients still craft Fletching and Enchanting at these schools' spots, so accept them there. */
const OLD_CRAFT_SCHOOL: Readonly<Partial<Record<CraftSkill, WeaponSchool>>> = { fletching: "archery", enchanting: "sorcery" };

/** Every craft is done at the Smith; a craft's old school spot still counts until every client has reloaded. */
export function standsAtCraftStation(ctx: Ctx, player: Parameters<typeof withinStationReach>[1], skill: CraftSkill) {
  if (standsAtTheSmith(ctx, player)) return true;
  const school = OLD_CRAFT_SCHOOL[skill];
  if (!school) return false;
  const at = TOWN_SCHOOL_POSITIONS[school];
  return isTownMap(player.mapId) && withinStationReach(ctx, player, { x: at.x, y: at.y - TOWN_FEET_OFFSET }, TOWN_SCHOOL_SERVER_REACH);
}

export type CraftingDeps = {
  requireControllingPlayer: (ctx: Ctx) => any;
  activeDuelFor: (ctx: Ctx, identity: Identity) => unknown;
  inventoryForProgress: (progress: any) => string[];
  restoreItemToProgress: (progress: any, itemId: string) => any;
  writeProgressAndPresentation: (ctx: Ctx, progress: any) => void;
};

type CraftArgs = { itemId: string; expectedMaterials: string };

/**
 * What a craft and a Reforge both check before taking anything: the piece, the Smith, no duel, the recipe the player
 * saw, the craft level and the materials. Returns the player's progress and the craft's skill and recipe.
 */
function checkCraft(ctx: Ctx, args: CraftArgs, deps: CraftingDeps) {
  const player = deps.requireControllingPlayer(ctx);
  const { itemId } = args;
  if (!isCraftable(itemId)) throw new SenderError("That cannot be crafted.");
  const skill = gradeCraftSkill(itemId)!, materials = gradeCraftMaterials(itemId)!;
  if (!standsAtCraftStation(ctx, player, skill)) throw new SenderError("Talk to the Smith first.");
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  if (craftMaterialsKey(materials) !== args.expectedMaterials) throw new SenderError("That recipe changed. Take another look.");
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!progress) throw new SenderError("Player unavailable.");
  if (craftLevel(craftSkillExperience(ctx, ctx.sender)[skill]) < gradeCraftLevel(itemId)) throw new SenderError(`You need ${gradeCraftNeed(itemId)}.`);
  // The bag needs only what the craft's tool leaves of the recipe; its chance of saving more comes after.
  const need = toolCraftCost(materials, toolLevelFor(ctx, ctx.sender, CRAFT_TOOL[skill]));
  const held = Object.fromEntries(Object.keys(materials).map(id => [id, oreCount(ctx, ctx.sender, id)]));
  const short = craftMaterialsShort(need, held);
  if (short.length) throw new SenderError(`You need ${short.map(id => `${need[id].toLocaleString("en-US")} ${MATERIAL_NAMES[id] ?? id}`).join(" and ")}.`);
  return { progress, skill, materials, held };
}

/** Takes the materials (less what the tool saves) and trains the craft; returns the Skill Luck a weapon rolls with. */
function chargeCraft(ctx: Ctx, itemId: GradeItemId, skill: CraftSkill, taken: Partial<Record<OreId, number>>, experience: number) {
  if (!takeOres(ctx, ctx.sender, taken)) throw new SenderError("Your materials changed. Take another look.");
  addCraftExperience(ctx, ctx.sender, skill, craftExperience(gradeOf(itemId)!) * experience);
  return isSkillWeapon(itemId) ? luckInPlay(ctx, ctx.sender).skillLuck + CRAFTED_SKILL_LUCK_RANKS : 0;
}

/**
 * One graded piece crafted at the Smith, always a new one, into a free bag slot as a bought one arrives
 * (grade-shop.ts), but at +2 and with better luck on a weapon's skills. Any grade the craft's level opens can be
 * crafted, Mastery or not. A piece already held arrives as another copy with its own roll and refine
 * (equipment-copies.ts). `expectedMaterials` is the recipe the player saw.
 */
export function craftGradeItemFor(ctx: Ctx, args: CraftArgs, deps: CraftingDeps) {
  const { progress, skill, materials, held } = checkCraft(ctx, args, deps);
  const itemId = args.itemId as GradeItemId, inventory = deps.inventoryForProgress(progress);
  const tool = craftTool(ctx, skill, materials);
  // A stack used up frees its slot for the piece.
  const emptied = Object.entries(tool.taken).filter(([id, count]) => held[id] === count).length;
  if (freeBagSlots(ctx, ctx.sender, progress, inventory) + emptied <= 0) throw new SenderError("Your bag is full. Free a slot first.");
  const skillLuck = chargeCraft(ctx, itemId, skill, tool.taken, tool.experience);
  collectItem(ctx, ctx.sender, itemId);
  // Two rolls, each skill keeping the higher, so crafting helps even at the Skill Luck cap.
  const roll = isSkillWeapon(itemId) ? reforgedRoll(ctx, itemId, skillLuck) : {};
  if (inventory.includes(itemId)) {
    insertKeptCopy(ctx, ctx.sender, itemId, roll, CRAFTED_REFINE);
    return;
  }
  deps.writeProgressAndPresentation(ctx, deps.restoreItemToProgress(progress, itemId));
  setFirstCopyRoll(ctx, ctx.sender, itemId, roll);
  setRefineLevel(ctx, ctx.sender, itemId, 0n, CRAFTED_REFINE);
}

const reforgedRoll = (ctx: Ctx, itemId: string, skillLuck: number) => {
  const first = rollWeaponSkills(itemId, () => ctx.random(), skillLuck);
  return mergeSkillRolls(itemId, first, rollWeaponSkills(itemId, () => ctx.random(), skillLuck)) ?? first;
};

/**
 * A Reforge of one held weapon copy (copy 0 is the first, the one a slot holds): the same materials and experience
 * as crafting it, two fresh rolls merged into its skills, each keeping the higher. No new piece, no bag room needed;
 * its refine, lock and cards stay.
 */
export function reforgeWeaponFor(ctx: Ctx, args: CraftArgs & { copyId: bigint }, deps: CraftingDeps) {
  const { itemId, copyId } = args;
  if (!isSkillWeapon(itemId)) throw new SenderError("Only a weapon can be reforged.");
  const { progress, skill, materials } = checkCraft(ctx, args, deps);
  if (copyId === 0n) {
    // A piece on the Upgrade Bench is still the player's.
    const owned = deps.inventoryForProgress(progress).includes(itemId)
      || activeItemUpgradeEntriesFor(ctx, ctx.sender).some(({ active }) => active.itemId === itemId);
    if (!owned) throw new SenderError("That weapon is not in your inventory.");
  } else {
    const copy = ctx.db.playerEquipmentCopy.id.find(copyId);
    if (!copy || copy.identity.toHexString() !== ctx.sender.toHexString() || copy.itemId !== itemId) throw new SenderError("That weapon is not in your inventory.");
  }
  const tool = craftTool(ctx, skill, materials);
  const skillLuck = chargeCraft(ctx, itemId as GradeItemId, skill, tool.taken, tool.experience);
  reforgeCopySkills(ctx, ctx.sender, itemId, copyId, 2, skillLuck);
}

/**
 * craft_grade_gear, as older clients call it: a weapon already held is reforged (its first copy), armor
 * already held is refused, anything else is crafted, so an open old tab's buttons do what they say.
 */
export function craftGradeGearFor(ctx: Ctx, args: CraftArgs, deps: CraftingDeps) {
  const progress = readPlayerProgress(ctx, ctx.sender);
  const owned = new Set([...(progress ? deps.inventoryForProgress(progress) : []),
    ...activeItemUpgradeEntriesFor(ctx, ctx.sender).map(({ active }) => active.itemId)]);
  if (!isCraftable(args.itemId) || !owned.has(args.itemId)) { craftGradeItemFor(ctx, args, deps); return; }
  if (!isSkillWeapon(args.itemId)) throw new SenderError("You already have that.");
  reforgeWeaponFor(ctx, { ...args, copyId: 0n }, deps);
}

/** The craft's tool (shared/tools.ts): the recipe less what it saves, rolled here, and its experience multiplier. */
function craftTool(ctx: Ctx, skill: CraftSkill, materials: Materials) {
  const level = toolLevelFor(ctx, ctx.sender, CRAFT_TOOL[skill]), saved = toolSavedMaterials(materials, level, () => ctx.random());
  const taken: Partial<Record<OreId, number>> = {};
  for (const [id, count] of Object.entries(materials)) if (count > (saved[id] ?? 0)) taken[id as OreId] = count - (saved[id] ?? 0);
  return { taken, experience: toolExperience(level) };
}

/** Reset Save clears every craft. Prestige keeps them. */
export function removeCraftSkills(ctx: Ctx, identity: Identity) {
  ctx.db.cookingAttempt.identity.delete(identity);
  for (const row of rowsOf(ctx, identity)) ctx.db.playerCraftSkill.key.delete(row.key);
  for (const row of [...ctx.db.playerCraftLevel.identity.filter(identity)]) ctx.db.playerCraftLevel.key.delete(row.key);
}

/** A guest's save replaces the account's on link, as Mining does, its crafts with it. */
export function mergeCraftSkills(ctx: Ctx, guest: Identity, account: Identity) {
  removeCraftSkills(ctx, account);
  ctx.db.cookingAttempt.identity.delete(guest);
  for (const row of rowsOf(ctx, guest)) {
    ctx.db.playerCraftSkill.key.delete(row.key);
    const skill: unknown = row.skill;
    if (!isPlayerCraftSkill(skill)) continue;
    ctx.db.playerCraftSkill.insert({ ...row, key: craftKey(account, skill), identity: account });
    writeCraftLevel(ctx, account, skill, row.experience);
  }
  for (const row of [...ctx.db.playerCraftLevel.identity.filter(guest)]) ctx.db.playerCraftLevel.key.delete(row.key);
}

/** Active food-buff combat stat multipliers for a player at ctx.timestamp (1 when none or expired). */
export function activeFoodBuffFactorsFor(ctx: Ctx, identity: Identity, graceMs = 0) {
  const row = ctx.db.playerFoodBuff?.identity.find(identity);
  if (!row || !fishById(row.fishId)) return NO_FOOD_BUFF;
  const nowMs = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
  return foodBuffFactors({ fishId: row.fishId as FishId, endsAtMs: row.endsAtMs }, nowMs, graceMs);
}

/** The craft_grade_item, reforge_weapon, cooking, eat_fish and sell_cooked_fish reducers, and craft views. */
export function registerCrafting(spacetimedb: typeof spacetimedbType, deps: CraftingDeps) {
  function requireBagRoomForCooked(ctx: Ctx, fishId: FishId, rawCost: number) {
    const cookedId = cookedFishId(fishId);
    const ores = oreCountsFor(ctx, ctx.sender);
    if ((ores[cookedId] ?? 0) > 0) return;
    const progress = readPlayerProgress(ctx, ctx.sender);
    const emptied = (ores[fishId] ?? 0) === rawCost ? 1 : 0;
    const { needed, room } = roomForOres({
      owned: progress ? deps.inventoryForProgress(progress) : [],
      equipped: progress ? equippedFields(progress) : [],
      extraCopies: extraCopiesOf(ctx, ctx.sender).length,
      ores,
      capacity: bagCapacityFor(ctx, ctx.sender) + emptied,
    }, [cookedId]);
    if (!room) throw new SenderError(bagFullForOres(needed));
  }

  function cooking(ctx: Ctx, args: { fishId: string; recipeId: string }, begin: boolean) {
    const player = deps.requireControllingPlayer(ctx);
    if (!isTownMap(player.mapId) || !COOK_FIRES.some(at => Math.hypot(player.x - at.x, player.y + TOWN_FEET_OFFSET - at.y) <= FIRE_REACH + 20))
      throw new SenderError("Walk up to a Town cooking fire first.");
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const fish = fishById(args.fishId), recipe = COOKING_RECIPES.find(each => each.id === args.recipeId);
    if (!fish || !recipe) throw new SenderError("Unknown fish or recipe.");
    const xp = ctx.db.playerCraftSkill.key.find(craftKey(ctx.sender, "cooking"))?.experience ?? 0n;
    const level = craftLevel(xp);
    if (!canCookFish(fish, level)) throw new SenderError(`Reach Cooking Lv ${fishCookingLevel(fish)} to cook ${fish.name}.`);
    if (level < recipe.level) throw new SenderError(`Reach Cooking Lv ${recipe.level} first.`);
    const attempt = ctx.db.cookingAttempt.identity;
    if (begin) {
      if (oreCount(ctx, ctx.sender, fish.id) < recipe.fish) throw new SenderError(`You need ${recipe.fish} ${fish.name}.`);
      requireBagRoomForCooked(ctx, fish.id, recipe.fish);
      const row = { identity: ctx.sender, fish: fish.id, recipe: recipe.id, started: ctx.timestamp };
      if (attempt.find(ctx.sender)) attempt.update(row);
      else ctx.db.cookingAttempt.insert(row);
      return;
    }
    const started = attempt.find(ctx.sender);
    if (!started || started.fish !== fish.id || started.recipe !== recipe.id) throw new SenderError("Start a dish at the cooking fire first.");
    if (Number(ctx.timestamp.microsSinceUnixEpoch - started.started.microsSinceUnixEpoch) < recipe.seconds * 1e6)
      throw new SenderError("The dish is still cooking.");
    attempt.delete(ctx.sender);
    if (oreCount(ctx, ctx.sender, fish.id) < recipe.fish) throw new SenderError(`You need ${recipe.fish} ${fish.name}.`);
    const skillet = toolLevelFor(ctx, ctx.sender, "skillet");
    const saved = skillet > 0 ? toolBonusYield(skillet, ctx.random()) : 0;
    const cost = Math.max(0, recipe.fish - saved);
    requireBagRoomForCooked(ctx, fish.id, cost);
    if (cost > 0 && !takeOres(ctx, ctx.sender, { [fish.id]: cost })) throw new SenderError(`You need ${recipe.fish} ${fish.name}.`);
    const chance = cookingSuccessChance(fish, level, skillet);
    if (chance < 1 && ctx.random() >= chance) return;
    const reward = cookingReward(fish, recipe, skillet);
    addOres(ctx, ctx.sender, cookedFishId(fish.id), reward.portions);
    addCraftExperience(ctx, ctx.sender, "cooking", reward.experience);
  }
  function eatFishFor(ctx: Ctx, args: { fishId: string }) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const fish = fishForCookedId(args.fishId) ?? fishById(args.fishId);
    if (!fish) throw new SenderError("Unknown cooked fish.");
    const cookedId = cookedFishId(fish.id);
    if (!takeOres(ctx, ctx.sender, { [cookedId]: 1 })) throw new SenderError(`You have no Cooked ${fish.name}.`);
    const nowMs = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
    const endsAtMs = nowMs + COOKED_FISH_PROFILES[fish.id].durationSeconds * 1000;
    const existing = ctx.db.playerFoodBuff.identity.find(ctx.sender);
    const row = { identity: ctx.sender, fishId: fish.id, endsAtMs };
    if (existing) ctx.db.playerFoodBuff.identity.update(row);
    else ctx.db.playerFoodBuff.insert(row);
  }
  function sellCookedFishFor(ctx: Ctx, args: { oreId: string; count: number }) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const fish = fishForCookedId(args.oreId);
    if (!fish) throw new SenderError("Only cooked fish can be sold here.");
    const count = Math.floor(Number(args.count));
    if (!Number.isFinite(count) || count < 1) throw new SenderError("Choose at least 1 cooked fish to sell.");
    const cookedId = cookedFishId(fish.id);
    if (!takeOres(ctx, ctx.sender, { [cookedId]: count })) throw new SenderError("Your cooked fish stack changed. Try again.");
    addGold(ctx, ctx.sender, cookedFishSellPrice(fish.id) * count);
  }
  const beginCooking = spacetimedb.reducer({ fishId: t.string(), recipeId: t.string() }, (ctx, args) => cooking(ctx, args, true));
  const cookFish = spacetimedb.reducer({ fishId: t.string(), recipeId: t.string() }, (ctx, args) => cooking(ctx, args, false));
  const eatFish = spacetimedb.reducer({ fishId: t.string() }, (ctx, args) => eatFishFor(ctx, args));
  const sellCookedFish = spacetimedb.reducer({ oreId: t.string(), count: t.u32() }, (ctx, args) => sellCookedFishFor(ctx, args));
  const craftGradeItem = spacetimedb.reducer({ itemId: t.string(), expectedMaterials: t.string() },
    (ctx: any, args: CraftArgs) => craftGradeItemFor(ctx, args, deps));
  const reforgeWeapon = spacetimedb.reducer({ itemId: t.string(), copyId: t.u64(), expectedMaterials: t.string() },
    (ctx: any, args: CraftArgs & { copyId: bigint }) => reforgeWeaponFor(ctx, args, deps));
  // Older clients call this.
  const craftGradeGear = spacetimedb.reducer({ itemId: t.string(), expectedMaterials: t.string() },
    (ctx: any, args: CraftArgs) => craftGradeGearFor(ctx, args, deps));
  const myCraftSkills = spacetimedb.view({ name: "my_craft_skills", public: true }, t.array(playerCraftSkill.rowType),
    (ctx: any) => [...ctx.db.playerCraftSkill.identity.filter(ctx.sender)]);
  const myFoodBuff = spacetimedb.view({ name: "my_food_buff", public: true }, t.array(playerFoodBuff.rowType),
    (ctx: any) => { const row = ctx.db.playerFoodBuff.identity.find(ctx.sender); return row ? [row] : []; });
  return { beginCooking, cookFish, eatFish, sellCookedFish, craftGradeItem, reforgeWeapon, craftGradeGear, myCraftSkills, myFoodBuff };
}
