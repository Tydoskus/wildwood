import { createPortalCutscene } from "./cutscene";
import { snapCameraToPlayer, type Camera } from "./camera";
import type { BossRainStrike, DragonBossState, EnemyState, FrostclawBossState, FrostclawIcefall, GloomrootBloom, GloomrootBossState, KoiShogunBossState, KoiShogunWhirlpool, MagmaliskBossState, MagmaliskEruption, MiremawBogBurst, PrismshellCrystalBurst, IronhornCrystalBurst, DreadreaperCrystalBurst, MiremawBossState, PrismshellBossState, IronhornBossState, DreadreaperBossState, PlayerState, SpiderBossState, SpiderVenomPool, TempestKirinBossState, TempestKirinThunderbolt, TidewyrmBossState, TidewyrmWhirlpool } from "./types";
import type { MapId, SpawnSite } from "../world";

export type MapPortal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };

type MapConfig = Record<MapId, { portal: MapPortal; arrival: { x: number; y: number }; secondaryPortal?: MapPortal }>;

const PORTAL_TRIGGER_RADIUS = 48;

/** Loads lazy destination art beside the server move and waits before revealing the new map. */
export async function prepareMapTransition(
  changeMap: () => Promise<boolean | undefined> | boolean | undefined,
  prepareAssets: () => Promise<void>,
) {
  const assetsReady = prepareAssets();
  const changed = await changeMap();
  if (!changed) return false;
  await assetsReady;
  return true;
}

export type MapController = {
  activePortal: () => MapPortal;
  secondaryPortal: () => MapPortal | null;
  portalIsUnlocked: (portal: MapPortal) => boolean;
  resolvePortalCollision: () => void;
  updatePortal: (dt: number) => void;
  loadMap: (mapId: MapId, x: number, y: number, facing?: number) => void;
  reconcileMapFromServer: () => void;
  startDragonPortalCutscene: (preview?: boolean) => void;
  startSnowlandsPortalCutscene: (preview?: boolean) => void;
  startLavaPortalCutscene: (preview?: boolean) => void;
  startInfernalPortalCutscene: (preview?: boolean) => void;
  startWaterPortalCutscene: (preview?: boolean) => void;
  startSamuraiPortalCutscene: (preview?: boolean) => void;
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
  mapConfig: MapConfig;
  tutorialMapId: MapId;
  desertMapId: MapId;
  snowMapId: MapId;
  lavaMapId: MapId;
  infernalMapId: MapId;
  waterMapId: MapId;
  samuraiMapId: MapId;
  cloudspireMapId: MapId;
  moonfenMapId: MapId;
  crystalHollowsMapId: MapId;
  clockworkRuinsMapId: MapId;
  duskfallOrchardMapId: MapId;
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
  clearPendingBossHits: () => void;
  onCutsceneFinished: (wasPreview: boolean) => void;
}): MapController {
  const {
    mapConfig, tutorialMapId, desertMapId, snowMapId, lavaMapId, infernalMapId, waterMapId, samuraiMapId, cloudspireMapId, moonfenMapId, crystalHollowsMapId, clockworkRuinsMapId, duskfallOrchardMapId, dragonCutsceneSeenKey, snowlandsCutsceneSeenKey, lavaCutsceneSeenKey, infernalCutsceneSeenKey, waterCutsceneSeenKey, samuraiCutsceneSeenKey,
    getCurrentMapId, setCurrentMapId, player, camera, viewport, keys, stopTouchMove, cutsceneOverlay, resizeViewport,
    isDueling, running, localMapState, changeMap, syncStoppedPosition, resetPresentationState, fadeToWorld, mapUnlocked, syncMapMusic,
    rebuildWorld, spawnFromSite, enemies, spawnSites, clearTransientCombat,
    bossRain, spiderVenom, frostclawIcefalls, magmaliskEruptions, gloomrootBlooms, tidewyrmWhirlpools, koiShogunWhirlpools, tempestKirinThunderbolts, miremawBogBursts, prismshellCrystalBursts, ironhornCrystalBursts, dreadreaperCrystalBursts, boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, koiShogunBoss, tempestKirinBoss, miremawBoss, prismshellBoss, ironhornBoss, dreadreaperBoss, clearPendingBossHits, onCutsceneFinished,
  } = options;
  const portalCutscene = createPortalCutscene();
  let mapTransitioning = false;
  let portalCooldown = 0;
  let portalExitGuard: MapPortal | null = null;
  let portalCutsceneIntensity = -1;
  let portalCutsceneBlackoutOpacity = 0;
  let portalCutsceneDestinationOpacity = 0;
  let portalCutscenePreview = false;
  let portalCutsceneSeenKey = dragonCutsceneSeenKey;
  let portalCutscenePortal = mapConfig[tutorialMapId].portal;

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
    const portal = activePortal();
    for (const obstacle of portalColliders()) {
      const dx = player.x - obstacle.x;
      const dy = player.y - obstacle.y;
      const minimumDistance = player.r + obstacle.r;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimumDistance * minimumDistance) continue;
      const distance = Math.sqrt(distanceSquared);
      const nx = distance > .001 ? dx / distance : (player.x < portal.x ? -1 : 1);
      const ny = distance > .001 ? dy / distance : 0;
      player.x = obstacle.x + nx * minimumDistance;
      player.y = obstacle.y + ny * minimumDistance;
    }
  }

  function loadMap(mapId: MapId, x: number, y: number, facing = 0) {
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
    miremawBoss.tongue = null;
    prismshellBoss.shatter = null;
    ironhornBoss.shatter = null;
    dreadreaperBoss.shatter = null;
    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);
  }

  function updatePortal(dt: number) {
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (mapTransitioning || portalCooldown > 0 || isDueling()) return;
    if (portalExitGuard) {
      if (playerIsInsidePortal(portalExitGuard)) return;
      portalExitGuard = null;
    }
    const portal = [activePortal(), secondaryPortal()].filter((candidate): candidate is MapPortal => candidate !== null).find((candidate) =>
      playerIsInsidePortal(candidate),
    );
    if (!portal || !portalIsUnlocked(portal)) return;
    mapTransitioning = true;
    keys.clear();
    stopTouchMove();
    player.moving = false;
    const destination = portal.destination;
    void prepareMapTransition(
      () => changeMap(destination, player.x, player.y),
      () => options.prepareMapAssets(destination),
    ).then((changed) => {
      if (!changed) {
        mapTransitioning = false;
        portalCooldown = 1;
        return;
      }
      const arrival = mapConfig[destination].arrival;
      fadeToWorld(() => {
        loadMap(destination, arrival.x, arrival.y, Math.PI / 2);
        snapCameraToPlayer(camera, player, viewport());
        resetPresentationState();
        syncStoppedPosition();
        mapTransitioning = false;
      });
    }).catch(() => {
      mapTransitioning = false;
      portalCooldown = 1;
    });
  }

  function reconcileMapFromServer() {
    if (!running() || mapTransitioning || isDueling()) return;
    const state = localMapState();
    if (!state || state.mapId === getCurrentMapId()) return;
    if (state.mapId !== tutorialMapId && state.mapId !== desertMapId && state.mapId !== snowMapId && state.mapId !== lavaMapId && state.mapId !== infernalMapId && state.mapId !== waterMapId && state.mapId !== samuraiMapId && state.mapId !== cloudspireMapId && state.mapId !== moonfenMapId && state.mapId !== crystalHollowsMapId && state.mapId !== clockworkRuinsMapId && state.mapId !== duskfallOrchardMapId) return;
    mapTransitioning = true;
    void options.prepareMapAssets(state.mapId as MapId).then(() => {
      fadeToWorld(() => {
        loadMap(state.mapId as MapId, state.x, state.y, state.facing);
        mapTransitioning = false;
      });
    });
  }

  function startMapPortalCutscene(mapId: MapId, preview = false, portal: MapPortal = mapConfig[mapId].portal, seenKey = dragonCutsceneSeenKey) {
    void options.prepareMapAssets(portal.destination);
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
  }

  function startDragonPortalCutscene(preview = false) { startMapPortalCutscene(tutorialMapId, preview); }
  function startSnowlandsPortalCutscene(preview = false) {
    const portal = mapConfig[desertMapId].secondaryPortal;
    if (portal) startMapPortalCutscene(desertMapId, preview, portal, snowlandsCutsceneSeenKey);
  }
  function startLavaPortalCutscene(preview = false) {
    const portal = mapConfig[snowMapId].secondaryPortal;
    if (portal) startMapPortalCutscene(snowMapId, preview, portal, lavaCutsceneSeenKey);
  }
  function startInfernalPortalCutscene(preview = false) {
    const portal = mapConfig[lavaMapId].secondaryPortal;
    if (portal) startMapPortalCutscene(lavaMapId, preview, portal, infernalCutsceneSeenKey);
  }
  function startWaterPortalCutscene(preview = false) {
    const portal = mapConfig[infernalMapId].secondaryPortal;
    if (portal) startMapPortalCutscene(infernalMapId, preview, portal, waterCutsceneSeenKey);
  }
  function startSamuraiPortalCutscene(preview = false) {
    const portal = mapConfig[waterMapId].secondaryPortal;
    if (portal) startMapPortalCutscene(waterMapId, preview, portal, samuraiCutsceneSeenKey);
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
    if (!wasPreview) options.markPortalCutsceneSeen(portalCutsceneSeenKey);
    onCutsceneFinished(wasPreview);
    return false;
  }

  return {
    activePortal,
    secondaryPortal,
    portalIsUnlocked,
    resolvePortalCollision,
    updatePortal,
    loadMap,
    reconcileMapFromServer,
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
