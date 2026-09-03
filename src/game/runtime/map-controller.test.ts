import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapController, prepareMapTransition } from "./map-controller";
import type { PlayerState } from "./types";

function portalArrivalHarness(destinationArrival: { x: number; y: number }) {
  const tutorialMapId = "tutorial_forest" as const;
  const desertMapId = "beginner_desert" as const;
  let currentMapId = tutorialMapId as typeof tutorialMapId | typeof desertMapId;
  const player: PlayerState = {
    x: 100, y: 68, r: 17, speed: 180, hp: 100, baseMaxHp: 100, maxHp: 100,
    damage: 4, attackRate: 1, projectileSpeed: 1_000, projectileCount: 1,
    attackRange: 200, knockback: 0, armor: 0, regen: 0, attackClock: 0,
    throwClock: 0, hurtClock: 0, facing: 0, combatFacing: null, moving: false,
  };
  const changeMap = vi.fn(async () => true);
  const markPortalCutsceneSeen = vi.fn();
  const controller = createMapController({
    mapConfig: {
      [tutorialMapId]: {
        portal: { x: 100, y: 100, width: 100, height: 100, depth: 100, destination: desertMapId },
        arrival: { x: 100, y: 168 },
      },
      [desertMapId]: {
        portal: { x: 300, y: 300, width: 100, height: 100, depth: 300, destination: tutorialMapId },
        arrival: destinationArrival,
      },
    },
    tutorialMapId,
    desertMapId,
    snowMapId: desertMapId,
    lavaMapId: desertMapId,
    infernalMapId: desertMapId,
    waterMapId: desertMapId,
    samuraiMapId: desertMapId,
    cloudspireMapId: desertMapId,
    moonfenMapId: desertMapId,
    dragonCutsceneSeenKey: "dragon",
    snowlandsCutsceneSeenKey: "snow",
    lavaCutsceneSeenKey: "lava",
    infernalCutsceneSeenKey: "infernal",
    waterCutsceneSeenKey: "water",
    samuraiCutsceneSeenKey: "samurai",
    markPortalCutsceneSeen,
    getCurrentMapId: () => currentMapId,
    setCurrentMapId: (mapId: typeof currentMapId) => { currentMapId = mapId; },
    player,
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: () => ({ width: 800, height: 600 }),
    keys: { clear: vi.fn() },
    stopTouchMove: vi.fn(),
    cutsceneOverlay: { hidden: true } as HTMLElement,
    resizeViewport: vi.fn(),
    isDueling: () => false,
    running: () => true,
    localMapState: () => null,
    changeMap,
    prepareMapAssets: async () => {},
    syncStoppedPosition: vi.fn(),
    resetPresentationState: vi.fn(),
    fadeToWorld: (action: () => void) => action(),
    mapUnlocked: () => true,
    syncMapMusic: vi.fn(),
    rebuildWorld: vi.fn(),
    spawnFromSite: vi.fn(),
    enemies: [],
    spawnSites: [],
    clearTransientCombat: vi.fn(),
    bossRain: [],
    spiderVenom: [],
    frostclawIcefalls: [],
    magmaliskEruptions: [],
    gloomrootBlooms: [],
    tidewyrmWhirlpools: [],
    koiShogunWhirlpools: [],
    tempestKirinThunderbolts: [],
    miremawBogBursts: [],
    boss: {} as never,
    spiderBoss: {} as never,
    frostclawBoss: {} as never,
    magmaliskBoss: {} as never,
    gloomrootBoss: {} as never,
    tidewyrmBoss: {} as never,
    koiShogunBoss: {} as never,
    tempestKirinBoss: {} as never,
    miremawBoss: {} as never,
    clearPendingBossHits: vi.fn(),
    onCutsceneFinished: vi.fn(),
  } as unknown as Parameters<typeof createMapController>[0]);
  return { changeMap, controller, currentMapId: () => currentMapId, desertMapId, player, markPortalCutsceneSeen };
}

afterEach(() => vi.unstubAllGlobals());

describe("cutscene completion", () => {
  it.each([false, true])("persists normal completion but not developer previews: preview=%s", (preview) => {
    vi.stubGlobal("document", { body: { classList: { add: vi.fn(), remove: vi.fn() } } });
    const { controller, markPortalCutsceneSeen } = portalArrivalHarness({ x: 300, y: 400 });
    controller.startDragonPortalCutscene(preview);
    expect(markPortalCutsceneSeen).not.toHaveBeenCalled();
    controller.updatePortalCutscene(20);
    if (preview) expect(markPortalCutsceneSeen).not.toHaveBeenCalled();
    else expect(markPortalCutsceneSeen).toHaveBeenCalledExactlyOnceWith("dragon");
  });
});

describe("portal arrival activation", () => {
  it("is active immediately after arriving outside the destination trigger", async () => {
    const { changeMap, controller, currentMapId, desertMapId, player } = portalArrivalHarness({ x: 300, y: 400 });
    controller.updatePortal(1 / 60);
    await vi.waitFor(() => expect(currentMapId()).toBe(desertMapId));

    player.x = 300;
    player.y = 268;
    controller.updatePortal(1 / 60);
    await vi.waitFor(() => expect(changeMap).toHaveBeenCalledTimes(2));
  });

  it("requires exiting first only when an arrival is inside a portal trigger", async () => {
    const { changeMap, controller, currentMapId, desertMapId, player } = portalArrivalHarness({ x: 300, y: 268 });
    controller.updatePortal(1 / 60);
    await vi.waitFor(() => expect(currentMapId()).toBe(desertMapId));

    controller.updatePortal(1 / 60);
    expect(changeMap).toHaveBeenCalledTimes(1);
    player.y = 400;
    controller.updatePortal(1 / 60);
    player.y = 268;
    controller.updatePortal(1 / 60);
    await vi.waitFor(() => expect(changeMap).toHaveBeenCalledTimes(2));
  });
});

describe("map asset transition gate", () => {
  it("starts destination art beside the server move and waits for it before arrival", async () => {
    let finishAssets!: () => void;
    const assetsReady = new Promise<void>((resolve) => { finishAssets = resolve; });
    const events: string[] = [];
    const transition = prepareMapTransition(
      async () => { events.push("server"); return true; },
      () => { events.push("assets"); return assetsReady; },
    );
    let arrived = false;
    void transition.then(() => { arrived = true; });

    await Promise.resolve();
    expect(events).toEqual(["assets", "server"]);
    expect(arrived).toBe(false);

    finishAssets();
    await expect(transition).resolves.toBe(true);
  });

  it("does not hold a rejected server move open for destination art", async () => {
    const neverReady = new Promise<void>(() => {});
    await expect(prepareMapTransition(
      () => false,
      vi.fn(() => neverReady),
    )).resolves.toBe(false);
  });
});
