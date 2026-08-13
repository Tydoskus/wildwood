import type { MapId } from "../world";

const FOREST_MUSIC_SOURCE = "assets/wildwood/audio/forest.mp3";
const DESERT_MUSIC_SOURCE = "assets/wildwood/audio/desert.mp3";

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
): MapMusicController {
  const audio = new Audio(FOREST_MUSIC_SOURCE);
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

  function setVolume(nextVolume: number) {
    volume = Math.min(1, Math.max(0, nextVolume));
    audio.volume = volume;
  }

  function syncMap(mapId: MapId) {
    const nextSource = mapId === desertMapId ? DESERT_MUSIC_SOURCE : FOREST_MUSIC_SOURCE;
    if (audio.getAttribute("src") === nextSource) return;
    const shouldResume = !audio.paused;
    audio.src = nextSource;
    audio.load();
    if (shouldResume && volume > 0) void audio.play().catch(() => {});
  }

  function ensurePlaying(allowed: boolean) {
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
