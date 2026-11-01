import { describe, expect, it } from "vitest";
import { Timestamp } from "spacetimedb";
// The server harness first: it swaps the host SDK in before any server module loads.
import { scenarioWorld, type ScenarioPlayer, type ScenarioWorld } from "./harness/server";
import { MINING_NODE_KINDS, MINING_NODES, MINING_RATE_SLACK, miningBreakSeconds, miningGain, miningRockOre } from "../../shared/mining";
import { WOOD_TREE_NODES, WOODCUTTING_LOGS, WOODCUTTING_RATE_SLACK, WOODCUTTING_RESPAWN_SECONDS, woodcuttingChopSeconds } from "../../shared/woodcutting";
import { TOWN_ARRIVAL, TOWN_CENTER, TOWN_DOORS, TOWN_EAST_BRIDGE, TOWN_FEET_OFFSET, TOWN_GROVE, TOWN_SMITH_POSITION, TOWN_WEST_BRIDGE, TOWN_HILLS_STONE_FREE, inTownHills, inTownWalkArea, townRoomAt, townWalkClamp } from "../../shared/town";
import { MINING_REACH, MINING_ROCK_EXTENT } from "../../shared/mining";
import { GROVE_ROAD_HALF_WIDTH, WOOD_STANDS, WOODCUTTING_REACH, groveRoadDistanceSquared } from "../../shared/woodcutting";
import { miningStandSpot } from "../../src/game/runtime/auto-farm/auto-mine";
import { choppingStandSpot } from "../../src/game/runtime/auto-farm/auto-chop";
import { planTownPath, townFeetClear, type TownPoint } from "../../src/game/runtime/town/town-path";
import { pushOutOf, TOWN_FEET_RADIUS, TOWN_SOLIDS } from "../../src/game/runtime/town/town-runtime";
import { ORE_ROCK_BOXES, WOOD_TREE_BOXES, oreRockDecor, spriteBox, townWindowDecor, woodTreeDecor } from "../../src/game/town-world";
import { stumpFrame } from "../../src/game/runtime/town/wood-tree-renderer";
import { CRYSTAL_CLUSTERS } from "../../src/game/runtime/town/ore-rock-renderer";
import { SOUL_ATLAS } from "../../src/game/town-village";
import { GATHER_CLAIM_AHEAD_MS } from "../../shared/gather-batch";
import { toolUpgradeCost, type ToolId } from "../../shared/tools";
import { craftExperience, craftExperienceForLevel, type CraftSkill } from "../../shared/crafting";
import { craftMaterialsKey, gradeCraftMaterials } from "../../shared/grade-craft";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { craftKey, craftSkillExperience } from "../../spacetimedb/src/crafting";
import { toolKey } from "../../spacetimedb/src/tools";
import { researchRankKey } from "../../spacetimedb/src/research-rank";
import { RESEARCH_STAND } from "../../spacetimedb/src/research-station";
import { standAt } from "./harness/gear";
import { fillBag, serverGatherer } from "./harness/gather";
import { connectClient } from "./harness/client";
import { createAccountRowServices } from "../../src/coop/services/account-row-services";
import { GATHER_QUEUE_CAP } from "../../shared/gather-batch";

const SECOND = 1_000;
const rock = (ore: string, kind: string, skip = 0) => MINING_NODES.filter(node => node.ore === ore && node.kind === kind)[skip]!;
const copper = rock("copper_ore", "small"), copperTwo = rock("copper_ore", "small", 1), copperLarge = rock("copper_ore", "large");
const iron = rock("iron_ore", "small"), mysterious = rock("copper_ore", "mysterious");
const crystal = MINING_NODES.find(node => node.kind === "crystal" && node.vein === 0)!;
const deepCrystal = MINING_NODES.find(node => node.kind === "crystal" && node.vein === 1)!;
const pines = WOOD_TREE_NODES.filter(tree => tree.kind === "pine"), oak = WOOD_TREE_NODES.find(tree => tree.kind === "oak")!;

/** A player in the world, in the Town, with their gathering on the server. */
function townsfolk(world: ScenarioWorld, name: string) {
  const player = world.join(name);
  return Object.assign(serverGatherer(world, player), { player });
}
function setSkill(world: ScenarioWorld, player: ScenarioPlayer, skill: "mining" | "woodcutting", level: number) {
  world.setup(ctx => {
    const now = world.timestamp(), long = new Timestamp(0n);
    if (skill === "mining") {
      const row = ctx.db.playerMining.identity.find(player.identity);
      if (row) ctx.db.playerMining.identity.update({ ...row, mining: level });
      else ctx.db.playerMining.insert({ identity: player.identity, mining: level, rocksBroken: 0, pickaxeAt: now, lastBreakAt: long, lastNodeId: 0, lastStarshard: false });
    } else {
      const row = ctx.db.playerWoodcutting.identity.find(player.identity);
      if (row) ctx.db.playerWoodcutting.identity.update({ ...row, woodcutting: level });
      else ctx.db.playerWoodcutting.insert({ identity: player.identity, woodcutting: level, treesChopped: 0, hatchetAt: now, lastChopAt: long, lastTreeId: 0 });
    }
  });
}
/** `player` challenges `other` to a duel, which is on at once. */
const duelWith = (_world: ScenarioWorld, player: ScenarioPlayer, other: ScenarioPlayer) => player.call("requestDuel", { opponent: other.identity });

describe("Mining on the server", () => {
  it("a break counts only beside the rock in the Town and out of a duel, pays its ore and Mining, and leaves it bare for that player alone", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann"), bob = townsfolk(world, "Bob");
    // Too far, or on another map: nothing.
    ann.standAt({ x: copper.x + 3_000, y: copper.y });
    expect(ann.reportMining([[copper.id, 0]])).toBe(0);
    ann.player.patch("player", { mapId: "tutorial_forest" });
    expect(ann.player.refusal("reportMining", { breaks: [{ nodeId: copper.id, atMs: BigInt(Math.round(world.now())) }] })).not.toBeNull();
    ann.standAt(copper);
    expect(ann.reportMining([[MINING_NODES.length, 0]])).toBe(0);
    // A first rock needs no pickaxe from anyone.
    expect(ann.reportMining([[copper.id, 0]])).toBe(1);
    expect([ann.ore("copper_ore"), ann.mining(), ann.player.view("my_mining")[0].mining]).toEqual([1, miningGain(copper), miningGain(copper)]);
    expect(ann.bareRocks()).toEqual([copper.id]);
    expect(bob.bareRocks()).toEqual([]);
    // Still growing back 30 s on; standing again after its regrowth.
    world.advance(30 * SECOND);
    expect(ann.reportMining([[copper.id, 0]])).toBe(0);
    world.advance((MINING_NODE_KINDS.small.respawnSeconds - 30) * SECOND);
    expect(ann.reportMining([[copper.id, 0]])).toBe(1);
    // Mid-duel, nothing.
    duelWith(world, bob.player, ann.player);
    world.advance(60 * SECOND);
    expect(bob.player.refusal("reportMining", { breaks: [{ nodeId: copperTwo.id, atMs: BigInt(Math.round(world.now())) }] })).not.toBeNull();
  });

  it("a break comes no sooner after the last than the rock takes, with a little slack; rows of rocks grown back are cleared", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    ann.standAt(copper);
    world.advance(60 * SECOND);
    expect(ann.reportMining([[copper.id, 0]])).toBe(1);
    // The large rock is due its break time after (with slack), give or take the clock's two seconds of drift.
    const dueMs = miningBreakSeconds(copperLarge, miningGain(copper)) * MINING_RATE_SLACK * SECOND - GATHER_CLAIM_AHEAD_MS;
    ann.standAt(copperLarge);
    expect(ann.reportMining([[copperLarge.id, 0]])).toBe(0);
    world.advance(dueMs - 50);
    expect(ann.reportMining([[copperLarge.id, 0]])).toBe(0);
    world.advance(100);
    expect(ann.reportMining([[copperLarge.id, 0]])).toBe(1);
    expect(ann.ore("copper_ore")).toBe(miningRockOre(copper) + miningRockOre(copperLarge));
    world.advance(10 * SECOND);
    ann.standAt(copperTwo);
    expect(ann.reportMining([[copperTwo.id, 0]])).toBe(1);
    expect(ann.bareRocks().sort()).toEqual([copper.id, copperLarge.id, copperTwo.id].sort());
    // Mining on after the small rocks grew back clears their rows.
    world.advance(MINING_NODE_KINDS.small.respawnSeconds * SECOND);
    ann.standAt(copper);
    expect(ann.reportMining([[copper.id, 0]])).toBe(1);
    expect(ann.bareRocks().sort()).toEqual([copper.id, copperLarge.id].sort());
  });

  it("deeper veins and crystal rocks wait for Mining; a Mysterious rock always gives a Starshard and no other rock does", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    // Iron at Mining 0, even with later maps open.
    ann.player.patch("playerProgress", { infernalUnlocked: true });
    ann.standAt(iron);
    expect(ann.reportMining([[iron.id, 0]])).toBe(0);
    ann.standAt(crystal);
    expect(ann.reportMining([[crystal.id, 0]])).toBe(0);
    setSkill(world, ann.player, "mining", 25);
    expect(ann.reportMining([[crystal.id, 0]])).toBe(1);
    expect(ann.ore("arcane_crystal")).toBe(1);
    world.advance(60 * SECOND);
    ann.standAt(deepCrystal);
    expect(ann.reportMining([[deepCrystal.id, 0]])).toBe(0);
    setSkill(world, ann.player, "mining", 75);
    expect(ann.reportMining([[deepCrystal.id, 0]])).toBe(1);
    expect(ann.ore("arcane_crystal")).toBeGreaterThan(2);
    world.advance(60 * SECOND);
    ann.standAt(iron);
    expect(ann.reportMining([[iron.id, 0]])).toBe(1);
    expect(ann.ore("iron_ore")).toBe(1);
    // Starshards: from Mysterious rocks only.
    world.advance(60 * SECOND);
    ann.standAt(copper);
    ann.reportMining([[copper.id, 0]]);
    expect(ann.ore("starshard")).toBe(0);
    world.advance(60 * SECOND);
    ann.standAt(mysterious);
    expect(ann.reportMining([[mysterious.id, 0]])).toBe(1);
    expect(ann.ore("starshard")).toBeGreaterThanOrEqual(1);
    expect(world.db.playerMining.identity.find(ann.player.identity).lastStarshard).toBe(true);
  });

  it("a full bag takes no new kind of ore, more of one held still comes in, and a Mysterious rock needs room for its Starshard", () => {
    const world = scenarioWorld();
    const empty = townsfolk(world, "Empty");
    fillBag(world, empty.player);
    empty.standAt(copper);
    expect(empty.reportMining([[copper.id, 0]])).toBe(0);
    expect(empty.ore("copper_ore")).toBe(0);
    const holder = townsfolk(world, "Holder");
    fillBag(world, holder.player, { copper_ore: 1 });
    holder.standAt(copper);
    expect(holder.reportMining([[copper.id, 0]])).toBe(1);
    expect(holder.ore("copper_ore")).toBe(2);
    world.advance(60 * SECOND);
    holder.standAt(mysterious);
    expect(holder.reportMining([[mysterious.id, 0]])).toBe(0);
    // One copy sold off: room for the Starshard.
    world.setup(ctx => ctx.db.playerEquipmentCopy.id.delete([...ctx.db.playerEquipmentCopy.identity.filter(holder.player.identity)][0].id));
    expect(holder.reportMining([[mysterious.id, 0]])).toBe(1);
    expect(holder.ore("starshard")).toBeGreaterThanOrEqual(1);
  });

  it("an old client's pickaxe and hatchet claims and one-break calls still work, and never take a skill away", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    ann.standAt({ x: TOWN_SMITH_POSITION.x + 400, y: TOWN_SMITH_POSITION.y });
    ann.player.call("claimPickaxe");
    ann.player.call("claimHatchet");
    expect(world.db.playerMining.identity.find(ann.player.identity)).toMatchObject({ mining: 0, rocksBroken: 0 });
    expect(world.db.playerWoodcutting.identity.find(ann.player.identity)).toMatchObject({ woodcutting: 0, treesChopped: 0 });
    world.advance(60 * SECOND);
    ann.standAt(copper);
    ann.player.call("mineNode", { nodeId: copper.id });
    ann.standAt(pines[0]);
    world.advance(10 * SECOND);
    ann.player.call("chopTree", { treeId: pines[0].id });
    ann.player.call("claimPickaxe");
    ann.player.call("claimHatchet");
    expect(world.db.playerMining.identity.find(ann.player.identity)).toMatchObject({ mining: 1, rocksBroken: 1 });
    expect(world.db.playerWoodcutting.identity.find(ann.player.identity)).toMatchObject({ treesChopped: 1 });
    expect(ann.woodcutting()).toBeGreaterThan(0);
  });
});

describe("Woodcutting on the server", () => {
  const [pine, pineTwo] = pines;
  it("a fall counts beside the tree, pays its logs and Woodcutting, leaves a stump for that player until it grows back, at the tree's pace", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann"), bob = townsfolk(world, "Bob");
    ann.standAt({ x: pine.x - 3_000, y: pine.y });
    expect(ann.reportChopping([[pine.id, 0]])).toBe(0);
    ann.standAt(pine);
    expect(ann.reportChopping([[WOOD_TREE_NODES.length + 1, 0]])).toBe(0);
    expect(ann.reportChopping([[pine.id, 0]])).toBe(1);
    expect(ann.ore("pine_log")).toBe(WOODCUTTING_LOGS);
    expect(ann.woodcutting()).toBeGreaterThan(0);
    expect(ann.felledTrees()).toEqual([pine.id]);
    expect(bob.felledTrees()).toEqual([]);
    const dueMs = woodcuttingChopSeconds(pineTwo, ann.woodcutting()) * WOODCUTTING_RATE_SLACK * SECOND - GATHER_CLAIM_AHEAD_MS;
    world.advance(dueMs - 50);
    ann.standAt(pineTwo);
    expect(ann.reportChopping([[pineTwo.id, 0]])).toBe(0);
    world.advance(100);
    expect(ann.reportChopping([[pineTwo.id, 0]])).toBe(1);
    ann.standAt(pine);
    expect(ann.reportChopping([[pine.id, 0]])).toBe(0);
    world.advance(WOODCUTTING_RESPAWN_SECONDS * SECOND + 5 * SECOND);
    expect(ann.reportChopping([[pine.id, 0]])).toBe(1);
    // Grown-back stumps' rows go as they chop on.
    expect(ann.felledTrees()).toEqual([pine.id]);
    // Mid-duel, nothing.
    duelWith(world, bob.player, ann.player);
    bob.standAt(pineTwo);
    expect(bob.player.refusal("reportChopping", { chops: [{ treeId: pineTwo.id, atMs: BigInt(Math.round(world.now())) }] })).not.toBeNull();
  });

  it("oaks wait for Woodcutting 50; a full bag takes no new kind of log; logs can be destroyed from the bag", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    ann.player.patch("playerProgress", { infernalUnlocked: true });
    ann.standAt(oak);
    expect(ann.reportChopping([[oak.id, 0]])).toBe(0);
    setSkill(world, ann.player, "woodcutting", 50);
    expect(ann.reportChopping([[oak.id, 0]])).toBe(1);
    expect(ann.ore("oak_log")).toBe(WOODCUTTING_LOGS);
    // A stale count is refused; the whole stack goes.
    expect(ann.player.refusal("destroyOre", { oreId: "oak_log", expectedCount: 1 })).not.toBeNull();
    ann.player.call("destroyOre", { oreId: "oak_log", expectedCount: WOODCUTTING_LOGS });
    expect(ann.ore("oak_log")).toBe(0);

    const full = townsfolk(world, "Full");
    fillBag(world, full.player);
    full.standAt(pines[0]);
    expect(full.reportChopping([[pines[0].id, 0]])).toBe(0);
    const holder = townsfolk(world, "Holder");
    fillBag(world, holder.player, { pine_log: 1 });
    holder.standAt(pines[0]);
    expect(holder.reportChopping([[pines[0].id, 0]])).toBe(1);
  });
});

describe("Tech Research", () => {
  it("starts research only at the Tech Research station in the Town", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    standAt(world, ann.player, { mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
    expect(ann.player.refusal("startResearch", { researchId: "foraging" })).not.toBeNull();
    expect(world.db.activeResearch.identity.find(ann.player.identity)).toBeFalsy();
    standAt(world, ann.player, { mapId: "town", ...RESEARCH_STAND });
    ann.player.call("startResearch", { researchId: "foraging" });
    expect(world.db.activeResearch.identity.find(ann.player.identity)?.researchId).toBe("foraging");
  });
});

describe("Resource Respawn research", () => {
  it("needs Card Luck or Gear Luck first, then researches into its own rank row", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    standAt(world, ann.player, { mapId: "town", ...RESEARCH_STAND });
    expect(ann.player.refusal("startResearch", { researchId: "resourceRespawn" })).not.toBeNull();
    world.setup(ctx => ctx.db.playerLuckResearch.insert({ identity: ann.player.identity, cardLuck: 1, gearLuck: 0, miningLuck: 0, skillLuck: 0, refineLuck: 0 }));
    ann.player.call("startResearch", { researchId: "resourceRespawn" });
    world.advance(Number(world.db.activeResearch.identity.find(ann.player.identity).completesAt.microsSinceUnixEpoch / 1000n) - world.now());
    world.runDue();
    expect(world.db.playerResearchRank.key.find(researchRankKey(ann.player.identity, "resourceRespawn"))?.rank).toBe(1);
  });

  it("at rank 5 takes a small rock back after 45 s and a tree after 90 s, not before; kept through a prestige, gone with a reset", () => {
    const world = scenarioWorld();
    const plain = townsfolk(world, "Plain"), keen = townsfolk(world, "Keen");
    world.setup(ctx => ctx.db.playerResearchRank.insert({ key: researchRankKey(keen.player.identity, "resourceRespawn"), identity: keen.player.identity, researchId: "resourceRespawn", rank: 5 }));
    world.advance(300 * SECOND);
    for (const [who, counted] of [[plain, 1], [keen, 2]] as const) {
      who.standAt(copper);
      expect(who.reportMining([[copper.id, 50 * SECOND], [copper.id, SECOND]])).toBe(counted);
      who.standAt(pines[0]);
      expect(who.reportChopping([[pines[0].id, 95 * SECOND], [pines[0].id, SECOND]])).toBe(counted);
    }
    // Rank 5, broken 40 s ago: 5 s still to go.
    world.advance(300 * SECOND);
    keen.standAt(copper);
    expect(keen.reportMining([[copper.id, 40 * SECOND], [copper.id, SECOND]])).toBe(1);

    // The old one-break calls count the rank too.
    world.advance(300 * SECOND);
    keen.player.call("mineNode", { nodeId: copper.id });
    world.advance(44 * SECOND);
    expect(keen.player.refusal("mineNode", { nodeId: copper.id })).not.toBeNull();
    world.advance(SECOND);
    expect(keen.player.refusal("mineNode", { nodeId: copper.id })).toBeNull();

    keen.player.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    keen.player.call("prestigeAccount");
    expect(world.db.playerResearchRank.key.find(researchRankKey(keen.player.identity, "resourceRespawn"))?.rank).toBe(5);
    keen.player.call("resetPlayerProgress");
    expect([...world.db.playerResearchRank.identity.filter(keen.player.identity)]).toEqual([]);
  });
});

describe("Tools at the Smith", () => {
  /** By the Smith with plenty of every material and `gold`, and these skills. */
  function atSmith(world: ScenarioWorld, name: string, options: { stock?: number; gold?: number; mining?: number; woodcutting?: number; crafts?: Partial<Record<CraftSkill, number>> } = {}) {
    const who = townsfolk(world, name);
    who.standAt(TOWN_SMITH_POSITION);
    const stock = options.stock ?? 100_000;
    if (stock) who.give(Object.fromEntries(["copper_ore", "iron_ore", "mithril_ore", "adamant_ore", "starshard", "pine_log", "oak_log", "yew_log", "elder_log", "arcane_crystal"].map(id => [id, stock])));
    who.give({}, options.gold ?? 10_000);
    if (options.mining) setSkill(world, who.player, "mining", options.mining);
    if (options.woodcutting) setSkill(world, who.player, "woodcutting", options.woodcutting);
    world.setup(ctx => {
      for (const [skill, level] of Object.entries(options.crafts ?? {})) {
        ctx.db.playerCraftSkill.insert({ key: craftKey(who.player.identity, skill as CraftSkill), identity: who.player.identity, skill, experience: BigInt(craftExperienceForLevel(level)) });
      }
    });
    world.advance(60 * SECOND);
    const upgrade = (tool: string, expectedLevel = who.tool(tool as ToolId)) => who.player.refusal("upgradeTool", { tool, expectedLevel });
    const setLevel = (tool: ToolId, level: number) => world.setup(ctx => ctx.db.playerTool.insert({ key: toolKey(who.player.identity, tool), identity: who.player.identity, tool, level }));
    return Object.assign(who, { upgrade, setLevel });
  }

  it("an upgrade takes its level's gold and materials beside the Smith, one level at a time, at the level the player saw, up to 10", () => {
    const world = scenarioWorld();
    const ann = atSmith(world, "Ann", { mining: 1_000, crafts: { fletching: 99 } });
    const cost = toolUpgradeCost("pickaxe", 1)!;
    expect(ann.upgrade("pickaxe")).toBeNull();
    expect(ann.tool("pickaxe")).toBe(1);
    expect(ann.ore("copper_ore")).toBe(100_000 - cost.materials.copper_ore);
    expect(ann.gold()).toBe(BigInt(10_000 - cost.gold));
    // A stale window (the level it showed is gone), an unknown tool, far from the Smith, mid-duel: nothing.
    expect(ann.upgrade("pickaxe", 0)).not.toBeNull();
    expect(ann.upgrade("shovel", 0)).not.toBeNull();
    ann.standAt({ x: TOWN_SMITH_POSITION.x + 400, y: TOWN_SMITH_POSITION.y });
    expect(ann.upgrade("pickaxe")).not.toBeNull();
    ann.standAt(TOWN_SMITH_POSITION);
    ann.setLevel("knife", 9);
    expect(ann.upgrade("knife")).toBeNull();
    expect(ann.tool("knife")).toBe(10);
    expect(ann.upgrade("knife")).not.toBeNull();
    duelWith(world, ann.player, world.join("Bob"));
    ann.standAt(TOWN_SMITH_POSITION);
    expect(ann.upgrade("pickaxe")).not.toBeNull();
    expect(ann.tool("pickaxe")).toBe(1);
  });

  it("waits for the skill, then the materials, then the gold, and a refusal charges nothing", () => {
    const world = scenarioWorld();
    expect(atSmith(world, "Low", { mining: 9 }).upgrade("pickaxe")).not.toBeNull();
    expect(atSmith(world, "Wood", { woodcutting: 9 }).upgrade("hatchet")).not.toBeNull();
    expect(atSmith(world, "Ench", { crafts: { enchanting: 2 } }).upgrade("focus")).not.toBeNull();
    const poor = atSmith(world, "Poor", { mining: 10, stock: 0, gold: 5 });
    expect(poor.upgrade("pickaxe")).not.toBeNull();
    poor.give({ copper_ore: 15 });
    expect(poor.upgrade("pickaxe")).not.toBeNull();
    expect([poor.ore("copper_ore"), poor.gold(), poor.tool("pickaxe")]).toEqual([15, 5n, 0]);
    poor.give({}, 5);
    expect(poor.upgrade("pickaxe")).toBeNull();
    expect([poor.ore("copper_ore"), poor.gold(), poor.tool("pickaxe")]).toEqual([0, 0n, 1]);
  });

  it("an upgraded hatchet fells sooner, and the server's pace check allows for it", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    world.setup(ctx => ctx.db.playerTool.insert({ key: toolKey(ann.player.identity, "hatchet"), identity: ann.player.identity, tool: "hatchet", level: 5 }));
    ann.standAt(pines[0]);
    expect(ann.reportChopping([[pines[0].id, 0]])).toBe(1);
    const seconds = woodcuttingChopSeconds(pines[1], ann.woodcutting(), 5);
    expect(seconds).toBeLessThan(woodcuttingChopSeconds(pines[1], ann.woodcutting()));
    world.advance(seconds * WOODCUTTING_RATE_SLACK * SECOND - GATHER_CLAIM_AHEAD_MS + 50);
    ann.standAt(pines[1]);
    expect(ann.reportChopping([[pines[1].id, 0]])).toBe(1);
  });

  it("an upgraded pickaxe or hatchet sometimes gives one more ore or log, a Worn one never", () => {
    const world = scenarioWorld();
    const worn = townsfolk(world, "Worn"), sharp = townsfolk(world, "Sharp");
    world.setup(ctx => ctx.db.playerTool.insert({ key: toolKey(sharp.player.identity, "pickaxe"), identity: sharp.player.identity, tool: "pickaxe", level: 10 }));
    world.setup(ctx => ctx.db.playerTool.insert({ key: toolKey(sharp.player.identity, "hatchet"), identity: sharp.player.identity, tool: "hatchet", level: 10 }));
    const smalls = MINING_NODES.filter(node => node.ore === "copper_ore" && node.kind === "small").slice(0, 12);
    for (const who of [worn, sharp]) {
      for (const node of smalls) { world.advance(10 * SECOND); who.standAt(node); who.reportMining([[node.id, 0]]); }
      for (const tree of pines.slice(0, 12)) { world.advance(30 * SECOND); who.standAt(tree); who.reportChopping([[tree.id, 0]]); }
    }
    expect(worn.ore("copper_ore")).toBe(smalls.length * miningRockOre(copper));
    expect(worn.ore("pine_log")).toBe(12 * WOODCUTTING_LOGS);
    expect(sharp.ore("copper_ore")).toBeGreaterThan(smalls.length * miningRockOre(copper));
    expect(sharp.ore("pine_log")).toBeGreaterThan(12 * WOODCUTTING_LOGS);
  });

  it("a craft tool saves part of each material and adds craft experience; a Worn one saves nothing", () => {
    const world = scenarioWorld();
    const craft = (who: ReturnType<typeof atSmith>, itemId: string) =>
      who.player.call("craftGradeItem", { itemId, expectedMaterials: craftMaterialsKey(gradeCraftMaterials(itemId)!) });
    const worn = atSmith(world, "Worn"), keen = atSmith(world, "Keen");
    keen.setLevel("hammer", 10);
    const needs = gradeCraftMaterials("crude_sword")!.copper_ore;
    craft(worn, "crude_sword");
    expect(worn.ore("copper_ore")).toBe(100_000 - needs);
    expect(craftSkillExperience({ db: world.db } as never, worn.player.identity).smithing).toBe(BigInt(craftExperience("crude")));
    craft(keen, "crude_sword");
    // A quarter of 10 saved: 2, or 3 when its odd half comes up.
    expect(100_000 - keen.ore("copper_ore")).toBeGreaterThanOrEqual(needs - 3);
    expect(100_000 - keen.ore("copper_ore")).toBeLessThanOrEqual(needs - 2);
    expect(craftSkillExperience({ db: world.db } as never, keen.player.identity).smithing).toBe(BigInt(Math.floor(craftExperience("crude") * 1.3)));
  });
});

describe("Gathering across saves", () => {
  it("Mining, Woodcutting, bare rocks and tools go with Reset Save and an erased account; tools stay through a prestige", () => {
    const world = scenarioWorld();
    const ann = townsfolk(world, "Ann");
    ann.standAt(copper); ann.reportMining([[copper.id, 0]]);
    ann.standAt(pines[0]); world.advance(10 * SECOND); ann.reportChopping([[pines[0].id, 0]]);
    world.setup(ctx => ctx.db.playerTool.insert({ key: toolKey(ann.player.identity, "focus"), identity: ann.player.identity, tool: "focus", level: 3 }));
    ann.player.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    ann.player.call("prestigeAccount");
    expect(ann.tool("focus")).toBe(3);
    expect(ann.rocks()).toBe(1);
    ann.player.call("resetPlayerProgress");
    expect([ann.rocks(), ann.trees(), ann.bareRocks().length, ann.felledTrees().length, ann.tool("focus")]).toEqual([0, 0, 0, 0, 0]);

    const bob = townsfolk(world, "Bob");
    bob.standAt(copper); bob.reportMining([[copper.id, 0]]);
    bob.standAt(pines[0]); world.advance(10 * SECOND); bob.reportChopping([[pines[0].id, 0]]);
    world.player("Owner", "owner").call("devEraseAccount", { identityHex: bob.player.hex, confirmation: "ERASE", reason: "Asked to be forgotten" });
    expect([bob.rocks(), bob.bareRocks().length, bob.trees(), bob.felledTrees().length]).toEqual([0, 0, 0, 0]);
  });

  it("a guest's Mining, Woodcutting, tools and research move to the account it links to, replacing the account's own", () => {
    const world = scenarioWorld();
    const gina = townsfolk(world, "Gina");
    gina.standAt(copper); gina.reportMining([[copper.id, 0]]);
    gina.standAt(pines[0]); world.advance(10 * SECOND); gina.reportChopping([[pines[0].id, 0]]);
    world.setup(ctx => {
      ctx.db.playerTool.insert({ key: toolKey(gina.player.identity, "hammer"), identity: gina.player.identity, tool: "hammer", level: 2 });
      ctx.db.playerResearchRank.insert({ key: researchRankKey(gina.player.identity, "resourceRespawn"), identity: gina.player.identity, researchId: "resourceRespawn", rank: 4 });
    });
    const code = "gather-link-".padEnd(40, "x");
    gina.player.call("beginAccountLink", { code });
    const al = world.player("Al", "account").connect();
    world.setup(ctx => {
      const now = world.timestamp();
      ctx.db.playerMining.insert({ identity: al.identity, mining: 40, rocksBroken: 9, pickaxeAt: now, lastBreakAt: now, lastNodeId: 2, lastStarshard: false });
      ctx.db.playerTool.insert({ key: toolKey(al.identity, "knife"), identity: al.identity, tool: "knife", level: 7 });
    });
    al.call("claimGuestAccount", { code });
    const account = serverGatherer(world, al);
    expect(world.db.playerMining.identity.find(al.identity)).toMatchObject({ mining: miningGain(copper), rocksBroken: 1 });
    expect(account.bareRocks()).toEqual([copper.id]);
    expect([account.trees(), account.felledTrees()]).toEqual([1, [pines[0].id]]);
    expect([account.tool("hammer"), account.tool("knife")]).toEqual([2, 0]);
    expect(world.db.playerResearchRank.key.find(researchRankKey(al.identity, "resourceRespawn"))?.rank).toBe(4);
    expect([gina.rocks(), gina.bareRocks().length, gina.trees(), gina.tool("hammer")]).toEqual([0, 0, 0, 0]);
  });
});

describe("The client's gathering reports", () => {
  /** Ann's account rows (mining, woodcutting, ores, tools …) on a real connection, standing by the Smith. */
  async function client(world: ScenarioWorld, options: { tools?: Partial<Record<ToolId, number>> } = {}) {
    const ann = townsfolk(world, "Ann");
    world.setup(ctx => { for (const [tool, level] of Object.entries(options.tools ?? {})) ctx.db.playerTool.insert({ key: toolKey(ann.player.identity, tool as ToolId), identity: ann.player.identity, tool, level }); });
    const connection = connectClient(world, ann.player);
    const rows = createAccountRowServices(() => connection, () => {});
    rows.watch(connection, () => true);
    await connection.fake.settle();
    const calls: string[] = [];
    world.onCommit(commit => { if (commit.sender.toHexString() === ann.player.hex) calls.push(commit.reducer); });
    // Fixture changes outside any call reach the page as the next update would bring them.
    const refresh = async () => { await connection.fake.settle(10); connection.fake.deliver(); };
    return { ann, connection, rows, api: rows.api, calls, settle: () => connection.fake.settle(10), refresh };
  }

  it("breaks waiting to be reported go first, ahead of any call the server checks against ores or bag room", async () => {
    const world = scenarioWorld();
    const { ann, api, calls, settle, refresh } = await client(world);
    setSkill(world, ann.player, "mining", 10);
    const cost = toolUpgradeCost("pickaxe", 1)!;
    // One ore short of the upgrade; the rock broken on the walk over brings the last.
    ann.give({ copper_ore: cost.materials.copper_ore - miningRockOre(copper) }, cost.gold);
    ann.standAt(TOWN_SMITH_POSITION);
    await refresh();
    api.queueMiningBreak(copper.id, world.now() - 30 * SECOND);
    expect(api.ores().copper_ore).toBe(cost.materials.copper_ore);
    expect(await api.upgradeTool("pickaxe", 0)).toMatchObject({ ok: true });
    await settle();
    expect(calls).toEqual(["reportMining", "upgradeTool"]);
    expect([ann.tool("pickaxe"), ann.ore("copper_ore")]).toEqual([1, 0]);
    // Every such call sends what is waiting first, whatever its own answer.
    for (const call of [
      () => api.refineItem("iron_bow", 0n, 0), () => api.destroyOre("copper_ore", 1), () => api.craftGradeItem("iron_bow"),
      () => api.buyShopCard(0, "card"), () => api.buyGradeGear("iron_bow", 1), () => api.claimStarterWeapon("bow"),
      () => api.fallIntoWell(), () => api.flushGathering(),
    ]) {
      world.advance(5 * SECOND);
      await settle();
      calls.length = 0;
      api.queueTreeChop(pines[0].id, world.now() - 60 * SECOND);
      await call();
      await settle();
      expect(calls[0]).toBe("reportChopping");
    }
    // Nothing waiting: no empty report.
    calls.length = 0;
    api.flushGathering();
    await settle();
    expect(calls).toEqual([]);
  });

  it("a full queue goes at once; a report on a dropped connection, or one from an old connection, lets its breaks go", async () => {
    const world = scenarioWorld();
    const { ann, connection, rows, api, calls, settle } = await client(world);
    ann.standAt(copper);
    const smalls = MINING_NODES.filter(node => node.ore === "copper_ore" && node.kind === "small");
    for (const [index, node] of smalls.slice(0, GATHER_QUEUE_CAP).entries()) api.queueMiningBreak(node.id, world.now() - 80 * SECOND + index * 100);
    await settle();
    expect(calls).toEqual(["reportMining"]);
    // Breaks on a connection that drops before they go stand again, and say why.
    const told: string[] = [];
    api.setOnMiningRejected(text => told.push(text));
    api.queueMiningBreak(copperLarge.id, world.now());
    expect(api.minedNodeAt(copperLarge.id)).not.toBeNull();
    connection.fake.drop();
    api.flushMining();
    await settle();
    expect(api.minedNodeAt(copperLarge.id)).toBeNull();
    expect(told).toHaveLength(1);
    // A new connection starts clean: breaks queued on the old one are let go, not sent there or here.
    const fresh = connectClient(world, ann.player), other = rock("copper_ore", "large", 1);
    api.queueMiningBreak(other.id, world.now());
    rows.watch(fresh, () => true);
    await settle();
    expect(api.minedNodeAt(other.id)).toBeNull();
    calls.length = 0;
    api.flushMining();
    await settle();
    expect(calls).toEqual([]);
  });

  it("tells what a report gave beyond what its breaks showed: an upgraded pickaxe's and hatchet's extra ore and logs", async () => {
    const world = scenarioWorld();
    const { ann, api, settle } = await client(world, { tools: { pickaxe: 10, hatchet: 10 } });
    const extra: Record<string, number> = {};
    api.setOnMiningExtra(ores => { for (const [id, count] of Object.entries(ores)) extra[id] = (extra[id] ?? 0) + (count ?? 0); });
    api.setOnWoodcuttingExtra(logs => { for (const [id, count] of Object.entries(logs)) extra[id] = (extra[id] ?? 0) + (count ?? 0); });
    const smalls = MINING_NODES.filter(node => node.ore === "copper_ore" && node.kind === "small").slice(0, 12);
    for (const node of smalls) {
      world.advance(10 * SECOND); await settle(); ann.standAt(node);
      api.queueMiningBreak(node.id, world.now()); api.flushMining(); await settle();
    }
    for (const tree of pines.slice(0, 12)) {
      world.advance(30 * SECOND); await settle(); ann.standAt(tree);
      api.queueTreeChop(tree.id, world.now()); api.flushWoodcutting(); await settle();
    }
    expect(extra.copper_ore).toBe(ann.ore("copper_ore") - smalls.length * miningRockOre(copper));
    expect(extra.pine_log).toBe(ann.ore("pine_log") - 12 * WOODCUTTING_LOGS);
    expect(extra.copper_ore + extra.pine_log).toBeGreaterThan(0);
    // The bag reads the server's counts once the reports are in.
    expect(api.ores().copper_ore).toBe(ann.ore("copper_ore"));
  });
});

describe("The Town's gathering grounds", () => {
  const arrival = { x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y + TOWN_FEET_OFFSET };
  /** Walks feet along waypoints as the Town moves a player: small steps, pushed out of every solid, held inside the walls. */
  function walk(from: TownPoint, waypoints: readonly TownPoint[]) {
    const feet = { ...from, r: TOWN_FEET_RADIUS };
    for (const waypoint of waypoints) {
      for (let step = 0; step < 4_000; step++) {
        const dx = waypoint.x - feet.x, dy = waypoint.y - feet.y, distance = Math.hypot(dx, dy);
        if (distance < 1) break;
        const move = Math.min(distance, 5);
        feet.x += dx / distance * move; feet.y += dy / distance * move;
        for (const solid of TOWN_SOLIDS) pushOutOf(feet, solid);
        if (!townRoomAt(feet.x, feet.y - TOWN_FEET_OFFSET, 400)) Object.assign(feet, townWalkClamp(feet.x, feet.y));
      }
    }
    return { x: feet.x, y: feet.y };
  }
  /** What stands tall around the hills and the grove: what could hide a player. */
  const decor = [...new Set([
    ...townWindowDecor(11_200, 5_250), ...townWindowDecor(8_000, 4_200),
    ...townWindowDecor((TOWN_GROVE.left + TOWN_GROVE.right) / 2, (TOWN_GROVE.top + TOWN_GROVE.bottom) / 2), ...townWindowDecor(TOWN_WEST_BRIDGE.x, TOWN_WEST_BRIDGE.y),
  ])];
  type Frame = { w: number; h: number; ax: number; ay: number };
  const tall = decor.flatMap(item => item.type === "soulProp" && !item.ground && !item.shadow && !item.sheet && !item.signpost && !item.painted
    ? [{ foot: item.y, box: spriteBox((SOUL_ATLAS.frames as Record<string, Frame>)[item.frame], item.x, item.y, item.s, item.flip) }] : []);
  const overlap = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  /** A player's body standing with feet here, and whether anything drawn over it hides it. */
  const hidden = (feet: TownPoint, extra: { foot: number; box: ReturnType<typeof spriteBox> }[] = []) => {
    const body = { left: feet.x - 22, right: feet.x + 22, top: feet.y - 75, bottom: feet.y };
    return [...tall, ...extra].some(item => item.foot > feet.y && overlap(item.box, body));
  };

  it("every rock and tree has clear ground beside it, in its reach alone, in plain view, that a walk from the landing reaches", () => {
    const spots = [
      ...MINING_NODES.map(node => ({ id: `rock ${node.id}`, node, spot: miningStandSpot(node), reach: MINING_REACH, others: MINING_NODES as readonly TownPoint[] })),
      ...WOOD_TREE_NODES.map(tree => ({ id: `tree ${tree.id}`, node: tree, spot: choppingStandSpot(tree), reach: WOODCUTTING_REACH, others: WOOD_TREE_NODES as readonly TownPoint[] })),
    ];
    const treeBoxes = WOOD_TREE_NODES.map(tree => ({ foot: tree.y, box: WOOD_TREE_BOXES[tree.id] }));
    for (const { id, node, spot, reach, others } of spots) {
      expect(spot, id).not.toBeNull();
      expect(townFeetClear(spot!.x, spot!.y), id).toBe(true);
      expect(inTownWalkArea(spot!.x, spot!.y), id).toBe(true);
      expect(others.filter(other => Math.hypot(other.x - spot!.x, other.y - spot!.y) <= reach), id).toEqual([node]);
      // Somewhere beside it (in front, or to either side) a player stands in its reach alone, in plain view.
      const beside = [{ x: node.x - 50, y: node.y + 20 }, { x: node.x + 50, y: node.y + 20 }, { x: node.x, y: node.y + 44 }, { x: node.x - 58, y: node.y }, { x: node.x + 58, y: node.y }, { x: node.x, y: node.y + 50 }];
      expect(beside.some(feet => inTownWalkArea(feet.x, feet.y) && !hidden(feet, treeBoxes)
        && others.filter(other => Math.hypot(other.x - feet.x, other.y - feet.y) <= reach).length === 1
        && others.some(other => other === node && Math.hypot(other.x - feet.x, other.y - feet.y) <= reach)), id).toBe(true);
      expect(planTownPath(arrival, spot!), id).not.toBeNull();
    }
    // Walked step by step from the landing: the nearest and the deepest rock, and the first and last tree of each stand;
    // from the far side of the village, the deepest rock.
    const deepest = miningStandSpot(MINING_NODES.filter(node => node.ore === "adamant_ore").at(-1)!)!;
    const walks: [TownPoint, TownPoint][] = [
      [arrival, miningStandSpot(MINING_NODES[0])!], [arrival, deepest], [{ x: TOWN_CENTER.x - 2_300, y: TOWN_CENTER.y + 1_700 }, deepest],
      ...WOOD_STANDS.flatMap((_stand, index) => { const trees = WOOD_TREE_NODES.filter(tree => tree.stand === index); return [trees[0], trees.at(-1)!].map(tree => [arrival, choppingStandSpot(tree)!] as [TownPoint, TownPoint]); }),
    ];
    for (const [from, goal] of walks) {
      const end = walk(from, planTownPath(from, goal)!);
      expect(Math.hypot(end.x - goal.x, end.y - goal.y)).toBeLessThan(2);
    }
  }, 30_000);

  it("keeps every rock where it has always been, by id, and the grove's trees inside Timberwood and its walls", () => {
    const fingerprint = (nodes: typeof MINING_NODES) => nodes.reduce((hash, node) => Math.imul(hash ^ (node.x * 7_919 + node.y * 104_729 + node.kind.length), 0x9e3779b1) >>> 0, 17);
    expect([MINING_NODES.length, fingerprint(MINING_NODES.slice(0, 100)), fingerprint(MINING_NODES.slice(100))]).toEqual([109, 67_313_776, 3_958_712_620]);
    for (const box of WOOD_TREE_BOXES) {
      expect(box.left).toBeGreaterThan(TOWN_GROVE.left);
      expect(box.right).toBeLessThan(TOWN_GROVE.right);
      expect(box.bottom).toBeLessThan(TOWN_GROVE.bottom);
    }
    // The way to Timberwood: nothing stands on its road.
    expect(decor.filter(item => item.type === "soulProp" && !item.shadow && !item.sheet && !item.signpost && groveRoadDistanceSquared(item.x, item.y) < (GROVE_ROAD_HALF_WIDTH + 5) ** 2)).toEqual([]);
    // No walk to where nobody can stand, or into a room except through its door.
    expect(planTownPath(arrival, { x: TOWN_EAST_BRIDGE.x, y: TOWN_EAST_BRIDGE.y + 120 })).toBeNull();
    const room = TOWN_DOORS[5].room;
    expect(planTownPath(arrival, { x: (room.left + room.right) / 2, y: room.bottom - 60 })).toBeNull();
  });

  it("draws every rock and tree once, with its own art and room, and nothing near the hills that reads as a rock with nothing in it", () => {
    const frameOf = (name: string) => (SOUL_ATLAS.frames as Record<string, Frame | undefined>)[name];
    const drawnTrees = decor.flatMap(item => item.type === "woodTree" ? [item.node] : []).sort((a, b) => a - b);
    expect(drawnTrees).toEqual(WOOD_TREE_NODES.map(tree => tree.id));
    for (const tree of WOOD_TREE_NODES) {
      expect(frameOf(woodTreeDecor(tree).frame), `tree ${tree.id}`).toBeTruthy();
      expect(frameOf(stumpFrame(tree.id)), `tree ${tree.id}`).toBeTruthy();
    }
    for (const node of MINING_NODES) {
      const box = ORE_ROCK_BOXES[node.id], extent = MINING_ROCK_EXTENT[node.kind];
      expect(box.left, `rock ${node.id}`).toBeGreaterThanOrEqual(node.x - extent.half - .5);
      expect(box.right, `rock ${node.id}`).toBeLessThanOrEqual(node.x + extent.half + .5);
      expect(CRYSTAL_CLUSTERS[oreRockDecor(node).frame]?.length, `rock ${node.id}`).toBeGreaterThan(0);
    }
    const widths = (kind: string) => MINING_NODES.filter(node => node.kind === kind).map(node => ORE_ROCK_BOXES[node.id].right - ORE_ROCK_BOXES[node.id].left);
    expect(Math.min(...widths("large"))).toBeGreaterThan(Math.max(...widths("small")));
    const standing = decor.filter(item => item.type === "soulProp" && !item.ground && !item.shadow && !item.sheet && !item.signpost) as { frame: string; x: number; y: number }[];
    expect(standing.filter(item => /^Stone_/.test(item.frame) && inTownHills(item.x, item.y, TOWN_HILLS_STONE_FREE))).toEqual([]);
  });
});

