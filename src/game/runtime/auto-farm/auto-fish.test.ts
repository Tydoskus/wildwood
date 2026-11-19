import { describe, expect, it } from "vitest";
import { FISHING_SPOTS } from "../../../../shared/fishing";
import { TOWN_ARRIVAL, TOWN_FEET_OFFSET, TOWN_MAP_ID } from "../../../../shared/town";
import { createAutoFish, fishingStandSpot, inFishingArea } from "./auto-fish";
import { fishingScene } from "../town/fishing-scene";
import type { PlayerState } from "../types";

function makePlayer(x: number, y: number): PlayerState {
  return { x, y, hp: 100, maxHp: 100, facing: 0, moving: false } as unknown as PlayerState;
}

describe("Auto Fish area handling across moving spots", () => {
  it("stays active and keeps here() true when walking away from a spot across Town to the next spot", () => {
    const startSite = FISHING_SPOTS[0].sites[0];
    const startBank = fishingStandSpot(startSite)!;
    const player = makePlayer(startBank.x, startBank.y - TOWN_FEET_OFFSET);
    fishingScene.rodOut = false;
    fishingScene.spots = FISHING_SPOTS.map((spot, index) => ({ spot: index, site: 0, ...spot.sites[0] }));

    const storageMap = new Map<string, string>();
    const storage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => { storageMap.set(k, v); },
      removeItem: (k: string) => { storageMap.delete(k); },
    };

    const fish = createAutoFish({
      player,
      mapId: () => TOWN_MAP_ID,
      source: () => ({ serverNowMs: () => 0 }),
      storage: () => storage,
      resumeStorage: () => storage,
      plan: (_from, to) => [to],
    });

    expect(fish.here()).toBe(true);
    expect(fish.start()).toBe(true);

    // Move the player to the Town plaza well outside the 260px bank radius (simulating transit between spots).
    player.x = TOWN_ARRIVAL.x;
    player.y = TOWN_ARRIVAL.y;
    expect(inFishingArea(player.x, player.y)).toBe(false);

    // While active, Auto Fish stays running, keeps steering, and keeps the HUD button visible.
    const move = fish.movement({ x: 0, y: 0, source: "none" }, 0.05);
    expect(fish.state().active).toBe(true);
    expect(fish.here()).toBe(true);
    expect(move?.source).toBe("steer");

    // Once stopped far from any bank, the button hides again.
    fish.stop();
    expect(fish.here()).toBe(false);
  });
});
