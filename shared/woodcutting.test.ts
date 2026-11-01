import { describe, expect, it, vi } from "vitest";
import {
  GROVE_ROAD, GROVE_ROAD_END, GROVE_ROAD_GATE, GROVE_ROAD_START, GROVE_ROAD_HALF_WIDTH, WOOD_STAND_BLEND, WOOD_STANDS, WOOD_TREE_KINDS, WOOD_TREE_NODES, WOOD_TREES, WOODCUTTING_LOGS,
  WOODCUTTING_REACH, groveRoadDistanceSquared, normalizeWoodcutting, woodcuttingChopSeconds, woodcuttingGain, woodcuttingSpeed, woodcuttingYield,
  canChopStand, canChopTree, woodStandHint, woodTree,
} from "./woodcutting";
import { MINING_VEINS } from "./mining";
import { WOOD_IDS, craftMaterials } from "./crafting";
import {
  TOWN_CENTER, TOWN_GROVE, TOWN_HILLS, TOWN_VILLAGE_BOUNDS, TOWN_VILLAGE_WALK_AREA, TOWN_WALK_AREAS, TOWN_WALK_MARGIN, TOWN_WEST_BRIDGE, inTownWalkArea, townChunkProps,
  townWalkClamp, TOWN_CHUNK_SIZE, inTownGrove,
} from "./town";

describe("Timberwood's stands", () => {
  it("run east to west from pine to elder, edge to edge across the grove, west of the village", () => {
    expect(WOOD_STANDS.map(stand => stand.kind)).toEqual([...WOOD_TREE_KINDS]);
    expect(WOOD_STANDS.map(stand => stand.log)).toEqual([...WOOD_IDS]);
    expect(WOOD_STANDS[0].right).toBe(TOWN_GROVE.right);
    expect(WOOD_STANDS.at(-1)!.left).toBe(TOWN_GROVE.left);
    WOOD_STANDS.slice(1).forEach((stand, index) => expect(stand.right).toBe(WOOD_STANDS[index].left));
    expect(WOOD_STANDS.map(stand => stand.hardness)).toEqual([1, 2, 4, 8]);
    // Left of the village on the map, level with it, inside the world; nowhere near the Copper Hills.
    expect(TOWN_GROVE.right).toBeLessThan(TOWN_CENTER.x + TOWN_VILLAGE_BOUNDS.left);
    expect(TOWN_GROVE.top).toBeGreaterThan(TOWN_VILLAGE_WALK_AREA.top);
    expect(TOWN_GROVE.bottom).toBeLessThan(TOWN_VILLAGE_WALK_AREA.bottom);
    expect(TOWN_GROVE.left - TOWN_WALK_MARGIN).toBeGreaterThan(0);
    expect(TOWN_GROVE.right).toBeLessThan(TOWN_HILLS.left - 5_000);
    expect(WOOD_TREES.oak.name).toBe("Oak Tree");
  });

  it("open by Woodcutting alone, at the same marks as the ore veins' Mining", () => {
    expect(WOOD_STANDS.map(stand => stand.firstTier)).toEqual(MINING_VEINS.map(vein => vein.firstTier));
    expect(WOOD_STANDS.map(stand => stand.woodcutting)).toEqual(MINING_VEINS.map(vein => vein.mining));
    const [pine, oak, yew, elder] = WOOD_STANDS;
    expect([canChopStand(pine, 0), canChopStand(oak, 49), canChopStand(oak, 50), canChopStand(yew, 249), canChopStand(elder, 900)]).toEqual([true, false, true, false, true]);
    const tree = (stand: number) => WOOD_TREE_NODES.find(node => node.stand === stand)!;
    expect([canChopTree(tree(0), 0), canChopTree(tree(1), 0), canChopTree(tree(1), 50)]).toEqual([true, false, true]);
    expect(woodStandHint(oak)).toBe("Reach Woodcutting 50 to chop Oak Trees.");
    expect(woodStandHint(elder)).toBe("Reach Woodcutting 900 to chop Elder Trees.");
    // Each stand's wood is the wood its grade's crafts take.
    expect(Object.keys(craftMaterials("superior", "bow"))).toContain(oak.log);
  });
});

describe("the trees", () => {
  it("are laid the same every time, in their stand's band inside the grove (straying a little past it), the deeper the fewer", async () => {
    WOOD_TREE_NODES.forEach((tree, index) => {
      expect(tree.id).toBe(index);
      const stand = WOOD_STANDS[tree.stand];
      expect([tree.kind, tree.log]).toEqual([stand.kind, stand.log]);
      expect(tree.x).toBeGreaterThan(stand.left - WOOD_STAND_BLEND);
      expect(tree.x).toBeLessThan(stand.right + WOOD_STAND_BLEND);
      expect(inTownGrove(tree.x, tree.y)).toBe(true);
    });
    // By stand, then north to south.
    for (let index = 1; index < WOOD_TREE_NODES.length; index++) {
      const a = WOOD_TREE_NODES[index - 1], b = WOOD_TREE_NODES[index];
      expect(a.stand < b.stand || (a.stand === b.stand && (a.y < b.y || (a.y === b.y && a.x < b.x)))).toBe(true);
    }
    expect(WOOD_STANDS.map((_stand, index) => WOOD_TREE_NODES.filter(tree => tree.stand === index).length)).toEqual(WOOD_STANDS.map(stand => stand.trees));
    vi.resetModules();
    const fresh = await import("./woodcutting");
    expect(fresh.WOOD_TREE_NODES).not.toBe(WOOD_TREE_NODES);
    expect(fresh.WOOD_TREE_NODES).toEqual(WOOD_TREE_NODES);
  });

  it("keep apart: no spot is in reach of two", () => {
    for (const a of WOOD_TREE_NODES) for (const b of WOOD_TREE_NODES) {
      if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * WOODCUTTING_REACH + 30);
    }
  });

  it("are looked up by id", () => {
    expect(woodTree(3)).toBe(WOOD_TREE_NODES[3]);
    for (const id of [-1, 1.5, WOOD_TREE_NODES.length, "3", null]) expect(woodTree(id)).toBeNull();
  });
});

describe("the woodcutters' road", () => {
  it("leaves the village over its west bridge, comes into the grove at its east edge and winds through the pines and oaks to the yews, the trees well off it", () => {
    expect(GROVE_ROAD[0]).toEqual(GROVE_ROAD_START);
    // It starts on the bridge's deck, so its earth runs on from under the deck's west end.
    expect(GROVE_ROAD_START.y).toBe(TOWN_WEST_BRIDGE.y);
    expect(Math.abs(GROVE_ROAD_START.x - TOWN_WEST_BRIDGE.x)).toBeLessThan(154 - GROVE_ROAD_HALF_WIDTH);
    expect(GROVE_ROAD_START.x).toBeLessThan(TOWN_WEST_BRIDGE.x);
    expect(GROVE_ROAD).toContainEqual(GROVE_ROAD_GATE);
    expect(GROVE_ROAD.at(-1)).toEqual(GROVE_ROAD_END);
    expect(inTownGrove(GROVE_ROAD_GATE.x, GROVE_ROAD_GATE.y)).toBe(true);
    expect(GROVE_ROAD_GATE.x).toBeGreaterThan(WOOD_TREES.pine.right - 200);
    expect(GROVE_ROAD_END.x).toBeLessThan(WOOD_TREES.oak.left + WOOD_STAND_BLEND);
    expect(GROVE_ROAD_END.x).toBeGreaterThan(WOOD_TREES.yew.left);
    // West all the way, never doubling back.
    for (let index = 1; index < GROVE_ROAD.length; index++) expect(GROVE_ROAD[index].x).toBeLessThanOrEqual(GROVE_ROAD[index - 1].x);
    // Smooth: no step of it turns sharply.
    for (let index = 2; index < GROVE_ROAD.length; index++) {
      const [a, b, c] = [GROVE_ROAD[index - 2], GROVE_ROAD[index - 1], GROVE_ROAD[index]];
      const turn = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
      expect(Math.min(turn, Math.PI * 2 - turn)).toBeLessThan(.6);
    }
    for (const tree of WOOD_TREE_NODES) expect(Math.sqrt(groveRoadDistanceSquared(tree.x, tree.y))).toBeGreaterThan(GROVE_ROAD_HALF_WIDTH + 120);
    // Every step of it is inside the walls.
    for (const point of GROVE_ROAD) expect(inTownWalkArea(point.x, point.y)).toBe(true);
  });
});

describe("the walls round the Town", () => {
  it("open all nine cells of the grid, Timberwood's included, and wall only round its outside", () => {
    expect(TOWN_WALK_AREAS).toHaveLength(1);
    const [walls] = TOWN_WALK_AREAS;
    expect(walls.left).toBeLessThan(TOWN_GROVE.left);
    expect(walls.top).toBeLessThan(TOWN_GROVE.top);
    expect(walls.bottom).toBeGreaterThan(TOWN_GROVE.bottom);
    for (const tree of WOOD_TREE_NODES) expect(inTownWalkArea(tree.x, tree.y + 44)).toBe(true);
    // North of the village and of the Copper Hills, and the grid's corners, are open countryside.
    expect(inTownWalkArea(TOWN_VILLAGE_WALK_AREA.left + 100, TOWN_VILLAGE_WALK_AREA.top - 100)).toBe(true);
    expect(inTownWalkArea(TOWN_HILLS.left + 1_000, TOWN_HILLS.top - 600)).toBe(true);
    expect(inTownWalkArea(TOWN_GROVE.left, walls.top + 10)).toBe(true);
    expect(inTownWalkArea(TOWN_HILLS.right, walls.bottom - 10)).toBe(true);
    // Past the outside, feet are held at the wall.
    expect(townWalkClamp(TOWN_GROVE.left + 10, walls.top - 500)).toEqual({ x: TOWN_GROVE.left + 10, y: walls.top });
    expect(townWalkClamp(walls.left - 1_000, TOWN_GROVE.top + 10)).toEqual({ x: walls.left, y: TOWN_GROVE.top + 10 });
  });

  it("keep the countryside's own props out of the grove", () => {
    for (let cx = Math.floor(TOWN_GROVE.left / TOWN_CHUNK_SIZE); cx <= Math.floor(TOWN_GROVE.right / TOWN_CHUNK_SIZE); cx++) {
      for (let cy = Math.floor(TOWN_GROVE.top / TOWN_CHUNK_SIZE); cy <= Math.floor(TOWN_GROVE.bottom / TOWN_CHUNK_SIZE); cy++) {
        expect(townChunkProps(cx, cy).filter(prop => inTownGrove(prop.x, prop.y))).toEqual([]);
      }
    }
  });
});

describe("Woodcutting", () => {
  const pine = WOOD_TREE_NODES.find(tree => tree.kind === "pine")!, elder = WOOD_TREE_NODES.find(tree => tree.kind === "elder")!;

  it("makes chopping faster as Mining makes mining faster", () => {
    expect([woodcuttingSpeed(0), woodcuttingSpeed(500)]).toEqual([1, 2]);
    expect(woodcuttingSpeed(1e12)).toBeLessThan(3);
    expect([normalizeWoodcutting(-5), normalizeWoodcutting("12.7"), normalizeWoodcutting(NaN)]).toEqual([0, 12, 0]);
    expect(woodcuttingChopSeconds(pine, 0)).toBe(8);
    expect(woodcuttingChopSeconds(elder, 0)).toBe(64);
    expect(woodcuttingChopSeconds(elder, 500)).toBe(32);
  });

  it("fells a tree into its stand's logs, and grows by them weighted by how deep the stand is", () => {
    expect(woodcuttingYield(pine)).toEqual({ pine_log: WOODCUTTING_LOGS });
    expect(woodcuttingYield(elder)).toEqual({ elder_log: WOODCUTTING_LOGS });
    expect([woodcuttingGain(pine), woodcuttingGain(elder)]).toEqual([WOODCUTTING_LOGS, WOODCUTTING_LOGS * 8]);
  });
});
