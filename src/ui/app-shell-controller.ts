import type { MapMusicController } from "../game/runtime/audio";
import { requiredElement } from "../game/runtime/dom";
import {
  renderAccountStatus,
  renderBooleanSetting,
  renderConnectionStatus,
  renderFullscreenSetting,
  renderLatencyStatus,
  renderVolume,
} from "./settings";

type AccountState = { signedIn: boolean; notice: string };

type AppShellDependencies = {
  mapMusic: MapMusicController;
  storageKeys: {
    antiAliasing: string;
    attackRange: string;
    fps: string;
    lowPerformance: string;
    latency: string;
    musicVolume: string;
    screenShake: string;
    sfxVolume: string;
  };
  connected: () => boolean;
  latencyMs: () => number | null | undefined;
  accountState: () => AccountState | undefined;
  signIn: () => void;
  signOut: () => void;
  canPlayMusic: () => boolean;
  onScreenShakeDisabled: () => void;
  onLowPerformanceChanged: () => void;
  showMessage: (message: string, color: string) => void;
};

/** Settings, audio lifecycle, fullscreen, and shell account/connection status. */
export function createAppShellController(dependencies: AppShellDependencies) {
  const screenShakeToggle = requiredElement<HTMLButtonElement>("screenShakeToggle");
  const attackRangeToggle = requiredElement<HTMLButtonElement>("attackRangeToggle");
  const antiAliasingToggle = requiredElement<HTMLButtonElement>("antiAliasingToggle");
  const lowPerformanceToggle = requiredElement<HTMLButtonElement>("lowPerformanceToggle");
  const fpsToggle = requiredElement<HTMLButtonElement>("fpsToggle");
  const fpsStatus = requiredElement("fpsStatus");
  const gameFpsStatus = requiredElement("gameFpsStatus");
  const onePercentLowFpsStatus = requiredElement("onePercentLowFpsStatus");
  const workFpsStatus = requiredElement("workFpsStatus");
  const latencyToggle = requiredElement<HTMLButtonElement>("latencyToggle");
  const latencyStatus = requiredElement("latencyStatus");
  const musicVolumeInput = requiredElement<HTMLInputElement>("musicVolume");
  const musicVolumeValue = requiredElement("musicVolumeValue");
  const sfxVolumeInput = requiredElement<HTMLInputElement>("sfxVolume");
  const sfxVolumeValue = requiredElement("sfxVolumeValue");
  const signInMuteButton = requiredElement<HTMLButtonElement>("signInMuteButton");
  const fullscreenToggle = requiredElement<HTMLButtonElement>("fullscreenToggle");
  const connectionStatus = requiredElement("connectionStatus");
  const accountButton = requiredElement("accountButton");
  const accountStatus = requiredElement("accountStatus");

  let screenShakeEnabled = readBoolean(dependencies.storageKeys.screenShake, true);
  let attackRangeVisible = readBoolean(dependencies.storageKeys.attackRange, true);
  let antiAliasingEnabled = readBoolean(dependencies.storageKeys.antiAliasing, true);
  let lowPerformanceMode = readBoolean(dependencies.storageKeys.lowPerformance, false);
  let fpsVisible = readBoolean(dependencies.storageKeys.fps, false);
  let latencyVisible = readBoolean(dependencies.storageKeys.latency, false);
  let lastAudibleMusicVolume = dependencies.mapMusic.volume > 0 ? dependencies.mapMusic.volume : .35;

  function renderSignInMuteButton() {
    const muted = dependencies.mapMusic.volume <= 0;
    const label = muted ? "Unmute music" : "Mute music";
    signInMuteButton.setAttribute("aria-pressed", String(muted));
    signInMuteButton.setAttribute("aria-label", label);
    signInMuteButton.title = label;
  }

  function refreshSettings() {
    renderBooleanSetting(screenShakeToggle, screenShakeEnabled);
    renderBooleanSetting(attackRangeToggle, attackRangeVisible);
    renderBooleanSetting(antiAliasingToggle, antiAliasingEnabled);
    renderBooleanSetting(lowPerformanceToggle, lowPerformanceMode);
    renderBooleanSetting(fpsToggle, fpsVisible);
    fpsStatus.hidden = !fpsVisible;
    renderBooleanSetting(latencyToggle, latencyVisible);
    renderLatencyStatus(latencyStatus, latencyVisible, dependencies.latencyMs(), dependencies.connected());
    dependencies.mapMusic.setVolume(dependencies.mapMusic.volume);
    dependencies.mapMusic.setSfxVolume(dependencies.mapMusic.sfxVolume);
    renderVolume(musicVolumeInput, musicVolumeValue, dependencies.mapMusic.volume);
    renderVolume(sfxVolumeInput, sfxVolumeValue, dependencies.mapMusic.sfxVolume);
    renderSignInMuteButton();
  }

  function refreshStatus() {
    renderConnectionStatus(connectionStatus, dependencies.connected());
    renderAccountStatus(accountButton, accountStatus, dependencies.accountState() || { signedIn: false, notice: "" });
    renderLatencyStatus(latencyStatus, latencyVisible, dependencies.latencyMs(), dependencies.connected());
  }

  function refreshFullscreen() {
    const root = document.documentElement;
    const supported = typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
    renderFullscreenSetting(fullscreenToggle, supported, Boolean(document.fullscreenElement || document.webkitFullscreenElement));
  }

  function ensureMusicPlaying() {
    dependencies.mapMusic.ensurePlaying(dependencies.canPlayMusic());
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await exitFullscreen();
      } else {
        await enterFullscreen();
      }
    } catch {
      dependencies.showMessage("FULLSCREEN UNAVAILABLE", "#ff9b91");
    }
    refreshFullscreen();
  }

  screenShakeToggle.addEventListener("click", () => {
    screenShakeEnabled = !screenShakeEnabled;
    writeBoolean(dependencies.storageKeys.screenShake, screenShakeEnabled);
    if (!screenShakeEnabled) dependencies.onScreenShakeDisabled();
    refreshSettings();
  });
  attackRangeToggle.addEventListener("click", () => {
    attackRangeVisible = !attackRangeVisible;
    writeBoolean(dependencies.storageKeys.attackRange, attackRangeVisible);
    refreshSettings();
  });
  antiAliasingToggle.addEventListener("click", () => {
    antiAliasingEnabled = !antiAliasingEnabled;
    writeBoolean(dependencies.storageKeys.antiAliasing, antiAliasingEnabled);
    refreshSettings();
  });
  lowPerformanceToggle.addEventListener("click", () => {
    lowPerformanceMode = !lowPerformanceMode;
    writeBoolean(dependencies.storageKeys.lowPerformance, lowPerformanceMode);
    dependencies.onLowPerformanceChanged();
    refreshSettings();
  });
  fpsToggle.addEventListener("click", () => {
    fpsVisible = !fpsVisible;
    writeBoolean(dependencies.storageKeys.fps, fpsVisible);
    refreshSettings();
  });
  latencyToggle.addEventListener("click", () => {
    latencyVisible = !latencyVisible;
    writeBoolean(dependencies.storageKeys.latency, latencyVisible);
    refreshSettings();
  });
  const applyMusicVolume = () => {
    const volume = Math.min(1, Math.max(0, Number(musicVolumeInput.value) / 100));
    dependencies.mapMusic.setVolume(volume);
    writeString(dependencies.storageKeys.musicVolume, String(volume));
    if (volume > 0) lastAudibleMusicVolume = volume;
    // Do not rewrite the range input through the full settings renderer while
    // iOS is actively dragging its native thumb.
    renderVolume(musicVolumeInput, musicVolumeValue, volume);
    renderSignInMuteButton();
    if (volume > 0) ensureMusicPlaying();
  };
  musicVolumeInput.addEventListener("input", applyMusicVolume);
  musicVolumeInput.addEventListener("change", applyMusicVolume);
  const applySfxVolume = () => {
    const volume = Math.min(1, Math.max(0, Number(sfxVolumeInput.value) / 100));
    dependencies.mapMusic.setSfxVolume(volume);
    writeString(dependencies.storageKeys.sfxVolume, String(volume));
    // Avoid moving iOS's native range thumb while it is actively dragged.
    renderVolume(sfxVolumeInput, sfxVolumeValue, volume);
  };
  sfxVolumeInput.addEventListener("input", applySfxVolume);
  sfxVolumeInput.addEventListener("change", applySfxVolume);
  signInMuteButton.addEventListener("click", () => {
    const nextVolume = dependencies.mapMusic.volume > 0 ? 0 : lastAudibleMusicVolume;
    if (dependencies.mapMusic.volume > 0) lastAudibleMusicVolume = dependencies.mapMusic.volume;
    dependencies.mapMusic.setVolume(nextVolume);
    writeString(dependencies.storageKeys.musicVolume, String(nextVolume));
    renderVolume(musicVolumeInput, musicVolumeValue, nextVolume);
    renderSignInMuteButton();
    if (nextVolume > 0) ensureMusicPlaying();
  });
  accountButton.addEventListener("click", () => {
    if (dependencies.accountState()?.signedIn) dependencies.signOut();
    else dependencies.signIn();
  });
  fullscreenToggle.addEventListener("click", () => { void toggleFullscreen(); });
  document.addEventListener("fullscreenchange", refreshFullscreen);
  document.addEventListener("webkitfullscreenchange", refreshFullscreen);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      dependencies.mapMusic.audio.pause();
      return;
    }
    ensureMusicPlaying();
  });
  window.addEventListener("pagehide", () => dependencies.mapMusic.audio.pause());
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Element && event.target.closest("#signInMuteButton")) return;
    ensureMusicPlaying();
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest("#signInMuteButton")) return;
    ensureMusicPlaying();
  }, { capture: true });

  refreshSettings();
  refreshStatus();
  refreshFullscreen();

  return {
    attackRangeVisible: () => attackRangeVisible,
    antiAliasingEnabled: () => antiAliasingEnabled,
    fpsVisible: () => fpsVisible,
    lowPerformanceMode: () => lowPerformanceMode,
    screenShakeEnabled: () => screenShakeEnabled,
    refreshFullscreen,
    refreshSettings,
    refreshStatus,
    renderFps: (fps: number, onePercentLowFps: number, workFps: number, idleThrottled = false) => {
      if (!fpsVisible) return;
      gameFpsStatus.textContent = `GAME FPS: ${fps}${idleThrottled ? " · IDLE" : ""}`;
      onePercentLowFpsStatus.textContent = `1% LOW: ${onePercentLowFps}`;
      workFpsStatus.textContent = `WORK FPS: ${workFps}`;
    },
    ensureMusicPlaying,
  };
}

async function enterFullscreen() {
  const root = document.documentElement;
  if (typeof root.requestFullscreen === "function") {
    try {
      await root.requestFullscreen({ navigationUI: "hide" });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "TypeError") throw error;
      await root.requestFullscreen();
    }
    return;
  }
  if (typeof root.webkitRequestFullscreen === "function") root.webkitRequestFullscreen();
}

async function exitFullscreen() {
  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen();
    return;
  }
  if (typeof document.webkitExitFullscreen === "function") document.webkitExitFullscreen();
}

function readBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeBoolean(key: string, value: boolean) {
  writeString(key, String(value));
}

function writeString(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
