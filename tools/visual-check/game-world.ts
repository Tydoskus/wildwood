// A whole map drawn by the game's own world renderer (world-render-wiring.ts), from the game's own map state
// (game-bootstrap.ts, the map layout, its camps and its boss): no server, no input, one fixed moment.
import { createCanvasPrimitives } from "../../src/game/canvas";
import { requiredCanvasContext } from "../../src/game/runtime/dom";
import { canvasRenderPixelRatio } from "../../src/game/runtime/render/render-budget";
import { residentDrawable } from "../../src/game/runtime/render/resident-image";
import { actorShadowDimensions } from "../../src/game/runtime/render/actor-shadow-geometry";
import { createGameBootstrap, createGameBootstrapAssets } from "../../src/game/runtime/game-bootstrap";
import { createWorldRendering } from "../../src/game/runtime/render/world-render-wiring";
import { createCanvasRuntime } from "../../src/game/runtime/render/canvas-runtime";
import { createWebGLStaticWorldLayer } from "../../src/game/runtime/render/webgl-static-world-layer";
import { snapCameraToPlayer, type Camera } from "../../src/game/runtime/render/camera";
import { resetCameraZoomPreference, stepCameraZoom } from "../../src/game/runtime/render/camera-zoom-preference";
import { createMapController } from "../../src/game/runtime/map-controller";
import { createEnemyLifecycle } from "../../src/game/runtime/enemies/enemy-lifecycle";
import { createLocalCorpses } from "../../src/game/runtime/enemies/local-corpses";
import { createCoopAccess } from "../../src/game/runtime/coop-access";
import { createCombatEffects } from "../../src/game/runtime/combat-effects";
import { applyMapBalance } from "../../src/game/runtime/map-balance-loader";
import { mapWorldLayout } from "../../src/game/map-layout";
import { createSpawnSites, type MapId } from "../../src/game/world";
import { WORLD } from "../../src/game/constants";
import { GAME_BALANCE } from "../../src/balance/game-balance";
import { resolveMapBalance } from "../../shared/map-balance";
import { worldBoundsFor } from "../../shared/world-bounds";
import { bossStateForMap } from "../../src/game/runtime/boss/boss-registry";
import type { RemotePlayer } from "../../src/coop/contracts";
import type { RewardLabelContext } from "../../src/game/runtime/reward-labels";
import { settleFrames, settleImages } from "./determinism";
import { createIdentity, section, type FakePlayer } from "./world";

const nap = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const noop = () => {};

let gameAssets: ReturnType<typeof createGameBootstrapAssets> | null = null;
/** The game's art loaders, made once for the page as the game makes them once per session. */
export function sharedAssets() {
  gameAssets ??= createGameBootstrapAssets({
    profileCharacterCanvas: document.createElement("canvas"), inventoryCharacterCanvas: document.createElement("canvas"),
    onWorldArtReady: noop, onPlayerAppearanceAssetReady: noop, localOutfit: () => [],
  });
  return gameAssets;
}

/** Waits until a map's art has loaded and decoded, as the game's loading screen does. */
export async function mapArtReady(mapId: MapId) {
  const { assets } = sharedAssets();
  void assets.ensureMapAssets(mapId);
  for (let waited = 0; !assets.worldArtReady(mapId); waited += 25) {
    if (assets.mapAssetLoadFailed(mapId)) throw new Error(`${mapId}: art failed to load`);
    if (waited > 60_000) throw new Error(`${mapId}: art still loading after 60 s`);
    await nap(25);
  }
  await settleImages();
}

export type MapViewOptions = {
  mapId: MapId;
  /** The canvas in CSS pixels; the camera frames it as the game frames that screen. */
  width: number;
  height: number;
  title: string;
  /** Where the local player stands; the map's arrival when left out. */
  at?: { x: number; y: number };
  /** Others on the map, drawn as remote players. */
  others?: (FakePlayer & { x: number; y: number; moving?: boolean; facing?: number })[];
  /** Changes to the map's state (its boss, its enemies) before the frame is drawn. */
  arrange?: (state: ReturnType<typeof createGameBootstrap>, camera: Camera) => void;
  gameTime?: number;
  /** The player's own zoom (Settings), in 5% steps from 100%: -10 is 50%, 10 is 150%. */
  zoomSteps?: number;
  /** Where the map's section goes; the page when left out. */
  parent?: HTMLElement;
  /** The minimap's box in canvas pixels; the HUD's corner when left out, none when null. */
  minimap?: { left: number; top: number; width: number; height: number } | null;
  /** Draw as the game does, on a full-window canvas with its WebGL world layer, instead of the plain 2D canvas. */
  gameRuntime?: boolean;
};

const LOCAL: FakePlayer = { id: "me", name: "Rymel", power: 12_345, hp: 900, maxHp: 1_200, headItem: "heroic_medium_helmet", chestItem: "heroic_medium_armor", feetItem: "heroic_warrior_boots", rightHandItem: "heroic_bow" };

/** One map on a canvas of its own, drawn by the game's world renderer; returns its frame drawer. */
export async function mapView(options: MapViewOptions) {
  const { mapId, width, height } = options;
  const host = section(options.title);
  if (options.parent) options.parent.append(host);
  const dpr = canvasRenderPixelRatio(window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.className = "vc-canvas";
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  // The game lays its vignette over the canvas as a fixed element beside it; on this page it sits over its own canvas.
  const stage = document.createElement("div");
  stage.className = "vc-stage";
  stage.append(canvas);
  host.append(stage);
  const bootstrapAssets = sharedAssets();
  const staticWorldLayer = options.gameRuntime ? createWebGLStaticWorldLayer(canvas) : null;
  staticWorldLayer?.prepare();
  const gameCanvas = options.gameRuntime ? createCanvasRuntime({
    canvas, transparent: Boolean(staticWorldLayer), getActorShadowSprite: () => bootstrapAssets.actorShadowSprite,
  }) : null;
  const ctx = gameCanvas?.ctx ?? requiredCanvasContext(canvas, { alpha: false });
  const primitives = createCanvasPrimitives(ctx);
  await mapArtReady(mapId);

  const state = createGameBootstrap();
  const { player, enemies, spawnSites, bosses, bossHazards, inventory, mapConfig, decor, paths } = state;
  const bounds = worldBoundsFor(mapId);
  const useWorld = () => { WORLD.w = bounds.width; WORLD.h = bounds.height; };
  useWorld();
  applyMapBalance(resolveMapBalance(mapId, GAME_BALANCE.settings, GAME_BALANCE.revision));
  Object.assign(inventory, { equippedHead: LOCAL.headItem, equippedChest: LOCAL.chestItem, equippedFeet: LOCAL.feetItem, equippedRightHand: LOCAL.rightHandItem, equippedLeftHand: "" });
  const arrival = options.at ?? mapConfig[mapId].arrival;
  Object.assign(player, { x: arrival.x, y: arrival.y, hp: LOCAL.hp, maxHp: LOCAL.maxHp, facing: Math.PI / 2 });
  const layout = mapWorldLayout(player, mapId);
  decor.splice(0, decor.length, ...layout.decor);
  paths.splice(0, paths.length, ...layout.paths);
  spawnSites.splice(0, spawnSites.length, ...createSpawnSites(bossStateForMap(bosses, mapId) ?? player, mapId));
  const lifecycle = createEnemyLifecycle(enemies, spawnSites, noop, { remaining: () => 0, gameTime: () => 0 });
  for (const site of spawnSites) lifecycle.spawnFromSite(site);

  const others = options.others ?? [];
  const remotes: RemotePlayer[] = others.map(other => ({
    id: other.id, name: other.name, power: other.power, x: other.x, y: other.y, speed: 0, facing: other.facing ?? 0, moving: other.moving ?? false,
    headItem: other.headItem ?? "", chestItem: other.chestItem ?? "", feetItem: other.feetItem ?? "", rightHandItem: other.rightHandItem ?? "", leftHandItem: other.leftHandItem ?? "",
  }));
  const coop = createCoopAccess({
    localIdentity: () => LOCAL.id, localDisplayName: () => LOCAL.name, remotePlayers: () => remotes, remotePlayerDeath: () => null,
  } as never);
  const camera: Camera = { x: 0, y: 0, zoom: 1 };
  const viewport = gameCanvas?.viewport() ?? { width, height };
  const shadowSprite = bootstrapAssets.actorShadowSprite;
  const canvasRuntime = gameCanvas ?? {
    ctx, ...primitives, resize: noop, dpr: () => dpr, viewport: () => viewport, renderViewport: () => ({ width, height, dpr }),
    // As canvas-runtime.ts draws it.
    drawActorShadow(x: number, y: number, shadowWidth: number, alpha = .38) {
      const shadowHeight = actorShadowDimensions(shadowWidth).height;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (shadowSprite.complete && shadowSprite.naturalWidth > 0) ctx.drawImage(residentDrawable(shadowSprite), x - shadowWidth / 2, y - shadowHeight / 2, Math.round(shadowWidth), shadowHeight);
      ctx.restore();
    },
  };
  let gameTime = options.gameTime ?? 0;
  const mapController = createMapController({
    mapConfig: mapConfig as never,
    markPortalCutsceneSeen: noop, getCurrentMapId: () => mapId, setCurrentMapId: noop, prepareMapAssets: async () => {},
    player, camera, viewport: () => viewport, keys: { clear: noop }, stopTouchMove: noop, cutsceneOverlay: { hidden: true } as HTMLElement,
    resizeViewport: noop, isDueling: () => false, running: () => false, localMapState: () => ({ mapId, x: player.x, y: player.y, facing: player.facing }),
    changeMap: () => true, syncStoppedPosition: noop, resetPresentationState: noop, fadeToWorld: action => action(), mapUnlocked: () => true,
    syncMapMusic: noop, rebuildWorld: noop, spawnFromSite: lifecycle.spawnFromSite, enemies, spawnSites, clearTransientCombat: noop,
    bosses, bossHazards, onCutsceneFinished: noop,
  });
  const identityRenderer = createIdentity(ctx, camera, viewport, [LOCAL, ...others]);
  const rendering = createWorldRendering({
    coop, canvasRuntime: canvasRuntime as never, staticWorldLayer, camera,
    minimapBounds: () => options.minimap === undefined ? { left: width - 134, top: 8, width: 126, height: 126 } : options.minimap,
    world: state, currentMapId: () => mapId, gameTime: () => gameTime, localDeath: () => null, localCorpses: createLocalCorpses(),
    isArenaScene: () => false, remoteEnemies: () => [], mapController, proceduralBoss: { draw: noop } as never, bootstrapAssets,
    stationStatus: { slotUpgrades: () => null, research: () => null, questBoard: () => null },
    rewardDisplay: { displayedMultiplier: () => 1, displayedAmount: (_type: unknown, amount: number) => amount } as never,
    rewardContext: () => undefined as unknown as RewardLabelContext, bossHitboxesVisible: () => false,
    identityRenderer, playerPower: () => LOCAL.power, lowPerformanceMode: () => false,
  });
  const effects = createCombatEffects();
  const frame = rendering.createFrameRenderer({
    bootsPickup: state.bootsPickup, remotePlayers: () => remotes, mapPlayerMarkers: () => [],
    isDueling: () => false, isArenaScene: () => false, duelAssetsReady: () => false, isReplayActive: () => false,
    replayScene: () => null, liveScene: () => null, heldScene: () => null, duelResultHeld: () => false,
    setRenderedDuelScene: noop, setDuelCountdown: noop, drawProfileCharacterPreview: noop, worldOccluded: () => false,
    updateSpeechBubbles: identityRenderer.updateSpeechBubbles, localIdentity: coop.localIdentity, localDisplayName: coop.localDisplayName,
    drawParticles: effects.drawParticles, drawDamageNumbers: effects.drawDamageNumbers,
    portalCutsceneActive: () => false, portalBlackoutOpacity: () => 0, attackRangeVisible: () => false,
    projectiles: state.projectiles, enemyShots: state.enemyShots, particles: effects.particles,
  });
  options.arrange?.(state, camera);
  return {
    state,
    camera,
    /** Frames the player as the game does on this screen, then draws a few frames so baked ground tiles land. */
    async draw() {
      useWorld();
      resetCameraZoomPreference();
      for (let step = 0; step < Math.abs(options.zoomSteps ?? 0); step += 1) stepCameraZoom(Math.sign(options.zoomSteps!) as 1 | -1);
      options.arrange?.(state, camera);
      snapCameraToPlayer(camera, player, viewport);
      // Stepping saves the level; later scenes on this origin start from 100% again.
      resetCameraZoomPreference();
      localStorage.clear();
      for (let pass = 0; pass < 4; pass += 1) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        frame.render();
        await settleFrames();
      }
    },
    setGameTime(seconds: number) { gameTime = seconds; },
    /** One frame as the game draws it, the camera on the player wherever they now stand. */
    renderFrame() {
      useWorld();
      snapCameraToPlayer(camera, player, viewport);
      frame.render();
    },
    renderer: () => staticWorldLayer?.active() ? "webgl" : "canvas2d",
    dispose() { canvas.remove(); document.getElementById("gameGpu")?.remove(); host.remove(); },
  };
}
