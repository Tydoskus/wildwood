// The game's actor and plate renderers wired to fake, in-memory state: no coop client, no network.
import { createCanvasPrimitives } from "../../src/game/canvas";
import { requiredCanvasContext } from "../../src/game/runtime/dom";
import { canvasRenderPixelRatio } from "../../src/game/runtime/render/render-budget";
import { residentDrawable } from "../../src/game/runtime/render/resident-image";
import { actorShadowDimensions } from "../../src/game/runtime/render/actor-shadow-geometry";
import { createActorRenderer } from "../../src/game/runtime/render/actor-renderer";
import { createPlayerIdentityRenderer } from "../../src/game/runtime/render/player-identity-renderer";
import { platePixels, plateSize } from "../../src/game/runtime/render/nameplate-scale";
import { WORLD_HEALTH_BAR_HEIGHT, WORLD_HEALTH_BAR_RADIUS } from "../../src/game/runtime/game-settings";
import { playerGenderIconPath } from "../../src/game/player-gender-icon";
import { bindPlayerNameTags } from "../../src/app/player-name-tags";
import { DEFAULT_SKIN_TONE, drawStartingPlayer, equipmentSprite, loadPlayerAppearanceAssets, type PlayerAppearanceAssets } from "../../src/game/player-appearance";
import { createMapScopedEnemySpriteAssets, ENEMY_TYPES, loadActorShadowSprite, type EnemyDefinition, type EnemyKind, type EnemySpriteSource, type LoadedEnemySprite } from "../../src/game/enemies";
import { ENEMY_SPRITE_LAYOUTS } from "../../src/game/enemy-sprite-layouts.mjs";
import { PLAYER_GENDER_FEMALE, PLAYER_GENDER_MALE, PLAYER_GENDER_UNSET, type PlayerGender } from "../../shared/player-gender";
import type { Camera } from "../../src/game/runtime/render/camera";
import type { EnemyState, PlayerState } from "../../src/game/runtime/types";
import type { PlayerDeathAnimationState } from "../../src/game/runtime/player-death-animation";
import type { ChatMessage, RemotePlayer } from "../../src/coop/contracts";

/** Ground the actors stand on: flat, so plates and outlines read against one known colour. */
export const GROUND = "#4f8a3c";

export type SceneCanvas = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number; dpr: number };

/** A canvas `width` × `height` CSS pixels, backed as the game backs its own (render-budget's pixel ratio). */
export function sceneCanvas(parent: HTMLElement, width: number, height: number): SceneCanvas {
  const dpr = canvasRenderPixelRatio(window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.className = "vc-canvas";
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  parent.append(canvas);
  const ctx = requiredCanvasContext(canvas, { alpha: false });
  return { canvas, ctx, width, height, dpr };
}

/** Clears to the ground colour with the game's base transform (CSS pixels, no smoothing). */
export function resetCanvas(scene: SceneCanvas, color = GROUND) {
  const { ctx, dpr } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, scene.canvas.width, scene.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

const LABEL_FONT = "bold 11px Arial, sans-serif";

/** A caption on a scene's canvas, light on a dark shadow so it reads on any ground. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = "center") {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#101410";
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = "#f2f2e8";
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function section(title: string) {
  const element = document.createElement("section");
  element.className = "vc-section";
  const heading = document.createElement("p");
  heading.className = "vc-title";
  heading.textContent = title;
  element.append(heading);
  document.body.append(element);
  return element;
}

let appearanceAssets: Promise<PlayerAppearanceAssets> | null = null;
/** Every piece of gear's art, loaded once (the game's own loader). */
export function playerAppearance() {
  appearanceAssets ??= new Promise(resolve => {
    const assets: PlayerAppearanceAssets = loadPlayerAppearanceAssets(() => resolve(assets));
  });
  return appearanceAssets;
}

/** Enemy art for these kinds, through the game's map-scoped loader, loaded and decoded. */
export async function enemySprites(kinds: readonly string[]) {
  const sources = ENEMY_SPRITE_LAYOUTS as unknown as Record<string, EnemySpriteSource>;
  const assets = createMapScopedEnemySpriteAssets(sources, { scene: kinds });
  await assets.ensureMapSprites("scene");
  return assets.sprites as Record<string, LoadedEnemySprite>;
}

/** A fake player of the plates and gear scenes. */
export type FakePlayer = {
  id: string;
  name: string;
  power: number;
  hp: number;
  maxHp: number;
  guest?: boolean;
  developer?: boolean;
  guildTag?: string;
  prestige?: number;
  gender?: PlayerGender;
  skinTone?: number;
  headItem?: string;
  chestItem?: string;
  feetItem?: string;
  rightHandItem?: string;
  leftHandItem?: string;
  /** Shown in a fight (a status plate with a bar) rather than as a name and power only. */
  fighting?: boolean;
  chat?: string;
};

const DEFAULT_ENEMY: EnemyDefinition = { hp: 10, speed: 0, damage: 1, attackSpeed: 1, r: 18, color: "#888", outline: "#222", reward: { type: "damage", amount: 1 } };

/** An enemy at rest at (x, y), filled out the way the simulation leaves one. */
export function fakeEnemy(type: string, x: number, y: number, extra: Partial<EnemyState> = {}): EnemyState {
  const definition = ENEMY_TYPES[type as EnemyKind] ?? DEFAULT_ENEMY;
  return {
    x, y, r: definition.r, type: type as EnemyKind, siteId: 0, campName: "", homeX: x, homeY: y, vx: 0, vy: 0,
    hp: definition.hp, maxHp: definition.hp, speed: definition.speed, damage: definition.damage, reward: definition.reward,
    aggroRadius: 0, leashRange: 0, engaged: false, leashing: false, facingX: 1, wandering: false,
    wanderTargetX: x, wanderTargetY: y, wanderWait: 0, attackClock: 0, moveSpeedRecovery: 0, hurt: 0, dead: false, phase: 0,
    idleUpdateElapsed: 0, ...(ENEMY_TYPES[type as EnemyKind] ? {} : { definition }), ...extra,
  };
}

const taggedPlayers = new Map<string, FakePlayer>();
const image = (src: string) => { const element = new Image(); element.src = src; return element; };

/** A chat line from a fake player, sent `agoMs` before now. */
export function chatLine(player: FakePlayer, message: string, agoMs = 1_000, id = 1): ChatMessage {
  return {
    id: BigInt(id), sender: player.id, senderName: player.name, message, replayId: 0n, powerLevel: player.power,
    senderGender: player.gender ?? PLAYER_GENDER_UNSET, moderated: false, replyToMessageId: 0n, replyToSenderName: "", replyToMessage: "",
    sentAtMs: Date.now() - agoMs,
  };
}

/** The overhead plates and chat bubbles (player-identity-renderer.ts) over fake players. */
export function createIdentity(ctx: CanvasRenderingContext2D, camera: Camera, viewport: { width: number; height: number }, people: readonly FakePlayer[],
  options: { chat?: ChatMessage[]; invisible?: (identity: string | undefined) => boolean } = {}) {
  const players = new Map(people.map(player => [player.id, player]));
  const primitives = createCanvasPrimitives(ctx);
  const chat = options.chat ?? people.filter(player => player.chat).map((player, index) => chatLine(player, player.chat!, 1_000, index + 1));
  return createPlayerIdentityRenderer({
    ctx,
    camera,
    viewport: () => viewport,
    onProfileIconsLoaded: () => {},
    powerIcon: image("assets/wildstat/icons/Icon_Battle_Candy_v2.webp"),
    genderIcons: {
      [PLAYER_GENDER_MALE]: image(playerGenderIconPath(PLAYER_GENDER_MALE)),
      [PLAYER_GENDER_FEMALE]: image(playerGenderIconPath(PLAYER_GENDER_FEMALE)),
    },
    isDeveloper: id => Boolean(id && players.get(id)?.developer),
    isLocallyInvisible: id => options.invisible?.(id) ?? false,
    isGuest: id => Boolean(id && players.get(id)?.guest),
    profileIcon: () => 0,
    playerGender: id => (id ? players.get(id)?.gender : undefined) ?? PLAYER_GENDER_UNSET,
    chatRevision: () => 1,
    chatMessages: () => chat,
    outlinedText: primitives.outlinedWorldText,
    fillText: primitives.fillWorldText,
    roundRect: primitives.roundRect,
    healthBarHeight: platePixels(WORLD_HEALTH_BAR_HEIGHT),
    healthBarRadius: plateSize(WORLD_HEALTH_BAR_RADIUS),
  });
}

/**
 * The world renderers as the game builds them (world-render-runtime.ts, app/wiring/player-identity-wiring.ts), with fake
 * players behind the identity lookups. Draws in world space: callers scale the context by `camera.zoom`.
 */
export async function createWorld(ctx: CanvasRenderingContext2D, options: {
  zoom: number;
  /** The canvas in CSS pixels, for the renderers' off-screen culling. */
  viewport: { width: number; height: number };
  players?: readonly FakePlayer[];
  enemySprites?: Record<string, LoadedEnemySprite>;
  /** A fallen local or remote player, and the clock their fall is timed against. */
  localDeath?: () => PlayerDeathAnimationState | null;
  remoteDeath?: (identity: string) => PlayerDeathAnimationState | null;
  nowMs?: () => number;
  /** Chat to show over players instead of each player's `chat` line. */
  chat?: ChatMessage[];
  invisible?: (identity: string | undefined) => boolean;
}) {
  const players = new Map((options.players ?? []).map(player => [player.id, player]));
  // Name tags are looked up globally: every world on the page answers for its own players.
  for (const player of players.values()) taggedPlayers.set(player.id, player);
  bindPlayerNameTags({
    prefix: id => {
      const player = id ? taggedPlayers.get(id) : undefined;
      return `${player?.developer ? "[dev]" : ""}${player?.guildTag ? `[${player.guildTag}]` : ""}`;
    },
    revision: () => 0,
    prestigeLevel: id => (id ? taggedPlayers.get(id)?.prestige : 0) ?? 0,
  });
  const assets = await playerAppearance();
  const primitives = createCanvasPrimitives(ctx);
  const camera: Camera = { x: 0, y: 0, zoom: options.zoom };
  let gameTime = 0;
  const shadowSprite = loadActorShadowSprite();
  const duelPlatformArt = new Image();
  // As canvas-runtime.ts drawActorShadow.
  const drawShadow = (x: number, y: number, shadowWidth: number, alpha = .38) => {
    const shadowHeight = actorShadowDimensions(shadowWidth).height;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadowSprite.complete && shadowSprite.naturalWidth > 0) {
      ctx.drawImage(residentDrawable(shadowSprite), x - shadowWidth / 2, y - shadowHeight / 2, Math.round(shadowWidth), shadowHeight);
    }
    ctx.restore();
  };
  const identity = createIdentity(ctx, camera, options.viewport, [...players.values()], { chat: options.chat, invisible: options.invisible });
  const enemies: EnemyState[] = [];
  const local: PlayerState = {
    x: 0, y: 0, r: 16, speed: 0, hp: 1, baseMaxHp: 1, maxHp: 1, damage: 1, attackRate: 1, projectileSpeed: 1, projectileCount: 1,
    attackRange: 1, knockback: 0, armor: 0, regen: 0, attackClock: 0, throwClock: 0, hurtClock: 0, facing: 0, combatFacing: null, moving: false,
  };
  let localGear: Pick<FakePlayer, "headItem" | "chestItem" | "feetItem" | "rightHandItem" | "leftHandItem"> = {};
  const actor = createActorRenderer({
    ctx,
    camera,
    viewport: () => options.viewport,
    devicePixelRatio: () => canvasRenderPixelRatio(window.devicePixelRatio || 1),
    gameTime: () => gameTime,
    nowMs: options.nowMs ?? (() => performance.now()),
    localDeath: options.localDeath ?? (() => null),
    remoteDeath: options.remoteDeath ?? (() => null),
    drawPlayerAppearance: (rendered, alpha) => drawStartingPlayer(ctx, assets, {
      ...rendered,
      gameTime: rendered.gameTime ?? gameTime,
      skinTone: rendered.skinTone ?? players.get(rendered.identity ?? rendered.id ?? "")?.skinTone ?? DEFAULT_SKIN_TONE,
      alpha,
    }),
    localHeadItem: () => localGear.headItem ?? "",
    localChestItem: () => localGear.chestItem ?? "",
    localFeetItem: () => localGear.feetItem ?? "",
    localRightHandItem: () => localGear.rightHandItem ?? "",
    localLeftHandItem: () => localGear.leftHandItem ?? "",
    equipmentForIdentity: id => (id ? players.get(id) : undefined) ?? {},
    itemSprite: (itemId, refineLevel) => equipmentSprite(assets, itemId, refineLevel),
    enemySprites: options.enemySprites ?? {},
    enemies,
    activeBossTarget: () => null,
    remoteAttackRange: 0,
    duelPlatformArt,
    player: local,
    rewardMultiplier: () => 1,
    enemyTextVisible: () => true,
    pixelCircle: primitives.pixelCircle,
    outlinedText: primitives.outlinedWorldText,
    outlinedSegments: primitives.outlinedWorldSegments,
    drawShadow,
    drawStatus: identity.drawActorStatus,
    drawIdentity: identity.drawPlayerIdentity,
    drawSpeechBubble: identity.drawSpeechBubble,
    publicName: identity.publicPlayerName,
    worldHealthBarHeight: WORLD_HEALTH_BAR_HEIGHT,
    mapId: () => "visual-check",
  });

  /** The local player, drawn by drawPlayer with its own plate. */
  function drawLocalPlayer(player: FakePlayer, x: number, y: number) {
    Object.assign(local, { x, y, hp: player.hp, maxHp: player.maxHp, facing: 0, moving: false });
    localGear = player;
    actor.drawPlayer(player.id, identity.publicPlayerName(player.id, player.name), player.power);
  }

  /** Another player, drawn by drawRemotePlayer: a status plate in a fight, a name and power otherwise. */
  function drawRemotePlayer(player: FakePlayer, x: number, y: number) {
    const remote: RemotePlayer = {
      id: player.id, name: player.name, power: player.power, x, y, speed: 0, facing: 0, moving: false,
      headItem: player.headItem ?? "", chestItem: player.chestItem ?? "", feetItem: player.feetItem ?? "",
      rightHandItem: player.rightHandItem ?? "", leftHandItem: player.leftHandItem ?? "",
      ...(player.fighting ? {
        regularEnemyCombat: {
          enemySiteId: 0, targetX: x + 400, targetY: y, targetRadius: 10, hits: 0, projectileProgress: 0, throwClock: 0,
          critical: false, hp: player.hp, maxHp: player.maxHp,
        },
      } : {}),
    };
    actor.drawRemotePlayer(remote);
  }

  return {
    camera,
    actor,
    identity,
    assets,
    drawLocalPlayer,
    drawRemotePlayer,
    setGameTime: (seconds: number) => { gameTime = seconds; },
    /** Bubbles are laid out from the chat once per frame, before the players. */
    updateSpeechBubbles: identity.updateSpeechBubbles,
  };
}
