import { DUEL_ARENA } from "../duel";
import { snapCameraToPlayer, updateCamera } from "./camera";
import type { PlayerState } from "./types";

type MapId = string;
type RuntimeDuel = { status: string; startsAtMs: number; endsAtMs: number } | null;

type SessionDependencies = {
  player: PlayerState;
  camera: { x: number; y: number; zoom: number };
  viewport: () => { width: number; height: number };
  tutorialMapId: MapId;
  desertMapId: MapId;
  validMapIds: readonly MapId[];
  getMapId: () => MapId;
  setMapId: (mapId: MapId) => void;
  serverMapId: () => MapId | undefined;
  serverPlayerState: () => { x: number; y: number; facing: number } | undefined;
  connected: () => boolean;
  accountInConflict: () => boolean;
  lowPerformanceMode: () => boolean;
  ensureMusicPlaying: () => void;
  hideStart: () => void;
  hideGameOver: () => void;
  showGameOver: () => void;
  beginAdventure: () => void;
  syncPosition: () => void;
  resetPlayer: (preserveStats: boolean) => void;
  mapMusicSync: () => void;
  isDueling: () => boolean;
  activeDuel: () => RuntimeDuel;
  syncDragon: () => void;
  syncSpider: () => void;
  cutsceneActive: () => boolean;
  updateCutscene: (dt: number) => void;
  updatePlayer: (dt: number) => void;
  updatePortal: (dt: number) => void;
  updateBootPickup: () => void;
  updateEnemies: (dt: number) => void;
  updateDragon: (dt: number) => void;
  updateSpider: (dt: number) => void;
  updateProjectiles: (dt: number) => void;
  updateRespawns: (gameTime: number) => void;
  clearDuelCombat: () => void;
  updateEffects: (dt: number) => void;
  updateHud: () => void;
  updateVisuals: (dt: number) => void;
  updateMessage: (dt: number) => void;
  render: () => void;
  recordPerformance: (frameMs: number, updateMs: number, renderMs: number, workMs: number) => void;
  renderPerformancePanel: () => void;
  performancePanelVisible: () => boolean;
  renderFpsDisplay: () => void;
  fpsDisplayVisible: () => boolean;
  fadeElement: HTMLElement;
  onLeaveDuelResult: () => void;
};

/** Owns frame cadence, session lifecycle, world update sequencing, and world fades. */
export function createGameSessionController(dependencies: SessionDependencies) {
  let running = false;
  let hasStarted = false;
  let paused = false;
  let gameTime = 0;
  let lastFrameAt = performance.now();
  let nextFrameAt = lastFrameAt;
  let nextPerformancePanelUpdateAt = 0;
  let fading = false;

  function update(dt: number) {
    if (dependencies.getMapId() === dependencies.tutorialMapId) dependencies.syncDragon();
    if (dependencies.getMapId() === dependencies.desertMapId) dependencies.syncSpider();
    gameTime += dt;
    dependencies.updateVisuals(dt);
    dependencies.updateMessage(dt);

    if (dependencies.cutsceneActive()) {
      dependencies.updateCutscene(dt);
      dependencies.updateHud();
      return;
    }

    dependencies.updatePlayer(dt);
    if (!dependencies.isDueling()) {
      dependencies.updatePortal(dt);
      if (dependencies.getMapId() === dependencies.tutorialMapId) dependencies.updateBootPickup();
      dependencies.updateEnemies(dt);
      if (dependencies.getMapId() === dependencies.tutorialMapId) dependencies.updateDragon(dt);
      if (dependencies.getMapId() === dependencies.desertMapId) dependencies.updateSpider(dt);
      dependencies.updateProjectiles(dt);
      dependencies.updateRespawns(gameTime);
    } else {
      dependencies.clearDuelCombat();
    }
    dependencies.updateEffects(dt);
    updateCamera(dependencies.camera, dependencies.player, dependencies.viewport(), dependencies.isDueling() ? DUEL_ARENA : null, dt);
    dependencies.updateHud();
  }

  function loop(now: number) {
    const frameIntervalMs = 1_000 / (dependencies.lowPerformanceMode() ? 30 : 60);
    if (now < nextFrameAt) {
      requestAnimationFrame(loop);
      return;
    }
    nextFrameAt += frameIntervalMs;
    if (nextFrameAt < now) nextFrameAt = now + frameIntervalMs;
    const frameDeltaMs = Math.max(0, now - lastFrameAt);
    const dt = Math.min(.035, Math.max(0, frameDeltaMs / 1_000));
    lastFrameAt = now;
    const workStartedAt = performance.now();
    let updateMs = 0;
    if (running && !paused && !dependencies.accountInConflict()) {
      const updateStartedAt = performance.now();
      update(dt);
      updateMs = performance.now() - updateStartedAt;
    }
    const renderStartedAt = performance.now();
    dependencies.render();
    const renderMs = performance.now() - renderStartedAt;
    dependencies.recordPerformance(frameDeltaMs, updateMs, renderMs, performance.now() - workStartedAt);
    if ((dependencies.performancePanelVisible() || dependencies.fpsDisplayVisible()) && now >= nextPerformancePanelUpdateAt) {
      nextPerformancePanelUpdateAt = now + 500;
      if (dependencies.performancePanelVisible()) dependencies.renderPerformancePanel();
      if (dependencies.fpsDisplayVisible()) dependencies.renderFpsDisplay();
    }
    requestAnimationFrame(loop);
  }

  function start(markIntro = true, restoreServerPosition = true) {
    dependencies.hideStart();
    dependencies.hideGameOver();
    paused = false;
    const serverMapId = dependencies.serverMapId();
    if (serverMapId && dependencies.validMapIds.includes(serverMapId)) dependencies.setMapId(serverMapId);
    dependencies.mapMusicSync();
    dependencies.resetPlayer(hasStarted);
    const serverState = dependencies.serverPlayerState();
    if (restoreServerPosition && serverState && serverMapId === dependencies.getMapId()) {
      dependencies.player.x = serverState.x;
      dependencies.player.y = serverState.y;
      dependencies.player.facing = serverState.facing;
      snapCameraToPlayer(dependencies.camera, dependencies.player, dependencies.viewport());
    }
    hasStarted = true;
    running = true;
    if (markIntro) dependencies.beginAdventure();
    if (dependencies.connected()) dependencies.syncPosition();
    lastFrameAt = performance.now();
    nextFrameAt = lastFrameAt;
    dependencies.ensureMusicPlaying();
  }

  function end() {
    running = false;
    dependencies.showGameOver();
  }

  function fadeToWorld(onBlack: () => void) {
    if (fading) return;
    fading = true;
    const fade = dependencies.fadeElement;
    fade.hidden = false;
    void fade.offsetWidth;
    fade.classList.add("is-visible");
    window.setTimeout(() => {
      onBlack();
      snapCameraToPlayer(dependencies.camera, dependencies.player, dependencies.viewport());
      requestAnimationFrame(() => {
        fade.classList.remove("is-visible");
        window.setTimeout(() => {
          fade.hidden = true;
          fading = false;
        }, 180);
      });
    }, 180);
  }

  return {
    end,
    fadeToWorld,
    gameTime: () => gameTime,
    hasStarted: () => hasStarted,
    isPaused: () => paused,
    isRunning: () => running,
    leaveDuelResult: () => fadeToWorld(dependencies.onLeaveDuelResult),
    loop,
    pause: () => { paused = true; },
    refreshFrameClock: () => {
      lastFrameAt = performance.now();
      nextFrameAt = lastFrameAt;
    },
    resetFrameSchedule: () => { nextFrameAt = performance.now(); },
    resetGameTime: () => { gameTime = 0; },
    setHasStarted: (started: boolean) => { hasStarted = started; },
    setPaused: (nextPaused: boolean) => { paused = nextPaused; },
    stop: () => { running = false; },
    start,
    update,
  };
}
