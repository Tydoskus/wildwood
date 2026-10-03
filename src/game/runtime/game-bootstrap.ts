import { CAMPAIGN_MAPS } from "../../../shared/campaign-registry";
import { HOME_TRAVEL_PORTAL, HOME_EXTERIOR_SPAWN } from "../../../shared/home";
import { ONBOARDING_MAP_ID, ONBOARDING_WORLD } from "../../../shared/onboarding";
import { generateMap, proceduralMapId, PROCEDURAL_ENTRY_MAP } from "../../../shared/procedural-maps";
import { withGeneratedMaps } from "../procedural-maps";
import { STARTER_STONE, type EquipmentSlot, type InventoryState } from "../inventory";
import { loadActorShadowSprite, loadEnemySprites, type EnemyKind } from "../enemies";
import { loadPlayerAppearanceAssets } from "../player-appearance";
import { ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOUDSPIRE_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, MOONFEN_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID, NEON_BASTION_MAP_ID, VERDANT_CATACOMBS_MAP_ID, ION_CITADEL_MAP_ID, SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID, WATER_REACH_MAP_ID, type MapId, type SpawnSite, type WorldDecor, type WorldPath } from "../world";
import { createAssetPreprocessor } from "./asset-preprocessor";
import { MAP_ENEMY_SPRITE_GROUPS } from "./map-asset-groups";
import { createProfileCharacterPreview } from "./profile-character-preview";
import { createLeaderboardPodiumPreview } from "./leaderboard-podium-preview";
import { createInventoryCharacterPreview } from "./inventory-character-preview";
import { updateCamera } from "./camera";
import type { EnemyState, PlayerState } from "./types";
import { BOSSES, perBoss, type BossHazards, type BossKind, type BossStates } from "./boss-registry";
import {
  DEFAULT_ATTACK_INTERVAL,
  MAP_DISPLAY_NAMES,
  numberedMapName,
  PLAYER_BASE_HP,
  PLAYER_BASE_DAMAGE,
  PLAYER_BASE_REGEN,
  PLAYER_SPAWN,
  PLAYER_SPEED,
} from "../../../shared/rules";
import { BASE_ATTACK_RANGE, BASE_PROJECTILE_SPEED } from "../constants";
import { createProjectileStore } from "./projectile-store";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../../shared/map-editor-overrides";
import { savedMapDesign, savedMapName } from "../map-design";
import { requestFrame } from "../../app/trusted-clock";

type BootstrapMapPortal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type BootstrapMapEntry = { name: string; portal: BootstrapMapPortal | null; arrival: { x: number; y: number }; secondaryPortal?: BootstrapMapPortal };

function editedMapEntry<T extends BootstrapMapEntry>(mapId: MapId, fallback: T): T {
  const edit = MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId];
  const name = numberedMapName(mapId, savedMapName(mapId) ?? edit?.name ?? fallback.name);
  if (!edit || edit.portals.length === 0) return { ...fallback, name };
  const portals = edit.portals.map((portal) => ({ ...portal, destination: portal.destination as MapId }));
  return {
    name,
    arrival: { ...edit.arrival },
    portal: portals[0],
    ...(portals[1] ? { secondaryPortal: portals[1] } : {}),
  } as T;
}

function editedBossPosition(mapId: MapId, fallback: { x: number; y: number }) {
  const boss = MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.boss;
  return boss ? { ...boss } : fallback;
}

/** A world boss at full health on its spawn, as the registry describes it. */
function createBossState<K extends BossKind>(kind: K): BossStates[K] {
  const { mapId, spawn, body, firstAttack, attackSlots } = BOSSES[kind];
  const position = editedBossPosition(mapId, spawn);
  const maxHp = BOSSES[kind].maxHp();
  return {
    isBoss: true,
    // The Dragon predates boss kinds and is recognised by having none.
    ...(kind === "dragon" ? {} : { bossKind: kind }),
    x: position.x,
    y: position.y,
    r: body.radius,
    ry: body.verticalRadius,
    hitboxOffsetY: body.hitboxOffsetY,
    maxHp,
    hp: maxHp,
    dead: false,
    hurt: 0,
    hpLossFlashFrom: maxHp,
    hpLossFlashTimer: 0,
    contactDamageClock: 0,
    attackClock: 3,
    nextAttack: firstAttack,
    ...Object.fromEntries(attackSlots.map((slot) => [slot, null])),
    encounter: null,
  } as unknown as BossStates[K];
}

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
  const bossHazards = perBoss(() => []) as BossHazards;
  const startSpawn = { ...PLAYER_SPAWN };
  const authoredMapConfig = {
    [ONBOARDING_MAP_ID]: { name: "First Steps", portal: null, arrival: ONBOARDING_WORLD.spawn },
    home_exterior: { name: "Home", portal: HOME_TRAVEL_PORTAL, arrival: HOME_EXTERIOR_SPAWN },
    [TUTORIAL_FOREST_MAP_ID]: editedMapEntry(TUTORIAL_FOREST_MAP_ID, {
      name: MAP_DISPLAY_NAMES[TUTORIAL_FOREST_MAP_ID],
      portal: { x: 190, y: 448, width: 198, height: 198, depth: 448, destination: BEGINNER_DESERT_MAP_ID },
      arrival: { x: 190, y: 540 },
    }),
    [BEGINNER_DESERT_MAP_ID]: editedMapEntry(BEGINNER_DESERT_MAP_ID, {
      name: MAP_DISPLAY_NAMES[BEGINNER_DESERT_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: TUTORIAL_FOREST_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
      arrival: { x: 360, y: 770 },
    }),
    [INTERMEDIATE_SNOWLANDS_MAP_ID]: editedMapEntry(INTERMEDIATE_SNOWLANDS_MAP_ID, {
      name: MAP_DISPLAY_NAMES[INTERMEDIATE_SNOWLANDS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: BEGINNER_DESERT_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: ADVANCED_LAVA_WASTES_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [ADVANCED_LAVA_WASTES_MAP_ID]: editedMapEntry(ADVANCED_LAVA_WASTES_MAP_ID, {
      name: MAP_DISPLAY_NAMES[ADVANCED_LAVA_WASTES_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: INTERMEDIATE_SNOWLANDS_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: INFERNAL_DEPTHS_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [INFERNAL_DEPTHS_MAP_ID]: editedMapEntry(INFERNAL_DEPTHS_MAP_ID, {
      name: MAP_DISPLAY_NAMES[INFERNAL_DEPTHS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: ADVANCED_LAVA_WASTES_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: WATER_REACH_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [WATER_REACH_MAP_ID]: editedMapEntry(WATER_REACH_MAP_ID, {
      name: MAP_DISPLAY_NAMES[WATER_REACH_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: INFERNAL_DEPTHS_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: SAMURAI_GARDEN_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [SAMURAI_GARDEN_MAP_ID]: editedMapEntry(SAMURAI_GARDEN_MAP_ID, {
      name: MAP_DISPLAY_NAMES[SAMURAI_GARDEN_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: WATER_REACH_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: CLOUDSPIRE_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [CLOUDSPIRE_MAP_ID]: editedMapEntry(CLOUDSPIRE_MAP_ID, {
      name: MAP_DISPLAY_NAMES[CLOUDSPIRE_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: SAMURAI_GARDEN_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: MOONFEN_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [MOONFEN_MAP_ID]: editedMapEntry(MOONFEN_MAP_ID, {
      name: MAP_DISPLAY_NAMES[MOONFEN_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: CLOUDSPIRE_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: CRYSTAL_HOLLOWS_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
    [CRYSTAL_HOLLOWS_MAP_ID]: editedMapEntry(CRYSTAL_HOLLOWS_MAP_ID, {
      name: MAP_DISPLAY_NAMES[CRYSTAL_HOLLOWS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: MOONFEN_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: CLOCKWORK_RUINS_MAP_ID },
      arrival: { x: 580, y: 770 },
    }), [CLOCKWORK_RUINS_MAP_ID]: editedMapEntry(CLOCKWORK_RUINS_MAP_ID, {
      name: MAP_DISPLAY_NAMES[CLOCKWORK_RUINS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: CRYSTAL_HOLLOWS_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: DUSKFALL_ORCHARD_MAP_ID },
      arrival: { x: 580, y: 770 },
    }), [DUSKFALL_ORCHARD_MAP_ID]: editedMapEntry(DUSKFALL_ORCHARD_MAP_ID, {
      name: MAP_DISPLAY_NAMES[DUSKFALL_ORCHARD_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: CLOCKWORK_RUINS_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: NEON_BASTION_MAP_ID },
      arrival: { x: 580, y: 770 },
    }), [NEON_BASTION_MAP_ID]: editedMapEntry(NEON_BASTION_MAP_ID, {
      name: MAP_DISPLAY_NAMES[NEON_BASTION_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: DUSKFALL_ORCHARD_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: VERDANT_CATACOMBS_MAP_ID },
      arrival: { x: 580, y: 770 },
    }), [VERDANT_CATACOMBS_MAP_ID]: editedMapEntry(VERDANT_CATACOMBS_MAP_ID, {
      name: MAP_DISPLAY_NAMES[VERDANT_CATACOMBS_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: NEON_BASTION_MAP_ID },
      secondaryPortal: { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: ION_CITADEL_MAP_ID },
      arrival: { x: 580, y: 770 },
    }), [ION_CITADEL_MAP_ID]: editedMapEntry(ION_CITADEL_MAP_ID, {
      name: MAP_DISPLAY_NAMES[ION_CITADEL_MAP_ID],
      portal: { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: VERDANT_CATACOMBS_MAP_ID },
      arrival: { x: 580, y: 770 },
    }),
  } satisfies Record<MapId, BootstrapMapEntry>;
  const campaignConfig = authoredMapConfig as Record<string, BootstrapMapEntry>;
  for (const [index, map] of CAMPAIGN_MAPS.entries()) {
    campaignConfig[map.id] ??= editedMapEntry(map.id as MapId, {
      name: MAP_DISPLAY_NAMES[map.id], arrival: { x: 580, y: 770 },
      portal: index ? { x: 360, y: 680, width: 198, height: 198, depth: 680, destination: CAMPAIGN_MAPS[index - 1].id as MapId } : null,
    });
    const next = CAMPAIGN_MAPS[index + 1];
    if (next && ![campaignConfig[map.id].portal, campaignConfig[map.id].secondaryPortal].some(portal => portal?.destination === next.id)) {
      campaignConfig[map.id].secondaryPortal = { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: next.id as MapId };
    }
  }
  const mapConfig = withGeneratedMaps<BootstrapMapEntry>(authoredMapConfig, id => {
    const map = generateMap(id);
    return { name: map.name, arrival: map.arrival, portal: { ...map.portals[0], destination: map.portals[0].destination as MapId }, secondaryPortal: map.portals[1] ? { ...map.portals[1], destination: map.portals[1].destination as MapId } : undefined };
  }) as typeof authoredMapConfig & Record<MapId, BootstrapMapEntry>;
  mapConfig[PROCEDURAL_ENTRY_MAP as MapId].secondaryPortal = { x: 580, y: 680, width: 198, height: 198, depth: 680, destination: proceduralMapId(1) };
  const player: PlayerState = {
    x: startSpawn.x, y: startSpawn.y, r: 17,
    speed: PLAYER_SPEED,
    hp: PLAYER_BASE_HP,
    baseMaxHp: PLAYER_BASE_HP,
    maxHp: PLAYER_BASE_HP,
    damage: PLAYER_BASE_DAMAGE,
    attackRate: DEFAULT_ATTACK_INTERVAL,
    projectileSpeed: BASE_PROJECTILE_SPEED,
    projectileCount: 1,
    attackRange: BASE_ATTACK_RANGE,
    knockback: 0,
    armor: 0,
    regen: PLAYER_BASE_REGEN,
    attackClock: 0,
    throwClock: 0,
    hurtClock: 0,
    facing: 0,
    combatFacing: null,
    moving: false,
  };
  const bosses = perBoss(createBossState) as BossStates;
  const editedBootsPickup = MAP_EDITOR_GAMEPLAY_OVERRIDES[TUTORIAL_FOREST_MAP_ID]?.bootsPickup;
  const bootsPickup = { x: editedBootsPickup?.x ?? 940, y: editedBootsPickup?.y ?? 3660, r: 18, collected: true };
  const inventory: BootstrapInventory = {
    itemIds: [STARTER_STONE],
    cosmeticItemIds: [],
    equippedHead: "",
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
    bossHazards,
    bosses,
    bootsPickup,
    decor,
    enemies,
    enemyShots,
    inventory,
    mapConfig,
    paths,
    player,
    projectiles,
    projectileStore,
    spawnSites,
    startSpawn,
  };
}

/** Builds every renderer-facing bundle while starting only shared/core art. */
export function createGameBootstrapAssets(options: {
  profileCharacterCanvas: HTMLCanvasElement;
  inventoryCharacterCanvas: HTMLCanvasElement;
  onWorldArtReady: () => void;
  onPlayerAppearanceAssetReady: () => void;
}) {
  const preprocessedAssets = createAssetPreprocessor(options.onWorldArtReady);
  const spriteKinds = (mapId: MapId) => [...new Set([
    ...MAP_ENEMY_SPRITE_GROUPS[mapId],
    ...(savedMapDesign(mapId)?.spawnCamps.flatMap((camp) => camp.types) ?? []),
  ])];
  // Generated IDs are intentionally not enumerable. Preserve their lazy lookup
  // when layering saved map edits over the authored groups.
  const editedEnemySpriteGroups = withGeneratedMaps<readonly EnemyKind[]>({}, spriteKinds);
  for (const mapId of Object.keys(MAP_ENEMY_SPRITE_GROUPS) as MapId[]) {
    editedEnemySpriteGroups[mapId] = spriteKinds(mapId);
  }
  const enemyAssets = loadEnemySprites(editedEnemySpriteGroups, options.onWorldArtReady);
  let actorShadowReady = false;
  const actorShadowSprite = loadActorShadowSprite(() => {
    actorShadowReady = true;
    options.onWorldArtReady();
  });
  const ensureMapAssets = (mapId: MapId) => Promise.all([
    preprocessedAssets.ensureMapAssets(mapId),
    enemyAssets.ensureMapSprites(mapId),
  ]).then(() => undefined);
  const mapAssetsReady = (mapId: MapId) =>
    preprocessedAssets.mapAssetsReady(mapId) && enemyAssets.mapSpritesReady(mapId);
  const mapAssetLoadFailed = (mapId: MapId) =>
    preprocessedAssets.mapAssetLoadFailed(mapId) || enemyAssets.mapSpriteLoadFailed(mapId);
  const assets = {
    ...preprocessedAssets,
    ensureMapAssets,
    releaseMapAssetsExcept: (keep: readonly MapId[]) => {
      preprocessedAssets.releaseMapAssetsExcept(keep);
      enemyAssets.releaseMapSpritesExcept(keep);
    },
    mapAssetLoadFailed,
    mapAssetsReady,
    worldArtReady: (mapId?: MapId) => {
      if (mapId) void ensureMapAssets(mapId);
      return preprocessedAssets.worldArtReady() && actorShadowReady && (!mapId || mapAssetsReady(mapId));
    },
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

/** Runs one-time client startup after controllers have been composed. */
export function startGameRuntime(options: {
  loadProgress: () => void;
  rebuildWorld: () => void;
  camera: { x: number; y: number; zoom: number };
  player: PlayerState;
  viewport: () => { width: number; height: number };
  render: () => void;
  loop: FrameRequestCallback;
}) {
  options.loadProgress();
  options.rebuildWorld();
  updateCamera(options.camera, options.player, options.viewport(), null, 1);
  options.render();
  window.dispatchEvent(new Event("wildstat:game-boot-ready"));
  requestFrame(options.loop);
}
