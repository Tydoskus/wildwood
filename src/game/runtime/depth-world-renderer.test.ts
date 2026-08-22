import { describe, expect, it } from "vitest";
import { TUTORIAL_FOREST_MAP_ID, type WorldDecor } from "../world";
import { createDepthWorldRenderer } from "./depth-world-renderer";
import type { Camera } from "./camera";
import type { DragonBossState, FrostclawBossState, PlayerState, SpiderBossState } from "./types";

function renderer(decor: WorldDecor[], calls: string[]) {
  return createDepthWorldRenderer({
    camera: { x: 0, y: 0, zoom: 1 } as Camera,
    viewport: () => ({ width: 500, height: 500 }),
    decor,
    enemies: [],
    player: { y: 170 } as PlayerState,
    boss: { dead: true, y: 0 } as DragonBossState,
    spiderBoss: { dead: true, y: 0 } as SpiderBossState,
    frostclawBoss: { dead: true, y: 0 } as FrostclawBossState,
    bootsPickup: { y: 0, r: 0, collected: true },
    currentMapId: () => TUTORIAL_FOREST_MAP_ID,
    activePortal: () => ({ depth: 0 }),
    secondaryPortal: () => null,
    drawTree: (tree) => calls.push(`tree:${tree.y}`),
    drawCactus: (cactus) => calls.push(`cactus:${cactus.y}`),
    drawSnowPine: (tree) => calls.push(`pine:${tree.y}`),
    drawUpgradeBench: (bench) => calls.push(`bench:${bench.y}`),
    drawLavaRock: (rock) => calls.push(`lava-rock:${rock.y}`),
    drawCharredTree: (tree) => calls.push(`charred-tree:${tree.y}`),
    drawEnemy: () => calls.push("enemy"),
    drawBoss: () => calls.push("boss"),
    drawSpiderBoss: () => calls.push("spider"),
    drawFrostclawBoss: () => calls.push("frostclaw"),
    drawBootPickup: () => calls.push("boots"),
    drawPortal: () => calls.push("portal"),
    drawSecondaryPortal: () => calls.push("secondary"),
    drawRemotePlayer: (player) => calls.push(`remote:${player.y}`),
    drawPlayer: () => calls.push("player"),
  });
}

describe("depth world renderer", () => {
  it("merges pre-sorted static decor with dynamic actors", () => {
    const calls: string[] = [];
    const depth = renderer([
      { type: "tree", x: 100, y: 300, s: 1, variant: 0 },
      { type: "cactus", x: 100, y: 100, s: 1, variant: 0 },
      { type: "upgradeBench", x: 100, y: 220, s: 1, label: "Upgrade Bench" },
    ], calls);

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["cactus:100", "player", "bench:220", "tree:300"]);
  });

  it("pre-culls offscreen static decor and remote players", () => {
    const calls: string[] = [];
    const depth = renderer([
      { type: "cactus", x: 2_000, y: 100, s: 1, variant: 0 },
    ], calls);

    depth.drawDepthSortedWorld([{
      id: "remote",
      x: 2_000,
      y: 100,
    } as never], false);

    expect(calls).toEqual(["player"]);
  });

  it("rebuilds static order after invalidation", () => {
    const calls: string[] = [];
    const decor: WorldDecor[] = [{ type: "tree", x: 100, y: 300, s: 1, variant: 0 }];
    const depth = renderer(decor, calls);
    depth.drawDepthSortedWorld([], false);
    calls.length = 0;
    decor.splice(0, 1, { type: "cactus", x: 100, y: 100, s: 1, variant: 0 });
    depth.invalidateDepthOrder();

    depth.drawDepthSortedWorld([], false);

    expect(calls).toEqual(["cactus:100", "player"]);
  });
});
