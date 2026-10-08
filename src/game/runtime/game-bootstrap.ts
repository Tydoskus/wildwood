import { SOUL_ARRIVAL, SOUL_MAP_ID, SOUL_TOWN_PORTAL } from "../../../shared/soul-dimension";
import { TOWN_ARRIVAL, TOWN_MAP_ID, TOWN_TRAVEL_PORTAL } from "../../../shared/town";
import { GUILD_HALL_ARRIVAL, GUILD_HALL_HOME_PAD } from "../../../shared/guild-hall";
import { CAMPAIGN_MAPS } from "../../../shared/campaign-registry";
import { HOME_TRAVEL_PORTAL, HOME_EXTERIOR_SPAWN } from "../../../shared/home";
import { ONBOARDING_MAP_ID, ONBOARDING_WORLD } from "../../../shared/onboarding";
import { generateMap, proceduralMapId, PROCEDURAL_ENTRY_MAP } from "../../../shared/procedural-maps";
import { withGeneratedMaps } from "../procedural-maps";
import { STARTER_STONE, type EquipmentSlot, type InventoryState } from "../inventory";
import { loadActorShadowSprite, loadEnemySprites, type EnemyKind } from "../enemies";
import { loadPlayerAppearanceAssets } from "../player-appearance";
import { TUTORIAL_FOREST_MAP_ID, type MapId, type SpawnSite, type WorldDecor, type WorldPath } from "../world";
import { createAssetPreprocessor } from "./asset-preprocessor";
import { MAP_ENEMY_SPRITE_GROUPS } from "./map-asset-groups";
import { createProfileCharacterPreview } from "./profile-character-preview";
import { createLeaderboardPodiumPreview } from "./leaderboard-podium-preview";
import { createInventoryCharacterPreview } from "./inventory-character-preview";
import { createProfileSnapshotRenderer } from "./profile-snapshot-render";
import { setProfileSnapshotRenderer } from "../../app/profile-snapshot-portraits";
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
import { CAMPAIGN_GATEWAYS, endlessEntryPortal } from "../../../shared/map-gateways";
import { MAP_EDITOR_GAMEPLAY_OVERRIDES } from "../../../shared/map-editor-overrides";
import { savedMapDesign, savedMapName } from "../map-design";
import { requestFrame } from "../../app/trusted-clock";

type BootstrapMapPortal = { x: number; y: number; width: number; height: number; depth: number; destination: MapId };
type BootstrapMapEntry = { name: string; portal: BootstrapMapPortal | null; arrival: { x: number; y: number }; secondaryPortal?: BootstrapMapPortal };

function campaignMapEntry(mapId: MapId): BootstrapMapEntry {
  const gateways = CAMPAIGN_GATEWAYS[mapId];
  const name = numberedMapName(mapId, savedMapName(mapId) ?? MAP_EDITOR_GAMEPLAY_OVERRIDES[mapId]?.name ?? MAP_DISPLAY_NAMES[mapId]);
  const [portal, secondaryPortal] = gateways.portals.map(portal => ({ ...portal, destination: portal.destination as MapId }));
  return { name, arrival: { ...gateways.arrival }, portal: portal ?? null, ...(secondaryPortal ? { secondaryPortal } : {}) };
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
    // Campaign portals and arrivals are shared with the server (shared/map-gateways.ts).
    ...Object.fromEntries(CAMPAIGN_MAPS.map(map => [map.id, campaignMapEntry(map.id as MapId)])) as Record<MapId, BootstrapMapEntry>,
    [ONBOARDING_MAP_ID]: { name: "First Steps", portal: null, arrival: ONBOARDING_WORLD.spawn },
    // Home is retired (the Town is the hub): nothing sends a player here; its pad leads to the Town.
    home_exterior: { name: "Home", portal: HOME_TRAVEL_PORTAL, arrival: HOME_EXTERIOR_SPAWN },
    // The travel portal opens the map picker (its destination is the picker's); the second, the Soul Dimension's,
    // is set by the soul runtime for players who may use it.
    [TOWN_MAP_ID]: { name: "Town", portal: { ...TOWN_TRAVEL_PORTAL, destination: TUTORIAL_FOREST_MAP_ID }, arrival: TOWN_ARRIVAL },
    [SOUL_MAP_ID]: { name: "Soul Dimension", portal: SOUL_TOWN_PORTAL, arrival: SOUL_ARRIVAL },
  };
  const mapConfig = withGeneratedMaps<BootstrapMapEntry>(authoredMapConfig, id => {
    const map = generateMap(id);
    return { name: map.name, arrival: map.arrival, portal: { ...map.portals[0], destination: map.portals[0].destination as MapId }, secondaryPortal: map.portals[1] ? { ...map.portals[1], destination: map.portals[1].destination as MapId } : undefined };
  // Every guild's hall: the yard's portal back to the Town at the foot of the path.
  }, { name: "Guild Hall", arrival: GUILD_HALL_ARRIVAL, portal: { ...GUILD_HALL_HOME_PAD, destination: TOWN_MAP_ID } }) as typeof authoredMapConfig & Record<MapId, BootstrapMapEntry>;
  mapConfig[PROCEDURAL_ENTRY_MAP as MapId].secondaryPortal = { ...endlessEntryPortal(proceduralMapId(1)), destination: proceduralMapId(1) };
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
  const editedEnemySpriteGroups = withGeneratedMaps<readonly EnemyKind[]>({}, spriteKinds, []);
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
  // The game hears the art is ready first, always: in 0.901.19 the snapshot
  // portraits went first, and a part that failed to load made Firefox throw
  // there, so players were never drawn. Snapshot pictures follow, and can fail alone.
  const playerAppearanceAssets = loadPlayerAppearanceAssets(() => {
    options.onPlayerAppearanceAssetReady();
    try { setProfileSnapshotRenderer(createProfileSnapshotRenderer(playerAppearanceAssets)); }
    catch (error) { console.warn('WildStat snapshot portraits unavailable:', error); }
  });
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
