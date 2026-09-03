import { CLOUDSPIRE_MAP_ID, INFERNAL_DEPTHS_MAP_ID, MOONFEN_MAP_ID, SAMURAI_GARDEN_MAP_ID, WATER_REACH_MAP_ID, type MapId } from "../world";

const FOREST_MUSIC_SOURCE = "assets/wildstat/audio/forest.mp3";
const DESERT_MUSIC_SOURCE = "assets/wildstat/audio/desert.mp3";
const SNOW_MUSIC_SOURCE = "assets/wildstat/audio/snow.mp3";
const LAVA_MUSIC_SOURCE = "assets/wildstat/audio/lava.mp3";
const NIGHT_FOREST_MUSIC_SOURCE = "assets/wildstat/audio/night-forest.mp3";
export const SIGN_IN_MUSIC_SOURCE = "assets/wildstat/audio/signin.mp3";
export const DEATH_SOUND_SOURCE = "assets/wildstat/audio/death.mp3";
export const BOW_ATTACK_SOUND_SOURCE = "assets/wildstat/audio/bow-release.mp3";
export const BOW_ATTACK_SOUND_GAIN = .28;
export const BOW_ATTACK_SOUND_CLIP_SECONDS = .46;
export const BOW_ATTACK_SOUND_RATE_MIN = .93;
export const BOW_ATTACK_SOUND_RATE_MAX = 1;

const BOW_ATTACK_SOUND_FADE_SECONDS = .09;
const BOW_ATTACK_SOUND_ATTACK_SECONDS = .008;
const BOW_ATTACK_SOUND_MIN_GAP_SECONDS = .055;
const BOW_ATTACK_SOUND_MAX_VOICES = 3;

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function musicSourceForMap(mapId: MapId, desertMapId: MapId, snowMapId: MapId, lavaMapId: MapId) {
  if (mapId === INFERNAL_DEPTHS_MAP_ID) return NIGHT_FOREST_MUSIC_SOURCE;
  // Water Reach deliberately borrows the airy snow arrangement until its own
  // soundtrack is produced; it should never silently fall back to Forest.
  if (mapId === WATER_REACH_MAP_ID) return SNOW_MUSIC_SOURCE;
  // Samurai Garden intentionally returns to the warmer Forest arrangement.
  if (mapId === SAMURAI_GARDEN_MAP_ID) return FOREST_MUSIC_SOURCE;
  // Cloudspire shares Snowlands' airy arrangement until its own theme lands.
  if (mapId === CLOUDSPIRE_MAP_ID) return SNOW_MUSIC_SOURCE;
  // Moonfen shares Night Forest's quieter arrangement until its own theme lands.
  if (mapId === MOONFEN_MAP_ID) return NIGHT_FOREST_MUSIC_SOURCE;
  if (mapId === lavaMapId) return LAVA_MUSIC_SOURCE;
  if (mapId === desertMapId) return DESERT_MUSIC_SOURCE;
  if (mapId === snowMapId) return SNOW_MUSIC_SOURCE;
  return FOREST_MUSIC_SOURCE;
}

export type MapMusicController = {
  readonly audio: HTMLAudioElement;
  readonly volume: number;
  readonly sfxVolume: number;
  setVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  pause(): void;
  syncMap(mapId: MapId): void;
  ensurePlaying(allowed: boolean): void;
  playDeathSound(): void;
  playBowAttackSound(): void;
};

type BowAttackVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

export function bowAttackPlaybackRate(randomValue = Math.random()) {
  const normalized = Number.isFinite(randomValue) ? Math.min(1, Math.max(0, randomValue)) : 1;
  return BOW_ATTACK_SOUND_RATE_MIN + normalized * (BOW_ATTACK_SOUND_RATE_MAX - BOW_ATTACK_SOUND_RATE_MIN);
}

export function createMapMusicController(
  storageKey: string,
  desertMapId: MapId,
  snowMapId: MapId,
  lavaMapId: MapId,
  sfxStorageKey?: string,
): MapMusicController {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  const deathAudio = new Audio(DEATH_SOUND_SOURCE);
  deathAudio.preload = "auto";

  let volume = .35;
  try {
    const storedVolume = localStorage.getItem(storageKey);
    if (storedVolume !== null) {
      const savedVolume = Number(storedVolume);
      if (Number.isFinite(savedVolume)) volume = Math.min(1, Math.max(0, savedVolume));
    }
  } catch {}
  let sfxVolume = volume;
  if (sfxStorageKey) {
    try {
      const storedSfxVolume = localStorage.getItem(sfxStorageKey);
      if (storedSfxVolume !== null) {
        const savedSfxVolume = Number(storedSfxVolume);
        if (Number.isFinite(savedSfxVolume)) sfxVolume = Math.min(1, Math.max(0, savedSfxVolume));
      }
    } catch {}
  }
  audio.volume = volume;
  deathAudio.volume = sfxVolume;
  let audioContext: AudioContext | null = null;
  let musicGainNode: GainNode | null = null;
  let sfxGainNode: GainNode | null = null;
  let bowAttackBuffer: AudioBuffer | null = null;
  let bowAttackBufferPromise: Promise<AudioBuffer | null> | null = null;
  let lastBowAttackAt = Number.NEGATIVE_INFINITY;
  const activeBowAttackVoices: BowAttackVoice[] = [];
  const musicObjectUrls = new Map<string, string>();
  let requestedMusicSource = SIGN_IN_MUSIC_SOURCE;
  let attachedMusicSource = "";
  let playbackRequested = false;
  let pendingMusicLoad: {
    source: string;
    abortController: AbortController;
    promise: Promise<string | null>;
  } | null = null;

  function loadMusicObjectUrl(source: string) {
    const cachedObjectUrl = musicObjectUrls.get(source);
    if (cachedObjectUrl) return Promise.resolve(cachedObjectUrl);
    if (pendingMusicLoad?.source === source) return pendingMusicLoad.promise;

    pendingMusicLoad?.abortController.abort();
    const abortController = new AbortController();
    const request = {
      source,
      abortController,
      promise: Promise.resolve<string | null>(null),
    };
    request.promise = fetch(source, { cache: "force-cache", signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Music request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        musicObjectUrls.set(source, objectUrl);
        return objectUrl;
      })
      .catch(() => null)
      .finally(() => {
        if (pendingMusicLoad === request) pendingMusicLoad = null;
      });
    pendingMusicLoad = request;
    return request.promise;
  }

  async function attachRequestedMusic(source: string) {
    const objectUrl = await loadMusicObjectUrl(source);
    if (!objectUrl || requestedMusicSource !== source || attachedMusicSource === source) return;
    audio.src = objectUrl;
    attachedMusicSource = source;
    if (playbackRequested && volume > 0) void audio.play().catch(() => {});
  }

  function preloadBowAttackSound(context: AudioContext) {
    if (bowAttackBuffer) return Promise.resolve(bowAttackBuffer);
    if (bowAttackBufferPromise) return bowAttackBufferPromise;
    bowAttackBufferPromise = fetch(BOW_ATTACK_SOUND_SOURCE, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Bow attack audio request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((encodedAudio) => context.decodeAudioData(encodedAudio))
      .then((decodedAudio) => {
        bowAttackBuffer = decodedAudio;
        return decodedAudio;
      })
      .catch(() => null)
      .finally(() => { bowAttackBufferPromise = null; });
    return bowAttackBufferPromise;
  }

  function ensureAudioGraph() {
    if (audioContext && musicGainNode && sfxGainNode) return audioContext;
    const AudioContextConstructor = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaElementSource(audio);
      const deathSource = audioContext.createMediaElementSource(deathAudio);
      musicGainNode = audioContext.createGain();
      sfxGainNode = audioContext.createGain();
      musicGainNode.gain.value = volume;
      sfxGainNode.gain.value = sfxVolume;
      source.connect(musicGainNode);
      deathSource.connect(sfxGainNode);
      musicGainNode.connect(audioContext.destination);
      sfxGainNode.connect(audioContext.destination);
      // iOS ignores HTMLMediaElement.volume. Keep the media element at full
      // volume after routing it through Web Audio and apply user volume here.
      audio.volume = 1;
      deathAudio.volume = 1;
      return audioContext;
    } catch {
      audioContext = null;
      musicGainNode = null;
      sfxGainNode = null;
      audio.volume = volume;
      deathAudio.volume = sfxVolume;
      return null;
    }
  }

  function setVolume(nextVolume: number) {
    volume = Math.min(1, Math.max(0, nextVolume));
    if (musicGainNode) musicGainNode.gain.value = volume;
    else audio.volume = volume;
  }

  function setSfxVolume(nextVolume: number) {
    sfxVolume = Math.min(1, Math.max(0, nextVolume));
    if (sfxGainNode) sfxGainNode.gain.value = sfxVolume;
    else deathAudio.volume = sfxVolume;
  }

  function pause() {
    playbackRequested = false;
    audio.pause();
  }

  function syncMap(mapId: MapId) {
    const nextSource = musicSourceForMap(mapId, desertMapId, snowMapId, lavaMapId);
    if (requestedMusicSource === nextSource) return;
    playbackRequested = playbackRequested || !audio.paused;
    requestedMusicSource = nextSource;
    audio.pause();
    // Fetch the complete encoded track without blocking the map transition.
    // Looping the resulting Blob URL cannot trigger another HTTP range request.
    void attachRequestedMusic(nextSource);
  }

  function ensurePlaying(allowed: boolean) {
    const context = ensureAudioGraph();
    if (context) {
      if (context.state === "suspended") void context.resume().catch(() => {});
      void preloadBowAttackSound(context);
    }
    playbackRequested = allowed && volume > 0;
    if (!playbackRequested) return;
    if (attachedMusicSource !== requestedMusicSource) {
      void attachRequestedMusic(requestedMusicSource);
      return;
    }
    if (audio.paused) void audio.play().catch(() => {});
  }

  function playDeathSound() {
    if (sfxVolume <= 0) return;
    const context = ensureAudioGraph();
    if (context?.state === "suspended") void context.resume().catch(() => {});
    deathAudio.currentTime = 0;
    void deathAudio.play().catch(() => {});
  }

  function playBowAttackSound() {
    if (sfxVolume <= 0) return;
    const context = ensureAudioGraph();
    if (!context || !sfxGainNode) return;
    if (context.state === "suspended") void context.resume().catch(() => {});
    if (!bowAttackBuffer) {
      void preloadBowAttackSound(context);
      return;
    }
    const now = context.currentTime;
    if (now - lastBowAttackAt < BOW_ATTACK_SOUND_MIN_GAP_SECONDS) return;
    lastBowAttackAt = now;

    while (activeBowAttackVoices.length >= BOW_ATTACK_SOUND_MAX_VOICES) {
      const oldest = activeBowAttackVoices.shift();
      if (!oldest) break;
      try {
        oldest.gain.gain.cancelScheduledValues(now);
        oldest.gain.gain.setValueAtTime(BOW_ATTACK_SOUND_GAIN, now);
        oldest.gain.gain.exponentialRampToValueAtTime(.0001, now + .02);
        oldest.source.stop(now + .025);
      } catch {}
    }

    const playbackRate = bowAttackPlaybackRate();
    const sourceDuration = Math.min(BOW_ATTACK_SOUND_CLIP_SECONDS, bowAttackBuffer.duration);
    if (sourceDuration <= 0) return;
    const playbackDuration = sourceDuration / playbackRate;
    const endAt = now + playbackDuration;
    const fadeDuration = Math.min(BOW_ATTACK_SOUND_FADE_SECONDS, playbackDuration * .25);
    const fadeAt = Math.max(now + BOW_ATTACK_SOUND_ATTACK_SECONDS, endAt - fadeDuration);
    const source = context.createBufferSource();
    const voiceGain = context.createGain();
    const voice: BowAttackVoice = { source, gain: voiceGain };
    source.buffer = bowAttackBuffer;
    source.playbackRate.value = playbackRate;
    voiceGain.gain.setValueAtTime(.0001, now);
    voiceGain.gain.linearRampToValueAtTime(BOW_ATTACK_SOUND_GAIN, now + BOW_ATTACK_SOUND_ATTACK_SECONDS);
    voiceGain.gain.setValueAtTime(BOW_ATTACK_SOUND_GAIN, fadeAt);
    voiceGain.gain.exponentialRampToValueAtTime(.0001, endAt);
    source.connect(voiceGain);
    voiceGain.connect(sfxGainNode);
    source.onended = () => {
      const index = activeBowAttackVoices.indexOf(voice);
      if (index >= 0) activeBowAttackVoices.splice(index, 1);
      source.disconnect();
      voiceGain.disconnect();
    };
    activeBowAttackVoices.push(voice);
    try {
      source.start(now, 0, sourceDuration);
      source.stop(endAt + .02);
    } catch {
      source.onended = null;
      activeBowAttackVoices.pop();
      source.disconnect();
      voiceGain.disconnect();
    }
  }

  return {
    audio,
    get volume() { return volume; },
    get sfxVolume() { return sfxVolume; },
    setVolume,
    setSfxVolume,
    pause,
    syncMap,
    ensurePlaying,
    playDeathSound,
    playBowAttackSound,
  };
}
