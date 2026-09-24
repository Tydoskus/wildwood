import { beginHomeTeleport, endHomeTeleport } from "./home-teleport";
import { createPortalCutscene } from "./cutscene";
import { snapCameraToPlayer, type Camera } from "./camera";
import type { BossRainStrike, DragonBossState, EnemyState, FrostclawBossState, FrostclawIcefall, GloomrootBloom, GloomrootBossState, KoiShogunBossState, KoiShogunWhirlpool, MagmaliskBossState, MagmaliskEruption, MiremawBogBurst, PrismshellCrystalBurst, IronhornCrystalBurst, DreadreaperCrystalBurst, VoltwardenCrystalBurst, GravebloomCrystalBurst, AegisPrimeCrystalBurst, MiremawBossState, PrismshellBossState, IronhornBossState, DreadreaperBossState, VoltwardenBossState, GravebloomBossState, AegisPrimeBossState, PlayerState, SpiderBossState, SpiderVenomPool, TempestKirinBossState, TempestKirinThunderbolt, TidewyrmBossState, TidewyrmWhirlpool } from "./types";
import type { MapId, SpawnSite } from "../world";

export type MapPortal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId; label?: string };

type MapConfig = Record<MapId, { portal: MapPortal | null; arrival: { x: number; y: number }; secondaryPortal?: MapPortal }>;

const PORTAL_TRIGGER_RADIUS = 48;

async function withMapDeadline<T>(work: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Map transition timed out")), 30_000);
    })]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Loads lazy destination art beside the server move and waits before revealing the new map. */
export async function prepareMapTransition(
  changeMap: () => Promise<boolean | undefined> | boolean | undefined,
  prepareAssets: () => Promise<void>,
) {
  return withMapDeadline((async () => {
    const assetsReady = prepareAssets();
    // Asset rejection may arrive before the reducer reply, including a denied
    // move. Handle it immediately; awaiting below still propagates a real failure.
    void assetsReady.catch(() => {});
    const changed = await changeMap();
    if (!changed) return false;
    await assetsReady;
    return true;
  })());
}

type TeleportArrival = { mapId: string; x: number; y: number; facing: number };

export type MapController = {
  teleportHome: () => Promise<boolean>;
  teleportToMap: (destination: MapId, request: () => Promise<boolean | TeleportArrival>) => Promise<boolean>;
  /** Leaves Home through its travel portal for a destination the picker chose. */
  travelFromHome: (destination: MapId) => Promise<boolean>;
  /** The map the toolbar teleport last left for Home, while this page has seen it. */
  homeDeparture: () => MapId | null;
  activePortal: () => MapPortal | null;
  secondaryPortal: () => MapPortal | null;
  portalIsUnlocked: (portal: MapPortal) => boolean;
  resolvePortalCollision: () => void;
  updatePortal: (dt: number) => void;
  loadMap: (mapId: MapId, x: number, y: number, facing?: number) => void;
  reconcileMapFromServer: () => void;
  queuePortalReveal: (mapId: MapId) => void;
  startProceduralPortalCutscene: () => boolean;
  startDragonPortalCutscene: (preview?: boolean) => boolean;
  startSnowlandsPortalCutscene: (preview?: boolean) => boolean;
  startLavaPortalCutscene: (preview?: boolean) => boolean;
  startInfernalPortalCutscene: (preview?: boolean) => boolean;
  startWaterPortalCutscene: (preview?: boolean) => boolean;
  startSamuraiPortalCutscene: (preview?: boolean) => boolean;
  updatePortalCutscene: (dt: number) => boolean;
  isCutsceneActive: () => boolean;
  isMapTransitioning: () => boolean;
  cutscenePortal: () => MapPortal;
  portalRevealIntensity: () => number;
  portalBlackoutOpacity: () => number;
  portalDestinationOpacity: () => number;
};

/** Owns map travel, portal collisions, and cinematic portal state. */
export function createMapController(options: {
  openHomeTravel?: () => void;
  onTravelStarted?: () => void;
  mapConfig: MapConfig;
  tutorialMapId: MapId;
  desertMapId: MapId;
  snowMapId: MapId;
  lavaMapId: MapId;
  infernalMapId: MapId;
  waterMapId: MapId;
  dragonCutsceneSeenKey: string;
  snowlandsCutsceneSeenKey: string;
  lavaCutsceneSeenKey: string;
  infernalCutsceneSeenKey: string;
  waterCutsceneSeenKey: string;
  samuraiCutsceneSeenKey: string;
  markPortalCutsceneSeen: (cutscene: string) => void;
  getCurrentMapId: () => MapId;
  setCurrentMapId: (mapId: MapId) => void;
  player: PlayerState;
  camera: Camera;
  viewport: () => { width: number; height: number };
  keys: { clear: () => void };
  stopTouchMove: () => void;
  cutsceneOverlay: HTMLElement;
  resizeViewport: () => void;
  isDueling: () => boolean;
  running: () => boolean;
  localMapState: () => { mapId: string; x: number; y: number; facing: number } | null | undefined;
  changeMap: (mapId: MapId, x: number, y: number) => Promise<boolean | undefined> | boolean | undefined;
  prepareMapAssets: (mapId: MapId) => Promise<void>;
  syncStoppedPosition: () => void;
  resetPresentationState: () => void;
  fadeToWorld: (action: () => void) => void;
  mapUnlocked: (mapId: MapId) => boolean;
  syncMapMusic: () => void;
  rebuildWorld: () => void;
  spawnFromSite: (site: SpawnSite) => void;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  clearTransientCombat: () => void;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  frostclawIcefalls: FrostclawIcefall[];
  magmaliskEruptions: MagmaliskEruption[];
  gloomrootBlooms: GloomrootBloom[];
  tidewyrmWhirlpools: TidewyrmWhirlpool[];
  koiShogunWhirlpools: KoiShogunWhirlpool[];
  tempestKirinThunderbolts: TempestKirinThunderbolt[];
  miremawBogBursts: MiremawBogBurst[];
  prismshellCrystalBursts: PrismshellCrystalBurst[];
  ironhornCrystalBursts: IronhornCrystalBurst[];
  dreadreaperCrystalBursts: DreadreaperCrystalBurst[];
  voltwardenCrystalBursts: VoltwardenCrystalBurst[];
  gravebloomCrystalBursts: GravebloomCrystalBurst[];
  aegisPrimeCrystalBursts: AegisPrimeCrystalBurst[];
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  koiShogunBoss: KoiShogunBossState;
  tempestKirinBoss: TempestKirinBossState;
  miremawBoss: MiremawBossState;
  prismshellBoss: PrismshellBossState;
  ironhornBoss: IronhornBossState;
  dreadreaperBoss: DreadreaperBossState;
  voltwardenBoss: VoltwardenBossState;
  gravebloomBoss: GravebloomBossState;
  aegisPrimeBoss: AegisPrimeBossState;
  clearPendingBossHits: () => void;
  onCutsceneFinished: (wasPreview: boolean) => void;
}): MapController {
  const {
    mapConfig, tutorialMapId, desertMapId, snowMapId, lavaMapId, infernalMapId, waterMapId, dragonCutsceneSeenKey, snowlandsCutsceneSeenKey, lavaCutsceneSeenKey, infernalCutsceneSeenKey, waterCutsceneSeenKey, samuraiCutsceneSeenKey,
    getCurrentMapId, setCurrentMapId, player, camera, viewport, keys, stopTouchMove, cutsceneOverlay, resizeViewport,
    isDueling, running, localMapState, changeMap, syncStoppedPosition, resetPresentationState, fadeToWorld, mapUnlocked, syncMapMusic,
    rebuildWorld, spawnFromSite, enemies, spawnSites, clearTransientCombat,
    bossRain, spiderVenom, frostclawIcefalls, magmaliskEruptions, gloomrootBlooms, tidewyrmWhirlpools, koiShogunWhirlpools, tempestKirinThunderbolts, miremawBogBursts, prismshellCrystalBursts, ironhornCrystalBursts, dreadreaperCrystalBursts, voltwardenCrystalBursts, gravebloomCrystalBursts, aegisPrimeCrystalBursts, boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, koiShogunBoss, tempestKirinBoss, miremawBoss, prismshellBoss, ironhornBoss, dreadreaperBoss, voltwardenBoss, gravebloomBoss, aegisPrimeBoss, clearPendingBossHits, onCutsceneFinished,
  } = options;
  const portalCutscene = createPortalCutscene();
  let mapTransitioning = false;
  let mapLoadGeneration = 0;
  let portalCooldown = 0;
  let portalExitGuard: MapPortal | null = null;
  let homeDeparture: MapId | null = null;
  let portalCutsceneIntensity = -1;
  let portalCutsceneBlackoutOpacity = 0;
  let portalCutsceneDestinationOpacity = 0;
  let portalCutscenePreview = false;
  let pendingPortalReveal: { mapId: MapId; portal: MapPortal } | null = null;
  let portalCutsceneSeenKey = dragonCutsceneSeenKey;
  const initialPortal = mapConfig[tutorialMapId].portal;
  if (!initialPortal) throw new Error("Tutorial map requires an introductory portal.");
  let portalCutscenePortal: MapPortal = initialPortal;

  async function teleport(destination?: MapId, request?: () => Promise<boolean | TeleportArrival>) {
    if (!running() || player.hp <= 0 || isDueling() || mapTransitioning || portalCutscene.active) return false;
    if (destination === getCurrentMapId() && !request) return true;
    options.onTravelStarted?.();
    mapTransitioning = true;
    const attempt = ++mapLoadGeneration;
    const departure = getCurrentMapId();
    const returning = departure === "home_exterior";
    let finished = false;
    const current = () => !finished && attempt === mapLoadGeneration && running() && player.hp > 0;
    try {
      keys.clear(); stopTouchMove(); player.moving = false;
      syncStoppedPosition();
      beginHomeTeleport();
      // Bound the whole operation, including reducer acknowledgement and art.
      // A late completion may update server state, but must never revive this
      // presentation; normal reconciliation handles the authoritative map.
      const travel = async () => {
        await new Promise(resolve => setTimeout(resolve, 650));
        if (!current()) return false;
        const changed = request ? await request() : await changeMap("home_exterior", player.x, player.y);
        if (!current() || !changed) return false;
        const arrival = typeof changed === "object" ? changed : null;
        let state = arrival ?? localMapState();
        while (current() && (!state || (destination ? state.mapId !== destination : (state.mapId === "home_exterior") === returning))) {
          await new Promise(resolve => setTimeout(resolve, 25));
          state = localMapState();
        }
        if (!current() || !state || !(state.mapId in mapConfig)) return false;
        await options.prepareMapAssets(state.mapId as MapId);
        if (!current()) return false;
        // Re-read after loading: reconnect/reset may have replaced the arrival.
        const latest = arrival ?? localMapState();
        if (!latest || latest.mapId !== state.mapId) return false;
        if (latest.mapId === getCurrentMapId()) {
          player.x = latest.x; player.y = latest.y; player.facing = latest.facing;
          player.moving = false;
          guardPortalContainingPlayer();
        } else loadMap(latest.mapId as MapId, latest.x, latest.y, latest.facing);
        snapCameraToPlayer(camera, player, viewport()); resetPresentationState();
        beginHomeTeleport(true);
        if (!destination && !returning) homeDeparture = departure;
        return true;
      };
      return await withMapDeadline(travel());
    } catch {
      return false;
    } finally {
      finished = true;
      if (attempt === mapLoadGeneration) {
        endHomeTeleport();
        mapTransitioning = false;
      }
    }
  }

  function activePortal() { return mapConfig[getCurrentMapId()].portal; }
  function secondaryPortal() { return mapConfig[getCurrentMapId()].secondaryPortal ?? null; }
  function portalIsUnlocked(portal: MapPortal) { return portal.destination === tutorialMapId || mapUnlocked(portal.destination); }

  function playerIsInsidePortal(portal: MapPortal) {
    return Math.hypot(player.x - portal.x, player.y - (portal.y - portal.height * .32)) <= PORTAL_TRIGGER_RADIUS;
  }

  function guardPortalContainingPlayer() {
    portalExitGuard = [activePortal(), secondaryPortal()]
      .filter((portal): portal is MapPortal => portal !== null)
      .find(playerIsInsidePortal) ?? null;
  }

  function portalColliders() {
    return [activePortal(), secondaryPortal()].filter((portal): portal is MapPortal => portal !== null).flatMap((portal) => [
      { x: portal.x - portal.width * .32, y: portal.y - 52, r: 22 },
      { x: portal.x + portal.width * .32, y: portal.y - 52, r: 22 },
    ]);
  }

  function resolvePortalCollision() {
    for (const obstacle of portalColliders()) {
      const dx = player.x - obstacle.x;
      const dy = player.y - obstacle.y;
      const minimumDistance = player.r + obstacle.r;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimumDistance * minimumDistance) continue;
      const distance = Math.sqrt(distanceSquared);
      const nx = distance > .001 ? dx / distance : (player.x < obstacle.x ? -1 : 1);
      const ny = distance > .001 ? dy / distance : 0;
      player.x = obstacle.x + nx * minimumDistance;
      player.y = obstacle.y + ny * minimumDistance;
    }
  }

  function loadMap(mapId: MapId, x: number, y: number, facing = 0) {
    if (pendingPortalReveal?.mapId !== mapId) pendingPortalReveal = null;
    mapLoadGeneration++;
    endHomeTeleport();
    mapTransitioning = false;
    void options.prepareMapAssets(mapId);
    setCurrentMapId(mapId);
    syncMapMusic();
    player.x = x;
    player.y = y;
    player.facing = facing;
    player.moving = false;
    guardPortalContainingPlayer();
    enemies.length = 0;
    spawnSites.length = 0;
    clearTransientCombat();
    clearPendingBossHits();
    bossRain.length = 0;
    boss.cone = null;
    spiderVenom.length = 0;
    spiderBoss.web = null;
    frostclawIcefalls.length = 0;
    frostclawBoss.roar = null;
    frostclawBoss.rift = null;
    magmaliskEruptions.length = 0;
    magmaliskBoss.bite = null;
    gloomrootBlooms.length = 0;
    gloomrootBoss.sweep = null;
    tidewyrmWhirlpools.length = 0;
    tidewyrmBoss.surge = null;
    koiShogunWhirlpools.length = 0;
    koiShogunBoss.slash = null;
    tempestKirinThunderbolts.length = 0;
    tempestKirinBoss.charge = null;
    miremawBogBursts.length = 0;
    prismshellCrystalBursts.length = 0;
    ironhornCrystalBursts.length = 0;
    dreadreaperCrystalBursts.length = 0;
    voltwardenCrystalBursts.length = 0;
    gravebloomCrystalBursts.length = 0;
    aegisPrimeCrystalBursts.length = 0;
    miremawBoss.tongue = null;
    prismshellBoss.shatter = null;
    ironhornBoss.shatter = null;
    dreadreaperBoss.shatter = null;
    voltwardenBoss.shatter = null;
    gravebloomBoss.shatter = null;
    aegisPrimeBoss.shatter = null;
    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);
  }

  function updatePortal(dt: number) {
    if (pendingPortalReveal && pendingPortalReveal.mapId !== getCurrentMapId()) pendingPortalReveal = null;
    if (pendingPortalReveal && !mapTransitioning && !portalCutscene.active && !isDueling() && player.hp > 0
      && mapUnlocked(pendingPortalReveal.portal.destination)) {
      const reveal = pendingPortalReveal;
      pendingPortalReveal = null;
      startMapPortalCutscene(reveal.mapId, false, reveal.portal, "");
    }
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (mapTransitioning || portalCutscene.active || portalCooldown > 0 || isDueling()) return;
    if (portalExitGuard) {
      if (playerIsInsidePortal(portalExitGuard)) return;
      portalExitGuard = null;
    }
    const portal = [activePortal(), secondaryPortal()].filter((candidate): candidate is MapPortal => candidate !== null).find((candidate) =>
      playerIsInsidePortal(candidate),
    );
    if (!portal || !portalIsUnlocked(portal)) return;
    if (getCurrentMapId() === "home_exterior" && options.openHomeTravel) {
      // The picker chooses the destination. Guarding the pad means standing
      // on it after Back never reopens the window; walking off and on does.
      portalExitGuard = portal;
      keys.clear(); stopTouchMove(); player.moving = false;
      options.openHomeTravel();
      return;
    }
    options.onTravelStarted?.();
    mapTransitioning = true;
    keys.clear();
    stopTouchMove();
    player.moving = false;
    const destination = portal.destination;
    const attempt = mapLoadGeneration;
    void prepareMapTransition(
      () => changeMap(destination, player.x, player.y),
      () => options.prepareMapAssets(destination),
    ).then((changed) => {
      if (attempt !== mapLoadGeneration) return;
      if (!changed) {
        mapTransitioning = false;
        portalExitGuard = portal;
        portalCooldown = 1;
        return;
      }
      const arrival = mapConfig[destination].arrival;
      fadeToWorld(() => {
        if (attempt !== mapLoadGeneration) return;
        loadMap(destination, arrival.x, arrival.y, Math.PI / 2);
        snapCameraToPlayer(camera, player, viewport());
        resetPresentationState();
        syncStoppedPosition();
        mapTransitioning = false;
      });
    }).catch(() => {
      if (attempt !== mapLoadGeneration) return;
      mapTransitioning = false;
      portalExitGuard = portal;
      portalCooldown = 1;
    });
  }

  function reconcileMapFromServer() {
    if (!running() || mapTransitioning || isDueling()) return;
    const state = localMapState();
    if (!state || state.mapId === getCurrentMapId()) return;
    if (!(state.mapId in mapConfig)) return;
    mapTransitioning = true;
    const attempt = mapLoadGeneration;
    void withMapDeadline(options.prepareMapAssets(state.mapId as MapId)).then(() => {
      if (attempt !== mapLoadGeneration) return;
      fadeToWorld(() => {
        if (attempt !== mapLoadGeneration) return;
        loadMap(state.mapId as MapId, state.x, state.y, state.facing);
        snapCameraToPlayer(camera, player, viewport());
        resetPresentationState();
        mapTransitioning = false;
      });
    }).catch(() => {
      if (attempt === mapLoadGeneration) mapTransitioning = false;
    });
  }

  function startMapPortalCutscene(mapId: MapId, preview = false, portal = mapConfig[mapId].portal, seenKey = dragonCutsceneSeenKey) {
    if (!portal || portalCutscene.active || (!preview && !mapUnlocked(portal.destination))) return false;
    // A local boss death is provisional until its reward unlock is acknowledged.
    // Warming destination art must not turn a failed request into an unhandled rejection.
    void options.prepareMapAssets(portal.destination).catch(() => {});
    document.body.classList.add("is-cutscene");
    resizeViewport();
    portalCutscene.begin(camera, { x: portal.x, y: portal.y - portal.height * .48 }, viewport());
    portalCutsceneIntensity = 0;
    portalCutsceneBlackoutOpacity = 0;
    portalCutsceneDestinationOpacity = 0;
    portalCutscenePreview = preview;
    portalCutscenePortal = portal;
    portalCutsceneSeenKey = seenKey;
    keys.clear();
    stopTouchMove();
    cutsceneOverlay.hidden = false;
    return true;
  }

  function startDragonPortalCutscene(preview = false) { return startMapPortalCutscene(tutorialMapId, preview); }
  function startSnowlandsPortalCutscene(preview = false) {
    const portal = mapConfig[desertMapId].secondaryPortal;
    return portal ? startMapPortalCutscene(desertMapId, preview, portal, snowlandsCutsceneSeenKey) : false;
  }
  function startLavaPortalCutscene(preview = false) {
    const portal = mapConfig[snowMapId].secondaryPortal;
    return portal ? startMapPortalCutscene(snowMapId, preview, portal, lavaCutsceneSeenKey) : false;
  }
  function startInfernalPortalCutscene(preview = false) {
    const portal = mapConfig[lavaMapId].secondaryPortal;
    return portal ? startMapPortalCutscene(lavaMapId, preview, portal, infernalCutsceneSeenKey) : false;
  }
  function startWaterPortalCutscene(preview = false) {
    const portal = mapConfig[infernalMapId].secondaryPortal;
    return portal ? startMapPortalCutscene(infernalMapId, preview, portal, waterCutsceneSeenKey) : false;
  }
  function startSamuraiPortalCutscene(preview = false) {
    const portal = mapConfig[waterMapId].secondaryPortal;
    return portal ? startMapPortalCutscene(waterMapId, preview, portal, samuraiCutsceneSeenKey) : false;
  }

  function updatePortalCutscene(dt: number) {
    const frame = portalCutscene.update(dt);
    camera.x = frame.camera.x;
    camera.y = frame.camera.y;
    camera.zoom = frame.camera.zoom;
    portalCutsceneIntensity = frame.portalIntensity;
    portalCutsceneBlackoutOpacity = frame.blackoutOpacity;
    portalCutsceneDestinationOpacity = frame.destinationOpacity;
    if (!frame.finished) return true;
    portalCutsceneIntensity = -1;
    portalCutsceneBlackoutOpacity = 0;
    portalCutsceneDestinationOpacity = 0;
    cutsceneOverlay.hidden = true;
    document.body.classList.remove("is-cutscene");
    resizeViewport();
    const wasPreview = portalCutscenePreview;
    portalCutscenePreview = false;
    if (!wasPreview && portalCutsceneSeenKey) options.markPortalCutsceneSeen(portalCutsceneSeenKey);
    onCutsceneFinished(wasPreview);
    return false;
  }

  return {
    teleportHome: () => teleport(),
    teleportToMap: (destination, request) => teleport(destination, request),
    travelFromHome: async (destination) => getCurrentMapId() === "home_exterior" && destination !== "home_exterior"
      && teleport(destination, async () => Boolean(await changeMap(destination, player.x, player.y))),
    homeDeparture: () => homeDeparture,
    activePortal,
    secondaryPortal,
    portalIsUnlocked,
    resolvePortalCollision,
    updatePortal,
    loadMap,
    reconcileMapFromServer,
    queuePortalReveal: (mapId) => {
      if (mapId !== getCurrentMapId()) return;
      const portal = mapConfig[mapId].secondaryPortal;
      // Capture the locked -> earned transition before queuing the authoritative reward.
      if (portal && !mapUnlocked(portal.destination)) pendingPortalReveal = { mapId, portal };
    },
    startProceduralPortalCutscene: () => {
      if (mapTransitioning || portalCutscene.active || isDueling()) return false;
      const mapId = getCurrentMapId();
      const portal = mapConfig[mapId].secondaryPortal;
      if (!mapId.startsWith("endless_") || !portal) return false;
      return startMapPortalCutscene(mapId, false, portal, "");
    },
    startDragonPortalCutscene,
    startSnowlandsPortalCutscene,
    startLavaPortalCutscene,
    startInfernalPortalCutscene,
    startWaterPortalCutscene,
    startSamuraiPortalCutscene,
    updatePortalCutscene,
    isCutsceneActive: () => portalCutscene.active,
    isMapTransitioning: () => mapTransitioning,
    cutscenePortal: () => portalCutscenePortal,
    portalRevealIntensity: () => portalCutsceneIntensity,
    portalBlackoutOpacity: () => portalCutsceneBlackoutOpacity,
    portalDestinationOpacity: () => portalCutsceneDestinationOpacity,
  };
}
