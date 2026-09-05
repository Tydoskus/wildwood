import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapController, prepareMapTransition } from "./map-controller";
import type { PlayerState } from "./types";
import { createGameBootstrap } from "./game-bootstrap";
import { CRYSTAL_HOLLOWS_MAP_ID, MOONFEN_MAP_ID, type MapId } from "../world";

function portalArrivalHarness(destinationArrival: { x: number; y: number }) {
  const tutorialMapId = "tutorial_forest" as const;
  const desertMapId = "beginner_desert" as const;
  const bootstrap = createGameBootstrap();
  let currentMapId: MapId = tutorialMapId;
  let unlocked = true;
  let serverMap: { mapId: MapId; x: number; y: number; facing: number } | null = null;
  const prepareMapAssets = vi.fn(async () => {});
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
      ...bootstrap.mapConfig,
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
    moonfenMapId: MOONFEN_MAP_ID,
    crystalHollowsMapId: CRYSTAL_HOLLOWS_MAP_ID, clockworkRuinsMapId: CRYSTAL_HOLLOWS_MAP_ID, duskfallOrchardMapId: CRYSTAL_HOLLOWS_MAP_ID,
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
    localMapState: () => serverMap,
    changeMap,
    prepareMapAssets,
    syncStoppedPosition: vi.fn(),
    resetPresentationState: vi.fn(),
    fadeToWorld: (action: () => void) => action(),
    mapUnlocked: () => unlocked,
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
    prismshellCrystalBursts: bootstrap.prismshellCrystalBursts, ironhornCrystalBursts: bootstrap.ironhornCrystalBursts, dreadreaperCrystalBursts: bootstrap.dreadreaperCrystalBursts,
    boss: {} as never,
    spiderBoss: {} as never,
    frostclawBoss: {} as never,
    magmaliskBoss: {} as never,
    gloomrootBoss: {} as never,
    tidewyrmBoss: {} as never,
    koiShogunBoss: {} as never,
    tempestKirinBoss: {} as never,
    miremawBoss: {} as never,
    prismshellBoss: bootstrap.prismshellBoss, ironhornBoss: bootstrap.ironhornBoss, dreadreaperBoss: bootstrap.dreadreaperBoss,
    clearPendingBossHits: vi.fn(),
    onCutsceneFinished: vi.fn(),
  } as unknown as Parameters<typeof createMapController>[0]);
  return {
    changeMap, controller, currentMapId: () => currentMapId, desertMapId, player, markPortalCutsceneSeen,
    bootstrap, prepareMapAssets,
    setUnlocked: (value: boolean) => { unlocked = value; },
    setServerMap: (value: typeof serverMap) => { serverMap = value; },
  };
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
  it("gates the Moonfen exit and supports the actual Crystal Hollows round trip", async () => {
    const harness = portalArrivalHarness({ x: 300, y: 400 });
    const { controller, player, bootstrap, changeMap, prepareMapAssets } = harness;
    controller.loadMap(MOONFEN_MAP_ID, 580, 770);
    harness.setUnlocked(false);
    player.x = 580;
    player.y = 617;
    controller.updatePortal(1 / 60);
    expect(changeMap).not.toHaveBeenCalled();

    harness.setUnlocked(true);
    controller.updatePortal(1 / 60);
    await vi.waitFor(() => expect(harness.currentMapId()).toBe(CRYSTAL_HOLLOWS_MAP_ID));
    expect(changeMap).toHaveBeenLastCalledWith(CRYSTAL_HOLLOWS_MAP_ID, 580, 617);
    expect(prepareMapAssets).toHaveBeenCalledWith(CRYSTAL_HOLLOWS_MAP_ID);
    expect(player).toMatchObject({ x: 580, y: 770 });

    bootstrap.prismshellCrystalBursts.push({ x: 100, y: 100, r: 86, timer: .5, maxTimer: 1 });
    player.x = 360;
    player.y = 617;
    controller.updatePortal(1 / 60);
    await vi.waitFor(() => expect(harness.currentMapId()).toBe(MOONFEN_MAP_ID));
    expect(changeMap).toHaveBeenLastCalledWith(MOONFEN_MAP_ID, 360, 617);
    expect(bootstrap.prismshellCrystalBursts).toHaveLength(0);
    expect(bootstrap.prismshellBoss.shatter).toBeNull();
  });

  it("accepts a restored Crystal Hollows location from the server", async () => {
    const harness = portalArrivalHarness({ x: 300, y: 400 });
    harness.setServerMap({ mapId: CRYSTAL_HOLLOWS_MAP_ID, x: 950, y: 1250, facing: 1 });
    harness.controller.reconcileMapFromServer();
    await vi.waitFor(() => expect(harness.currentMapId()).toBe(CRYSTAL_HOLLOWS_MAP_ID));
    expect(harness.player).toMatchObject({ x: 950, y: 1250, facing: 1 });
    expect(harness.prepareMapAssets).toHaveBeenCalledWith(CRYSTAL_HOLLOWS_MAP_ID);
  });

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


describe("reset map presentation", () => {
  it("does not let an old server-map asset load overwrite the reset tutorial", async () => {
    const h = portalArrivalHarness({ x: 300, y: 400 });
    let finishAssets!: () => void;
    h.prepareMapAssets.mockImplementationOnce(() => new Promise<void>(done => { finishAssets = done; }));
    h.setServerMap({ mapId: CRYSTAL_HOLLOWS_MAP_ID, x: 950, y: 1250, facing: 1 });
    h.controller.reconcileMapFromServer();
    expect(h.controller.isMapTransitioning()).toBe(true);
    h.controller.loadMap("tutorial_forest", 500, 500);
    finishAssets();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(h.currentMapId()).toBe("tutorial_forest");
    expect(h.player).toMatchObject({ x: 500, y: 500 });
    expect(h.controller.isMapTransitioning()).toBe(false);
  });
});
