import { drawHomeTeleport } from "./home-teleport";
import { createActorRenderer, type ActorStatus } from "./actor-renderer";
import { createBossRenderer } from "./boss-renderer";
import type { Camera } from "./camera";
import { createDepthWorldRenderer } from "./depth-world-renderer";
import { createRenderController, type RenderController } from "./render-controller";
import { createWorldRenderer, type MinimapBounds } from "./world-renderer";
import { DEFAULT_SKIN_TONE, drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import type { LoadedEnemySprite, RewardType } from "../enemies";
import type { MapId, WorldDecor, WorldPath } from "../world";
import type { MapPlayerMarker, RemotePlayer } from "../../wildstat-coop";
import type { PlayerGender } from "../../../shared/player-gender";
import type { DuelScene, EnemyShot, EnemyState, PlayerState, Projectile } from "./types";
import { bossForMap, bossStateForMap, type BossArtAssets, type BossHazards, type BossStates } from "./boss-registry";
import { BASE_ATTACK_RANGE } from "../constants";
import type { PlayerDeathAnimationState } from "./player-death-animation";
import type { Particle } from "./combat-effects";
import { parseHexColorOrNull, STATIC_WORLD_LAYER_RESET_EVENT, type StaticWorldColorQuadFrame, type StaticWorldLayer, type StaticWorldSpriteFrame } from "./webgl-static-world-layer";
import { nightEnemyOpacity, nightGroundShadowsVisible } from "./night-visibility";
import { snapWorldRenderCoordinate } from "./render-space";
import { createSoulGroundRenderer, createSoulPropRenderer } from "./soul-prop-renderer";
import { createSoulParticles } from "./soul-particles";
import { createSoulWater } from "./soul-water";
import { isSoulMap } from "../../../shared/soul-dimension";

type Viewport = { width: number; height: number; dpr: number };
type Portal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type BootsPickup = { x: number; y: number; r: number; collected: boolean };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;

export type WorldRenderRuntimeOptions = {
  ctx: CanvasRenderingContext2D;
  staticWorldLayer?: StaticWorldLayer | null;
  camera: Camera;
  viewport: () => Viewport;
  minimapBounds?: () => MinimapBounds | null;
  devicePixelRatio: () => number;
  drawMapHazards?: () => void;
  currentMapId: () => MapId;
  gameTime: () => number;
  nowMs: () => number;
  localDeath: () => PlayerDeathAnimationState | null;
  remoteDeath: (identity: string) => PlayerDeathAnimationState | null;
  isArenaScene: () => boolean;
  mapName: (mapId: MapId) => string;
  infernalMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  remoteEnemies?: () => readonly EnemyState[];
  player: PlayerState;
  bosses: BossStates;
  bossHazards: BossHazards;
  activePortal: () => Portal | null;
  cutscenePortal: () => Portal;
  secondaryPortal: () => Portal | null;
  portalIsUnlocked: (portal: Portal) => boolean;
  portalRevealIntensity: () => number;
  portalDestinationOpacity: () => number;
  assets: {
    duelSpaceBackground: HTMLImageElement;
    treeSpritesheet: HTMLImageElement;
    treeSpriteBounds: () => { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number; canopyWidth: number }[];
    nightTreeSpritesheet: HTMLImageElement;
    nightTreeSpriteBounds: () => { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number; canopyWidth: number }[];
    cherryTreeSpritesheet: HTMLImageElement;
    cherryTreeSpriteBounds: () => { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number; canopyWidth: number }[];
    portalArch: HTMLImageElement;
    portalSwirl: HTMLImageElement;
    snowPine: HTMLImageElement;
    upgradeBench: HTMLImageElement;
    lavaPools: HTMLImageElement[];
    lavaRocks: HTMLImageElement[];
    charredTrees: HTMLImageElement[];
    /** The Soul Dimension's one atlas (soul-village.ts). */
    soulAtlas?: HTMLImageElement;
    soulVillageProps?: HTMLImageElement;
    soulVillageGround?: HTMLImageElement;
    soulInteriors?: HTMLImageElement;
    soulWater?: HTMLImageElement;
    soulShore?: HTMLImageElement;
    bossArt: BossArtAssets;
    duelPlatformArt: HTMLImageElement;
  };
  actorShadowSprite: HTMLImageElement;
  upgradeBenchStatus: () => { itemId: string; timer: string } | null;
  researchStatus?: () => { timer: string } | null;
  questBoardStatus?: () => { finished: boolean[]; timer: string } | null;
  drawShadow: DrawShadow;
  pixelCircle: (x: number, y: number, radius: number) => void;
  outlinedText: OutlinedText;
  fillText: (text: string, x: number, y: number, color: string) => void;
  bossHpLossFlashDuration: number;
  spiderWebRange: number;
  playerAppearanceAssets: PlayerAppearanceAssets;
  skinTone: (identity: string | undefined) => number | undefined;
  equippedItems: () => { head: string; chest: string; feet: string; rightHand: string; leftHand: string };
  equipmentForIdentity: (identity: string | undefined) => { headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
  enemySprites: Record<string, LoadedEnemySprite>;
  rewardMultiplier: () => number;
  rewardAmount?: (type: RewardType, amount: number) => number;
  /** Developer overlay: draw each boss's collision shape over its artwork. */
  showBossHitboxes?: () => boolean;
  enemyTextVisible: (enemy: EnemyState) => boolean;
  drawStatus: (status: ActorStatus) => void;
  drawIdentity: (identity: string | undefined, name: string, power: number | null, centerX: number, bottom: number, color: string, gender?: PlayerGender) => void;
  drawSpeechBubble: (identity: string | undefined, x: number, y: number) => void;
  publicPlayerName: (identity: string | undefined, name: string | undefined) => string;
  playerPower: (player: PlayerState) => number;
  worldHealthBarHeight: number;
};

export type FrameRendererOptions = {
  bootsPickup: BootsPickup;
  remotePlayers: () => RemotePlayer[];
  mapPlayerMarkers: () => MapPlayerMarker[];
  isDueling: () => boolean;
  isArenaScene: () => boolean;
  duelAssetsReady: () => boolean;
  isReplayActive: () => boolean;
  replayScene: () => DuelScene | null;
  liveScene: () => DuelScene | null;
  heldScene: () => DuelScene | null;
  duelResultHeld: () => boolean;
  setRenderedDuelScene: (scene: DuelScene | null) => void;
  setDuelCountdown: (countdown: number) => void;
  drawProfileCharacterPreview: () => void;
  worldOccluded?: () => boolean;
  updateSpeechBubbles: () => void;
  localIdentity: () => string | undefined;
  localDisplayName: () => string | undefined;
  drawParticles: (ctx: CanvasRenderingContext2D, camera: Camera, devicePixelRatio: number) => void;
  drawDamageNumbers: (ctx: CanvasRenderingContext2D, camera: Camera, outlinedText: OutlinedText, devicePixelRatio: number) => void;
  portalCutsceneActive: () => boolean;
  portalBlackoutOpacity: () => number;
  attackRangeVisible: () => boolean;
  weaponAttackRange?: () => number;
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  particles: readonly Particle[];
};

/** Wires the independent world, actor, boss, depth, and frame renderers. */
/** How long the game must have been out of sight before its ground is redrawn on return (a quick tab switch keeps it). */
const RESUME_REDRAW_AFTER_MS = 3_000;

export function createWorldRenderRuntime(options: WorldRenderRuntimeOptions) {
  let invalidateDepthOrder = () => {};
  let soulGround: ReturnType<typeof createSoulGroundRenderer>;
  const drawEntityShadow: DrawShadow = (x, y, width, alpha) => {
    // Arena scenes are visually separate from the current world map and retain
    // their shadows. Night Forest relies on its vignette to ground world actors.
    if (options.isArenaScene() || nightGroundShadowsVisible(options.currentMapId(), options.infernalMapId)) {
      options.drawShadow(x, y, width, alpha);
    }
  };
  const world = createWorldRenderer({
    ctx: options.ctx,
    staticWorldLayer: options.staticWorldLayer,
    camera: options.camera,
    getViewport: () => options.viewport(),
    getMinimapBounds: options.minimapBounds,
    minimapVillageGround: () => options.assets.soulVillageGround,
    getDevicePixelRatio: options.devicePixelRatio,
    getMapId: options.currentMapId,
    getGameTime: options.gameTime,
    isArenaScene: options.isArenaScene,
    mapName: options.mapName,
    activePortal: options.activePortal,
    cutscenePortal: options.cutscenePortal,
    secondaryPortal: options.secondaryPortal,
    portalIsUnlocked: options.portalIsUnlocked,
    portalRevealIntensity: options.portalRevealIntensity,
    portalDestinationOpacity: options.portalDestinationOpacity,
    infernalMapId: options.infernalMapId,
    paths: options.paths,
    decor: options.decor,
    enemies: options.enemies,
    player: options.player,
    bosses: options.bosses,
    actorShadowSprite: options.actorShadowSprite,
    drawShadow: options.drawShadow,
    outlinedText: options.outlinedText,
    upgradeBenchStatus: () => {
      const status = options.upgradeBenchStatus();
      return status ? { itemSprite: options.playerAppearanceAssets.equipment[status.itemId]?.sprite, timer: status.timer } : null;
    },
    researchStatus: options.researchStatus,
    questBoardStatus: options.questBoardStatus,
    ...options.assets,
  });
  const boss = createBossRenderer({
    ctx: options.ctx, camera: options.camera, devicePixelRatio: options.devicePixelRatio,
    bosses: options.bosses, hazards: options.bossHazards, art: options.assets.bossArt,
    gameTime: options.gameTime, pixelCircle: options.pixelCircle, outlinedText: options.outlinedText,
    drawShadow: drawEntityShadow, hpLossFlashDuration: options.bossHpLossFlashDuration, spiderWebRange: options.spiderWebRange,
    rewardMultiplier: options.rewardMultiplier,
    rewardAmount: options.rewardAmount,
    showBossHitboxes: options.showBossHitboxes,
  });
  const actor = createActorRenderer({
    ctx: options.ctx,
    camera: options.camera,
    viewport: () => options.viewport(),
    devicePixelRatio: options.devicePixelRatio,
    gameTime: options.gameTime,
    nowMs: options.nowMs,
    localDeath: options.localDeath,
    remoteDeath: options.remoteDeath,
    drawPlayerAppearance: (rendered, alpha) => drawStartingPlayer(options.ctx, options.playerAppearanceAssets, {
      ...rendered,
      gameTime: options.gameTime(),
      skinTone: rendered.skinTone ?? options.skinTone(rendered.identity ?? rendered.id) ?? DEFAULT_SKIN_TONE,
      alpha,
    }),
    localHeadItem: () => options.equippedItems().head,
    localChestItem: () => options.equippedItems().chest,
    localFeetItem: () => options.equippedItems().feet,
    localRightHandItem: () => options.equippedItems().rightHand,
    localLeftHandItem: () => options.equippedItems().leftHand,
    equipmentForIdentity: options.equipmentForIdentity,
    itemSprite: (itemId) => itemId ? options.playerAppearanceAssets.equipment[itemId]?.sprite : undefined,
    enemySprites: options.enemySprites,
    enemies: options.enemies,
    activeBossTarget: () => bossStateForMap(options.bosses, options.currentMapId()),
    remoteAttackRange: BASE_ATTACK_RANGE,
    duelPlatformArt: options.assets.duelPlatformArt,
    player: options.player,
    rewardMultiplier: options.rewardMultiplier,
    rewardAmount: options.rewardAmount,
    enemyTextVisible: options.enemyTextVisible,
    pixelCircle: options.pixelCircle,
    outlinedText: options.outlinedText,
    drawShadow: drawEntityShadow,
    drawStatus: options.drawStatus,
    drawIdentity: options.drawIdentity,
    drawSpeechBubble: options.drawSpeechBubble,
    publicName: options.publicPlayerName,
    worldHealthBarHeight: options.worldHealthBarHeight,
  });

  function createFrameRenderer(frame: FrameRendererOptions): RenderController {
    let renderer: RenderController;
    const webGLProjectileFrames: StaticWorldSpriteFrame[] = [];
    const webGLProjectileBatchState = { frames: webGLProjectileFrames, complete: false };
    const webGLProjectileBatch = () => {
      webGLProjectileFrames.length = 0;
      webGLProjectileBatchState.complete = Boolean(options.staticWorldLayer?.active());
      if (!webGLProjectileBatchState.complete) return webGLProjectileBatchState;
      for (const projectile of frame.projectiles) {
        const sprite = actor.webGLProjectileFrame(projectile, false);
        if (!sprite) {
          webGLProjectileFrames.length = 0;
          webGLProjectileBatchState.complete = false;
          return webGLProjectileBatchState;
        }
        webGLProjectileFrames.push(sprite);
      }
      for (const shot of frame.enemyShots) {
        const sprite = actor.webGLProjectileFrame(shot, true);
        if (!sprite) {
          webGLProjectileFrames.length = 0;
          webGLProjectileBatchState.complete = false;
          return webGLProjectileBatchState;
        }
        webGLProjectileFrames.push(sprite);
      }
      return webGLProjectileBatchState;
    };
    const webGLParticleQuads: StaticWorldColorQuadFrame[] = [];
    const webGLParticleQuadPool: StaticWorldColorQuadFrame[] = [];
    const webGLParticleColorCache = new Map<string, [number, number, number] | null>();
    const webGLParticleBatchState = { frames: webGLParticleQuads, complete: false };
    const webGLParticleBatch = () => {
      webGLParticleQuads.length = 0;
      webGLParticleBatchState.complete = Boolean(options.staticWorldLayer?.active());
      if (!webGLParticleBatchState.complete) return webGLParticleBatchState;
      const devicePixelRatio = options.devicePixelRatio();
      for (const particle of frame.particles) {
        let color = webGLParticleColorCache.get(particle.color);
        if (color === undefined && !webGLParticleColorCache.has(particle.color)) {
          color = parseHexColorOrNull(particle.color);
          webGLParticleColorCache.set(particle.color, color);
        }
        if (!color) {
          webGLParticleQuads.length = 0;
          webGLParticleBatchState.complete = false;
          return webGLParticleBatchState;
        }
        const index = webGLParticleQuads.length;
        const quad = webGLParticleQuadPool[index] ?? {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          color,
          opacity: 0,
        };
        quad.left = snapWorldRenderCoordinate(particle.x - options.camera.x, options.camera.zoom, devicePixelRatio);
        quad.top = snapWorldRenderCoordinate(particle.y - options.camera.y, options.camera.zoom, devicePixelRatio);
        quad.width = particle.size;
        quad.height = particle.size;
        quad.color = color;
        quad.opacity = Math.max(0, Math.min(1, particle.life / (particle.maxLife || 1)));
        webGLParticleQuadPool[index] = quad;
        webGLParticleQuads.push(quad);
      }
      return webGLParticleBatchState;
    };
    const drawSoulProp = createSoulPropRenderer({ ctx: options.ctx, camera: options.camera, atlas: () => options.assets.soulAtlas,
      villageProps: () => options.assets.soulVillageProps, devicePixelRatio: options.devicePixelRatio, time: options.gameTime });
    soulGround = createSoulGroundRenderer({ ctx: options.ctx, camera: options.camera, ground: () => options.assets.soulVillageGround, interiors: () => options.assets.soulInteriors,
      decor: options.decor, drawProp: drawSoulProp,
      drawWater: createSoulWater({ ctx: options.ctx, camera: options.camera, water: () => options.assets.soulWater, shore: () => options.assets.soulShore,
        viewport: options.viewport, time: options.gameTime }),
      viewport: options.viewport, devicePixelRatio: options.devicePixelRatio, active: () => isSoulMap(options.currentMapId()) });
    const depth = createDepthWorldRenderer({
      camera: options.camera,
      viewport: () => options.viewport(),
      decor: options.decor,
      enemies: options.enemies,
      remoteEnemies: options.remoteEnemies,
      player: options.player,
      bosses: options.bosses,
      bootsPickup: frame.bootsPickup,
      currentMapId: options.currentMapId,
      activePortal: options.activePortal,
      secondaryPortal: options.secondaryPortal,
      drawTree: world.drawTree,
      drawCactus: world.drawCactus,
      drawSnowPine: world.drawSnowPine,
      drawUpgradeBench: world.drawUpgradeBench,
      drawCharredTree: world.drawCharredTree,
      drawSoulProp,
      drawEnemy: actor.drawEnemy,
      enemyOpacity: (enemy) => options.currentMapId() === options.infernalMapId
        ? nightEnemyOpacity(Math.hypot(enemy.x - options.player.x, enemy.y - options.player.y), options.player.attackRange, enemy.r)
        : 1,
      drawBoss: (kind) => boss.drawBoss[kind](),
      drawBossHitboxes: boss.drawBossHitboxes,
      drawOverWorld: createSoulParticles({ ctx: options.ctx, camera: options.camera, image: () => options.assets.soulVillageProps,
        viewport: options.viewport, time: options.gameTime, active: () => isSoulMap(options.currentMapId()) }),
      drawBootPickup: () => renderer.drawBootPickup(),
      drawPortal: world.drawPortal,
      drawSecondaryPortal: world.drawSecondaryPortal,
      drawRemotePlayer: actor.drawRemotePlayer,
      drawPlayer: () => drawHomeTeleport(options.ctx, options.player.x - options.camera.x, options.player.y - options.camera.y, () => actor.drawPlayer(
        frame.localIdentity(),
        options.publicPlayerName(frame.localIdentity(), frame.localDisplayName()),
        options.playerPower(options.player),
      )),
    });
    invalidateDepthOrder = () => { depth.invalidateDepthOrder(); soulGround.invalidate(); };
    renderer = createRenderController({
      ctx: options.ctx,
      camera: options.camera,
      player: options.player,
      bootsPickup: frame.bootsPickup,
      viewport: options.viewport,
      pixelCircle: options.pixelCircle,
      remotePlayers: frame.remotePlayers,
      mapPlayerMarkers: frame.mapPlayerMarkers,
      isDueling: frame.isDueling,
      isArenaScene: frame.isArenaScene,
      duelAssetsReady: frame.duelAssetsReady,
      isReplayActive: frame.isReplayActive,
      replayScene: frame.replayScene,
      liveScene: frame.liveScene,
      heldScene: frame.heldScene,
      duelResultHeld: frame.duelResultHeld,
      setRenderedDuelScene: frame.setRenderedDuelScene,
      setDuelCountdown: frame.setDuelCountdown,
      drawProfileCharacterPreview: frame.drawProfileCharacterPreview,
      worldOccluded: frame.worldOccluded,
      updateSpeechBubbles: frame.updateSpeechBubbles,
      drawMapHazards: options.drawMapHazards,
      drawGround: world.drawGround,
      drawStaticWorld: world.drawStaticWorld,
      drawDuelArena: actor.drawDuelArena,
      drawDuelScene: actor.drawDuelScene,
      drawDecor: () => { world.drawDecor(); soulGround.draw(); },
      drawBossTelegraphs: () => {
        const mapBoss = bossForMap(options.currentMapId());
        if (mapBoss) boss.drawBossTelegraphs[mapBoss.kind]();
      },
      drawProjectile: actor.drawProjectile,
      drawDepthSortedWorld: depth.drawDepthSortedWorld,
      drawMinimap: world.drawMinimap,
      drawCutscenePortal: world.drawCutscenePortal,
      drawParticles: (ctx, camera) => frame.drawParticles(ctx, camera, options.devicePixelRatio()),
      drawDamageNumbers: (ctx, camera) => frame.drawDamageNumbers(ctx, camera, options.outlinedText, options.devicePixelRatio()),
      currentMapIsInfernal: () => options.currentMapId() === options.infernalMapId,
      portalCutsceneActive: frame.portalCutsceneActive,
      portalBlackoutOpacity: frame.portalBlackoutOpacity,
      attackRangeVisible: frame.attackRangeVisible,
      weaponAttackRange: frame.weaponAttackRange,
      projectiles: frame.projectiles,
      enemyShots: frame.enemyShots,
      webGLProjectileBatch,
      webGLParticleBatch,
    });
    return renderer;
  }

  function invalidateStaticWorld() {
    world.invalidateStaticWorld();
    invalidateDepthOrder();
  }

  // A phone that sends the game to the background (another app, the lock
  // screen) or holds it under a long chat can drop the GPU context and the
  // cached ground tiles, and nothing redrew them: most of the screen came back
  // black. Coming back after a few seconds, or when the WebGL context is lost
  // or restored, rebuild a lost layer and redraw every ground tile from scratch.
  let hiddenAt = Number.POSITIVE_INFINITY;
  const redrawWorld = (rebuild: boolean) => {
    if (rebuild) options.staticWorldLayer?.recover?.();
    invalidateStaticWorld();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") { hiddenAt = performance.now(); return; }
    if (performance.now() - hiddenAt >= RESUME_REDRAW_AFTER_MS) redrawWorld(true);
    hiddenAt = Number.POSITIVE_INFINITY;
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) redrawWorld(true); });
  window.addEventListener(STATIC_WORLD_LAYER_RESET_EVENT, (event) => redrawWorld((event as CustomEvent).detail === "restored"));

  return { ...world, ...boss, ...actor, createFrameRenderer, invalidateStaticWorld, invalidateDepthOrder: () => invalidateDepthOrder() };
}
