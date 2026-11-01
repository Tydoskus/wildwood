import { describe, expect, it, vi } from "vitest";
import { MINING_NODES, miningBreakSeconds, miningGain } from "../../shared/mining";
import { Timestamp } from "spacetimedb";
import { TOWN_ARRIVAL, TOWN_FEET_OFFSET, TOWN_QUEST_BOARD_POSITION, TOWN_RESEARCH_POSITION, TOWN_SMITH_POSITION, townRoomAt } from "../../shared/town";
import { PLAYER_SPAWN, TUTORIAL_FOREST_MAP_ID } from "../../shared/rules";
import { toolLevelNeed, toolUpgradeCost } from "../../shared/tools";
import type { OreId } from "../../shared/refine";
import { WOOD_TREE_NODES, woodcuttingChopSeconds } from "../../shared/woodcutting";
import { miningStandSpot } from "../../src/game/runtime/auto-farm/auto-mine";
import { choppingStandSpot } from "../../src/game/runtime/auto-farm/auto-chop";
import { gameWorld, playAs, type GameTab } from "./harness/game";
import { foundGuild, guildWindow } from "./harness/guild";
import { profileSkillRows } from "../../src/ui/profile-skills";
import { writeMiningLevel } from "../../spacetimedb/src/mining";
import { clearSpotNear, fillBag, gatherer, GROVE_ENTRY, HILLS_ENTRY, serverGatherer, standingAt } from "./harness/gather";
import { takeGold } from "../../spacetimedb/src/gold";

vi.setConfig({ testTimeout: 60_000 });

const pines = WOOD_TREE_NODES.filter(tree => tree.kind === "pine");
const copper = MINING_NODES.filter(node => node.ore === "copper_ore" && node.kind !== "crystal");
const feetOf = (at: { x: number; y: number }) => ({ x: at.x, y: at.y + TOWN_FEET_OFFSET });
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const nearestTo = <T>(from: { x: number; y: number }, nodes: T[], spot: (node: T) => { x: number; y: number } | null) =>
  [...nodes].sort((a, b) => distance(spot(a)!, from) - distance(spot(b)!, from))[0];

describe("Mining and chopping by hand", () => {
  /** The small copper rock nearest the way in, a short walk from the village. */
  const rock = nearestTo(feetOf(HILLS_ENTRY), copper.filter(node => node.kind === "small"), miningStandSpot);
  const pine = nearestTo(feetOf(GROVE_ENTRY), pines, choppingStandSpot);
  const reported = (reports: any[], key: "breaks" | "chops") => reports.flatMap(report => report[key]);

  it("standing by a rock swings until it breaks; its ore shows at once, and walking out of the hills reports it to the server", async () => {
    const world = gameWorld();
    const ann = await gatherer(world, "Ann", { at: standingAt(miningStandSpot(rock)!) });
    const reports = ann.callsTo("reportMining");
    const start = world.now(), seconds = miningBreakSeconds(rock, 0);
    await ann.tab.play(seconds * 1_000 - 500);
    expect(ann.tab.coop.ores().copper_ore ?? 0).toBe(0);
    await ann.tab.play(1_500);
    // Broken here: counted in the bag before the server hears of it.
    expect(ann.tab.coop.ores().copper_ore).toBe(1);
    expect(ann.rocks()).toBe(0);
    // Out of the hills: the waiting break goes at once.
    await ann.tab.hold("KeyA", 3_000);
    expect(reports).toHaveLength(1);
    const [only] = reported(reports, "breaks");
    expect(only.nodeId).toBe(rock.id);
    expect(Number(only.atMs) - start).toBeGreaterThan(seconds * 1_000 - 100);
    expect(Number(only.atMs) - start).toBeLessThan(seconds * 1_000 + 1_500);
    expect([ann.rocks(), ann.ores().copper_ore, ann.mining()]).toEqual([1, 1, miningGain(rock)]);
    expect(ann.tab.coop.ores().copper_ore).toBe(1);
  });

  it("more Mining and an upgraded pickaxe break a rock sooner, at the pace the server checks", async () => {
    const world = gameWorld();
    const bob = await gatherer(world, "Bob", { at: standingAt(miningStandSpot(rock)!), mining: 400, tools: { pickaxe: 10 } });
    const reports = bob.callsTo("reportMining");
    const start = world.now(), seconds = miningBreakSeconds(rock, 400, 0, 10);
    expect(seconds).toBeLessThan(miningBreakSeconds(rock, 0) / 2);
    expect(await bob.tab.until(() => bob.rocks() >= 1, 30_000)).toBe(true);
    const [first] = reported(reports, "breaks");
    expect(Number(first.atMs) - start).toBeGreaterThan(seconds * 1_000 - 100);
    expect(Number(first.atMs) - start).toBeLessThan(seconds * 1_000 + 1_500);
  });

  it("standing by a pine fells it; the logs show at once and the server pays logs and Woodcutting", async () => {
    const world = gameWorld();
    const ann = await gatherer(world, "Ann", { at: standingAt(choppingStandSpot(pine)!) });
    const reports = ann.callsTo("reportChopping");
    const start = world.now(), seconds = woodcuttingChopSeconds(pine, 0);
    await ann.tab.play(seconds * 1_000 + 1_000);
    expect(ann.tab.coop.ores().pine_log).toBeGreaterThan(0);
    expect(ann.trees()).toBe(0);
    expect(await ann.tab.until(() => ann.trees() >= 1, 30_000)).toBe(true);
    const [first] = reported(reports, "chops");
    expect(first.treeId).toBe(pine.id);
    expect(Number(first.atMs) - start).toBeGreaterThan(seconds * 1_000 - 100);
    expect(Number(first.atMs) - start).toBeLessThan(seconds * 1_000 + 1_500);
    expect(ann.ores().pine_log).toBe(ann.tab.coop.ores().pine_log);
    expect(ann.woodcutting()).toBeGreaterThan(0);
  });

  it("a Mysterious rock's break goes to the server at once, and its Starshard comes in", async () => {
    const world = gameWorld();
    const rich = copper.find(node => node.kind === "mysterious")!;
    const ann = await gatherer(world, "Ann", { at: standingAt(miningStandSpot(rich)!) });
    const seconds = miningBreakSeconds(rich, 0);
    expect(await ann.tab.until(() => ann.rocks() >= 1, seconds * 1_000 + 2_000)).toBe(true);
    expect(ann.ores().starshard).toBeGreaterThanOrEqual(1);
  });

  it("a break the server did not count stands its rock again, and it is mined again once it really stands", async () => {
    const world = gameWorld();
    const ann = await gatherer(world, "Ann", { at: standingAt(miningStandSpot(rock)!) });
    const reports = ann.callsTo("reportMining");
    // The rock breaks here; at that same moment another device of hers broke it too, so the server has it bare
    // for a minute and will not count this break.
    expect(await ann.tab.until(() => (ann.tab.coop.ores().copper_ore ?? 0) > 0, 10_000)).toBe(true);
    world.setup(ctx => ctx.db.playerMinedNode.insert({ key: `${ann.player.hex}:${rock.id}`, identity: ann.player.identity, nodeId: rock.id,
      brokenAt: new Timestamp(BigInt(Math.round(world.now())) * 1000n) }));
    expect(await ann.tab.until(() => reports.length >= 1, 30_000)).toBe(true);
    await ann.tab.play(500);
    // Not counted: no ore, and the bag lets the shown ore go.
    expect(ann.rocks()).toBe(0);
    expect(ann.tab.coop.ores().copper_ore ?? 0).toBe(0);
    // Once it has grown back on the server, the player standing there mines it and it counts.
    expect(await ann.tab.until(() => ann.rocks() >= 1, 120_000)).toBe(true);
    expect(ann.ores().copper_ore).toBe(1);
  });

  it("a deeper vein waits for its Mining, and a full bag takes no new kind of ore: nothing is swung or reported", async () => {
    const world = gameWorld();
    const iron = MINING_NODES.find(node => node.ore === "iron_ore" && node.kind === "small")!;
    const ann = await gatherer(world, "Ann", { at: standingAt(miningStandSpot(iron)!) });
    const annReports = ann.callsTo("reportMining");
    await ann.tab.play(30_000);
    expect(ann.tab.coop.ores().iron_ore ?? 0).toBe(0);
    expect(annReports).toEqual([]);

    const full = gameWorld();
    const bob = await gatherer(full, "Bob", { at: standingAt(miningStandSpot(rock)!), before: player => fillBag(full, player) });
    const bobReports = bob.callsTo("reportMining");
    await bob.tab.play(30_000);
    expect(bob.tab.coop.ores().copper_ore ?? 0).toBe(0);
    expect(bobReports).toEqual([]);
  });
});

describe("Tools at the Smith", () => {
  /** West of the Smith on the lane: walking east comes up to him. */
  const lane = clearSpotNear({ x: TOWN_SMITH_POSITION.x - 150, y: TOWN_SMITH_POSITION.y }, 40);
  const pickaxeButton = (tab: GameTab) => tab.document.querySelector<HTMLButtonElement>('[data-tool="pickaxe"] button');
  const press = async (tab: GameTab, target: HTMLButtonElement | null) => {
    if (!target || target.disabled) throw new Error("That button cannot be pressed");
    target.dispatchEvent(new (tab.window as any).Event("click", { bubbles: true }));
    await tab.play(1_000);
  };
  /** Walks east until the Smith's window opens. */
  const walkUpToTheSmith = async (tab: GameTab) => {
    tab.key("KeyD");
    const opened = await tab.until(() => tab.shown("smithTitle"), 3_000);
    tab.key("KeyD", "keyup");
    return opened;
  };

  it("the last pickaxe upgrade in the Smith's window charges its gold and ore; one the server refuses charges nothing", async () => {
    const world = gameWorld();
    const top = toolUpgradeCost("pickaxe", 10)!;
    const ann = await gatherer(world, "Ann", { at: standingAt(lane), mining: toolLevelNeed("pickaxe", 10), tools: { pickaxe: 9 },
      before: player => serverGatherer(world, player).give({ ...top.materials }, top.gold) });
    const held = serverGatherer(world, ann.player);
    const materials = Object.keys(top.materials) as OreId[];
    // The Smith's window opens as she walks up to him; the Tools view lists the tools.
    expect(await walkUpToTheSmith(ann.tab)).toBe(true);
    await press(ann.tab, ann.tab.document.querySelector<HTMLButtonElement>('[data-view="tools"]'));
    // The gold is spent elsewhere before her tap lands (this window has not heard): refused, nothing taken.
    world.setup(ctx => takeGold(ctx, ann.player.identity, top.gold));
    await press(ann.tab, pickaxeButton(ann.tab));
    expect(held.tool("pickaxe")).toBe(9);
    expect(materials.map(id => held.ore(id))).toEqual(materials.map(id => top.materials[id]));
    // The gold comes back; she steps away from the Smith and back, and his window opens again.
    held.give({}, top.gold);
    await press(ann.tab, ann.tab.element("smithTitle").closest("dialog")!.querySelector<HTMLButtonElement>(".window-back-button"));
    expect(ann.tab.shown("smithTitle")).toBe(false);
    await ann.tab.hold("KeyA", 600);
    expect(await walkUpToTheSmith(ann.tab)).toBe(true);
    await press(ann.tab, ann.tab.document.querySelector<HTMLButtonElement>('[data-view="tools"]'));
    await press(ann.tab, pickaxeButton(ann.tab));
    expect(held.tool("pickaxe")).toBe(10);
    expect([held.gold(), ...materials.map(id => held.ore(id))]).toEqual([0n, ...materials.map(() => 0)]);
    // Fully upgraded: nothing left to press.
    expect(pickaxeButton(ann.tab)).toBeNull();
    // Walking off with his window open closes it once she is past his reach, where its buttons would be refused.
    await ann.tab.hold("KeyA", 1_000);
    expect(ann.tab.shown("smithTitle")).toBe(false);
  });
});

describe("Skills", () => {
  it("the Skills tab shows her own levels with progress to the next, and another player's levels alone", async () => {
    const world = gameWorld();
    const bob = world.join("Bob");
    const ann = await gatherer(world, "Ann", { at: HILLS_ENTRY, mining: 40, before: player => {
      foundGuild(world, player, "Rose", [bob]);
      world.setup(ctx => {
        ctx.db.playerMining.insert({ identity: bob.identity, mining: 340, rocksBroken: 0, pickaxeAt: world.timestamp(), lastBreakAt: world.timestamp(), lastNodeId: 0, lastStarshard: false });
        writeMiningLevel(ctx, bob.identity);
      });
    } });
    const panel = () => ann.tab.element("profileSkillsPanel");
    const level = (kind: string) => panel().querySelector(`.profile-skill-${kind} .profile-skill-level`)?.textContent;
    const bars = () => panel().querySelectorAll(".profile-skill-bar").length;
    ann.tab.tap("playerHudProfileIcon");
    await ann.tab.play(1_000);
    ann.tab.tap("profileSkillsTab");
    await ann.tab.play(300);
    expect(ann.tab.shown("profileSkillsPanel")).toBe(true);
    const own = profileSkillRows({ mining: 40, woodcutting: null }, {});
    expect(level("mining")).toBe(own.find(row => row.kind === "mining")!.level);
    expect(bars()).toBeGreaterThan(0);
    // Her soul tier's kills under Info.
    ann.tab.tap("profileInfoTab");
    await ann.tab.play(300);
    expect(ann.tab.shown("profileSoulTier")).toBe(true);
    // Bob's profile, from the guild roster: his level, no progress.
    const guild = guildWindow(ann.tab);
    await guild.open();
    await guild.press(`profile-${bob.hex}`);
    await ann.tab.play(1_000);
    ann.tab.tap("profileSkillsTab");
    await ann.tab.play(300);
    expect(level("mining")).toBe(profileSkillRows({ mining: 340 }).find(row => row.kind === "mining")!.level);
    expect(bars()).toBe(0);
    ann.tab.tap("profileInfoTab");
    await ann.tab.play(300);
    expect(ann.tab.shown("profileInfoPanel")).toBe(true);
    expect(ann.tab.shown("profileSoulTier")).toBe(false);
  });
});


describe("The Quest Board and Research in Town", () => {
  const tracker = (tab: GameTab) => tab.document.querySelector<HTMLElement>(".quest-tracker");
  const tracking = (tab: GameTab) => Boolean(tracker(tab) && !tracker(tab)!.hidden);

  it("quests stay off the HUD until the board is first opened, then show on every device", async () => {
    const world = gameWorld();
    const square = { x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y };
    // Kills already drew her week's quests.
    const ann = await gatherer(world, "Ann", { at: square, before: player => player.call("refreshDailyQuests", {}) });
    await ann.tab.play(3_000);
    expect(ann.tab.coop.weeklyQuests()?.quests.length).toBeGreaterThan(0);
    expect(tracking(ann.tab)).toBe(false);
    await ann.tab.close();
    // Where she stands when her next page opens. Standing at the board opens it; from then on the HUD tracks quests.
    const standAt = (spot: { x: number; y: number }) => world.player("Ann").patch("playerLastLocation", { mapId: "town", ...spot });
    standAt(standingAt(clearSpotNear({ x: TOWN_QUEST_BOARD_POSITION.x, y: TOWN_QUEST_BOARD_POSITION.y + 10 }, 30)));
    const atBoard = await playAs(world, "Ann");
    expect(await atBoard.until(() => tracking(atBoard), 5_000)).toBe(true);
    await atBoard.close();
    // Another device, back on the square: still on.
    standAt(square);
    const phone = await playAs(world, "Ann");
    expect(await phone.until(() => tracking(phone), 5_000)).toBe(true);
  });

  it("tapping Research Ready away from the Town lands inside the Research building, and Fight goes back", async () => {
    const world = gameWorld();
    const bob = await gatherer(world, "Bob", { at: { x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y },
      before: player => player.patch("player", { mapId: TUTORIAL_FOREST_MAP_ID, x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y }) });
    await bob.tab.play(2_000);
    bob.tab.tap("researchReadyHint");
    const inResearch = () => {
      const row = world.db.player.identity.find(bob.player.identity);
      return row?.mapId === "town" && townRoomAt(row.x, row.y)?.index === TOWN_RESEARCH_POSITION.door;
    };
    expect(await bob.tab.until(inResearch, 10_000)).toBe(true);
    expect(world.db.homeReturnLocation.identity.find(bob.player.identity)?.mapId).toBe(TUTORIAL_FOREST_MAP_ID);
  });
});

describe("Arrows from the Smith", () => {
  /** Beside the Smith, within his reach. */
  const bySmith = clearSpotNear({ x: TOWN_SMITH_POSITION.x, y: TOWN_SMITH_POSITION.y + 30 }, 40);

  it("crafts a stack at the Smith, nocks it for good, and the server takes the arrows the bow fires, never more than held", async () => {
    const world = gameWorld();
    const ann = await gatherer(world, "Ann", { at: standingAt(bySmith),
      before: player => serverGatherer(world, player).give({ pine_log: 3, iron_ore: 3 }) });
    const held = serverGatherer(world, ann.player);
    // Two crafts: two of each material, two hundred arrows.
    expect((await ann.tab.coop.craftArrows("steel_arrow", 2)).ok).toBe(true);
    await ann.tab.play(500);
    expect([held.ore("steel_arrow"), held.ore("pine_log"), held.ore("iron_ore")]).toEqual([200, 1, 1]);
    // Short of materials: refused, nothing taken.
    expect((await ann.tab.coop.craftArrows("steel_arrow", 2)).ok).toBe(false);
    expect([held.ore("pine_log"), held.ore("iron_ore")]).toEqual([1, 1]);
    await ann.tab.coop.nockArrow("steel_arrow");
    await ann.tab.play(500);
    expect(ann.tab.coop.arrowInPlay()).toBe("steel_arrow");
    // Arrows fired come off the stack at once; the server takes them some seconds later.
    for (let shot = 0; shot < 150; shot++) ann.tab.coop.recordArrowShot("steel_arrow");
    expect(ann.tab.coop.ores().steel_arrow).toBe(50);
    await ann.tab.play(16_000);
    expect(held.ore("steel_arrow")).toBe(50);
    // More reported than held: the server takes what there is, and the bow is back to plain arrows.
    for (let shot = 0; shot < 80; shot++) ann.tab.coop.recordArrowShot("steel_arrow");
    await ann.tab.play(16_000);
    expect(held.ore("steel_arrow")).toBe(0);
    expect(ann.tab.coop.arrowInPlay()).toBeNull();
    // The nock is the account's: still nocked after a reload, ready for the next stack.
    const tab = await ann.tab.reload();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(tab.coop.nockedArrow()).toBe("steel_arrow");
  });
});
