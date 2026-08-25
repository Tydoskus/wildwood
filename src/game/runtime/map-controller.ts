import { createPortalCutscene } from "./cutscene";
import type { Camera } from "./camera";
import type { BossRainStrike, DragonBossState, EnemyState, FrostclawBossState, FrostclawIcefall, MagmaliskBossState, MagmaliskEruption, PlayerState, SpiderBossState, SpiderVenomPool } from "./types";
import type { MapId, SpawnSite } from "../world";

export type MapPortal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };

type MapConfig = Record<MapId, { portal: MapPortal; arrival: { x: number; y: number }; secondaryPortal?: MapPortal }>;

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
  dragonCutsceneSeenKey: string;
  snowlandsCutsceneSeenKey: string;
  lavaCutsceneSeenKey: string;
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
  syncStoppedPosition: () => void;
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
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  clearPendingBossHits: () => void;
  showMapMessage: (mapId: MapId) => void;
  onCutsceneFinished: (wasPreview: boolean) => void;
}): MapController {
  const {
    mapConfig, tutorialMapId, desertMapId, snowMapId, lavaMapId, dragonCutsceneSeenKey, snowlandsCutsceneSeenKey, lavaCutsceneSeenKey,
    getCurrentMapId, setCurrentMapId, player, camera, viewport, keys, stopTouchMove, cutsceneOverlay, resizeViewport,
    isDueling, running, localMapState, changeMap, syncStoppedPosition, fadeToWorld, mapUnlocked, syncMapMusic,
    rebuildWorld, spawnFromSite, enemies, spawnSites, clearTransientCombat,
    bossRain, spiderVenom, frostclawIcefalls, magmaliskEruptions, boss, spiderBoss, frostclawBoss, magmaliskBoss, clearPendingBossHits, showMapMessage, onCutsceneFinished,
  } = options;
  const portalCutscene = createPortalCutscene();
  let mapTransitioning = false;
  let portalCooldown = 0;
  let portalCutsceneIntensity = -1;
  let portalCutsceneBlackoutOpacity = 0;
  let portalCutsceneDestinationOpacity = 0;
  let portalCutscenePreview = false;
  let portalCutsceneSeenKey = dragonCutsceneSeenKey;
  let portalCutscenePortal = mapConfig[tutorialMapId].portal;

  function activePortal() { return mapConfig[getCurrentMapId()].portal; }
  function secondaryPortal() { return mapConfig[getCurrentMapId()].secondaryPortal ?? null; }
  function portalIsUnlocked(portal: MapPortal) { return portal.destination === tutorialMapId || mapUnlocked(portal.destination); }

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
    setCurrentMapId(mapId);
    syncMapMusic();
    player.x = x;
    player.y = y;
    player.facing = facing;
    player.moving = false;
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
    frostclawBoss.pushTimer = 0;
    magmaliskEruptions.length = 0;
    magmaliskBoss.bite = null;
    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);
  }

  function updatePortal(dt: number) {
    portalCooldown = Math.max(0, portalCooldown - dt);
    if (mapTransitioning || portalCooldown > 0 || isDueling()) return;
    const portal = [activePortal(), secondaryPortal()].filter((candidate): candidate is MapPortal => candidate !== null).find((candidate) =>
      Math.hypot(player.x - candidate.x, player.y - (candidate.y - candidate.height * .32)) <= 48,
    );
    if (!portal || !portalIsUnlocked(portal)) return;
    mapTransitioning = true;
    const destination = portal.destination;
    void Promise.resolve(changeMap(destination, player.x, player.y)).then((changed) => {
      if (!changed) { mapTransitioning = false; portalCooldown = 1; return; }
      fadeToWorld(() => {
        const arrival = mapConfig[destination].arrival;
        loadMap(destination, arrival.x, arrival.y, Math.PI / 2);
        portalCooldown = 1.5;
        mapTransitioning = false;
        showMapMessage(getCurrentMapId());
        syncStoppedPosition();
      });
    });
  }

  function reconcileMapFromServer() {
    if (!running() || mapTransitioning || isDueling()) return;
    const state = localMapState();
    if (!state || state.mapId === getCurrentMapId()) return;
    if (state.mapId !== tutorialMapId && state.mapId !== desertMapId && state.mapId !== snowMapId && state.mapId !== lavaMapId) return;
    mapTransitioning = true;
    fadeToWorld(() => {
      loadMap(state.mapId as MapId, state.x, state.y, state.facing);
      portalCooldown = 1.5;
      mapTransitioning = false;
      showMapMessage(getCurrentMapId());
    });
  }

  function startMapPortalCutscene(mapId: MapId, preview = false, portal: MapPortal = mapConfig[mapId].portal, seenKey = dragonCutsceneSeenKey) {
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
    if (!wasPreview) { try { localStorage.setItem(portalCutsceneSeenKey, "true"); } catch {} }
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
    updatePortalCutscene,
    isCutsceneActive: () => portalCutscene.active,
    isMapTransitioning: () => mapTransitioning,
    cutscenePortal: () => portalCutscenePortal,
    portalRevealIntensity: () => portalCutsceneIntensity,
    portalBlackoutOpacity: () => portalCutsceneBlackoutOpacity,
    portalDestinationOpacity: () => portalCutsceneDestinationOpacity,
  };
}
