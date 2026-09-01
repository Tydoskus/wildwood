import { createActorRenderer, type ActorStatus } from "./actor-renderer";
import { createBossRenderer } from "./boss-renderer";
import type { Camera } from "./camera";
import { createDepthWorldRenderer } from "./depth-world-renderer";
import { createRenderController, type RenderController } from "./render-controller";
import { createWorldRenderer, type MinimapBounds } from "./world-renderer";
import { DEFAULT_SKIN_TONE, drawStartingPlayer, type PlayerAppearanceAssets } from "../player-appearance";
import type { LoadedEnemySprite } from "../enemies";
import type { MapId, WorldDecor, WorldPath } from "../world";
import type { MapPlayerMarker, RemotePlayer } from "../../wildstat-coop";
import type { PlayerGender } from "../../../shared/player-gender";
import type { BossRainStrike, DragonBossState, DuelScene, EnemyShot, EnemyState, FrostclawBossState, FrostclawIcefall, GloomrootBloom, GloomrootBossState, KoiShogunBossState, KoiShogunWhirlpool, MagmaliskBossState, MagmaliskEruption, PlayerState, Projectile, SpiderBossState, SpiderVenomPool, TempestKirinBossState, TempestKirinThunderbolt, TidewyrmBossState, TidewyrmWhirlpool } from "./types";
import { BASE_ATTACK_RANGE } from "../constants";
import type { PlayerDeathAnimationState } from "./player-death-animation";
import type { Particle } from "./combat-effects";
import { parseHexColorOrNull, type StaticWorldColorQuadFrame, type StaticWorldLayer, type StaticWorldSpriteFrame } from "./webgl-static-world-layer";
import { nightEnemyOpacity, nightGroundShadowsVisible } from "./night-visibility";
import { snapWorldRenderCoordinate } from "./render-space";

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
  currentMapId: () => MapId;
  gameTime: () => number;
  nowMs: () => number;
  localDeath: () => PlayerDeathAnimationState | null;
  remoteDeath: (identity: string) => PlayerDeathAnimationState | null;
  isArenaScene: () => boolean;
  mapName: (mapId: MapId) => string;
  tutorialMapId: MapId;
  desertMapId: MapId;
  snowMapId: MapId;
  lavaMapId: MapId;
  infernalMapId: MapId;
  waterMapId: MapId;
  samuraiMapId: MapId;
  cloudspireMapId: MapId;
  paths: WorldPath[];
  decor: WorldDecor[];
  enemies: EnemyState[];
  remoteEnemies?: () => readonly EnemyState[];
  player: PlayerState;
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  koiShogunBoss: KoiShogunBossState;
  tempestKirinBoss: TempestKirinBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  frostclawIcefalls: FrostclawIcefall[];
  magmaliskEruptions: MagmaliskEruption[];
  gloomrootBlooms: GloomrootBloom[];
  tidewyrmWhirlpools: TidewyrmWhirlpool[];
  koiShogunWhirlpools: KoiShogunWhirlpool[];
  tempestKirinThunderbolts: TempestKirinThunderbolt[];
  activePortal: () => Portal;
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
    portalArch: HTMLImageElement;
    portalSwirl: HTMLImageElement;
    snowPine: HTMLImageElement;
    upgradeBench: HTMLImageElement;
    lavaPools: HTMLImageElement[];
    lavaRocks: HTMLImageElement[];
    charredTrees: HTMLImageElement[];
    dragonSpriteCanvas: HTMLCanvasElement;
    spiderSpriteCanvas: HTMLCanvasElement;
    frostclawSpriteCanvas: HTMLCanvasElement;
    magmaliskSpriteCanvas: HTMLCanvasElement;
    gloomrootSpriteCanvas: HTMLCanvasElement;
    tidewyrmSpriteCanvas: HTMLCanvasElement;
    koiShogunSpriteCanvas: HTMLCanvasElement;
    tempestKirinSpriteCanvas: HTMLCanvasElement;
    dragonReady: () => boolean;
    spiderReady: () => boolean;
    frostclawReady: () => boolean;
    magmaliskReady: () => boolean;
    gloomrootReady: () => boolean;
    tidewyrmReady: () => boolean;
    koiShogunReady: () => boolean;
    tempestKirinReady: () => boolean;
    duelPlatformArt: HTMLImageElement;
  };
  actorShadowSprite: HTMLImageElement;
  upgradeBenchStatus: () => { itemId: string; timer: string } | null;
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
  isReplayActive: () => boolean;
  replayScene: () => DuelScene | null;
  liveScene: () => DuelScene | null;
  heldScene: () => DuelScene | null;
  duelResultHeld: () => boolean;
  setRenderedDuelScene: (scene: DuelScene | null) => void;
  setDuelCountdown: (countdown: number) => void;
  drawProfileCharacterPreview: () => void;
  updateSpeechBubbles: () => void;
  localIdentity: () => string | undefined;
  localDisplayName: () => string | undefined;
  drawParticles: (ctx: CanvasRenderingContext2D, camera: Camera, devicePixelRatio: number) => void;
  drawDamageNumbers: (ctx: CanvasRenderingContext2D, camera: Camera, outlinedText: OutlinedText, devicePixelRatio: number) => void;
  portalCutsceneActive: () => boolean;
  portalBlackoutOpacity: () => number;
  screenShake: () => number;
  screenShakeEnabled: () => boolean;
  attackRangeVisible: () => boolean;
  flash: () => number;
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  particles: readonly Particle[];
};

/** Wires the independent world, actor, boss, depth, and frame renderers. */
export function createWorldRenderRuntime(options: WorldRenderRuntimeOptions) {
  let invalidateDepthOrder = () => {};
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
    tutorialMapId: options.tutorialMapId,
    desertMapId: options.desertMapId,
    snowMapId: options.snowMapId,
    lavaMapId: options.lavaMapId,
    infernalMapId: options.infernalMapId,
    waterMapId: options.waterMapId,
    samuraiMapId: options.samuraiMapId,
    paths: options.paths,
    decor: options.decor,
    enemies: options.enemies,
    player: options.player,
    boss: options.boss,
    spiderBoss: options.spiderBoss,
    frostclawBoss: options.frostclawBoss,
    magmaliskBoss: options.magmaliskBoss,
    gloomrootBoss: options.gloomrootBoss,
    tidewyrmBoss: options.tidewyrmBoss,
    koiShogunBoss: options.koiShogunBoss,
    tempestKirinBoss: options.tempestKirinBoss,
    actorShadowSprite: options.actorShadowSprite,
    drawShadow: options.drawShadow,
    outlinedText: options.outlinedText,
    upgradeBenchStatus: () => {
      const status = options.upgradeBenchStatus();
      return status ? { itemSprite: options.playerAppearanceAssets.equipment[status.itemId]?.sprite, timer: status.timer } : null;
    },
    ...options.assets,
  });
  const boss = createBossRenderer({
    ctx: options.ctx, camera: options.camera, devicePixelRatio: options.devicePixelRatio, boss: options.boss, spiderBoss: options.spiderBoss, frostclawBoss: options.frostclawBoss, magmaliskBoss: options.magmaliskBoss, gloomrootBoss: options.gloomrootBoss, tidewyrmBoss: options.tidewyrmBoss, koiShogunBoss: options.koiShogunBoss, tempestKirinBoss: options.tempestKirinBoss,
    bossRain: options.bossRain, spiderVenom: options.spiderVenom, frostclawIcefalls: options.frostclawIcefalls, magmaliskEruptions: options.magmaliskEruptions, gloomrootBlooms: options.gloomrootBlooms, tidewyrmWhirlpools: options.tidewyrmWhirlpools, koiShogunWhirlpools: options.koiShogunWhirlpools, tempestKirinThunderbolts: options.tempestKirinThunderbolts,
    dragonSpriteCanvas: options.assets.dragonSpriteCanvas, spiderSpriteCanvas: options.assets.spiderSpriteCanvas, frostclawSpriteCanvas: options.assets.frostclawSpriteCanvas, magmaliskSpriteCanvas: options.assets.magmaliskSpriteCanvas, gloomrootSpriteCanvas: options.assets.gloomrootSpriteCanvas, tidewyrmSpriteCanvas: options.assets.tidewyrmSpriteCanvas, koiShogunSpriteCanvas: options.assets.koiShogunSpriteCanvas, tempestKirinSpriteCanvas: options.assets.tempestKirinSpriteCanvas,
    dragonReady: options.assets.dragonReady, spiderReady: options.assets.spiderReady, frostclawReady: options.assets.frostclawReady, magmaliskReady: options.assets.magmaliskReady, gloomrootReady: options.assets.gloomrootReady, tidewyrmReady: options.assets.tidewyrmReady, koiShogunReady: options.assets.koiShogunReady, tempestKirinReady: options.assets.tempestKirinReady,
    gameTime: options.gameTime, pixelCircle: options.pixelCircle, outlinedText: options.outlinedText,
    drawShadow: drawEntityShadow, hpLossFlashDuration: options.bossHpLossFlashDuration, spiderWebRange: options.spiderWebRange,
    rewardMultiplier: options.rewardMultiplier,
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
      skinTone: options.skinTone(rendered.identity ?? rendered.id) ?? DEFAULT_SKIN_TONE,
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
    activeBossTarget: () => options.currentMapId() === options.tutorialMapId
      ? options.boss
      : options.currentMapId() === options.desertMapId
        ? options.spiderBoss
        : options.currentMapId() === options.snowMapId
          ? options.frostclawBoss
          : options.currentMapId() === options.lavaMapId
            ? options.magmaliskBoss
            : options.currentMapId() === options.infernalMapId
              ? options.gloomrootBoss
              : options.currentMapId() === options.waterMapId
                ? options.tidewyrmBoss
                : options.currentMapId() === options.samuraiMapId
                  ? options.koiShogunBoss
                  : options.currentMapId() === options.cloudspireMapId
                    ? options.tempestKirinBoss
                    : null,
    remoteAttackRange: BASE_ATTACK_RANGE,
    duelPlatformArt: options.assets.duelPlatformArt,
    player: options.player,
    rewardMultiplier: options.rewardMultiplier,
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
    const depth = createDepthWorldRenderer({
      camera: options.camera,
      viewport: () => options.viewport(),
      decor: options.decor,
      enemies: options.enemies,
      remoteEnemies: options.remoteEnemies,
      player: options.player,
      boss: options.boss,
      spiderBoss: options.spiderBoss,
      frostclawBoss: options.frostclawBoss,
      magmaliskBoss: options.magmaliskBoss,
      gloomrootBoss: options.gloomrootBoss,
      tidewyrmBoss: options.tidewyrmBoss,
      koiShogunBoss: options.koiShogunBoss,
      tempestKirinBoss: options.tempestKirinBoss,
      bootsPickup: frame.bootsPickup,
      currentMapId: options.currentMapId,
      activePortal: options.activePortal,
      secondaryPortal: options.secondaryPortal,
      drawTree: world.drawTree,
      drawCactus: world.drawCactus,
      drawSnowPine: world.drawSnowPine,
      drawUpgradeBench: world.drawUpgradeBench,
      drawCharredTree: world.drawCharredTree,
      drawEnemy: actor.drawEnemy,
      enemyOpacity: (enemy) => options.currentMapId() === options.infernalMapId
        ? nightEnemyOpacity(Math.hypot(enemy.x - options.player.x, enemy.y - options.player.y), options.player.attackRange, enemy.r)
        : 1,
      drawBoss: boss.drawBoss,
      drawSpiderBoss: boss.drawSpiderBoss,
      drawFrostclawBoss: boss.drawFrostclawBoss,
      drawMagmaliskBoss: boss.drawMagmaliskBoss,
      drawGloomrootBoss: boss.drawGloomrootBoss,
      drawTidewyrmBoss: boss.drawTidewyrmBoss,
      drawKoiShogunBoss: boss.drawKoiShogunBoss,
      drawTempestKirinBoss: boss.drawTempestKirinBoss,
      drawBootPickup: () => renderer.drawBootPickup(),
      drawPortal: world.drawPortal,
      drawSecondaryPortal: world.drawSecondaryPortal,
      drawRemotePlayer: actor.drawRemotePlayer,
      drawPlayer: () => actor.drawPlayer(
        frame.localIdentity(),
        options.publicPlayerName(frame.localIdentity(), frame.localDisplayName()),
        options.playerPower(options.player),
      ),
    });
    invalidateDepthOrder = depth.invalidateDepthOrder;
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
      isReplayActive: frame.isReplayActive,
      replayScene: frame.replayScene,
      liveScene: frame.liveScene,
      heldScene: frame.heldScene,
      duelResultHeld: frame.duelResultHeld,
      setRenderedDuelScene: frame.setRenderedDuelScene,
      setDuelCountdown: frame.setDuelCountdown,
      drawProfileCharacterPreview: frame.drawProfileCharacterPreview,
      updateSpeechBubbles: frame.updateSpeechBubbles,
      drawGround: world.drawGround,
      drawStaticWorld: world.drawStaticWorld,
      drawDuelArena: actor.drawDuelArena,
      drawDuelScene: actor.drawDuelScene,
      drawDecor: world.drawDecor,
      drawBossTelegraphs: boss.drawBossTelegraphs,
      drawSpiderTelegraphs: boss.drawSpiderTelegraphs,
      drawFrostclawTelegraphs: boss.drawFrostclawTelegraphs,
      drawMagmaliskTelegraphs: boss.drawMagmaliskTelegraphs,
      drawGloomrootTelegraphs: boss.drawGloomrootTelegraphs,
      drawTidewyrmTelegraphs: boss.drawTidewyrmTelegraphs,
      drawKoiShogunTelegraphs: boss.drawKoiShogunTelegraphs,
      drawTempestKirinTelegraphs: boss.drawTempestKirinTelegraphs,
      drawProjectile: actor.drawProjectile,
      drawDepthSortedWorld: depth.drawDepthSortedWorld,
      drawMinimap: world.drawMinimap,
      drawCutscenePortal: world.drawCutscenePortal,
      drawParticles: (ctx, camera) => frame.drawParticles(ctx, camera, options.devicePixelRatio()),
      drawDamageNumbers: (ctx, camera) => frame.drawDamageNumbers(ctx, camera, options.outlinedText, options.devicePixelRatio()),
      currentMapIsTutorial: () => options.currentMapId() === options.tutorialMapId,
      currentMapIsDesert: () => options.currentMapId() === options.desertMapId,
      currentMapIsSnow: () => options.currentMapId() === options.snowMapId,
      currentMapIsLava: () => options.currentMapId() === options.lavaMapId,
      currentMapIsInfernal: () => options.currentMapId() === options.infernalMapId,
      currentMapIsWater: () => options.currentMapId() === options.waterMapId,
      currentMapIsSamurai: () => options.currentMapId() === options.samuraiMapId,
      currentMapIsCloudspire: () => options.currentMapId() === options.cloudspireMapId,
      portalCutsceneActive: frame.portalCutsceneActive,
      portalBlackoutOpacity: frame.portalBlackoutOpacity,
      screenShake: frame.screenShake,
      screenShakeEnabled: frame.screenShakeEnabled,
      attackRangeVisible: frame.attackRangeVisible,
      flash: frame.flash,
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

  return { ...world, ...boss, ...actor, createFrameRenderer, invalidateStaticWorld };
}
