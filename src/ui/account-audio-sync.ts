import type { AccountAudioRemote, AccountAudioSnapshot, AudioVolumes } from "../coop/services/account-audio-settings";

export type AudioChannel = "music" | "sfx";
type Timer = unknown;
type AudioSyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const ACCOUNT_AUDIO_DEBOUNCE_MS = 1_000;
/** Covers protocol registration after a connect; a later change or reconnect starts over. */
const MAX_SEND_ATTEMPTS = 10;
/** Sliders move in whole percent; anything finer is f32 rounding on the way back. */
const SAME_VOLUME_TOLERANCE = .0005;

function browserStorage(): AudioSyncStorage | undefined {
  try { return localStorage; } catch { return undefined; }
}

export function readUnsyncedAudio(key: string, storage: Pick<Storage, "getItem"> | undefined = browserStorage()): Set<AudioChannel> {
  let stored: string | null = null;
  try { stored = storage?.getItem(key) ?? null; } catch {}
  const channels = new Set<AudioChannel>();
  for (const part of (stored ?? "").split(/\s+/)) if (part === "music" || part === "sfx") channels.add(part);
  return channels;
}

function writeUnsyncedAudio(key: string, channels: Set<AudioChannel>, storage = browserStorage()) {
  try {
    if (channels.size) storage?.setItem(key, [...channels].sort().join(" "));
    else storage?.removeItem(key);
  } catch {}
}

/** Records that a volume changed on this device before the account has it. */
export function markUnsyncedAudio(key: string, channel: AudioChannel, storage: Pick<Storage, "getItem" | "setItem"> | undefined = browserStorage()) {
  const channels = readUnsyncedAudio(key, storage);
  channels.add(channel);
  try { storage?.setItem(key, [...channels].sort().join(" ")); } catch {}
}

function normalizedVolume(value: number) {
  return Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000 : 0;
}

function normalized(volumes: AudioVolumes): AudioVolumes {
  return { musicVolume: normalizedVolume(volumes.musicVolume), sfxVolume: normalizedVolume(volumes.sfxVolume) };
}

function sameVolumes(left: AudioVolumes, right: AudioVolumes) {
  return Math.abs(left.musicVolume - right.musicVolume) < SAME_VOLUME_TOLERANCE
    && Math.abs(left.sfxVolume - right.sfxVolume) < SAME_VOLUME_TOLERANCE;
}

type AccountAudioSyncDependencies = {
  remote: AccountAudioRemote | null | undefined;
  /** The volumes this device is playing at now. */
  local: () => AudioVolumes;
  /** Plays at the account's volumes; must not report back through localChanged. */
  apply: (volumes: AudioVolumes) => void;
  unsyncedKey: string;
  storage?: AudioSyncStorage;
  debounceMs?: number;
  schedule?: (callback: () => void, delayMs: number) => Timer;
  cancel?: (timer: Timer) => void;
  warn?: (message: string, error: unknown) => void;
};

/**
 * Keeps this device's music and sound-effect volumes and the account's copy
 * in step.
 *
 * - The account's copy wins when it arrives, except for a channel changed on
 *   this device and not yet confirmed, which is sent up instead.
 * - An account with no copy is given this device's volumes, once per login.
 * - A change is sent a second after the slider is released, and only if it
 *   differs from what the account already holds.
 * - Offline, or without a coop connection, nothing is sent and the local
 *   settings behave exactly as they always have.
 */
export function createAccountAudioSync(dependencies: AccountAudioSyncDependencies) {
  const {
    remote, local, apply, unsyncedKey, storage,
    debounceMs = ACCOUNT_AUDIO_DEBOUNCE_MS,
    schedule = (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancel = (timer) => window.clearTimeout(timer as number),
    warn = (message, error) => console.warn(message, error),
  } = dependencies;
  let loaded = false;
  /** What the account is known to hold, or null before it has any. */
  let known: AudioVolumes | null = null;
  let unsynced = readUnsyncedAudio(unsyncedKey, storage);
  let changeSequence = 0;
  let attempts = 0;
  let timer: Timer | null = null;

  function setUnsynced(next: Set<AudioChannel>) {
    unsynced = next;
    writeUnsyncedAudio(unsyncedKey, next, storage);
  }

  function scheduleFlush(delayMs: number) {
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; flush(); }, delayMs);
  }

  function retry() {
    attempts += 1;
    if (attempts < MAX_SEND_ATTEMPTS) scheduleFlush(debounceMs);
  }

  function flush() {
    if (!remote || !loaded || !unsynced.size) return;
    const volumes = normalized(local());
    if (known && sameVolumes(volumes, known)) {
      setUnsynced(new Set());
      return;
    }
    const sequence = changeSequence;
    let sent: Promise<boolean>;
    try { sent = remote.save(volumes); } catch (error) { sent = Promise.reject(error); }
    sent.then((accepted) => {
      if (!accepted) { retry(); return; }
      attempts = 0;
      known = volumes;
      if (sequence === changeSequence) setUnsynced(new Set());
    }).catch((error) => {
      warn("WildStat could not save audio settings:", error);
      retry();
    });
  }

  function receive(snapshot: AccountAudioSnapshot) {
    loaded = snapshot.loaded;
    attempts = 0;
    if (!loaded) {
      known = null;
      return;
    }
    if (!snapshot.volumes) {
      // First login on a client that syncs: this device's volumes become the account's.
      known = null;
      setUnsynced(new Set<AudioChannel>(["music", "sfx"]));
      scheduleFlush(0);
      return;
    }
    known = normalized(snapshot.volumes);
    const current = normalized(local());
    const next = {
      musicVolume: unsynced.has("music") ? current.musicVolume : known.musicVolume,
      sfxVolume: unsynced.has("sfx") ? current.sfxVolume : known.sfxVolume,
    };
    if (!sameVolumes(next, current)) apply(next);
    if (unsynced.size) scheduleFlush(0);
  }

  function markChanged(channel: AudioChannel) {
    changeSequence += 1;
    if (unsynced.has(channel)) return;
    const next = new Set(unsynced);
    next.add(channel);
    setUnsynced(next);
  }

  /**
   * A slider is being dragged. Nothing is sent, but the channel now belongs to
   * this device, so an account update arriving mid-drag cannot move it.
   */
  function localEditing(channel: AudioChannel) {
    markChanged(channel);
  }

  /** A slider was released or the mute button pressed. */
  function localChanged(channel: AudioChannel) {
    markChanged(channel);
    attempts = 0;
    scheduleFlush(debounceMs);
  }

  const stopObserving = remote?.observe(receive);
  if (remote) receive(remote.snapshot());

  return {
    localEditing,
    localChanged,
    dispose() {
      stopObserving?.();
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}
