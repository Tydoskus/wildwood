import {
  ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOCKWORK_RUINS_MAP_ID, CLOUDSPIRE_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID,
  DUSKFALL_ORCHARD_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ION_CITADEL_MAP_ID, MOONFEN_MAP_ID,
  NEON_BASTION_MAP_ID, SAMURAI_GARDEN_MAP_ID, VERDANT_CATACOMBS_MAP_ID, WATER_REACH_MAP_ID, type MapId,
} from "../world";
import { afterEntry } from "../../app/after-entry";

const FOREST_MUSIC_SOURCE = "assets/wildstat/audio/forest.mp3";
const DESERT_MUSIC_SOURCE = "assets/wildstat/audio/desert.mp3";
const SNOW_MUSIC_SOURCE = "assets/wildstat/audio/snow.mp3";
const LAVA_MUSIC_SOURCE = "assets/wildstat/audio/lava.mp3";
const NIGHT_FOREST_MUSIC_SOURCE = "assets/wildstat/audio/night-forest.mp3";
// Measured integrated loudness of the shipped MP3s. Preserve each track's
// dynamics while bringing map music to the same perceived level (-20 LUFS).
const MAP_MUSIC_LOUDNESS_LUFS: Record<string, number> = {
  [FOREST_MUSIC_SOURCE]: -12.4,
  [DESERT_MUSIC_SOURCE]: -26.8,
  [SNOW_MUSIC_SOURCE]: -27.7,
  [LAVA_MUSIC_SOURCE]: -31.8,
  [NIGHT_FOREST_MUSIC_SOURCE]: -36.7,
};
export function musicGainForSource(source: string) {
  const loudness = MAP_MUSIC_LOUDNESS_LUFS[source];
  return loudness === undefined ? 1 : 10 ** ((-20 - loudness) / 20);
}
export const SIGN_IN_MUSIC_SOURCE = "assets/wildstat/audio/signin.mp3";

/**
 * Each track also ships as 128 kbps AAC beside its MP3, about half the
 * download. Tracks keep their .mp3 path as
 * their identity, for gain and caching; only the download is the .m4a, where
 * the browser plays AAC, falling back to the MP3 if the server has no .m4a.
 */
export function compactMusicSource(source: string, probe: Pick<HTMLMediaElement, "canPlayType"> | null) {
  if (!/\/audio\/[^/]+\.mp3$/.test(source) || source.endsWith("/death.mp3") || source.endsWith("/bow-release.mp3")) return source;
  let playable = "";
  try { playable = probe?.canPlayType('audio/mp4; codecs="mp4a.40.2"') ?? ""; } catch {}
  return playable ? source.replace(/\.mp3$/, ".m4a") : source;
}
export const DEATH_SOUND_SOURCE = "assets/wildstat/audio/death.mp3";
export const BOW_ATTACK_SOUND_SOURCE = "assets/wildstat/audio/bow-release.mp3";
// The release clip is short and the death sting mastered quiet, so both are
// boosted to land at or above the music without clipping at full volume.
export const BOW_ATTACK_SOUND_GAIN = .8;
export const DEATH_SOUND_GAIN = 2.8;
/** Sound effects have their own volume: muting music leaves them playing. */
export const DEFAULT_SFX_VOLUME = .7;
export const BOW_ATTACK_SOUND_CLIP_SECONDS = .46;
export const BOW_ATTACK_SOUND_RATE_MIN = .93;
export const BOW_ATTACK_SOUND_RATE_MAX = 1;

const BOW_ATTACK_SOUND_FADE_SECONDS = .09;
const BOW_ATTACK_SOUND_ATTACK_SECONDS = .008;
const BOW_ATTACK_SOUND_MIN_GAP_SECONDS = .055;
const BOW_ATTACK_SOUND_MAX_VOICES = 3;
/** A shot fired while the clip is still decoding plays once it arrives, if that is soon enough to still feel like the shot. */
export const BOW_ATTACK_SOUND_LATE_PLAY_MS = 300;
/**
 * A sword swing is a swoosh made here from smoothed noise: there is no clip to download. A low band rises
 * then falls through the swing, under a rounded swell, with the highs cut, so it whooshes rather than hisses.
 * Its gain matches the first swish's loudness, about 7 dB RMS under the bow release, so swings stay below arrows.
 */
export const SWORD_SWING_SOUND_GAIN = .48;
export const SWORD_SWING_SOUND_SECONDS = .28;
/** Fast swings get shorter swooshes, so six a second stay six swooshes rather than one smear. */
export const SWORD_SWING_SOUND_MIN_SECONDS = .16;
const SWORD_SWING_SOUND_INTERVAL_SHARE = 1.3;
/** Each swing pitches down by up to this much, as the bow's release does, so repeats never sound copied. */
export const SWORD_SWING_PITCH_MIN = .85;
const SWORD_SWING_SOUND_MIN_GAP_SECONDS = .07;
const SWORD_SWING_SOUND_MAX_VOICES = 3;

/**
 * How loud one swing plays at this attack interval: full up to three a second, then quieter as they come
 * faster, so six a second are no louder overall than three, the way rapid-fire games keep a stream even.
 */
export function swordSwingLevel(attackInterval?: number) {
  if (!(attackInterval !== undefined && attackInterval > 0 && Number.isFinite(attackInterval))) return 1;
  return Math.min(1, Math.sqrt(attackInterval * 3));
}

/** How long one swoosh lasts at this attack interval. */
export function swordSwingSeconds(attackInterval?: number) {
  if (!(attackInterval !== undefined && attackInterval > 0 && Number.isFinite(attackInterval))) return SWORD_SWING_SOUND_SECONDS;
  return Math.min(SWORD_SWING_SOUND_SECONDS, Math.max(SWORD_SWING_SOUND_MIN_SECONDS, attackInterval * SWORD_SWING_SOUND_INTERVAL_SHARE));
}

/** Noise with its grain smoothed off by a one-pole low-pass, long enough for the longest swoosh. */
export function swingNoiseBuffer(context: BaseAudioContext, seconds = SWORD_SWING_SOUND_SECONDS + .05) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let level = 0, peak = 0;
  for (let index = 0; index < data.length; index += 1) {
    level = .6 * level + .4 * (Math.random() * 2 - 1);
    data[index] = level;
    peak = Math.max(peak, Math.abs(level));
  }
  if (peak > 0) for (let index = 0; index < data.length; index += 1) data[index] /= peak;
  return buffer;
}

/** A rounded swell that peaks 40% of the way in: no corner to click on. */
const SWING_SWELL = Array.from({ length: 64 }, (_, index) => {
  const t = index / 63, x = t < .4 ? t / .4 : 1 - (t - .4) / .6;
  return Math.max(.0001, Math.sin(x * Math.PI / 2) ** 2);
});

/** One swoosh into `destination`, starting at `at`; returns the nodes to clean up, or null. */
export function scheduleSwordSwing(context: BaseAudioContext, noise: AudioBuffer, destination: AudioNode, at: number,
  randomValue = Math.random(), seconds = SWORD_SWING_SOUND_SECONDS, level = 1) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const gain = context.createGain();
  const end = at + seconds;
  source.buffer = noise;
  filter.type = "bandpass";
  filter.Q.value = 1;
  const pitch = SWORD_SWING_PITCH_MIN + Math.min(1, Math.max(0, randomValue)) * (1 - SWORD_SWING_PITCH_MIN);
  const from = 380 * pitch;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(from * 2.2, at + seconds * .4);
  filter.frequency.exponentialRampToValueAtTime(from * .7, end);
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2000;
  lowpass.Q.value = .4;
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.setValueCurveAtTime(Float32Array.from(SWING_SWELL, swell => swell * SWORD_SWING_SOUND_GAIN * level), at, seconds);
  source.connect(filter);
  filter.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(destination);
  try {
    source.start(at);
    source.stop(end + .02);
  } catch {
    source.disconnect();
    filter.disconnect();
    lowpass.disconnect();
    gain.disconnect();
    return null;
  }
  return { source, filter, lowpass, gain };
}
/** Soundtracks are kept as Blob URLs for the map you are on and the one you left; older ones are released. */
const MUSIC_OBJECT_URL_KEEP = 2;
const MUSIC_RETRY_MS = 2_000;
/** The server answered, without the file. */
class MusicFileMissing extends Error {}

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

/** Every map without its own entry plays the Forest arrangement. */
const MAP_MUSIC_SOURCES: Partial<Record<MapId, string>> = {
  [BEGINNER_DESERT_MAP_ID]: DESERT_MUSIC_SOURCE,
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: SNOW_MUSIC_SOURCE,
  [ADVANCED_LAVA_WASTES_MAP_ID]: LAVA_MUSIC_SOURCE,
  [INFERNAL_DEPTHS_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  // Water Reach deliberately borrows the airy snow arrangement until its own
  // soundtrack is produced; it should never silently fall back to Forest.
  [WATER_REACH_MAP_ID]: SNOW_MUSIC_SOURCE,
  // Samurai Garden intentionally returns to the warmer Forest arrangement.
  [SAMURAI_GARDEN_MAP_ID]: FOREST_MUSIC_SOURCE,
  // Cloudspire shares Snowlands' airy arrangement until its own theme lands.
  [CLOUDSPIRE_MAP_ID]: SNOW_MUSIC_SOURCE,
  // Moonfen and the maps after it share Night Forest's quieter arrangement
  // until their own themes land.
  [MOONFEN_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  [CRYSTAL_HOLLOWS_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  [CLOCKWORK_RUINS_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  [DUSKFALL_ORCHARD_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  [NEON_BASTION_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  [VERDANT_CATACOMBS_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
  [ION_CITADEL_MAP_ID]: NIGHT_FOREST_MUSIC_SOURCE,
};

export function musicSourceForMap(mapId: MapId) {
  return MAP_MUSIC_SOURCES[mapId] ?? FOREST_MUSIC_SOURCE;
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
  playSwordAttackSound(attackInterval?: number): void;
  /** A narrator line on the sound effects volume, with the music dipped under it; returns a stop. */
  playVoiceLine(src: string): () => void;
};

/** How far the music dips while a narrator line plays. */
export const VOICE_MUSIC_DUCK = .35;

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
  sfxStorageKey?: string,
): MapMusicController {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  const deathAudio = new Audio(DEATH_SOUND_SOURCE);
  // Only the fallback when Web Audio is unavailable; the decoded buffer below
  // already fetches the clip, so preloading here downloaded it twice.
  deathAudio.preload = "none";

  let volume = .35;
  try {
    const storedVolume = localStorage.getItem(storageKey);
    if (storedVolume !== null) {
      const savedVolume = Number(storedVolume);
      if (Number.isFinite(savedVolume)) volume = Math.min(1, Math.max(0, savedVolume));
    }
  } catch {}
  let sfxVolume = DEFAULT_SFX_VOLUME;
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
  deathAudio.volume = Math.min(1, sfxVolume * DEATH_SOUND_GAIN);
  let audioContext: AudioContext | null = null;
  let musicGainNode: GainNode | null = null;
  let sfxGainNode: GainNode | null = null;
  let deathGainNode: GainNode | null = null;
  let bowAttackBuffer: AudioBuffer | null = null;
  let bowAttackBufferPromise: Promise<AudioBuffer | null> | null = null;
  let deathBuffer: AudioBuffer | null = null;
  let deathBufferPromise: Promise<AudioBuffer | null> | null = null;
  let bowAttackRequestedAt = Number.NEGATIVE_INFINITY;
  let lastBowAttackAt = Number.NEGATIVE_INFINITY;
  // The encoded clips need no AudioContext to download, so fetch them at once
  // and the first shot or death has its sound; decode once a context exists.
  const fetchEncoded = (source: string) => fetch(source)
    .then((response) => {
      if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .catch(() => null);
  const encodedBowAttack = fetchEncoded(BOW_ATTACK_SOUND_SOURCE);
  // The death sting (~150 KB) waits until the player is in the world, unless asked for sooner.
  let encodedDeath: Promise<ArrayBuffer | null> | null = null;
  const encodedDeathClip = () => encodedDeath ??= fetchEncoded(DEATH_SOUND_SOURCE);
  afterEntry(() => { void encodedDeathClip(); });
  const activeBowAttackVoices: BowAttackVoice[] = [];
  let swingNoise: AudioBuffer | null = null;
  let lastSwordSwingAt = Number.NEGATIVE_INFINITY;
  let voice: HTMLAudioElement | null = null;
  let activeSwordSwings = 0;
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
    const fetchTrack = (url: string) => fetch(url, { cache: "force-cache", signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new MusicFileMissing(`Music request failed: ${response.status}`);
        return response.blob();
      });
    const compact = compactMusicSource(source, audio);
    // The MP3 is twice the download, so it stands in only when the server has no AAC copy.
    // A dropped connection asks for the AAC copy once more instead.
    const fetchCompact = () => fetchTrack(compact).catch((error) => {
      if (error instanceof MusicFileMissing) return fetchTrack(source);
      if (abortController.signal.aborted) throw error;
      return new Promise(resolve => setTimeout(resolve, MUSIC_RETRY_MS))
        .then(() => fetchTrack(compact))
        .catch((again) => again instanceof MusicFileMissing ? fetchTrack(source) : Promise.reject(again));
    });
    request.promise = (compact === source ? fetchTrack(source) : fetchCompact())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        musicObjectUrls.set(source, objectUrl);
        while (musicObjectUrls.size > MUSIC_OBJECT_URL_KEEP) {
          const [oldestSource, oldestUrl] = musicObjectUrls.entries().next().value as [string, string];
          if (oldestSource === attachedMusicSource) break;
          musicObjectUrls.delete(oldestSource);
          try { URL.revokeObjectURL?.(oldestUrl); } catch {}
        }
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

  function decodeClip(context: AudioContext, encoded: Promise<ArrayBuffer | null>) {
    return encoded
      .then((bytes) => bytes ? context.decodeAudioData(bytes.slice(0)) : null)
      .catch(() => null);
  }

  function preloadBowAttackSound(context: AudioContext) {
    if (bowAttackBuffer) return Promise.resolve(bowAttackBuffer);
    if (bowAttackBufferPromise) return bowAttackBufferPromise;
    bowAttackBufferPromise = decodeClip(context, encodedBowAttack)
      .then((decodedAudio) => {
        bowAttackBuffer = decodedAudio;
        // A shot that arrived while this was decoding still deserves its sound.
        if (decodedAudio && performance.now() - bowAttackRequestedAt <= BOW_ATTACK_SOUND_LATE_PLAY_MS) playBowAttackSound();
        return decodedAudio;
      })
      .finally(() => { bowAttackBufferPromise = null; });
    return bowAttackBufferPromise;
  }

  function preloadDeathSound(context: AudioContext) {
    if (deathBuffer) return Promise.resolve(deathBuffer);
    if (deathBufferPromise) return deathBufferPromise;
    deathBufferPromise = decodeClip(context, encodedDeathClip())
      .then((decodedAudio) => { deathBuffer = decodedAudio; return decodedAudio; })
      .finally(() => { deathBufferPromise = null; });
    return deathBufferPromise;
  }

  function ensureAudioGraph() {
    if (audioContext && musicGainNode && sfxGainNode && deathGainNode) return audioContext;
    // Browsers keep audio paused until the first click or key, and warn about a context made sooner.
    // Where the page can tell, wait for that first input; until then the music element plays on its own.
    if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
    const AudioContextConstructor = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaElementSource(audio);
      const deathSource = audioContext.createMediaElementSource(deathAudio);
      musicGainNode = audioContext.createGain();
      sfxGainNode = audioContext.createGain();
      musicGainNode.gain.value = volume * musicGainForSource(requestedMusicSource);
      sfxGainNode.gain.value = sfxVolume;
      deathGainNode = audioContext.createGain();
      deathGainNode.gain.value = DEATH_SOUND_GAIN;
      deathGainNode.connect(sfxGainNode);
      source.connect(musicGainNode);
      deathSource.connect(deathGainNode);
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
      deathGainNode = null;
      audio.volume = Math.min(1, volume * musicGainForSource(requestedMusicSource));
      deathAudio.volume = Math.min(1, sfxVolume * DEATH_SOUND_GAIN);
      return null;
    }
  }

  function setVolume(nextVolume: number) {
    volume = Math.min(1, Math.max(0, nextVolume));
    applyMusicVolume();
  }

  function applyMusicVolume() {
    const adjusted = volume * musicGainForSource(requestedMusicSource) * (voice ? VOICE_MUSIC_DUCK : 1);
    if (musicGainNode) musicGainNode.gain.value = adjusted;
    else audio.volume = Math.min(1, adjusted);
  }

  function setSfxVolume(nextVolume: number) {
    sfxVolume = Math.min(1, Math.max(0, nextVolume));
    if (voice) voice.volume = sfxVolume;
    if (sfxGainNode) sfxGainNode.gain.value = sfxVolume;
    else deathAudio.volume = Math.min(1, sfxVolume * DEATH_SOUND_GAIN);
  }

  function pause() {
    playbackRequested = false;
    audio.pause();
  }

  function syncMap(mapId: MapId) {
    const nextSource = musicSourceForMap(mapId);
    if (requestedMusicSource === nextSource) return;
    playbackRequested = playbackRequested || !audio.paused;
    requestedMusicSource = nextSource;
    applyMusicVolume();
    audio.pause();
    // A muted player never downloads the track: 4-8 MB a map. Unmuting calls
    // ensurePlaying, which fetches it then.
    if (!playbackRequested || volume <= 0) return;
    // Fetch the complete encoded track without blocking the map transition.
    // Looping the resulting Blob URL cannot trigger another HTTP range request.
    void attachRequestedMusic(nextSource);
  }

  function ensurePlaying(allowed: boolean) {
    const context = ensureAudioGraph();
    if (context) {
      resumeAudioContext(context);
      void preloadBowAttackSound(context);
      void preloadDeathSound(context);
    }
    playbackRequested = allowed && volume > 0;
    if (!playbackRequested) return;
    if (attachedMusicSource !== requestedMusicSource) {
      void attachRequestedMusic(requestedMusicSource);
      return;
    }
    if (audio.paused) void audio.play().catch(() => {});
  }

  function resumeAudioContext(context: AudioContext | null) {
    // WebKit also reports "interrupted" after calls, locking, or app switches.
    // Reuse the existing graph so media elements are never connected twice.
    if (context && context.state !== "running" && context.state !== "closed") {
      void context.resume().catch(() => {});
    }
  }

  function playDeathSound() {
    if (sfxVolume <= 0) return;
    const context = ensureAudioGraph();
    resumeAudioContext(context);
    // A decoded buffer starts on the audio clock the instant it is asked for,
    // and does not depend on a media element that a suspended or interrupted
    // context can leave silent. Without a context the element still works.
    if (context && deathGainNode && deathBuffer) {
      const source = context.createBufferSource();
      source.buffer = deathBuffer;
      source.connect(deathGainNode);
      source.onended = () => source.disconnect();
      try { source.start(); return; } catch { source.disconnect(); }
    }
    if (context) void preloadDeathSound(context);
    deathAudio.currentTime = 0;
    void deathAudio.play().catch(() => {});
  }

  function playBowAttackSound() {
    if (sfxVolume <= 0) return;
    const context = ensureAudioGraph();
    if (!context || !sfxGainNode) return;
    resumeAudioContext(context);
    if (!bowAttackBuffer) {
      bowAttackRequestedAt = performance.now();
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

  function playSwordAttackSound(attackInterval?: number) {
    if (sfxVolume <= 0) return;
    const context = ensureAudioGraph();
    if (!context || !sfxGainNode) return;
    resumeAudioContext(context);
    const now = context.currentTime;
    if (now - lastSwordSwingAt < SWORD_SWING_SOUND_MIN_GAP_SECONDS || activeSwordSwings >= SWORD_SWING_SOUND_MAX_VOICES) return;
    swingNoise ??= swingNoiseBuffer(context);
    const swing = scheduleSwordSwing(context, swingNoise, sfxGainNode, now, Math.random(), swordSwingSeconds(attackInterval), swordSwingLevel(attackInterval));
    if (!swing) return;
    lastSwordSwingAt = now;
    activeSwordSwings += 1;
    swing.source.onended = () => {
      activeSwordSwings = Math.max(0, activeSwordSwings - 1);
      swing.source.disconnect();
      swing.filter.disconnect();
      swing.lowpass.disconnect();
      swing.gain.disconnect();
    };
  }

  function playVoiceLine(src: string) {
    voice?.pause();
    if (sfxVolume <= 0) return () => {};
    const line = new Audio(src);
    line.volume = sfxVolume;
    voice = line;
    applyMusicVolume();
    const stop = () => {
      line.pause();
      if (voice !== line) return;
      voice = null;
      applyMusicVolume();
    };
    line.addEventListener("ended", stop);
    line.addEventListener("error", stop);
    void line.play().catch(stop);
    return stop;
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
    playSwordAttackSound,
    playVoiceLine,
  };
}
