import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MINING_NODES, MINING_NODE_KINDS, MINING_OUTCROP_GAP, MINING_OUTCROPS, MINING_PLATE_ROOM, MINING_REACH, MINING_ROCK_EXTENT, MINING_ROCK_ROOM,
  MINING_STARSHARD_CHANCE, MINING_TRACK, MINING_TRACK_HALF_WIDTH, MINING_VEINS, miningBreakSeconds, miningGain, miningNode, miningNodeName,
  miningSpeed, miningTrackDistanceSquared, miningYield, normalizeMining, canMineRock, miningRockHint, miningRockNeed,
} from "./mining";
import { layHills, miningLayoutSource } from "./mining-layout-generate";
import { toolLevelNeed } from "./tools";
import { GRADE_ORES, refineGrade } from "./refine";
import { TOWN_EAST_BRIDGE, TOWN_EAST_FENCE_GAP, TOWN_HILLS, TOWN_VILLAGE_WALK_AREA, TOWN_WALK_AREA, TOWN_WALK_AREAS } from "./town";
import { ITEM_DEFINITIONS } from "./items";
import { itemTier } from "./item-tier";

describe("the Copper Hills' veins", () => {
  it("run west to east from copper to adamant, edge to edge across the hills", () => {
    expect(MINING_VEINS.map(vein => vein.ore)).toEqual(["copper_ore", "iron_ore", "mithril_ore", "adamant_ore"]);
    expect(MINING_VEINS[0].left).toBe(TOWN_HILLS.left);
    expect(MINING_VEINS.at(-1)!.right).toBe(TOWN_HILLS.right);
    MINING_VEINS.slice(1).forEach((vein, index) => expect(vein.left).toBe(MINING_VEINS[index].right));
    // Each grade twice as hard as the last.
    expect(MINING_VEINS.map(vein => vein.hardness)).toEqual([1, 2, 4, 8]);
    // East of the village's own countryside, and inside the walls, which reach past them.
    expect(TOWN_HILLS.left).toBeGreaterThan(TOWN_VILLAGE_WALK_AREA.right);
    expect(TOWN_WALK_AREA.right).toBeGreaterThan(TOWN_HILLS.right);
    const [walls] = TOWN_WALK_AREAS;
    expect(walls.right).toBeGreaterThan(TOWN_HILLS.right);
    expect(TOWN_HILLS.top).toBeGreaterThan(walls.top);
    expect(TOWN_HILLS.bottom).toBeLessThan(walls.bottom);
  });

  it("hold the ore of the gear tiers they are named for, and open by Mining alone, as the pickaxe's upgrades do", () => {
    for (const vein of MINING_VEINS) {
      // A vein's first tier is the first tier whose gear takes its ore.
      const firstItem = Object.keys(ITEM_DEFINITIONS).find(id => refineGrade(id) && itemTier(id) === vein.firstTier)!;
      expect(GRADE_ORES[refineGrade(firstItem)!]).toBe(vein.ore);
      const before = Object.keys(ITEM_DEFINITIONS).find(id => refineGrade(id) && itemTier(id) === vein.firstTier - 1);
      if (before) expect(GRADE_ORES[refineGrade(before)!]).not.toBe(vein.ore);
    }
    // Copper at once; the deeper veins at the pickaxe's Iron, Silver and Adamant marks.
    expect(MINING_VEINS.map(vein => vein.mining)).toEqual([0, toolLevelNeed("pickaxe", 2), toolLevelNeed("pickaxe", 4), toolLevelNeed("pickaxe", 7)]);
    expect(MINING_VEINS.map(vein => vein.mining)).toEqual([0, 50, 250, 900]);
    // Each vein's crystal rocks a little past its ore, and below the next vein.
    MINING_VEINS.forEach((vein, index) => {
      expect(vein.crystalMining).toBeGreaterThan(vein.mining);
      if (MINING_VEINS[index + 1]) expect(vein.crystalMining).toBeLessThan(MINING_VEINS[index + 1].mining);
    });
    const ore = (vein: number) => MINING_NODES.find(node => node.vein === vein && node.kind === "small")!;
    expect([canMineRock(ore(0), 0), canMineRock(ore(1), 49), canMineRock(ore(1), 50), canMineRock(ore(3), 899), canMineRock(ore(3), 900)])
      .toEqual([true, false, true, false, true]);
    expect(miningRockHint(ore(2))).toBe("Reach Mining 250 to mine Mithril Ore.");
    expect(miningRockHint(ore(3))).toBe("Reach Mining 900 to mine Adamant Ore.");
  });
});

describe("the rocks", () => {
  it("are laid the same every time, in their vein's band, apart from each other", () => {
    expect(MINING_NODES.length).toBeGreaterThan(80);
    MINING_NODES.forEach((node, index) => {
      expect(node.id).toBe(index);
      const vein = MINING_VEINS[node.vein];
      expect(node.ore).toBe(node.kind === "crystal" ? "arcane_crystal" : vein.ore);
      expect(node.x).toBeGreaterThanOrEqual(vein.left);
      expect(node.x).toBeLessThanOrEqual(vein.right);
      expect(node.y).toBeGreaterThanOrEqual(TOWN_HILLS.top);
      expect(node.y).toBeLessThanOrEqual(TOWN_HILLS.bottom);
    });
    for (const a of MINING_NODES) for (const b of MINING_NODES) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(80);
  });

  it("are the layout the generator lays, as every client and the server read it", () => {
    // Client and server must agree on every rock, or gathering fails silently.
    const stale = "shared/mining-layout.generated.ts is stale: run npm run generate:mining-layout and commit it";
    expect(readFileSync(new URL("./mining-layout.generated.ts", import.meta.url), "utf8"), stale).toBe(miningLayoutSource());
    const laid = layHills();
    expect(MINING_NODES, stale).toEqual(laid.nodes);
    expect(MINING_OUTCROPS, stale).toEqual(laid.outcrops);
  });

  it("come in every kind in every vein: mostly Small, some Large, at least one Mysterious", () => {
    MINING_VEINS.forEach((_vein, veinIndex) => {
      const rocks = MINING_NODES.filter(node => node.vein === veinIndex && node.kind !== "crystal");
      const count = (kind: string) => rocks.filter(node => node.kind === kind).length;
      expect(count("mysterious")).toBeGreaterThanOrEqual(1);
      expect(count("large")).toBeGreaterThanOrEqual(Math.floor(rocks.length * .2));
      expect(count("small")).toBeGreaterThan(rocks.length / 2);
    });
    // Copper is the biggest vein and adamant the smallest: the deeper, the scarcer.
    const sizes = MINING_VEINS.map((_vein, index) => MINING_NODES.filter(node => node.vein === index && node.kind !== "crystal").length);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it("keep their kind's room from each other: none touch, and no spot is in reach of two", () => {
    for (const a of MINING_NODES) for (const b of MINING_NODES) {
      if (a.id >= b.id) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      expect(distance).toBeGreaterThanOrEqual(MINING_ROCK_ROOM[a.kind] + MINING_ROCK_ROOM[b.kind]);
      // A player's feet within reach of one rock are out of reach of every other.
      expect(distance).toBeGreaterThan(2 * MINING_REACH);
    }
  });

  it("stand in outcrops of a few, each in one vein, with room for grass between outcrops", () => {
    expect(MINING_OUTCROPS.flatMap(outcrop => outcrop.rocks).sort((a, b) => a - b)).toEqual(MINING_NODES.map(node => node.id));
    for (const outcrop of MINING_OUTCROPS) {
      expect(outcrop.rocks.length).toBeGreaterThanOrEqual(3);
      expect(outcrop.rocks.length).toBeLessThanOrEqual(8);
      for (const id of outcrop.rocks) expect(MINING_NODES[id].vein).toBe(outcrop.vein);
      // Its heart is one of its big rocks.
      expect(MINING_NODES[outcrop.rocks[0]].kind).not.toBe("small");
    }
    const outcropOf = new Map(MINING_OUTCROPS.flatMap(outcrop => outcrop.rocks.map(id => [id, outcrop.id] as const)));
    for (const a of MINING_NODES) for (const b of MINING_NODES) {
      if (a.id < b.id && outcropOf.get(a.id) !== outcropOf.get(b.id)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MINING_OUTCROP_GAP);
    }
    // Every vein has a few outcrops, the deeper the fewer.
    const counts = MINING_VEINS.map((_vein, index) => MINING_OUTCROPS.filter(outcrop => outcrop.vein === index).length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("leave the room under each rock free for the plate that names it while it is mined", () => {
    for (const under of MINING_NODES) for (const rock of MINING_NODES) {
      if (rock === under) continue;
      const extent = MINING_ROCK_EXTENT[rock.kind];
      const inRoom = Math.abs(rock.x - under.x) < MINING_PLATE_ROOM.half[under.kind] + extent.half
        && rock.y - extent.up < under.y + MINING_PLATE_ROOM.bottom && rock.y + extent.down > under.y + MINING_PLATE_ROOM.top;
      expect(inRoom, `rock ${rock.id} in rock ${under.id}'s plate room`).toBe(false);
    }
    // The plate hangs below the reach: no miner's feet come that low.
    expect(MINING_PLATE_ROOM.top).toBeGreaterThan(MINING_REACH);
  });

  it("keep off the miners' track, which comes out of the village over the east bridge and ends among the last outcrop", () => {
    const [start, end] = [MINING_TRACK[0], MINING_TRACK.at(-1)!];
    // From just outside the gap in the village's fence, up along it ...
    expect(start.x - TOWN_EAST_FENCE_GAP.right).toBeGreaterThan(0);
    expect(start.x - TOWN_EAST_FENCE_GAP.right).toBeLessThan(60);
    expect(start.y).toBeGreaterThan(TOWN_EAST_FENCE_GAP.top);
    expect(start.y).toBeLessThan(TOWN_EAST_FENCE_GAP.bottom);
    // ... over the east bridge's deck ...
    const onBridge = MINING_TRACK.findIndex(point => point.x >= TOWN_EAST_BRIDGE.x);
    expect(Math.abs(MINING_TRACK[onBridge].y - TOWN_EAST_BRIDGE.y)).toBeLessThan(3);
    // ... and east into the hills at about y 4,220 ...
    const atEdge = MINING_TRACK.find(point => point.x >= TOWN_HILLS.left)!;
    expect(Math.abs(atEdge.y - 4_220)).toBeLessThan(40);
    for (let index = onBridge; index < MINING_TRACK.length; index++) expect(MINING_TRACK[index].x).toBeGreaterThan(MINING_TRACK[index - 1].x);
    // ... and on through every vein to the last, where it ends.
    for (const vein of MINING_VEINS) expect(MINING_TRACK.some(point => point.x > vein.left && point.x < vein.right)).toBe(true);
    expect(end.x).toBeGreaterThan(MINING_VEINS.at(-1)!.left);
    expect(end.x).toBeLessThan(TOWN_HILLS.right);
    // Every rock keeps well off it, but those of the outcrop round its end, which only keep off it.
    const last = MINING_OUTCROPS.filter(outcrop => outcrop.vein === MINING_VEINS.length - 1)
      .sort((a, b) => Math.hypot(a.x - end.x, a.y - end.y) - Math.hypot(b.x - end.x, b.y - end.y))[0];
    expect(Math.hypot(last.x - end.x, last.y - end.y)).toBeLessThan(250);
    for (const node of MINING_NODES) {
      const distance = Math.sqrt(miningTrackDistanceSquared(node.x, node.y));
      expect(distance).toBeGreaterThan(last.rocks.includes(node.id) ? MINING_TRACK_HALF_WIDTH + 60 : 200);
    }
  });

  it("hold a few crystal rocks in every vein, laid after the rest so every older rock keeps its id", () => {
    const crystals = MINING_NODES.filter(node => node.kind === "crystal");
    MINING_VEINS.forEach((vein, index) => expect(crystals.filter(node => node.vein === index).length).toBe(vein.crystals));
    const first = MINING_NODES.findIndex(node => node.kind === "crystal");
    expect(MINING_NODES.slice(first).every(node => node.kind === "crystal")).toBe(true);
    expect(crystals.every(node => node.ore === "arcane_crystal")).toBe(true);
    expect(miningNodeName(crystals[0])).toBe("Arcane Crystal");
    // They give crystal, not ore, and a deeper vein's give more.
    expect(miningYield(crystals[0], .5)).toEqual({ arcane_crystal: 1 });
    expect(miningYield(crystals.find(node => node.vein === 3)!, .5)).toEqual({ arcane_crystal: 8 });
    expect(miningYield(crystals[0], .5, { oreFind: 1 }, 0)).toEqual({ arcane_crystal: 2 });
  });

  it("open a crystal rock once Mining reaches its vein's crystal mark", () => {
    const crystal = (vein: number) => MINING_NODES.find(node => node.kind === "crystal" && node.vein === vein)!;
    expect(MINING_VEINS.map((_vein, index) => miningRockNeed(crystal(index)))).toEqual([25, 75, 300, 1_000]);
    expect([canMineRock(crystal(0), 24), canMineRock(crystal(0), 25), canMineRock(crystal(1), 74), canMineRock(crystal(1), 75)]).toEqual([false, true, false, true]);
    expect(miningRockHint(crystal(0))).toBe("Reach Mining 25 to mine Arcane Crystal.");
    expect(miningRockHint(crystal(3))).toBe("Reach Mining 1,000 to mine Arcane Crystal.");
  });

  it("are named by size and ore, and looked up by id", () => {
    const large = MINING_NODES.find(node => node.kind === "large" && node.ore === "iron_ore")!;
    expect(miningNodeName(large)).toBe("Large Iron Ore");
    expect(miningNode(large.id)).toBe(large);
    for (const id of [-1, 1.5, MINING_NODES.length, "3", null]) expect(miningNode(id)).toBeNull();
  });
});

describe("Mining", () => {
  const small = MINING_NODES.find(node => node.kind === "small" && node.ore === "copper_ore")!;
  const large = MINING_NODES.find(node => node.kind === "large" && node.ore === "copper_ore")!;
  const adamant = MINING_NODES.find(node => node.kind === "small" && node.ore === "adamant_ore")!;

  it("makes mining faster, twice as fast at 500 and never three times", () => {
    expect(miningSpeed(0)).toBe(1);
    expect(miningSpeed(500)).toBe(2);
    expect(miningSpeed(1e12)).toBeLessThan(3);
    for (let mining = 0; mining < 5_000; mining += 250) expect(miningSpeed(mining + 250)).toBeGreaterThan(miningSpeed(mining));
    expect([normalizeMining(-5), normalizeMining("12.7"), normalizeMining(NaN)]).toEqual([0, 12, 0]);
  });

  it("times a rock by its kind and vein, and Mining divides the time", () => {
    expect(miningBreakSeconds(small, 0)).toBe(4);
    expect(miningBreakSeconds(large, 0)).toBe(12);
    expect(miningBreakSeconds(adamant, 0)).toBe(32);
    expect(miningBreakSeconds(adamant, 500)).toBe(16);
  });

  it("grows by the ore a rock gives, weighted by how deep its vein is", () => {
    expect([miningGain(small), miningGain(large), miningGain(adamant)]).toEqual([1, 3, 8]);
  });

  it("breaks a rock into its vein's ore, and only a Mysterious rock into a Starshard too", () => {
    const mysterious = MINING_NODES.find(node => node.kind === "mysterious" && node.ore === "mithril_ore")!;
    expect(miningYield(small, 0)).toEqual({ copper_ore: 1 });
    expect(miningYield(large, .5)).toEqual({ copper_ore: 3 });
    expect(MINING_STARSHARD_CHANCE).toBe(1);
    expect(miningYield(mysterious, 0)).toEqual({ mithril_ore: 2, starshard: 1 });
    expect(miningYield(mysterious, .999)).toEqual({ mithril_ore: 2, starshard: 1 });
    expect(MINING_NODE_KINDS.mysterious.respawnSeconds).toBeGreaterThan(MINING_NODE_KINDS.large.respawnSeconds);
  });
});
