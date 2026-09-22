import { afterEach, describe, expect, it, vi } from "vitest";
import { drawHomeTeleport, endHomeTeleport } from "./home-teleport";
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
  const onTravelStarted = vi.fn();
  const controller = createMapController({
    onTravelStarted,
    mapConfig: {
      ...bootstrap.mapConfig,
      endless_40: bootstrap.mapConfig.endless_40,
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
    prismshellCrystalBursts: bootstrap.prismshellCrystalBursts, ironhornCrystalBursts: bootstrap.ironhornCrystalBursts, dreadreaperCrystalBursts: bootstrap.dreadreaperCrystalBursts, voltwardenCrystalBursts: bootstrap.voltwardenCrystalBursts, gravebloomCrystalBursts: bootstrap.gravebloomCrystalBursts, aegisPrimeCrystalBursts: bootstrap.aegisPrimeCrystalBursts,
    boss: {} as never,
    spiderBoss: {} as never,
    frostclawBoss: {} as never,
    magmaliskBoss: {} as never,
    gloomrootBoss: {} as never,
    tidewyrmBoss: {} as never,
    koiShogunBoss: {} as never,
    tempestKirinBoss: {} as never,
    miremawBoss: {} as never,
    prismshellBoss: bootstrap.prismshellBoss, ironhornBoss: bootstrap.ironhornBoss, dreadreaperBoss: bootstrap.dreadreaperBoss, voltwardenBoss: bootstrap.voltwardenBoss, gravebloomBoss: bootstrap.gravebloomBoss, aegisPrimeBoss: bootstrap.aegisPrimeBoss,
    clearPendingBossHits: vi.fn(),
    onCutsceneFinished: vi.fn(),
  } as unknown as Parameters<typeof createMapController>[0]);
  return {
    onTravelStarted, changeMap, controller, currentMapId: () => currentMapId, desertMapId, player, markPortalCutsceneSeen,
    bootstrap, prepareMapAssets,
    setMap: (value: MapId) => { currentMapId = value; },
    setUnlocked: (value: boolean) => { unlocked = value; },
    setServerMap: (value: typeof serverMap) => { serverMap = value; },
  };
}

afterEach(() => { vi.unstubAllGlobals(); endHomeTeleport(); vi.useRealTimers(); });

describe("developer direct travel", () => {
  it("teleports within the same map using the confirmed position even while the local table is stale", async () => {
    vi.useFakeTimers();
    const f = portalArrivalHarness({ x: 300, y: 400 });
    f.setServerMap({ mapId: "tutorial_forest", x: 100, y: 100, facing: 0 });
    const request = vi.fn(async () => ({ mapId: "tutorial_forest", x: 1800, y: 1900, facing: 1 }));
    const pending = f.controller.teleportToMap("tutorial_forest", request);
    await vi.advanceTimersByTimeAsync(650);
    expect(await pending).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(f.player).toMatchObject({ x: 1800, y: 1900, facing: 1 });
  });

  it("waits for server arrival and lazy art before switching to Endless 40", async () => {
    vi.useFakeTimers();
    const f = portalArrivalHarness({ x: 300, y: 400 });
    let finishAssets!: () => void;
    f.prepareMapAssets.mockImplementationOnce(() => new Promise<void>(resolve => { finishAssets = resolve; }));
    const request = vi.fn(async () => true);
    const pending = f.controller.teleportToMap("endless_40", request);
    await vi.advanceTimersByTimeAsync(650);
    expect(request).toHaveBeenCalledOnce();
    expect(f.currentMapId()).toBe("tutorial_forest");
    f.setServerMap({ mapId: "endless_40", x: 580, y: 770, facing: 1 });
    await vi.advanceTimersByTimeAsync(25);
    expect(f.prepareMapAssets).toHaveBeenCalledWith("endless_40");
    expect(f.currentMapId()).toBe("tutorial_forest");
    finishAssets();
    expect(await pending).toBe(true);
    expect(f.currentMapId()).toBe("endless_40");
    expect(f.player).toMatchObject({ x: 580, y: 770, facing: 1 });
    expect(f.controller.isMapTransitioning()).toBe(false);
  });
  it("releases the transition when permission is denied", async () => {
    vi.useFakeTimers();
    const f = portalArrivalHarness({ x: 300, y: 400 });
    const pending = f.controller.teleportToMap("endless_40", async () => false);
    await vi.advanceTimersByTimeAsync(650);
    expect(await pending).toBe(false);
    expect(f.controller.isMapTransitioning()).toBe(false);
    expect(f.currentMapId()).toBe("tutorial_forest");
  });
});

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
  it("handles asset failure even when the server rejects the move", async () => {
    await expect(prepareMapTransition(() => false, () => Promise.reject(new Error("missing art")))).resolves.toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
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

describe("Home teleport", () => {
  it("has no portal in Home, so walking the courtyard never travels", () => {
    const h = portalArrivalHarness({ x: 300, y: 400 });
    h.controller.loadMap("home_exterior", 500, 700);
    expect(h.controller.activePortal()).toBeNull();
    h.controller.resolvePortalCollision();
    h.controller.updatePortal(1);
    expect(h.player).toMatchObject({ x: 500, y: 700 });
    expect(h.changeMap).not.toHaveBeenCalled();
  });
  afterEach(() => vi.useRealTimers());
  it("locks departure, waits for server state, and restores the server return point", async () => {
    vi.useFakeTimers();
    const h = portalArrivalHarness({ x: 300, y: 400 });
    h.player.x = 1234; h.player.y = 2345;
    h.changeMap.mockImplementationOnce(async () => {
      h.setServerMap({ mapId: "home_exterior", x: 500, y: 700, facing: 0 });
      return true;
    });
    const travel = h.controller.teleportHome();
    expect(h.onTravelStarted).toHaveBeenCalledOnce();
    expect(h.controller.isMapTransitioning()).toBe(true);
    expect(await h.controller.teleportHome()).toBe(false);
    expect(h.changeMap).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(650);
    expect(await travel).toBe(true);
    expect(h.currentMapId()).toBe("home_exterior");
    expect(h.changeMap).toHaveBeenCalledWith("home_exterior", 1234, 2345);
    h.player.x = 380; h.player.y = 414;
    h.changeMap.mockImplementationOnce(async () => {
      h.setServerMap({ mapId: "tutorial_forest", x: 1234, y: 2345, facing: Math.PI });
      return true;
    });
    const back = h.controller.teleportHome();
    await vi.advanceTimersByTimeAsync(650);
    expect(await back).toBe(true);
    expect(h.player).toMatchObject({ x: 1234, y: 2345, facing: Math.PI });
    expect(h.controller.isMapTransitioning()).toBe(false);
  });
  it("keeps the player in place and unlocks input when travel fails", async () => {
    vi.useFakeTimers();
    const h = portalArrivalHarness({ x: 300, y: 400 });
    h.changeMap.mockResolvedValueOnce(false);
    const travel = h.controller.teleportHome();
    await vi.advanceTimersByTimeAsync(650);
    expect(await travel).toBe(false);
    expect(h.currentMapId()).toBe("tutorial_forest");
    expect(h.player).toMatchObject({ x: 100, y: 68 });
    expect(h.controller.isMapTransitioning()).toBe(false);
  });
});


it("requires leaving a failed portal before attempting it again", async () => {
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.changeMap.mockResolvedValue(false);
  h.controller.updatePortal(.016);
  await vi.waitFor(() => expect(h.controller.isMapTransitioning()).toBe(false));
  expect(h.changeMap).toHaveBeenCalledTimes(1);
  for (let frame = 0; frame < 10; frame++) h.controller.updatePortal(1);
  expect(h.changeMap).toHaveBeenCalledTimes(1);
  h.player.x = 500;
  h.controller.updatePortal(1);
  h.player.x = 100;
  h.controller.updatePortal(1);
  await vi.waitFor(() => expect(h.changeMap).toHaveBeenCalledTimes(2));
});

function expectPlayerVisible() {
  const draw = vi.fn();
  drawHomeTeleport({} as CanvasRenderingContext2D, 0, 0, draw);
  expect(draw).toHaveBeenCalledOnce();
}

it.each(["reducer", "state", "assets"])("bounds a stalled home %s and ignores late completion", async stage => {
  vi.useFakeTimers();
  const h = portalArrivalHarness({ x: 300, y: 400 });
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  if (stage === "reducer") h.changeMap.mockImplementationOnce(async () => { await pending; return true; });
  if (stage !== "state") h.setServerMap({ mapId: "home_exterior", x: 500, y: 700, facing: 0 });
  if (stage === "assets") h.prepareMapAssets.mockImplementationOnce(() => pending);
  const travel = h.controller.teleportHome();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await travel).toBe(false);
  expect(h.controller.isMapTransitioning()).toBe(false);
  expectPlayerVisible();
  h.controller.loadMap("beginner_desert", 600, 900);
  finish();
  await vi.advanceTimersByTimeAsync(50);
  expect(h.currentMapId()).toBe("beginner_desert");
  expect(h.player).toMatchObject({ x: 600, y: 900 });
  expectPlayerVisible();
});

it("clears departure on reset and prevents stale cleanup unlocking a new teleport", async () => {
  vi.useFakeTimers();
  const h = portalArrivalHarness({ x: 300, y: 400 });
  let finish!: (changed: boolean) => void;
  h.changeMap.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const old = h.controller.teleportHome();
  await vi.advanceTimersByTimeAsync(700);
  h.controller.loadMap("tutorial_forest", 500, 500);
  expectPlayerVisible();
  h.changeMap.mockResolvedValueOnce(false);
  const next = h.controller.teleportHome();
  finish(false);
  expect(await old).toBe(false);
  expect(h.controller.isMapTransitioning()).toBe(true);
  await vi.advanceTimersByTimeAsync(650);
  expect(await next).toBe(false);
  expect(h.controller.isMapTransitioning()).toBe(false);
  expectPlayerVisible();
});

it.each(["reducer", "assets"])("restores visibility after rejected home %s", async stage => {
  vi.useFakeTimers();
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.setServerMap({ mapId: "home_exterior", x: 500, y: 700, facing: 0 });
  if (stage === "reducer") h.changeMap.mockRejectedValueOnce(new Error("Disconnected"));
  else h.prepareMapAssets.mockRejectedValueOnce(new Error("Asset failed"));
  const travel = h.controller.teleportHome();
  await vi.advanceTimersByTimeAsync(650);
  expect(await travel).toBe(false);
  expect(h.controller.isMapTransitioning()).toBe(false);
  expectPlayerVisible();
});

it("rejects an arrival replaced during asset loading", async () => {
  vi.useFakeTimers();
  const h = portalArrivalHarness({ x: 300, y: 400 });
  let finish!: () => void;
  h.setServerMap({ mapId: "home_exterior", x: 500, y: 700, facing: 0 });
  h.prepareMapAssets.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const travel = h.controller.teleportHome();
  await vi.advanceTimersByTimeAsync(650);
  h.setServerMap({ mapId: "beginner_desert", x: 800, y: 900, facing: 1 });
  finish();
  expect(await travel).toBe(false);
  expectPlayerVisible();
  h.controller.reconcileMapFromServer();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.currentMapId()).toBe("beginner_desert");
  expect(h.player).toMatchObject({ x: 800, y: 900 });
});

it.each(["reject", "stall"])("allows reconciliation to retry after assets %s", async mode => {
  vi.useFakeTimers();
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.setServerMap({ mapId: "home_exterior", x: 500, y: 700, facing: 0 });
  if (mode === "reject") h.prepareMapAssets.mockRejectedValueOnce(new Error("Asset failed"));
  else h.prepareMapAssets.mockImplementationOnce(() => new Promise<void>(() => {}));
  h.controller.reconcileMapFromServer();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(h.controller.isMapTransitioning()).toBe(false);
  h.controller.reconcileMapFromServer();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.currentMapId()).toBe("home_exterior");
  expectPlayerVisible();
});

it("bounds portal waits even when the map reducer never acknowledges", async () => {
  vi.useFakeTimers();
  try {
    const pending = prepareMapTransition(() => new Promise<boolean>(() => {}), async () => {});
    const result = expect(pending).rejects.toThrow("Map transition timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
  } finally { vi.useRealTimers(); }
});

it("reveals the next Endless portal without submitting an unsupported campaign cutscene key", () => {
  vi.stubGlobal("document", { body: { classList: { add: vi.fn(), remove: vi.fn() } } });
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.setMap("endless_40");
  expect(h.controller.startProceduralPortalCutscene()).toBe(true);
  expect(h.controller.cutscenePortal().destination).toBe("endless_41");
  expect(h.prepareMapAssets).toHaveBeenCalledWith("endless_41");
  expect(h.controller.startProceduralPortalCutscene()).toBe(false);
  h.controller.updatePortalCutscene(20);
  expect(h.controller.isCutsceneActive()).toBe(false);
  expect(h.markPortalCutsceneSeen).not.toHaveBeenCalled();
});


it.each(["samurai_garden", "ion_citadel", "endless_40"] as const)("queues %s's first portal reveal until the server confirms the unlock and the player is alive", mapId => {
  vi.stubGlobal("document", { body: { classList: { add: vi.fn(), remove: vi.fn() } } });
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.setMap(mapId);
  h.setUnlocked(false);
  h.controller.queuePortalReveal(mapId);
  h.controller.updatePortal(.1);
  expect(h.controller.isCutsceneActive()).toBe(false);
  h.setUnlocked(true);
  h.player.hp = 0;
  h.controller.updatePortal(.1);
  expect(h.controller.isCutsceneActive()).toBe(false);
  h.player.hp = 100;
  h.controller.updatePortal(.1);
  expect(h.controller.isCutsceneActive()).toBe(true);
  expect(h.controller.cutscenePortal().destination).toBe(h.bootstrap.mapConfig[mapId].secondaryPortal!.destination);
  expect(h.changeMap).not.toHaveBeenCalled();
  h.controller.updatePortalCutscene(20);
  h.controller.queuePortalReveal(mapId);
  h.controller.updatePortal(.1);
  expect(h.controller.isCutsceneActive()).toBe(false);
  expect(h.markPortalCutsceneSeen).not.toHaveBeenCalled();
});

it("discards a queued reveal when the player leaves its map", () => {
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.setMap("endless_40"); h.setUnlocked(false);
  h.controller.queuePortalReveal("endless_40");
  h.setMap("home_exterior"); h.setUnlocked(true);
  h.controller.updatePortal(.1);
  h.setMap("endless_40"); h.controller.updatePortal(.1);
  expect(h.controller.isCutsceneActive()).toBe(false);
});

it("waits for the authoritative unlock before showing a dragon portal cinematic", () => {
  vi.stubGlobal("document", { body: { classList: { add: vi.fn(), remove: vi.fn() } } });
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.setUnlocked(false);
  h.controller.startDragonPortalCutscene();
  expect(h.controller.isCutsceneActive()).toBe(false);
  expect(h.prepareMapAssets).not.toHaveBeenCalled();
  expect(h.markPortalCutsceneSeen).not.toHaveBeenCalled();
  h.setUnlocked(true);
  h.controller.startDragonPortalCutscene();
  expect(h.controller.isCutsceneActive()).toBe(true);
});

it("notifies intentional portal travel, but not a reconnect's map hydration", async () => {
  const h = portalArrivalHarness({ x: 300, y: 400 });
  h.controller.updatePortal(1 / 60);
  expect(h.onTravelStarted).toHaveBeenCalledOnce();
  await Promise.resolve(); await Promise.resolve();
  const reconnect = portalArrivalHarness({ x: 300, y: 400 });
  reconnect.setServerMap({ mapId: "beginner_desert", x: 300, y: 400, facing: 0 });
  reconnect.controller.reconcileMapFromServer();
  await Promise.resolve(); await Promise.resolve();
  expect(reconnect.onTravelStarted).not.toHaveBeenCalled();
});
