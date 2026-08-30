import { DUEL_ARENA } from "../duel";
import { snapCameraToPlayer, updateCamera } from "./camera";
import type { PlayerState } from "./types";

type MapId = string;
type RuntimeDuel = { status: string; startsAtMs: number; endsAtMs: number } | null;

/**
 * requestAnimationFrame timestamps can land a fraction of a millisecond before
 * a nominal refresh deadline. Treating those callbacks as early makes a 60 Hz
 * display skip the callback and render at 30 FPS instead.
 */
export const FRAME_DEADLINE_TOLERANCE_MS = 1;
export const SIMULATION_HZ = 60;
export const SIMULATION_STEP_SECONDS = 1 / SIMULATION_HZ;
export const MAX_SIMULATION_STEPS_PER_FRAME = 8;
export const MAX_SIMULATION_CATCH_UP_SECONDS = SIMULATION_STEP_SECONDS * MAX_SIMULATION_STEPS_PER_FRAME;
export const IDLE_PRESENTATION_DELAY_MS = 2_000;

export type FixedSimulationClock = {
  accumulatorSeconds: number;
  steps: number;
  droppedSeconds: number;
  interpolationAlpha: number;
};

export function frameDeadlineReached(now: number, nextFrameAt: number) {
  return now + FRAME_DEADLINE_TOLERANCE_MS >= nextFrameAt;
}

/** Default presentation follows every display callback; battery mode stays 30 FPS. */
export function presentationFrameDue(lowPerformanceMode: boolean, now: number, nextFrameAt: number) {
  return !lowPerformanceMode || frameDeadlineReached(now, nextFrameAt);
}

export function idlePresentationThrottleActive(
  inputActive: boolean,
  now: number,
  lastInputAt: number,
  delayMs = IDLE_PRESENTATION_DELAY_MS,
) {
  if (inputActive || !Number.isFinite(now) || !Number.isFinite(lastInputAt)) return false;
  return now - lastInputAt >= Math.max(0, delayMs);
}

/**
 * Converts real foreground time into deterministic 60 Hz gameplay steps.
 * Eight catch-up steps preserve game speed through a frame near 9 FPS, while
 * longer stalls are treated as pauses instead of causing a large burst.
 */
export function advanceFixedSimulationClock(accumulatorSeconds: number, elapsedSeconds: number): FixedSimulationClock {
  const previous = Number.isFinite(accumulatorSeconds) ? Math.max(0, accumulatorSeconds) : 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const total = previous + elapsed;
  const retained = Math.min(total, MAX_SIMULATION_CATCH_UP_SECONDS);
  const steps = Math.min(
    MAX_SIMULATION_STEPS_PER_FRAME,
    Math.floor((retained + SIMULATION_STEP_SECONDS * 1e-7) / SIMULATION_STEP_SECONDS),
  );
  const nextAccumulator = Math.max(0, retained - steps * SIMULATION_STEP_SECONDS);
  return {
    accumulatorSeconds: nextAccumulator,
    steps,
    droppedSeconds: Math.max(0, total - retained),
    interpolationAlpha: Math.min(1, nextAccumulator / SIMULATION_STEP_SECONDS),
  };
}

type SessionDependencies = {
  player: PlayerState;
  camera: { x: number; y: number; zoom: number };
  viewport: () => { width: number; height: number };
  tutorialMapId: MapId;
  desertMapId: MapId;
  snowMapId: MapId;
  lavaMapId: MapId;
  infernalMapId: MapId;
  waterMapId: MapId;
  validMapIds: readonly MapId[];
  getMapId: () => MapId;
  setMapId: (mapId: MapId) => void;
  serverMapId: () => MapId | undefined;
  serverPlayerState: () => { x: number; y: number; facing: number } | undefined;
  connected: () => boolean;
  accountInConflict: () => boolean;
  lowPerformanceMode: () => boolean;
  presentationInputActive: () => boolean;
  ensureMusicPlaying: () => void;
  hideStart: () => void;
  hideGameOver: () => void;
  showGameOver: () => void;
  beginAdventure: () => void;
  syncStoppedPosition: () => void;
  resetPlayer: (preserveStats: boolean) => void;
  resolvePortalCollision: () => void;
  mapMusicSync: () => void;
  isDueling: () => boolean;
  activeDuel: () => RuntimeDuel;
  syncDragon: () => void;
  syncSpider: () => void;
  syncFrostclaw: () => void;
  syncMagmalisk: () => void;
  syncGloomroot: () => void;
  syncTidewyrm: () => void;
  cutsceneActive: () => boolean;
  updateCutscene: (dt: number) => void;
  updatePlayer: (dt: number) => void;
  updateUpgradeBench: () => void;
  updatePortal: (dt: number) => void;
  updateBootPickup: () => void;
  updateEnemies: (dt: number) => void;
  updateDragon: (dt: number) => void;
  updateSpider: (dt: number) => void;
  updateFrostclaw: (dt: number) => void;
  updateMagmalisk: (dt: number) => void;
  updateGloomroot: (dt: number) => void;
  updateTidewyrm: (dt: number) => void;
  updateProjectiles: (dt: number) => void;
  updateRespawns: (gameTime: number) => void;
  clearDuelCombat: () => void;
  updateEffects: (dt: number) => void;
  updateHud: () => void;
  updateVisuals: (dt: number) => void;
  updateMessage: (dt: number) => void;
  capturePresentationState: () => void;
  resetPresentationState: () => void;
  render: (interpolationAlpha: number) => void;
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
  let lastRenderedAt = lastFrameAt;
  let nextFrameAt = lastFrameAt;
  let lastPresentationInputAt = lastFrameAt;
  let simulationAccumulatorSeconds = 0;
  let nextPerformancePanelUpdateAt = 0;
  let fading = false;

  function syncSharedWorldState() {
    if (dependencies.getMapId() === dependencies.tutorialMapId) dependencies.syncDragon();
    if (dependencies.getMapId() === dependencies.desertMapId) dependencies.syncSpider();
    if (dependencies.getMapId() === dependencies.snowMapId) dependencies.syncFrostclaw();
    if (dependencies.getMapId() === dependencies.lavaMapId) dependencies.syncMagmalisk();
    if (dependencies.getMapId() === dependencies.infernalMapId) dependencies.syncGloomroot();
    if (dependencies.getMapId() === dependencies.waterMapId) dependencies.syncTidewyrm();
  }

  function simulate(dt: number) {
    gameTime += dt;
    dependencies.updateVisuals(dt);
    dependencies.updateMessage(dt);

    if (dependencies.cutsceneActive()) {
      dependencies.updateCutscene(dt);
      return;
    }

    dependencies.updatePlayer(dt);
    dependencies.updateUpgradeBench();
    if (!dependencies.isDueling()) {
      dependencies.updatePortal(dt);
      if (dependencies.getMapId() === dependencies.tutorialMapId) dependencies.updateBootPickup();
      dependencies.updateEnemies(dt);
      if (dependencies.getMapId() === dependencies.tutorialMapId) dependencies.updateDragon(dt);
      if (dependencies.getMapId() === dependencies.desertMapId) dependencies.updateSpider(dt);
      if (dependencies.getMapId() === dependencies.snowMapId) dependencies.updateFrostclaw(dt);
      if (dependencies.getMapId() === dependencies.lavaMapId) dependencies.updateMagmalisk(dt);
      if (dependencies.getMapId() === dependencies.infernalMapId) dependencies.updateGloomroot(dt);
      if (dependencies.getMapId() === dependencies.waterMapId) dependencies.updateTidewyrm(dt);
      dependencies.updateProjectiles(dt);
      dependencies.updateRespawns(gameTime);
    } else {
      dependencies.clearDuelCombat();
    }
    dependencies.updateEffects(dt);
    updateCamera(dependencies.camera, dependencies.player, dependencies.viewport(), dependencies.isDueling() ? DUEL_ARENA : null, dt);
  }

  function update(dt: number) {
    dependencies.capturePresentationState();
    syncSharedWorldState();
    simulate(dt);
    dependencies.updateHud();
  }

  function updateFixedSimulation(elapsedSeconds: number) {
    const clock = advanceFixedSimulationClock(simulationAccumulatorSeconds, elapsedSeconds);
    simulationAccumulatorSeconds = clock.accumulatorSeconds;
    for (let step = 0; step < clock.steps; step += 1) {
      if (!running || paused || dependencies.accountInConflict()) {
        simulationAccumulatorSeconds = 0;
        break;
      }
      dependencies.capturePresentationState();
      if (step === 0) syncSharedWorldState();
      simulate(SIMULATION_STEP_SECONDS);
    }
    if (clock.steps > 0) dependencies.updateHud();
    return Math.min(1, simulationAccumulatorSeconds / SIMULATION_STEP_SECONDS);
  }

  function refreshFrameClock() {
    lastFrameAt = performance.now();
    lastRenderedAt = lastFrameAt;
    nextFrameAt = lastFrameAt;
    lastPresentationInputAt = lastFrameAt;
    simulationAccumulatorSeconds = 0;
    dependencies.resetPresentationState();
  }

  // Browsers can suspend animation frames for an arbitrary amount of time.
  // Returning to the page starts a fresh foreground clock instead of turning
  // background time into movement or queued combat.
  document.addEventListener("visibilitychange", refreshFrameClock);

  function loop(now: number) {
    const lowPerformanceMode = dependencies.lowPerformanceMode();
    const inputActive = dependencies.presentationInputActive();
    if (inputActive) lastPresentationInputAt = now;
    const idleThrottled = !lowPerformanceMode
      && idlePresentationThrottleActive(inputActive, now, lastPresentationInputAt);
    const reducedFrameRate = lowPerformanceMode || idleThrottled;
    if (!presentationFrameDue(reducedFrameRate, now, nextFrameAt)) {
      requestAnimationFrame(loop);
      return;
    }
    if (reducedFrameRate) {
      const frameIntervalMs = 1_000 / 30;
      nextFrameAt += frameIntervalMs;
      if (nextFrameAt < now) nextFrameAt = now + frameIntervalMs;
    } else {
      nextFrameAt = now;
    }
    const frameDeltaMs = Math.max(0, now - lastFrameAt);
    lastFrameAt = now;
    const renderedFrameDeltaMs = Math.max(0, now - lastRenderedAt);
    lastRenderedAt = now;
    const workStartedAt = performance.now();
    let updateMs = 0;
    let interpolationAlpha = 1;
    if (running && !paused && !dependencies.accountInConflict() && !document.hidden) {
      const updateStartedAt = performance.now();
      interpolationAlpha = updateFixedSimulation(frameDeltaMs / 1_000);
      updateMs = performance.now() - updateStartedAt;
    } else {
      simulationAccumulatorSeconds = 0;
    }
    const renderStartedAt = performance.now();
    dependencies.render(interpolationAlpha);
    const renderMs = performance.now() - renderStartedAt;
    dependencies.recordPerformance(renderedFrameDeltaMs, updateMs, renderMs, performance.now() - workStartedAt);
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
    // Settle restored/spawned positions before input can move through a portal
    // collider on the first simulation frame.
    dependencies.resolvePortalCollision();
    hasStarted = true;
    running = true;
    if (markIntro) dependencies.beginAdventure();
    if (dependencies.connected()) dependencies.syncStoppedPosition();
    refreshFrameClock();
    dependencies.ensureMusicPlaying();
  }

  function end() {
    running = false;
    simulationAccumulatorSeconds = 0;
    dependencies.resetPresentationState();
    dependencies.player.moving = false;
    if (dependencies.connected()) dependencies.syncStoppedPosition();
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
      dependencies.resetPresentationState();
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
    pause: () => { paused = true; simulationAccumulatorSeconds = 0; dependencies.resetPresentationState(); },
    refreshFrameClock,
    resetFrameSchedule: () => { nextFrameAt = performance.now(); },
    resetGameTime: () => { gameTime = 0; simulationAccumulatorSeconds = 0; dependencies.resetPresentationState(); },
    setHasStarted: (started: boolean) => { hasStarted = started; },
    setPaused: (nextPaused: boolean) => {
      if (paused === nextPaused) return;
      paused = nextPaused;
      refreshFrameClock();
    },
    stop: () => { running = false; simulationAccumulatorSeconds = 0; dependencies.resetPresentationState(); },
    start,
    update,
  };
}
