import { WORLD } from "../constants";
import { clamp } from "../math";
import { createSpawnSites, createWorldLayout, type MapId, type SpawnSite, type WorldDecor, type WorldPath } from "../world";
import type { Movement, MovementInputSource } from "./player-input-controller";
import type { DragonBossState, EnemyShot, EnemyState, PlayerState, Projectile, DuelScene, RuntimeDuelReplay, RuntimeDuelState } from "./types";

type LocalState = { x: number; y: number; facing?: number };
type DuelPresentation = { state: { challengerHp: number; opponentHp: number } };
type PlayerInterestArea = { left: number; top: number; right: number; bottom: number };

export type PlayerController = {
  rebuildWorld: () => void;
  reset: (preserveStats: boolean, hasSavedProgress: boolean) => void;
  update: (dt: number) => void;
  isDuelResultHeld: () => boolean;
  finishDuelResult: () => void;
  resetMovementSync: () => void;
};

/** Owns player world reset, movement, multiplayer sync, and duel return lifecycle. */
export function createPlayerController(options: {
  player: PlayerState;
  boss: DragonBossState;
  enemies: EnemyState[];
  spawnSites: SpawnSite[];
  decor: WorldDecor[];
  paths: WorldPath[];
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  particles: unknown[];
  damageNumbers: unknown[];
  tutorialMapId: MapId;
  getCurrentMapId: () => MapId;
  mapSpawn: (mapId: MapId) => { x: number; y: number };
  initialStats: Pick<PlayerState, "maxHp" | "damage" | "attackRate" | "projectileSpeed" | "projectileCount" | "attackRange" | "armor" | "regen" | "speed">;
  invalidateStaticWorld: () => void;
  spawnFromSite: (site: SpawnSite) => void;
  clearPlayerCombat: () => void;
  resetBosses: () => void;
  onResetUI: () => void;
  movement: () => Movement;
  isMapTransitioning: () => boolean;
  resolvePortalCollision: () => void;
  resolveDragonCollision: () => void;
  resolveSpiderCollision: () => void;
  applyDragonConePush: (dt: number) => void;
  isTutorialMap: () => boolean;
  isDesertMap: () => boolean;
  viewport: () => { width: number; height: number; zoom: number };
  cameraPosition: () => { x: number; y: number };
  isConnected: () => boolean;
  syncSpeed: (speed: number) => void;
  movementSpeedMultiplier: () => number;
  syncMovementState: (x: number, y: number, dx: number, dy: number, inputSource: Exclude<MovementInputSource, "none">, force: boolean, interestArea?: PlayerInterestArea) => void;
  autoAttack: (dt: number) => void;
  isAutoAttackEnabled: () => boolean;
  activeDuel: () => RuntimeDuelState | null;
  isDueling: () => boolean;
  localIdentity: () => string | undefined;
  localState: () => LocalState | null | undefined;
  syncLiveDuelDamage: (duel: RuntimeDuelState) => DuelPresentation;
  liveDuelScene: () => DuelScene | null;
  setHeldDuelScene: (scene: DuelScene | null) => void;
  pulseDuel: () => void;
  resetLiveDuelPresentation: () => void;
  loadDuelReplay: (id: bigint) => Promise<RuntimeDuelReplay | null>;
  showDuelResult: (replay: RuntimeDuelReplay | null) => void;
  showDuelResultUnavailable: () => void;
}): PlayerController {
  const {
    player, boss, enemies, spawnSites, decor, paths, projectiles, enemyShots, particles, damageNumbers,
    tutorialMapId, getCurrentMapId, mapSpawn, initialStats, invalidateStaticWorld, spawnFromSite,
    clearPlayerCombat, resetBosses, onResetUI, movement, isMapTransitioning, resolvePortalCollision,
    resolveDragonCollision, resolveSpiderCollision, applyDragonConePush, isTutorialMap, isDesertMap,
    viewport, cameraPosition, isConnected, syncSpeed, movementSpeedMultiplier, syncMovementState, autoAttack, isAutoAttackEnabled,
    activeDuel, isDueling, localIdentity, localState, syncLiveDuelDamage, liveDuelScene, setHeldDuelScene,
    pulseDuel, resetLiveDuelPresentation, loadDuelReplay, showDuelResult, showDuelResultUnavailable,
  } = options;
  let movementSyncActive = false;
  let duelWasActive = false;
  let lastLocalDuelId: bigint | null = null;
  let duelResultHeld = false;
  let duelReturnState: LocalState | null = null;

  function rebuildWorld() {
    const mapId = getCurrentMapId();
    const layout = createWorldLayout(player, mapId);
    decor.splice(0, decor.length, ...layout.decor);
    paths.splice(0, paths.length, ...layout.paths);
    spawnSites.splice(0, spawnSites.length, ...createSpawnSites(boss, mapId));
    invalidateStaticWorld();
  }

  function reset(preserveStats: boolean, hasSavedProgress: boolean) {
    const spawn = mapSpawn(getCurrentMapId());
    player.x = spawn.x;
    player.y = spawn.y;
    if (!preserveStats && !hasSavedProgress) Object.assign(player, initialStats);
    player.hp = player.maxHp;
    player.attackClock = 0;
    player.throwClock = 0;
    player.hurtClock = 0;
    player.facing = 0;
    player.moving = false;
    enemies.length = 0;
    projectiles.length = 0;
    enemyShots.length = 0;
    particles.length = 0;
    damageNumbers.length = 0;
    clearPlayerCombat();
    resetBosses();
    rebuildWorld();
    for (const site of spawnSites) spawnFromSite(site);
    onResetUI();
  }

  function applyDuelState() {
    const duel = activeDuel();
    if (!duel || !isDueling()) return false;
    const localIsChallenger = duel.challenger === localIdentity();
    const state = localState();
    if (state) {
      player.x = state.x;
      player.y = state.y;
      player.facing = state.facing ?? player.facing;
    }
    const presentation = syncLiveDuelDamage(duel);
    player.maxHp = localIsChallenger ? duel.challengerMaxHp : duel.opponentMaxHp;
    player.hp = duel.status === "finishing"
      ? localIsChallenger ? duel.challengerHp : duel.opponentHp
      : localIsChallenger ? presentation.state.challengerHp : presentation.state.opponentHp;
    player.moving = false;
    duelWasActive = true;
    lastLocalDuelId = duel.id;
    const liveScene = liveDuelScene();
    if (liveScene) setHeldDuelScene(liveScene);
    pulseDuel();
    return true;
  }

  function update(dt: number) {
    if (applyDuelState()) return;
    if (duelWasActive) {
      const state = localState();
      if (!state || state.x < player.r || state.y < player.r || state.x > WORLD.w - player.r || state.y > WORLD.h - player.r) return;
      duelReturnState = state;
      duelWasActive = false;
      duelResultHeld = true;
      resetLiveDuelPresentation();
      if (lastLocalDuelId) void loadDuelReplay(lastLocalDuelId).then((replay) => replay ? showDuelResult(replay) : showDuelResultUnavailable());
      return;
    }
    if (duelResultHeld) return;
    if (isMapTransitioning()) { player.moving = false; return; }
    const connected = isConnected();
    const started = connected && !movementSyncActive;
    movementSyncActive = connected;
    const movementSpeed = player.speed * movementSpeedMultiplier();
    if (connected) syncSpeed(movementSpeed);
    let { x: mx, y: my, source } = movement();
    const length = Math.hypot(mx, my);
    player.moving = length > 0;
    if (player.moving) {
      mx /= length;
      my /= length;
      player.x += mx * movementSpeed * dt;
      player.y += my * movementSpeed * dt;
      if (Math.abs(mx) > .1) player.facing = Math.atan2(my, mx);
    }
    applyDragonConePush(dt);
    resolvePortalCollision();
    if (isTutorialMap()) resolveDragonCollision();
    if (isDesertMap()) resolveSpiderCollision();
    player.x = clamp(player.x, player.r, WORLD.w - player.r);
    player.y = clamp(player.y, player.r, WORLD.h - player.r);
    if (connected) {
      const { width, height, zoom } = viewport();
      const visibleW = width / zoom;
      const visibleH = height / zoom;
      const camera = cameraPosition();
      syncMovementState(player.x, player.y, player.moving ? mx : 0, player.moving ? my : 0, source === "touch" ? "touch" : "keyboard", started, {
        left: camera.x,
        top: camera.y,
        right: camera.x + visibleW,
        bottom: camera.y + visibleH,
      });
    }
    player.hurtClock = Math.max(0, player.hurtClock - dt);
    if (player.regen > 0 && player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    if (isAutoAttackEnabled()) autoAttack(dt);
  }

  return {
    rebuildWorld,
    reset,
    update,
    isDuelResultHeld: () => duelResultHeld,
    resetMovementSync: () => { movementSyncActive = false; },
    finishDuelResult: () => {
      duelResultHeld = false;
      setHeldDuelScene(null);
      if (duelReturnState) {
        player.x = duelReturnState.x;
        player.y = duelReturnState.y;
        player.facing = duelReturnState.facing ?? player.facing;
      }
      duelReturnState = null;
      player.hp = player.maxHp;
      player.hurtClock = 0;
    },
  };
}
