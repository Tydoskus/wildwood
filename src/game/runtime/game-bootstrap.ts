import { WORLD } from "../constants";
import { BASIC_PAPER_HAT, STARTER_STONE, type EquipmentSlot, type InventoryState } from "../inventory";
import { loadActorShadowSprite, loadEnemySprites } from "../enemies";
import { loadPlayerAppearanceAssets } from "../player-appearance";
import { ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOUDSPIRE_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID, WATER_REACH_MAP_ID, type MapId, type SpawnSite, type WorldDecor, type WorldPath } from "../world";
import { createAssetPreprocessor } from "./asset-preprocessor";
import { createProfileCharacterPreview } from "./profile-character-preview";
import { createLeaderboardPodiumPreview } from "./leaderboard-podium-preview";
import { createInventoryCharacterPreview } from "./inventory-character-preview";
import { updateCamera } from "./camera";
import type { BossRainStrike, DragonBossState, EnemyState, FrostclawBossState, FrostclawIcefall, GloomrootBloom, GloomrootBossState, KoiShogunBossState, KoiShogunWhirlpool, MagmaliskBossState, MagmaliskEruption, PlayerState, SpiderBossState, SpiderVenomPool, TempestKirinBossState, TempestKirinThunderbolt, TidewyrmBossState, TidewyrmWhirlpool } from "./types";
import {
  DEFAULT_ATTACK_INTERVAL,
  DRAGON_MAX_HP,
  FROSTCLAW_MAX_HP,
  GLOOMROOT_MAX_HP,
  KOI_SHOGUN_MAX_HP,
  MAGMALISK_MAX_HP,
  MAP_DISPLAY_NAMES,
  PLAYER_BASE_HP,
  PLAYER_SPEED,
  SPIDER_MAX_HP,
  TEMPEST_KIRIN_MAX_HP,
  TIDEWYRM_MAX_HP,
} from "../../../shared/rules";
import { BASE_ATTACK_RANGE, BASE_PROJECTILE_SPEED } from "../constants";
import { createProjectileStore } from "./projectile-store";

export type BootstrapInventory = InventoryState & {
  selectedItemId: string;
  selectedItemLocation: EquipmentSlot | "BAG" | "";
};

/** Immutable map rules plus mutable game entities allocated once per session. */
export function createGameBootstrap() {
  const projectileStore = createProjectileStore();
  const { projectiles, enemyShots } = projectileStore;
  const enemies: EnemyState[] = [];
  const spawnSites: SpawnSite[] = [];
  const decor: WorldDecor[] = [];
  const paths: WorldPath[] = [];
  const bossRain: BossRainStrike[] = [];
  const spiderVenom: SpiderVenomPool[] = [];
  const frostclawIcefalls: FrostclawIcefall[] = [];
  const magmaliskEruptions: MagmaliskEruption[] = [];
  const gloomrootBlooms: GloomrootBloom[] = [];
  const tidewyrmWhirlpools: TidewyrmWhirlpool[] = [];
  const koiShogunWhirlpools: KoiShogunWhirlpool[] = [];
  const tempestKirinThunderbolts: TempestKirinThunderbolt[] = [];
  const startSpawn = { x: 360, y: 360 };
  const mapConfig = {
    [TUTORIAL_FOREST_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[TUTORIAL_FOREST_MAP_ID],
      portal: { x: 190, y: 448, width: 198, height: 198, depth: 448, destination: BEGINNER_DESERT_MAP_ID },
      arrival: { x: 190, y: 540 },
    },
    [BEGINNER_DESERT_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[BEGINNER_DESERT_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: TUTORIAL_FOREST_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
      arrival: { x: 360, y: 770 },
    },
    [INTERMEDIATE_SNOWLANDS_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[INTERMEDIATE_SNOWLANDS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: BEGINNER_DESERT_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: ADVANCED_LAVA_WASTES_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
    [ADVANCED_LAVA_WASTES_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[ADVANCED_LAVA_WASTES_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: INFERNAL_DEPTHS_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
    [INFERNAL_DEPTHS_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[INFERNAL_DEPTHS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: ADVANCED_LAVA_WASTES_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: WATER_REACH_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
    [WATER_REACH_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[WATER_REACH_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: INFERNAL_DEPTHS_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: SAMURAI_GARDEN_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
    [SAMURAI_GARDEN_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[SAMURAI_GARDEN_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: WATER_REACH_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: CLOUDSPIRE_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
    [CLOUDSPIRE_MAP_ID]: {
      name: MAP_DISPLAY_NAMES[CLOUDSPIRE_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: SAMURAI_GARDEN_MAP_ID },
      arrival: { x: 580, y: 770 },
    },
  } as const;
  const player: PlayerState = {
    x: startSpawn.x, y: startSpawn.y, r: 17,
    speed: PLAYER_SPEED,
    hp: PLAYER_BASE_HP,
    baseMaxHp: PLAYER_BASE_HP,
    maxHp: PLAYER_BASE_HP,
    damage: 4,
    attackRate: DEFAULT_ATTACK_INTERVAL,
    projectileSpeed: BASE_PROJECTILE_SPEED,
    projectileCount: 1,
    attackRange: BASE_ATTACK_RANGE,
    knockback: 0,
    armor: 0,
    regen: 0,
    attackClock: 0,
    throwClock: 0,
    hurtClock: 0,
    facing: 0,
    combatFacing: null,
    moving: false,
  };
  const boss: DragonBossState = {
    isBoss: true,
    x: WORLD.w - 760,
    y: WORLD.h - 560,
    r: 140,
    maxHp: DRAGON_MAX_HP,
    hp: DRAGON_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: DRAGON_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "cone",
    cone: null,
    encounter: null,
  };
  const spiderBoss: SpiderBossState = {
    isBoss: true,
    bossKind: "spider",
    x: 4050,
    y: 4050,
    r: 125,
    maxHp: SPIDER_MAX_HP,
    hp: SPIDER_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: SPIDER_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "web",
    web: null,
    encounter: null,
  };
  const frostclawBoss: FrostclawBossState = {
    isBoss: true,
    bossKind: "frostclaw",
    x: 4050,
    y: 4050,
    r: 150,
    maxHp: FROSTCLAW_MAX_HP,
    hp: FROSTCLAW_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: FROSTCLAW_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "roar",
    roar: null,
    rift: null,
    pushAngle: 0,
    pushTimer: 0,
    encounter: null,
  };
  const magmaliskBoss: MagmaliskBossState = {
    isBoss: true,
    bossKind: "magmalisk",
    x: 4050,
    y: 4050,
    r: 165,
    maxHp: MAGMALISK_MAX_HP,
    hp: MAGMALISK_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: MAGMALISK_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "bite",
    bite: null,
    encounter: null,
  };
  const gloomrootBoss: GloomrootBossState = {
    isBoss: true,
    bossKind: "gloomroot",
    x: 4050,
    y: 4050,
    r: 175,
    maxHp: GLOOMROOT_MAX_HP,
    hp: GLOOMROOT_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: GLOOMROOT_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "sweep",
    sweep: null,
    encounter: null,
  };
  const tidewyrmBoss: TidewyrmBossState = {
    isBoss: true,
    bossKind: "tidewyrm",
    x: 4050,
    y: 4050,
    r: 175,
    maxHp: TIDEWYRM_MAX_HP,
    hp: TIDEWYRM_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: TIDEWYRM_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "surge",
    surge: null,
    encounter: null,
  };
  const koiShogunBoss: KoiShogunBossState = {
    isBoss: true,
    bossKind: "koiShogun",
    x: 4050,
    y: 4050,
    r: 175,
    maxHp: KOI_SHOGUN_MAX_HP,
    hp: KOI_SHOGUN_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: KOI_SHOGUN_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "slash",
    slash: null,
    encounter: null,
  };
  const tempestKirinBoss: TempestKirinBossState = {
    isBoss: true,
    bossKind: "tempestKirin",
    x: 4050,
    y: 4050,
    r: 180,
    maxHp: TEMPEST_KIRIN_MAX_HP,
    hp: TEMPEST_KIRIN_MAX_HP,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: TEMPEST_KIRIN_MAX_HP,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: "charge",
    charge: null,
    encounter: null,
  };
  const bootsPickup = { x: 940, y: 3660, r: 18, collected: false };
  const inventory: BootstrapInventory = {
    itemIds: [BASIC_PAPER_HAT, STARTER_STONE],
    equippedHead: BASIC_PAPER_HAT,
    equippedChest: "",
    equippedFeet: "",
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
    cosmeticHead: "",
    cosmeticChest: "",
    cosmeticFeet: "",
    cosmeticRightHand: "",
    cosmeticLeftHand: "",
    selectedItemId: "",
    selectedItemLocation: "",
  };

  return {
    boss,
    bossRain,
    bootsPickup,
    decor,
    enemies,
    enemyShots,
    frostclawBoss,
    frostclawIcefalls,
    gloomrootBlooms,
    gloomrootBoss,
    koiShogunBoss,
    koiShogunWhirlpools,
    inventory,
    magmaliskBoss,
    magmaliskEruptions,
    mapConfig,
    paths,
    player,
    projectiles,
    projectileStore,
    spawnSites,
    spiderBoss,
    spiderVenom,
    startSpawn,
    tidewyrmBoss,
    tidewyrmWhirlpools,
    tempestKirinBoss,
    tempestKirinThunderbolts,
  };
}

/** Starts art loads and returns every renderer-facing asset bundle. */
export function createGameBootstrapAssets(options: {
  profileCharacterCanvas: HTMLCanvasElement;
  inventoryCharacterCanvas: HTMLCanvasElement;
  onWorldArtReady: () => void;
  onPlayerAppearanceAssetReady: () => void;
}) {
  const preprocessedAssets = createAssetPreprocessor(options.onWorldArtReady);
  const enemyAssets = loadEnemySprites(options.onWorldArtReady);
  let actorShadowReady = false;
  const actorShadowSprite = loadActorShadowSprite(() => {
    actorShadowReady = true;
    options.onWorldArtReady();
  });
  const assets = {
    ...preprocessedAssets,
    worldArtReady: (mapId?: MapId) => preprocessedAssets.worldArtReady(mapId) && enemyAssets.ready() && actorShadowReady,
  };
  const playerAppearanceAssets = loadPlayerAppearanceAssets(options.onPlayerAppearanceAssetReady);
  return {
    actorShadowSprite,
    assets,
    enemySprites: enemyAssets.sprites,
    playerAppearanceAssets,
    leaderboardPodiumPreview: createLeaderboardPodiumPreview(playerAppearanceAssets),
    inventoryCharacterPreview: createInventoryCharacterPreview(options.inventoryCharacterCanvas, playerAppearanceAssets),
    profileCharacterPreview: createProfileCharacterPreview(options.profileCharacterCanvas, playerAppearanceAssets),
  };
}

type GameStartupAccountState = {
  returningFromSignIn?: boolean;
  signInRequired?: boolean;
  signedIn?: boolean;
  knownAccount?: boolean;
  authInProgress?: boolean;
  guestSessionApproved?: boolean;
  gameSessionApproved?: boolean;
};

export function shouldShowGameStartupAccountChoice(account: GameStartupAccountState | undefined) {
  if (account?.signedIn || account?.authInProgress || account?.returningFromSignIn
    || account?.guestSessionApproved || account?.gameSessionApproved) return false;
  return Boolean(account?.signInRequired || !account?.knownAccount);
}

/** Runs one-time client startup after controllers have been composed. */
export function startGameRuntime(options: {
  accountState: () => GameStartupAccountState | undefined;
  showAccountChoice: () => void;
  showConnecting: () => void;
  loadProgress: () => void;
  rebuildWorld: () => void;
  camera: { x: number; y: number; zoom: number };
  player: PlayerState;
  viewport: () => { width: number; height: number };
  render: () => void;
  loop: FrameRequestCallback;
}) {
  const account = options.accountState();
  if (shouldShowGameStartupAccountChoice(account)) options.showAccountChoice();
  else options.showConnecting();
  options.loadProgress();
  options.rebuildWorld();
  updateCamera(options.camera, options.player, options.viewport(), null, 1);
  options.render();
  requestAnimationFrame(options.loop);
}
