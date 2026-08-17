import type { MapId } from "../world";

const FOREST_MUSIC_SOURCE = "assets/wildwood/audio/forest.mp3";
const DESERT_MUSIC_SOURCE = "assets/wildwood/audio/desert.mp3";
const SNOW_MUSIC_SOURCE = "assets/wildwood/audio/snow.mp3";
export const SIGN_IN_MUSIC_SOURCE = "assets/wildwood/audio/signin.mp3";

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function musicSourceForMap(mapId: MapId, desertMapId: MapId, snowMapId: MapId) {
  return mapId === desertMapId
    ? DESERT_MUSIC_SOURCE
    : mapId === snowMapId
      ? SNOW_MUSIC_SOURCE
      : FOREST_MUSIC_SOURCE;
}

export type MapMusicController = {
  readonly audio: HTMLAudioElement;
  readonly volume: number;
  setVolume(volume: number): void;
  syncMap(mapId: MapId): void;
  ensurePlaying(allowed: boolean): void;
};

export function createMapMusicController(
  storageKey: string,
  desertMapId: MapId,
  snowMapId: MapId,
): MapMusicController {
  const audio = new Audio(SIGN_IN_MUSIC_SOURCE);
  audio.loop = true;
  audio.preload = "metadata";

  let volume = .35;
  try {
    const storedVolume = localStorage.getItem(storageKey);
    if (storedVolume !== null) {
      const savedVolume = Number(storedVolume);
      if (Number.isFinite(savedVolume)) volume = Math.min(1, Math.max(0, savedVolume));
    }
  } catch {}
  audio.volume = volume;
  let audioContext: AudioContext | null = null;
  let gainNode: GainNode | null = null;

  function ensureAudioGraph() {
    if (audioContext && gainNode) return audioContext;
    const AudioContextConstructor = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaElementSource(audio);
      gainNode = audioContext.createGain();
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      // iOS ignores HTMLMediaElement.volume. Keep the media element at full
      // volume after routing it through Web Audio and apply user volume here.
      audio.volume = 1;
      return audioContext;
    } catch {
      audioContext = null;
      gainNode = null;
      audio.volume = volume;
      return null;
    }
  }

  function setVolume(nextVolume: number) {
    volume = Math.min(1, Math.max(0, nextVolume));
    if (gainNode) gainNode.gain.value = volume;
    else audio.volume = volume;
  }

  function syncMap(mapId: MapId) {
    const nextSource = musicSourceForMap(mapId, desertMapId, snowMapId);
    if (audio.getAttribute("src") === nextSource) return;
    const shouldResume = !audio.paused;
    audio.src = nextSource;
    audio.load();
    if (shouldResume && volume > 0) void audio.play().catch(() => {});
  }

  function ensurePlaying(allowed: boolean) {
    const context = ensureAudioGraph();
    if (context?.state === "suspended") void context.resume().catch(() => {});
    if (!allowed || volume <= 0 || !audio.paused) return;
    void audio.play().catch(() => {});
  }

  return {
    audio,
    get volume() { return volume; },
    setVolume,
    syncMap,
    ensurePlaying,
  };
}
