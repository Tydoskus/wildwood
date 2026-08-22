import type { MapId } from "../world";

const FOREST_MUSIC_SOURCE = "assets/wildwood/audio/forest.mp3";
const DESERT_MUSIC_SOURCE = "assets/wildwood/audio/desert.mp3";
const SNOW_MUSIC_SOURCE = "assets/wildwood/audio/snow.mp3";
const LAVA_MUSIC_SOURCE = "assets/wildwood/audio/lava.mp3";
export const SIGN_IN_MUSIC_SOURCE = "assets/wildwood/audio/signin.mp3";
export const DEATH_SOUND_SOURCE = "assets/wildwood/audio/death.mp3";
export const BOW_ATTACK_SOUND_SOURCE = "assets/wildwood/audio/bow-release.mp3";
export const BOW_ATTACK_SOUND_GAIN = .22;
export const BOW_ATTACK_SOUND_CLIP_SECONDS = .46;
export const BOW_ATTACK_SOUND_RATE_MIN = .93;
export const BOW_ATTACK_SOUND_RATE_MAX = 1.07;

const BOW_ATTACK_SOUND_FADE_SECONDS = .09;
const BOW_ATTACK_SOUND_ATTACK_SECONDS = .008;
const BOW_ATTACK_SOUND_MIN_GAP_SECONDS = .055;
const BOW_ATTACK_SOUND_MAX_VOICES = 3;

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function musicSourceForMap(mapId: MapId, desertMapId: MapId, snowMapId: MapId, lavaMapId: MapId) {
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
  const normalized = Number.isFinite(randomValue) ? Math.min(1, Math.max(0, randomValue)) : .5;
  return BOW_ATTACK_SOUND_RATE_MIN + normalized * (BOW_ATTACK_SOUND_RATE_MAX - BOW_ATTACK_SOUND_RATE_MIN);
}

export function createMapMusicController(
  storageKey: string,
  desertMapId: MapId,
  snowMapId: MapId,
  lavaMapId: MapId,
  sfxStorageKey?: string,
): MapMusicController {
  const audio = new Audio(SIGN_IN_MUSIC_SOURCE);
  audio.loop = true;
  audio.preload = "metadata";
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

  function preloadBowAttackSound(context: AudioContext) {
    if (bowAttackBuffer) return Promise.resolve(bowAttackBuffer);
    if (bowAttackBufferPromise) return bowAttackBufferPromise;
    bowAttackBufferPromise = fetch(BOW_ATTACK_SOUND_SOURCE)
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

  function syncMap(mapId: MapId) {
    const nextSource = musicSourceForMap(mapId, desertMapId, snowMapId, lavaMapId);
    if (audio.getAttribute("src") === nextSource) return;
    const shouldResume = !audio.paused;
    audio.src = nextSource;
    audio.load();
    if (shouldResume && volume > 0) void audio.play().catch(() => {});
  }

  function ensurePlaying(allowed: boolean) {
    const context = ensureAudioGraph();
    if (context) {
      if (context.state === "suspended") void context.resume().catch(() => {});
      void preloadBowAttackSound(context);
    }
    if (!allowed || volume <= 0 || !audio.paused) return;
    void audio.play().catch(() => {});
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
    const fadeAt = Math.max(now + BOW_ATTACK_SOUND_ATTACK_SECONDS, endAt - BOW_ATTACK_SOUND_FADE_SECONDS);
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
    syncMap,
    ensurePlaying,
    playDeathSound,
    playBowAttackSound,
  };
}
