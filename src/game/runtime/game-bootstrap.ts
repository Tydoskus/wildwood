import { WORLD } from "../constants";
import { BASIC_PAPER_HAT, STARTER_STONE, type EquipmentSlot, type InventoryState } from "../inventory";
import { loadActorShadowSprite, loadEnemySprites } from "../enemies";
import { loadPlayerAppearanceAssets } from "../player-appearance";
import { ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, TUTORIAL_FOREST_MAP_ID, type SpawnSite, type WorldDecor, type WorldPath } from "../world";
import { createAssetPreprocessor } from "./asset-preprocessor";
import { createProfileCharacterPreview } from "./profile-character-preview";
import { updateCamera } from "./camera";
import type { BossRainStrike, DragonBossState, EnemyState, FrostclawBossState, FrostclawIcefall, PlayerState, SpiderBossState, SpiderVenomPool } from "./types";
import {
  DEFAULT_ATTACK_INTERVAL,
  MAP_DISPLAY_NAMES,
  PLAYER_BASE_HP,
  PLAYER_SPEED,
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
    maxHp: 1_000_000,
    hp: 1_000_000,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: 1_000_000,
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
    maxHp: 150_000_000,
    hp: 150_000_000,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: 150_000_000,
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
    maxHp: 750_000_000_000,
    hp: 750_000_000_000,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: 750_000_000_000,
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
  const bootsPickup = { x: 940, y: 3660, r: 18, collected: false };
  const inventory: BootstrapInventory = {
    itemIds: [BASIC_PAPER_HAT, STARTER_STONE],
    equippedHead: BASIC_PAPER_HAT,
    equippedChest: "",
    equippedFeet: "",
    equippedRightHand: STARTER_STONE,
    equippedLeftHand: "",
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
    inventory,
    mapConfig,
    paths,
    player,
    projectiles,
    projectileStore,
    spawnSites,
    spiderBoss,
    spiderVenom,
    startSpawn,
  };
}

/** Starts art loads and returns every renderer-facing asset bundle. */
export function createGameBootstrapAssets(options: {
  profileCharacterCanvas: HTMLCanvasElement;
  onWorldArtReady: () => void;
  onPlayerAppearanceAssetReady: () => void;
}) {
  const assets = createAssetPreprocessor(options.onWorldArtReady);
  const playerAppearanceAssets = loadPlayerAppearanceAssets(options.onPlayerAppearanceAssetReady);
  return {
    actorShadowSprite: loadActorShadowSprite(),
    assets,
    enemySprites: loadEnemySprites(),
    playerAppearanceAssets,
    profileCharacterPreview: createProfileCharacterPreview(options.profileCharacterCanvas, playerAppearanceAssets),
  };
}

/** Runs one-time client startup after controllers have been composed. */
export function startGameRuntime(options: {
  accountState: () => { returningFromSignIn?: boolean; signInRequired?: boolean; signedIn?: boolean; knownAccount?: boolean; authInProgress?: boolean } | undefined;
  showSigningIn: () => void;
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
  if (account?.returningFromSignIn) options.showSigningIn();
  else if (account?.signInRequired) options.showAccountChoice();
  else if (!account?.signedIn && !account?.knownAccount && !account?.authInProgress) options.showAccountChoice();
  else options.showConnecting();
  options.loadProgress();
  options.rebuildWorld();
  updateCamera(options.camera, options.player, options.viewport(), null, 1);
  options.render();
  requestAnimationFrame(options.loop);
}
