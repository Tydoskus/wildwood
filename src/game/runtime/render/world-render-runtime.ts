import { TOWN_FEET_OFFSET } from "../../../../shared/town";
import { createWorldSpriteCapture } from "./world-sprite-capture";
import type { SwitchableContext } from "./switchable-context";
import { drawTownTeleport } from "../town/town-teleport";
import { createOreRockRenderer } from "../town/ore-rock-renderer";
import { createPickaxeSprite, MINING_PICKAXE, PICKAXE_OVERRIDES } from "../town/pickaxe-sprite";
import { miningScene } from "../town/mining-scene";
import { HATCHET_OVERRIDES, WOODCUTTING_HATCHET } from "../town/hatchet-sprite";
import { toolSprite } from "../town/tool-sprites";
import { woodcuttingScene } from "../town/woodcutting-scene";
import { createWoodTreeRenderer } from "../town/wood-tree-renderer";
import { createStarterChestRenderer } from "./starter-chest-renderer";
import { drawSoulWellFall } from "../soul/soul-well-fall";
import { createActorRenderer, type ActorStatus } from "./actor-renderer";
import { createBossRenderer } from "../boss/boss-renderer";
import type { Camera } from "./camera";
import { createDepthWorldRenderer } from "./depth-world-renderer";
import { createRenderController, type RenderController } from "./render-controller";
import { createWorldRenderer, type MinimapBounds } from "./world-renderer";
import { DEFAULT_SKIN_TONE, drawStartingPlayer, equipmentSprite, type PlayerAppearanceAssets } from "../../player-appearance";
import { localItemRefine } from "../../local-item-refines";
import type { LoadedEnemySprite, RewardType } from "../../enemies";
import { TUTORIAL_FOREST_MAP_ID, type MapId, type WorldDecor, type WorldPath } from "../../world";
import type { MapPlayerMarker, RemotePlayer } from "../../../wildstat-coop";
import type { PlayerGender } from "../../../../shared/player-gender";
import type { DuelScene, EnemyShot, EnemyState, PlayerState, Projectile } from "../types";
import { bossForMap, bossStateForMap, type BossArtAssets, type BossHazards, type BossStates } from "../boss/boss-registry";
import { BASE_ATTACK_RANGE, WORLD } from "../../constants";
import type { PlayerDeathAnimationState } from "../player-death-animation";
import type { Particle } from "../combat-effects";
import { parseHexColorOrNull, STATIC_WORLD_LAYER_RESET_EVENT, type StaticWorldColorQuadFrame, type StaticWorldLayer, type StaticWorldSpriteFrame } from "./webgl-static-world-layer";
import { nightEnemyOpacity, nightGroundShadowsVisible } from "./night-visibility";
import { snapWorldRenderCoordinate } from "./render-space";
import { createSoulGroundRenderer, createSoulPropRenderer } from "../soul/soul-prop-renderer";
import { createGroveShadowRenderer } from "../town/grove-shadows";
import { createSoulParticles } from "../soul/soul-particles";
import { createSoulWater } from "../soul/soul-water";
import { createSoulWaterGL, routeRiver } from "../soul/soul-water-gl";
import { createForestRoadPainter } from "./forest-road";
import { mapVisualTheme } from "../../map-design";
import { createSoulGroundPropPainter, createTownGroundTilePainter, soulGroundPropsIn, TOWN_GROUND_WORLD } from "../town/town-ground-tiles";
import { isTownMap } from "../../../../shared/town";
import { drawOxSprite } from "./ox-sprite";
import { isGuildHallMap } from "../../../../shared/guild-hall";
import { GUILD_HALL_GROUND } from "../../guild-hall";
import {
  createGuildCrestDrawer, createGuildHallRoomsDrawer, createGuildHallUnderDrawer, drawSeated, GUILD_HALL_SEAT_FACING, seatedAt,
} from "../guild-hall/guild-hall-render";
import type { TextSegment } from "../../canvas";

type Viewport = { width: number; height: number; dpr: number };
type Portal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type BootsPickup = { x: number; y: number; r: number; collected: boolean };
type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type OutlinedSegments = (segments: readonly TextSegment[], x: number, y: number, strokeWidth?: number) => void;
type DrawShadow = (x: number, y: number, width: number, alpha?: number) => void;

export type WorldRenderRuntimeOptions = {
  ctx: CanvasRenderingContext2D;
  staticWorldLayer?: StaticWorldLayer | null;
  /** The context everything draws through, switched to the sprite recorder for the world (world-sprite-capture.ts). */
  worldContext?: SwitchableContext;
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
    workbench: HTMLImageElement;
    lavaPools: HTMLImageElement[];
    lavaRocks: HTMLImageElement[];
    charredTrees: HTMLImageElement[];
    /** The Soul Dimension's one atlas (town-village.ts). */
    soulAtlas?: HTMLImageElement;
    townVillageProps?: HTMLImageElement;
    townVillageGround?: HTMLImageElement;
    soulInteriors?: HTMLImageElement;
    soulWater?: HTMLImageElement;
    soulShore?: HTMLImageElement;
    forestRoad?: HTMLImageElement;
    /** A guild hall's art (guild-hall.ts) and the badge sheets its crests are cut from. */
    guildHallProps?: HTMLImageElement;
    guildHallGround?: HTMLImageElement;
    guildHallRooms?: HTMLImageElement;
    guildEmblemSheets?: HTMLImageElement[];
    bossArt: BossArtAssets;
    duelPlatformArt: HTMLImageElement;
  };
  actorShadowSprite: HTMLImageElement;
  slotUpgradesStatus: () => { itemId: string; timer: string } | null;
  researchStatus?: () => { timer: string } | null;
  questBoardStatus?: () => { finished: boolean[]; timer: string } | null;
  drawShadow: DrawShadow;
  pixelCircle: (x: number, y: number, radius: number) => void;
  outlinedText: OutlinedText;
  outlinedSegments: OutlinedSegments;
  fillText: (text: string, x: number, y: number, color: string) => void;
  bossHpLossFlashDuration: number;
  spiderWebRange: number;
  playerAppearanceAssets: PlayerAppearanceAssets;
  skinTone: (identity: string | undefined) => number | undefined;
  /** The looks drawn, and `weapon`: the weapon fought with, which may be another kind than the hand's look. */
  equippedItems: () => { head: string; chest: string; feet: string; rightHand: string; leftHand: string; weapon?: string };
  equipmentForIdentity: (identity: string | undefined) => { headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
  enemySprites: Record<string, LoadedEnemySprite>;
  rewardMultiplier: () => number;
  rewardAmount?: (type: RewardType, amount: number) => number;
  /** What attack speed and crit enemies' labels are worked out from (actor-renderer.ts). */
  rewardContext?: () => import("../reward-labels").RewardLabelContext;
  /** Developer overlay: draw each boss's collision shape over its artwork. */
  showBossHitboxes?: () => boolean;
  enemyTextVisible: (enemy: EnemyState) => boolean;
  drawStatus: (status: ActorStatus) => void;
  drawIdentity: (identity: string | undefined, name: string, power: number | null, centerX: number, headTop: number, color: string, gender?: PlayerGender) => void;
  drawSpeechBubble: (identity: string | undefined, x: number, headTop: number) => void;
  publicPlayerName: (identity: string | undefined, name: string | undefined) => string;
  playerPower: (player: PlayerState) => number;
  worldHealthBarHeight: number;
  /** Low Performance Mode: the Town drops its moving water and its smoke and sparks. */
  lowPerformanceMode?: () => boolean;
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
  let hallGround: ReturnType<typeof createSoulGroundRenderer>;
  // The pickaxe is painted and the hatchet is a vendor axe: each joins the equipment art under its own name.
  const pickaxeSprite = createPickaxeSprite();
  if (pickaxeSprite) options.playerAppearanceAssets.equipment[MINING_PICKAXE] = { sprite: pickaxeSprite };
  const hatchetSprite = toolSprite("hatchet", 0);
  if (hatchetSprite) options.playerAppearanceAssets.equipment[WOODCUTTING_HATCHET] = { sprite: hatchetSprite };
  // The tool out, if any: the pickaxe in the Copper Hills coloured by its level, the hatchet in Timberwood its level's axe.
  const inHand = (id: string, tool: "pickaxe" | "hatchet", level: number, plain: HTMLImageElement) => {
    const asset = options.playerAppearanceAssets.equipment[id], sprite = (level > 0 && toolSprite(tool, level)) || plain;
    if (asset && asset.sprite !== sprite) asset.sprite = sprite;
    return id;
  };
  const toolInHand = () => miningScene.pickaxeOut && pickaxeSprite ? inHand(MINING_PICKAXE, "pickaxe", miningScene.toolLevel, pickaxeSprite)
    : woodcuttingScene.hatchetOut && hatchetSprite ? inHand(WOODCUTTING_HATCHET, "hatchet", woodcuttingScene.toolLevel, hatchetSprite) : null;
  const drawEntityShadow: DrawShadow = (x, y, width, alpha) => {
    // Arena scenes are visually separate from the current world map and retain
    // their shadows. Night Forest relies on its vignette to ground world actors.
    if (options.isArenaScene() || nightGroundShadowsVisible(options.currentMapId(), options.infernalMapId)) {
      options.drawShadow(x, y, width, alpha);
    }
  };
  const townGround = createTownGroundTilePainter({ ground: () => options.assets.townVillageGround, interiors: () => options.assets.soulInteriors,
    villageProps: () => options.assets.townVillageProps, atlas: () => options.assets.soulAtlas, road: () => options.assets.forestRoad });
  const townStaticTiles = { world: TOWN_GROUND_WORLD, ...townGround };
  // The tutorial forest's own tile, then the Town's road tiles over its paths, its pack grass and tree shadows (pack-forest.ts).
  const forestProps = createSoulGroundPropPainter({ villageProps: () => undefined, atlas: () => options.assets.soulAtlas });
  const forestRoads = createForestRoadPainter(() => options.assets.forestRoad);
  const forestStaticTiles = {
    world: WORLD,
    ready: () => Boolean(options.assets.soulAtlas?.complete && options.assets.forestRoad?.complete),
    paint(context: CanvasRenderingContext2D, tileX: number, tileY: number, tileSize: number, paintBase: () => void,
      layout: { paths: WorldPath[]; decor: WorldDecor[] } = options) {
      paintBase();
      const rect = { left: tileX * tileSize, top: tileY * tileSize, right: (tileX + 1) * tileSize, bottom: (tileY + 1) * tileSize };
      if (!forestRoads(context, layout.paths, rect.left, rect.top, tileSize, mapVisualTheme(TUTORIAL_FOREST_MAP_ID).ground)) return false;
      const { flat, shadows } = soulGroundPropsIn(layout.decor, rect);
      context.imageSmoothingEnabled = false;
      forestProps(context, flat, shadows, rect.left, rect.top, tileSize);
      return true;
    },
  };
  const lowPerformance = () => options.lowPerformanceMode?.() ?? false;
  const world = createWorldRenderer({
    ctx: options.ctx,
    staticWorldLayer: options.staticWorldLayer,
    camera: options.camera,
    getViewport: () => options.viewport(),
    getMinimapBounds: options.minimapBounds,
    minimapVillageGround: () => options.assets.townVillageGround,
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
    slotUpgradesStatus: () => {
      const status = options.slotUpgradesStatus();
      return status ? { itemSprite: equipmentSprite(options.playerAppearanceAssets, status.itemId, localItemRefine(status.itemId)), timer: status.timer } : null;
    },
    researchStatus: options.researchStatus,
    questBoardStatus: options.questBoardStatus,
    // Ox is the game's original player sprite, standing still facing down, grounded by the same shadow
    // as a player.
    drawOx: (x, y) => {
      drawEntityShadow(x, y, 34, .17);
      drawOxSprite(options.ctx, x, y);
    },
    // The Smith is a villager in the game's own gear: a fire-forged helm, magma plate and a sword, facing the room.
    drawSmith: (x, y) => {
      drawEntityShadow(x, y, 30, .17);
      drawStartingPlayer(options.ctx, options.playerAppearanceAssets, {
        x, y: y - TOWN_FEET_OFFSET, facing: Math.PI / 2, gameTime: options.gameTime(), skinTone: 5,
        headItem: "fire_metal_helmet", chestItem: "magma_armor", rightHandItem: "wooden_sword", leftHandItem: "",
      });
    },
    // The Trade Chrysanthemum's clerk: a villager in white gold and a straw hat, empty-handed, facing the square.
    drawExchangeClerk: (x, y) => {
      drawEntityShadow(x, y, 30, .17);
      drawStartingPlayer(options.ctx, options.playerAppearanceAssets, {
        x, y: y - TOWN_FEET_OFFSET, facing: Math.PI / 2, gameTime: options.gameTime(), skinTone: 2,
        headItem: "samurai_hat", chestItem: "legendary_white_gold_armor", rightHandItem: "", leftHandItem: "",
      });
    },
    ...options.assets,
    customStaticTiles: mapId => isTownMap(mapId) ? townStaticTiles : mapId === TUTORIAL_FOREST_MAP_ID ? forestStaticTiles : null,
  });
  const boss = createBossRenderer({
    ctx: options.ctx, camera: options.camera, devicePixelRatio: options.devicePixelRatio,
    bosses: options.bosses, hazards: options.bossHazards, art: options.assets.bossArt,
    gameTime: options.gameTime, pixelCircle: options.pixelCircle, outlinedText: options.outlinedText,
    drawShadow: drawEntityShadow, hpLossFlashDuration: options.bossHpLossFlashDuration, spiderWebRange: options.spiderWebRange,
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
      // Mining in the Copper Hills: the Smith's pickaxe in hand, swinging on the mining's own clock.
      ...(rendered.rightHandItem === MINING_PICKAXE ? { throwClock: miningScene.swingClock, presentationOverrides: PICKAXE_OVERRIDES } : {}),
      // Chopping in Timberwood: the hatchet's axe, held at its own grip (hatchet-sprite.ts).
      ...(rendered.rightHandItem === WOODCUTTING_HATCHET ? { throwClock: woodcuttingScene.swingClock, presentationOverrides: HATCHET_OVERRIDES } : {}),
      gameTime: rendered.gameTime ?? options.gameTime(),
      skinTone: rendered.skinTone ?? options.skinTone(rendered.identity ?? rendered.id) ?? DEFAULT_SKIN_TONE,
      alpha,
    }),
    localHeadItem: () => options.equippedItems().head,
    localChestItem: () => options.equippedItems().chest,
    localFeetItem: () => options.equippedItems().feet,
    localRightHandItem: () => toolInHand() ?? options.equippedItems().rightHand,
    localLeftHandItem: () => toolInHand() ? "" : options.equippedItems().leftHand,
    localWeaponItem: () => toolInHand() ? "" : options.equippedItems().weapon ?? "",
    equipmentForIdentity: options.equipmentForIdentity,
    itemSprite: (itemId, refineLevel) => equipmentSprite(options.playerAppearanceAssets, itemId, refineLevel),
    enemySprites: options.enemySprites,
    enemies: options.enemies,
    activeBossTarget: () => bossStateForMap(options.bosses, options.currentMapId()),
    remoteAttackRange: BASE_ATTACK_RANGE,
    duelPlatformArt: options.assets.duelPlatformArt,
    player: options.player,
    rewardMultiplier: options.rewardMultiplier,
    rewardAmount: options.rewardAmount, rewardContext: options.rewardContext,
    enemyTextVisible: options.enemyTextVisible,
    pixelCircle: options.pixelCircle,
    outlinedText: options.outlinedText,
    outlinedSegments: options.outlinedSegments,
    drawShadow: drawEntityShadow,
    drawStatus: options.drawStatus,
    drawIdentity: options.drawIdentity,
    drawSpeechBubble: options.drawSpeechBubble,
    publicName: options.publicPlayerName,
    worldHealthBarHeight: options.worldHealthBarHeight,
    mapId: options.currentMapId,
  });

  function createFrameRenderer(frame: FrameRendererOptions): RenderController {
    let renderer: RenderController;
    const worldSprites = createWorldSpriteCapture(options.worldContext, () => options.staticWorldLayer);
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
      villageProps: () => options.assets.townVillageProps, devicePixelRatio: options.devicePixelRatio, time: options.gameTime,
      drawsOnCanvas: () => !worldSprites?.recording(),
      hallProps: () => options.assets.guildHallProps, drawCrest: createGuildCrestDrawer(() => options.assets.guildEmblemSheets) });
    hallGround = createSoulGroundRenderer({ ctx: options.ctx, camera: options.camera, ground: () => options.assets.guildHallGround, area: GUILD_HALL_GROUND,
      interiors: () => undefined, drawRooms: createGuildHallRoomsDrawer({ ctx: options.ctx, camera: options.camera, rooms: () => options.assets.guildHallRooms,
        devicePixelRatio: options.devicePixelRatio }),
      drawUnder: createGuildHallUnderDrawer({ ctx: options.ctx, camera: options.camera }),
      decor: options.decor, drawProp: drawSoulProp, viewport: options.viewport, devicePixelRatio: options.devicePixelRatio, active: () => isGuildHallMap(options.currentMapId()) });
    // The Town's ground, rooms, flat props and shadows are baked into the static world's tiles: only its water moves.
    // The WebGL world draws the river with its tiles when it can; the canvas draws it otherwise.
    const drawRiver = routeRiver(options.staticWorldLayer,
      createSoulWaterGL({ camera: options.camera, water: () => options.assets.soulWater, shore: () => options.assets.soulShore,
        time: options.gameTime, active: () => isTownMap(options.currentMapId()) && !lowPerformance() }),
      createSoulWater({ ctx: options.ctx, camera: options.camera, water: () => options.assets.soulWater, shore: () => options.assets.soulShore,
        viewport: options.viewport, time: options.gameTime, active: () => !lowPerformance() }));
    soulGround = createSoulGroundRenderer({ ctx: options.ctx, camera: options.camera, ground: () => options.assets.townVillageGround, interiors: () => options.assets.soulInteriors,
      decor: options.decor, drawProp: drawSoulProp, baked: true,
      drawWater: drawRiver,
      viewport: options.viewport, devicePixelRatio: options.devicePixelRatio, active: () => isTownMap(options.currentMapId()) });
    const drawGroveShadows = createGroveShadowRenderer({ ctx: options.ctx, camera: options.camera, viewport: options.viewport,
      drawProp: drawSoulProp, active: () => isTownMap(options.currentMapId()) });
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
      drawStation: world.drawStation,
      drawCharredTree: world.drawCharredTree,
      drawSoulProp,
      drawOreRock: createOreRockRenderer({ ctx: options.ctx, camera: options.camera, devicePixelRatio: options.devicePixelRatio, time: options.gameTime,
        drawSoulProp, outlinedText: options.outlinedText }),
      drawWoodTree: createWoodTreeRenderer({ ctx: options.ctx, camera: options.camera, devicePixelRatio: options.devicePixelRatio, drawSoulProp, outlinedText: options.outlinedText }),
      drawStarterChest: createStarterChestRenderer({ ctx: options.ctx, camera: options.camera, devicePixelRatio: options.devicePixelRatio, time: options.gameTime, outlinedText: options.outlinedText }),
      drawEnemy: actor.drawEnemy,
      enemyOpacity: (enemy) => options.currentMapId() === options.infernalMapId
        ? nightEnemyOpacity(Math.hypot(enemy.x - options.player.x, enemy.y - options.player.y), options.player.attackRange, enemy.r)
        : 1,
      drawBoss: (kind) => boss.drawBoss[kind](),
      drawBossHitboxes: boss.drawBossHitboxes,
      drawOverWorld: createSoulParticles({ ctx: options.ctx, camera: options.camera, image: () => options.assets.townVillageProps,
        viewport: options.viewport, time: options.gameTime, active: () => isTownMap(options.currentMapId()) && !lowPerformance() }),
      drawBootPickup: () => renderer.drawBootPickup(),
      drawPortal: world.drawPortal,
      drawSecondaryPortal: world.drawSecondaryPortal,
      // Anyone standing still at a guild hall's table is drawn sitting at it.
      drawRemotePlayer: remote => {
        const seat = remote.moving ? null : seatedAt(remote.x, remote.y);
        drawSeated(options.ctx, remote.x, remote.y, remote.y - options.camera.y, seat, () => actor.drawRemotePlayer(seat ? { ...remote, facing: GUILD_HALL_SEAT_FACING[seat.side] } : remote));
      },
      drawPlayer: () => drawSeated(options.ctx, options.player.x, options.player.y, options.player.y - options.camera.y, options.player.moving ? null : seatedAt(options.player.x, options.player.y), () => drawSoulWellFall(options.ctx, options.player.x - options.camera.x, options.player.y - options.camera.y, options.player.y,
        () => drawTownTeleport(options.ctx, options.player.x - options.camera.x, options.player.y - options.camera.y, () => actor.drawPlayer(
          frame.localIdentity(),
          options.publicPlayerName(frame.localIdentity(), frame.localDisplayName()),
          options.playerPower(options.player),
        )))),
    });
    invalidateDepthOrder = () => { depth.invalidateDepthOrder(); soulGround.invalidate(); hallGround.invalidate(); };
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
      drawDecor: () => { world.drawDecor(); soulGround.draw(); drawGroveShadows(); hallGround.draw(); },
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
      worldSprites,
      canvasDraws: options.worldContext?.realDraws,
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
